import { createClient } from '@/lib/supabase/server'
import { getUserDocuments } from '@/lib/rag-db'

export async function GET() {
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

    // Get user's documents
    const documents = await getUserDocuments(user.id)

    return new Response(JSON.stringify({ documents }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    console.error(' Get documents error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch documents',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    )
  }
}
