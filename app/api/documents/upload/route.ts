import { chunkText, generateEmbedding, extractTextFromJSON } from '@/lib/embeddings'
import { createDocument, appendChunkEmbeddingBatch, createProcessingJob } from '@/lib/rag-db'
import { processDocumentInBackground } from '@/lib/document-processing'
import { hasServiceSupabase } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const STORAGE_BUCKET = 'MyBucket'
const STORAGE_UPLOAD_PREFIX = 'upload'

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB — lower limit to avoid heap OOM during processing
const EMBED_BATCH_SIZE = 25 // Smaller batches to avoid heap OOM in Node
const BACKGROUND_PROCESSING_ENABLED = hasServiceSupabase()

/** Sanitize filename for storage path (avoid path traversal, keep extension) */
function sanitizeStorageFileName(name: string): string {
  const base = name.replace(/^.*[/\\]/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  return base || 'file'
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const maxMB = MAX_FILE_SIZE_BYTES / 1024 / 1024
      return new Response(
        JSON.stringify({
          error: `File too large. Maximum size is ${maxMB}MB.`,
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }
      )
    }

    const allowedTypes = ['application/json', 'text/plain', 'text/json']
    if (!allowedTypes.includes(file.type)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid file type. Only JSON and text files are supported.',
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    // 1) Upload file to Supabase Storage (MyBucket/upload/...) — works with or without auth if bucket allows
    const safeName = sanitizeStorageFileName(file.name)
    const storagePath = `${STORAGE_UPLOAD_PREFIX}/${crypto.randomUUID()}-${safeName}`
    const fileBuffer = await file.arrayBuffer()

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return new Response(
        JSON.stringify({
          error: 'Failed to upload file to storage',
          details: uploadError.message,
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }
      )
    }

    // If no authenticated user, only storage upload; skip RAG DB (RLS requires auth)
    if (userError || !user) {
      return new Response(
        JSON.stringify({
          success: true,
          storagePath: uploadData?.path ?? storagePath,
          message: `File uploaded to storage. Sign in to index this document for chat.`,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    }

    const { documentId } = await createDocument(
      user.id,
      file.name,
      file.type,
      file.size
    )

    if (!BACKGROUND_PROCESSING_ENABLED) {
      return await processDocumentInlineResponse({
        file,
        documentId,
        storagePath: uploadData?.path ?? storagePath,
      })
    }

    const job = await createProcessingJob(documentId, user.id, storagePath)
    void processDocumentInBackground({
      jobId: job.id,
      documentId,
      userId: user.id,
      storagePath,
      filename: file.name,
      contentType: file.type,
      fileSize: file.size,
    })

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        jobId: job.id,
        storagePath: uploadData?.path ?? storagePath,
        message: 'Document queued for background processing',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    )
  } catch (error) {
    console.error(' Document upload error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to upload document',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    )
  }
}

interface InlineProcessingArgs {
  file: File
  documentId: string
  storagePath: string
}

async function processDocumentInlineResponse({
  file,
  documentId,
  storagePath,
}: InlineProcessingArgs) {
  const content = await file.text()
  let extractedText = ''
  if (file.type === 'application/json' || file.type === 'text/json') {
    try {
      const jsonData = JSON.parse(content)
      extractedText = extractTextFromJSON(jsonData)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON format' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }
  } else {
    extractedText = content
  }

  if (!extractedText.trim()) {
    return new Response(
      JSON.stringify({ error: 'File contains no readable text' }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }
    )
  }

  const chunks = chunkText(extractedText)

  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE)
    const batchEmbeddings: number[][] = []

    for (const chunk of batch) {
      const embedding = await generateEmbedding(chunk.content)
      batchEmbeddings.push(embedding)
    }

    await appendChunkEmbeddingBatch(documentId, batch, batchEmbeddings)
  }

  return new Response(
    JSON.stringify({
      success: true,
      documentId,
      storagePath,
      message: `Successfully processed ${file.name} with ${chunks.length} chunks`,
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
  )
}
