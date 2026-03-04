import { streamText, convertToModelMessages } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import {
  saveChatMessage,
  createChatSession,
  getMessagesForUser,
} from '@/lib/rag-db'
import { createClient } from '@/lib/supabase/server'
import {
  SupabaseRAGRetriever,
  formatDocumentsAsContext,
  RAG_SYSTEM_PROMPT_TEMPLATE,
} from '@/lib/langchain-rag'

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const maxDuration = 60

interface ChatRequest {
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    parts?: any[]
  }>
  sessionId?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest
    const { messages } = body
    const rawSessionId = body.sessionId

    // Get current user first — we need user for everything
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

    // Use provided sessionId or create a new session for this user
    const sessionId =
      rawSessionId && typeof rawSessionId === 'string' && rawSessionId.trim()
        ? rawSessionId
        : await createChatSession(user.id, 'New Chat')

    // Get the last user message
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'user') {
      return new Response(JSON.stringify({ error: 'Invalid message format' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }

    // Normalize user message to string (client may send content or parts)
    const userQuery =
      typeof lastMessage.content === 'string'
        ? lastMessage.content
        : Array.isArray(lastMessage.parts)
          ? (lastMessage.parts as Array<{ type: string; text?: string }>)
              .filter((p): p is { type: string; text: string } => p.type === 'text' && typeof p.text === 'string')
              .map((p) => p.text)
              .join('')
          : ''

    // LangChain: retrieve relevant docs and build RAG context
    const retriever = new SupabaseRAGRetriever({
      userId: user.id,
      k: 5,
      threshold: 0.4,
    })
    const docs = await retriever.invoke(userQuery)
    const ragContext = formatDocumentsAsContext(docs)
    const sources = docs.map((d) => ({
      chunkId: d.metadata?.chunkId as string,
      filename: (d.metadata?.filename as string) ?? 'Unknown',
      content: d.pageContent,
      similarity: (d.metadata?.similarity as number) ?? 0,
    }))
    const systemPrompt = await RAG_SYSTEM_PROMPT_TEMPLATE.format({ context: ragContext })

    // Convert messages for the model
    const modelMessages = await convertToModelMessages(messages as Parameters<typeof convertToModelMessages>[0])

    // Call the streaming text function (OpenAI provider uses OPENAI_API_KEY)
    const result = streamText({
      model: openai.chat('gpt-4o-mini'),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens: 1024,
    })

    // Save user message
    await saveChatMessage(sessionId, 'user', userQuery, sources.length > 0 ? sources : undefined)

    // Stream the response and save it; include sessionId in header so client can store it
    const streamResponse = result.toUIMessageStreamResponse({
      onFinish: async ({ responseMessage }) => {
        try {
          const msg = responseMessage as { content?: string; parts?: Array<{ type: string; text?: string }> }
          const content =
            typeof msg.content === 'string'
              ? msg.content
              : msg.parts
                  ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                  .map((p) => p.text)
                  .join('') ?? ''
          const assistantText = content || 'Unable to generate response'
          await saveChatMessage(sessionId, 'assistant', assistantText, undefined)
        } catch (err) {
          console.error(' Failed to save assistant message:', err)
        }
      },
    })
    streamResponse.headers.set('X-Session-Id', sessionId)
    return streamResponse
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
