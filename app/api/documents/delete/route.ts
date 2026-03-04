import { createClient } from '@/lib/supabase/server'
import { deleteDocument } from '@/lib/rag-db'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Parse request
    const { documentId } = await request.json()

    if (!documentId) {
      return new Response(JSON.stringify({ error: 'Missing documentId' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Delete document
    await deleteDocument(documentId, user.id)

    return new Response(
      JSON.stringify({ success: true, message: 'Document deleted successfully' }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    )
  } catch (error) {
    console.error(' Delete document error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to delete document',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    )
  }
}
