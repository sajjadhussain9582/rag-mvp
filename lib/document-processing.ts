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
import { appendChunkEmbeddingBatch } from '@/lib/rag-db'

const EMBED_BATCH_SIZE = 25

/**
 * Stream a Blob (e.g. File from multipart) to a temp file to avoid loading the whole file in memory.
 */
export async function streamBlobToTempFile(blob: Blob): Promise<string> {
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
export async function* streamChunksFromFile(
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

/**
 * Process a temp file: parse (JSON or plain text), chunk with FS streaming where possible,
 * embed batches, and insert into document_chunks + embeddings via appendChunkEmbeddingBatch.
 * Uses request-scoped createClient() inside rag-db so RLS is correct.
 */
export async function processDocumentFromTempFile(
  tempPath: string,
  documentId: string,
  contentType: string
): Promise<{ chunkCount: number }> {
  const isJson =
    contentType === 'application/json' || contentType === 'text/json'

  let chunkCount = 0

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

    let batch: Array<{ content: string; index: number }> = []

    for (const chunk of chunkTextIterator(extractedText)) {
      batch.push(chunk)
      if (batch.length < EMBED_BATCH_SIZE) continue

      const batchEmbeddings: number[][] = []
      for (const b of batch) {
        batchEmbeddings.push(await generateEmbedding(b.content))
      }
      await appendChunkEmbeddingBatch(documentId, batch, batchEmbeddings)
      chunkCount += batch.length
      batch = []
    }

    if (batch.length > 0) {
      const batchEmbeddings: number[][] = []
      for (const b of batch) {
        batchEmbeddings.push(await generateEmbedding(b.content))
      }
      await appendChunkEmbeddingBatch(documentId, batch, batchEmbeddings)
      chunkCount += batch.length
    }
  } else {
    let batch: Array<{ content: string; index: number }> = []

    for await (const chunk of streamChunksFromFile(tempPath)) {
      batch.push(chunk)
      if (batch.length < EMBED_BATCH_SIZE) continue

      const batchEmbeddings: number[][] = []
      for (const b of batch) {
        batchEmbeddings.push(await generateEmbedding(b.content))
      }
      await appendChunkEmbeddingBatch(documentId, batch, batchEmbeddings)
      chunkCount += batch.length
      batch = []
    }

    if (batch.length > 0) {
      const batchEmbeddings: number[][] = []
      for (const b of batch) {
        batchEmbeddings.push(await generateEmbedding(b.content))
      }
      await appendChunkEmbeddingBatch(documentId, batch, batchEmbeddings)
      chunkCount += batch.length
    }
  }

  return { chunkCount }
}
