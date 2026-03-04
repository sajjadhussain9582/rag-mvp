import fs from 'fs'
import path from 'path'
import os from 'os'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

import {
  CHUNK_OVERLAP_CHARS,
  CHUNK_SIZE_CHARS,
  chunkTextIterator,
  extractTextFromJSON,
  generateEmbedding,
} from '@/lib/embeddings'
import { updateProcessingJob } from '@/lib/rag-db'
import { getServiceSupabase, hasServiceSupabase } from '@/lib/supabase/service'

const STORAGE_BUCKET = 'MyBucket'
const EMBED_BATCH_SIZE = 25
const EMBEDDING_MODEL_NAME = 'text-embedding-3-small'

export interface BackgroundProcessingArgs {
  jobId: string
  documentId: string
  userId: string
  storagePath: string
  filename: string
  contentType: string
  fileSize: number
}

/**
 * Stream the Blob to a temp file to avoid holding arrayBuffer + Buffer + string in memory.
 */
async function streamBlobToTempFile(blob: Blob): Promise<string> {
  const tempPath = path.join(
    os.tmpdir(),
    `rag-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  const nodeStream = Readable.fromWeb(blob.stream() as import('stream/web').ReadableStream)
  await pipeline(nodeStream, fs.createWriteStream(tempPath))
  return tempPath
}

/**
 * Async generator: read file as UTF-8 stream and yield chunks with overlap (no full-file string in memory).
 */
async function* streamChunksFromFile(
  filePath: string
): AsyncGenerator<{ content: string; index: number }> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  let buffer = ''
  let index = 0
  for await (const chunk of stream) {
    buffer += chunk
    while (buffer.length >= CHUNK_SIZE_CHARS) {
      const content = buffer.slice(0, CHUNK_SIZE_CHARS).trim()
      if (content) {
        yield { content, index }
        index++
      }
      const overlapStart = Math.max(0, CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS)
      buffer = buffer.slice(overlapStart)
    }
  }
  const rest = buffer.trim()
  if (rest) {
    yield { content: rest, index }
  }
}

export async function processDocumentInBackground({
  jobId,
  documentId,
  storagePath,
  contentType,
}: BackgroundProcessingArgs) {
  if (!hasServiceSupabase()) {
    console.warn('Skipping background processing: missing SUPABASE_SERVICE_ROLE_KEY')
    await safeUpdateJob(jobId, {
      status: 'failed',
      message: 'Missing service role key',
      error_details: 'Set SUPABASE_SERVICE_ROLE_KEY to continue background jobs.',
    })
    return
  }

  const supabase = getServiceSupabase()
  let tempPath: string | null = null

  try {
    await safeUpdateJob(jobId, {
      status: 'processing',
      message: 'Downloading document for processing',
    })

    const { data: downloadData, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(storagePath)

    if (downloadError || !downloadData) {
      throw downloadError ?? new Error('Failed to download file from storage')
    }

    tempPath = await streamBlobToTempFile(downloadData)

    const isJson =
      contentType === 'application/json' || contentType === 'text/json'

    if (isJson) {
      const rawText = await fs.promises.readFile(tempPath, 'utf-8')
      let extractedText: string
      try {
        const parsed = JSON.parse(rawText)
        extractedText = extractTextFromJSON(parsed)
      } catch {
        throw new Error('Uploaded JSON document is malformed')
      }
      if (!extractedText.trim()) {
        throw new Error('Document contains no readable text')
      }

      let processedChunks = 0
      let batch: Array<{ content: string; index: number }> = []

      for (const chunk of chunkTextIterator(extractedText)) {
        batch.push(chunk)
        if (batch.length < EMBED_BATCH_SIZE) continue

        const batchEmbeddings: number[][] = []
        for (const b of batch) {
          batchEmbeddings.push(await generateEmbedding(b.content))
        }
        const chunkInserts = batch.map((c) => ({
          document_id: documentId,
          chunk_number: c.index,
          content: c.content,
          token_count: Math.ceil(c.content.length / 4),
        }))
        const { data: chunkRows, error: chunkInsertError } = await supabase
          .from('document_chunks')
          .insert(chunkInserts)
          .select('id')
        if (chunkInsertError || !chunkRows) {
          throw chunkInsertError ?? new Error('Failed to insert document chunks')
        }
        const embeddingInserts = chunkRows.map((row, i) => ({
          chunk_id: row.id,
          embedding: batchEmbeddings[i],
          model_name: EMBEDDING_MODEL_NAME,
        }))
        const { error: embeddingInsertError } = await supabase
          .from('embeddings')
          .insert(embeddingInserts)
        if (embeddingInsertError) throw embeddingInsertError

        processedChunks += batch.length
        await safeUpdateJob(jobId, {
          message: `Processed ${processedChunks} chunks`,
        })
        batch = []
      }

      if (batch.length > 0) {
        const batchEmbeddings: number[][] = []
        for (const b of batch) {
          batchEmbeddings.push(await generateEmbedding(b.content))
        }
        const chunkInserts = batch.map((c) => ({
          document_id: documentId,
          chunk_number: c.index,
          content: c.content,
          token_count: Math.ceil(c.content.length / 4),
        }))
        const { data: chunkRows, error: chunkInsertError } = await supabase
          .from('document_chunks')
          .insert(chunkInserts)
          .select('id')
        if (chunkInsertError || !chunkRows) {
          throw chunkInsertError ?? new Error('Failed to insert document chunks')
        }
        const embeddingInserts = chunkRows.map((row, i) => ({
          chunk_id: row.id,
          embedding: batchEmbeddings[i],
          model_name: EMBEDDING_MODEL_NAME,
        }))
        const { error: embeddingInsertError } = await supabase
          .from('embeddings')
          .insert(embeddingInserts)
        if (embeddingInsertError) throw embeddingInsertError
        processedChunks += batch.length
      }

      await safeUpdateJob(jobId, {
        status: 'completed',
        message: `Finished processing ${processedChunks} chunks`,
      })
    } else {
      let processedChunks = 0
      let batch: Array<{ content: string; index: number }> = []

      for await (const chunk of streamChunksFromFile(tempPath)) {
        batch.push(chunk)
        if (batch.length < EMBED_BATCH_SIZE) continue

        const batchEmbeddings: number[][] = []
        for (const b of batch) {
          batchEmbeddings.push(await generateEmbedding(b.content))
        }
        const chunkInserts = batch.map((c) => ({
          document_id: documentId,
          chunk_number: c.index,
          content: c.content,
          token_count: Math.ceil(c.content.length / 4),
        }))
        const { data: chunkRows, error: chunkInsertError } = await supabase
          .from('document_chunks')
          .insert(chunkInserts)
          .select('id')
        if (chunkInsertError || !chunkRows) {
          throw chunkInsertError ?? new Error('Failed to insert document chunks')
        }
        const embeddingInserts = chunkRows.map((row, i) => ({
          chunk_id: row.id,
          embedding: batchEmbeddings[i],
          model_name: EMBEDDING_MODEL_NAME,
        }))
        const { error: embeddingInsertError } = await supabase
          .from('embeddings')
          .insert(embeddingInserts)
        if (embeddingInsertError) throw embeddingInsertError
        processedChunks += batch.length
        await safeUpdateJob(jobId, {
          message: `Processed ${processedChunks} chunks`,
        })
        batch = []
      }

      if (batch.length > 0) {
        const batchEmbeddings: number[][] = []
        for (const b of batch) {
          batchEmbeddings.push(await generateEmbedding(b.content))
        }
        const chunkInserts = batch.map((c) => ({
          document_id: documentId,
          chunk_number: c.index,
          content: c.content,
          token_count: Math.ceil(c.content.length / 4),
        }))
        const { data: chunkRows, error: chunkInsertError } = await supabase
          .from('document_chunks')
          .insert(chunkInserts)
          .select('id')
        if (chunkInsertError || !chunkRows) {
          throw chunkInsertError ?? new Error('Failed to insert document chunks')
        }
        const embeddingInserts = chunkRows.map((row, i) => ({
          chunk_id: row.id,
          embedding: batchEmbeddings[i],
          model_name: EMBEDDING_MODEL_NAME,
        }))
        const { error: embeddingInsertError } = await supabase
          .from('embeddings')
          .insert(embeddingInserts)
        if (embeddingInsertError) throw embeddingInsertError
        processedChunks += batch.length
      }

      await safeUpdateJob(jobId, {
        status: 'completed',
        message: `Finished processing ${processedChunks} chunks`,
      })
    }
  } catch (error) {
    console.error('Background processing error:', error)
    await safeUpdateJob(jobId, {
      status: 'failed',
      message: 'Processing failed. Please try again.',
      error_details: error instanceof Error ? error.message : 'Unknown error',
    })
  } finally {
    if (tempPath) {
      fs.unlink(tempPath, () => {})
    }
  }
}

async function safeUpdateJob(
  jobId: string,
  updates: Parameters<typeof updateProcessingJob>[1],
) {
  if (!hasServiceSupabase()) {
    console.warn('Cannot update processing job: missing service role key')
    return
  }

  try {
    const supabase = getServiceSupabase()
    await updateProcessingJob(jobId, updates, supabase)
  } catch (error) {
    console.error('Failed to update processing job status', error)
  }
}
