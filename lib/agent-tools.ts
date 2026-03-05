import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import {
  SupabaseRAGRetriever,
  formatDocumentsAsContext,
  documentsToSources,
} from '@/lib/langchain-rag'
import type { ChatSource } from '@/lib/rag-db'

/** Create the document search tool bound to a user. Returns context string and source list for citations. */
export function createDocumentSearchTool(userId: string) {
  return tool(
    async ({ query }: { query: string }) => {
      try {
        const retriever = new SupabaseRAGRetriever({
          userId,
          k: 5,
          threshold: 0.4,
        })
        const docs = await retriever.invoke(query?.trim() || '')
        const context = formatDocumentsAsContext(docs)
        const sources = documentsToSources(docs)
        return JSON.stringify({ context, sources })
      } catch (e) {
        console.error('Document search tool error:', e)
        return JSON.stringify({
          context: 'Error searching documents. Please try again.',
          sources: [] as ChatSource[],
        })
      }
    },
    {
      name: 'search_my_documents',
      description:
        'Search the user\'s uploaded documents for relevant information. Use this first when the user asks about their documents or data. Input: search query string.',
      schema: z.object({
        query: z.string().describe('The search query to find relevant document chunks'),
      }),
    }
  )
}

/** Web search tool (Tavily). Returns null if TAVILY_API_KEY is not set so the agent can run without it. */
export async function getWebSearchTool(): Promise<ReturnType<typeof tool> | null> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey?.trim()) return null

  try {
    const { TavilySearchAPIRetriever } = await import('@langchain/community/retrievers/tavily_search_api')
    const retriever = new TavilySearchAPIRetriever({
      apiKey,
      k: 5,
      searchDepth: 'basic',
    })
    return tool(
      async ({ query }: { query: string }) => {
        try {
          const docs = await retriever.invoke(query?.trim() || '')
          if (!docs?.length) return 'No web results found.'
          return docs
            .map((d) => {
              const title = d.metadata?.title ? `**${d.metadata.title}**\n` : ''
              const url = (d.metadata?.source ?? d.metadata?.url) ? `Source: ${d.metadata.source ?? d.metadata.url}\n` : ''
              return `${title}${url}${d.pageContent}`.trim()
            })
            .join('\n\n---\n\n')
        } catch (e) {
          console.error('Web search tool error:', e)
          return 'Web search failed. Please try again or rely on document search only.'
        }
      },
      {
        name: 'web_search',
        description:
          'Search the web for current or general information when the answer is not in the user\'s documents. Use for recent events, general knowledge, or when document search returns nothing relevant.',
        schema: z.object({
          query: z.string().describe('The search query for the web'),
        }),
      }
    )
  } catch {
    return null
  }
}
