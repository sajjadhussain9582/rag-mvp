import { createClient } from '@/lib/supabase/server'
import { createChatSession, getChatHistory } from '@/lib/rag-db'

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
    const { title } = await request.json()

    // Create new chat session
    const sessionId = await createChatSession(user.id, title || 'New Chat')

    return new Response(
      JSON.stringify({
        success: true,
        sessionId,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    )
  } catch (error) {
    console.error(' Create session error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to create chat session',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    )
  }
}

export async function GET(request: Request) {
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

    // Get query params
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Missing sessionId' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Get chat history
    const history = await getChatHistory(sessionId)

    return new Response(
      JSON.stringify({
        messages: history,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    )
  } catch (error) {
    console.error(' Get history error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch chat history',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    )
  }
}
