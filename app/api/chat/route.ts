import { streamText, convertToModelMessages } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { generateEmbedding } from '@/lib/embeddings'
import {
  searchDocumentsFallback,
  saveChatMessage,
  SearchResult,
} from '@/lib/rag-db'
import { createClient } from '@/lib/supabase/server'

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const maxDuration = 60

interface ChatRequest {
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    parts?: any[]
  }>
  sessionId: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest
    const { messages, sessionId } = body

    // Get current user
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

    // Generate embedding for the user query
    let queryEmbedding: number[] = []
    try {
      if (userQuery.trim()) {
        queryEmbedding = await generateEmbedding(userQuery)
      }
    } catch (error) {
      console.error(' Failed to generate query embedding:', error)
      // Continue without embeddings - will respond without RAG context
    }

    // Search for relevant documents
    let searchResults: SearchResult[] = []
    if (queryEmbedding.length > 0) {
      searchResults = await searchDocumentsFallback(user.id, queryEmbedding, 5)
    }
    console.log('searchResults', searchResults,user.id, queryEmbedding)
    // Build RAG context from search results
    let ragContext = ''
    const sources = []

    if (searchResults.length > 0) {
      ragContext = 'Based on the provided documents, here is relevant information:\n\n'
      for (const result of searchResults) {
        ragContext += `[From ${result.filename}]\n${result.content}\n\n`
        sources.push({
          chunkId: result.chunkId,
          filename: result.filename,
          content: result.content,
          similarity: result.similarity,
        })
      }
    } else {
      ragContext =
        'No relevant documents found in the knowledge base. Responding based on general knowledge:\n\n'
    }

    // Build system prompt for RAG
    const systemPrompt = `You are a helpful AI assistant that answers questions based on provided documents.

${ragContext ? `Document Context:\n${ragContext}` : 'No document context available.'}

IMPORTANT INSTRUCTIONS:
1. Only provide information that exists in the provided documents
2. If the user asks about something not covered in the documents, clearly state that it's not in your knowledge base
3. When referencing information from documents, cite the source
4. If no relevant documents were found, politely explain that you cannot answer the question based on your current knowledge base
5. Be honest about the limitations of your knowledge
`

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

    // Stream the response and save it
    return result.toUIMessageStreamResponse({
      onFinish: async ({ responseMessage }) => {
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
      },
    })
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
