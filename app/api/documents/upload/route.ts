import { createDocument } from '@/lib/rag-db'
import { streamBlobToTempFile, processDocumentFromTempFile } from '@/lib/document-processing'
import { createClient } from '@/lib/supabase/server'
import fs from 'fs'

export const maxDuration = 60

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

export async function POST(request: Request) {
  let tempPath: string | null = null

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

    const allowedTypes = ['application/json', 'text/plain', 'text/json', 'application/pdf']
    const isPdfByExtension = file.name.toLowerCase().endsWith('.pdf')
    if (!allowedTypes.includes(file.type) && !isPdfByExtension) {
      return new Response(
        JSON.stringify({
          error: 'Invalid file type. Only JSON, text, and PDF files are supported.',
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }
      )
    }

    const contentType =
      isPdfByExtension && file.type !== 'application/pdf'
        ? 'application/pdf'
        : file.type

    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Sign in to upload documents' }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }
      )
    }

    tempPath = await streamBlobToTempFile(file)

    const { documentId } = await createDocument(
      user.id,
      file.name,
      contentType,
      file.size
    )

    const { chunkCount } = await processDocumentFromTempFile(
      tempPath,
      documentId,
      contentType
    )

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        message: `Successfully processed ${chunkCount} chunks`,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Document upload error:', error)
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
  } finally {
    if (tempPath) {
      fs.unlink(tempPath, () => {})
    }
  }
}
