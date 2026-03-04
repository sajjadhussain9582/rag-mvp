import { createDocument } from '@/lib/rag-db'
import { streamBlobToTempFile, processDocumentFromTempFile } from '@/lib/document-processing'
import { createClient } from '@/lib/supabase/server'
import fs from 'fs'

export const maxDuration = 60

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB — avoid heap OOM and long request duration

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
      file.type,
      file.size
    )

    const { chunkCount } = await processDocumentFromTempFile(
      tempPath,
      documentId,
      file.type
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
