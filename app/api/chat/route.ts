import { createUIMessageStreamResponse } from 'ai'
import { toBaseMessages, toUIMessageStream } from '@ai-sdk/langchain'
import {
  saveChatMessage,
  createChatSession,
  getMessagesForUser,
} from '@/lib/rag-db'
import { createClient } from '@/lib/supabase/server'
import { SupabaseRAGRetriever, documentsToSources } from '@/lib/langchain-rag'
import { streamAgent, type AgentGraphState } from '@/lib/agent-graph'
import { isAIMessage } from '@langchain/core/messages'

export const maxDuration = 60

interface ChatRequest {
  messages: Array<{
    id?: string
    role: 'user' | 'assistant'
    content: string
    parts?: unknown[]
  }>
  sessionId?: string
}

/** Extract plain text from LangChain message content (string or content blocks). */
function getMessageContentAsText(message: { content?: unknown }): string {
  const c = message.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return (c as Array<{ type?: string; text?: string }>)
      .map((block) => (block.type === 'text' && block.text ? block.text : ''))
      .join('')
  }
  return ''
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest
    const { messages } = body
    const rawSessionId = body.sessionId

    const supabase = await createClient()
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

    const sessionId =
      rawSessionId && typeof rawSessionId === 'string' && rawSessionId.trim()
        ? rawSessionId
        : await createChatSession(user.id, 'New Chat')

    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'user') {
      return new Response(JSON.stringify({ error: 'Invalid message format' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    const userQuery =
      typeof lastMessage.content === 'string'
        ? lastMessage.content
        : Array.isArray(lastMessage.parts)
          ? (lastMessage.parts as Array<{ type: string; text?: string }>)
              .filter((p): p is { type: string; text: string } => p.type === 'text' && typeof p.text === 'string')
              .map((p) => p.text)
              .join('')
          : ''

    // Initial RAG retrieval for user-message sources (preserve current behavior)
    const retriever = new SupabaseRAGRetriever({
      userId: user.id,
      k: 5,
      threshold: 0.4,
    })
    const docs = await retriever.invoke(userQuery)
    const sources = documentsToSources(docs)

    await saveChatMessage(sessionId, 'user', userQuery, sources.length > 0 ? sources : undefined)

    const langchainMessages = await toBaseMessages(messages as Parameters<typeof toBaseMessages>[0])
    const graphStream = await streamAgent(user.id, langchainMessages)

    const stream = toUIMessageStream<AgentGraphState>(graphStream, {
      onFinish: async (finalState) => {
        try {
          const msgs = finalState?.messages
          if (!Array.isArray(msgs) || msgs.length === 0) return
          const lastAi = [...msgs].reverse().find((m) => isAIMessage(m))
          if (lastAi) {
            const assistantText = getMessageContentAsText(lastAi) || 'Unable to generate response'
            await saveChatMessage(sessionId, 'assistant', assistantText, undefined)
          }
        } catch (err) {
          console.error('Failed to save assistant message:', err)
        }
      },
    })

    const response = createUIMessageStreamResponse({
      stream,
      headers: { 'X-Session-Id': sessionId },
    })
    return response
  } catch (error) {
    console.error(' Chat API error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to process chat request',
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
  const supabase = await createClient()
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

  try {
    const messages = await getMessagesForUser(user.id)
    return new Response(JSON.stringify({ messages }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    console.error('Chat GET error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch messages',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    )
  }
}
