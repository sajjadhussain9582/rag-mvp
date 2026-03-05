import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { ChatOpenAI } from '@langchain/openai'
import type { BaseMessage } from '@langchain/core/messages'
import { createDocumentSearchTool } from '@/lib/agent-tools'
import { getWebSearchTool } from '@/lib/agent-tools'

const AGENT_SYSTEM_PROMPT = `You are a helpful AI assistant that answers questions using the user's uploaded documents and, when needed, web search.

RULES:
1. Prefer searching the user's documents first with search_my_documents when the question is about their data or uploaded content.
2. Use web_search when the answer is not in the documents, for current events, or general knowledge.
3. You may call both tools if needed (e.g. documents first, then web to supplement).
4. Cite sources when you use information from documents or web results.
5. If no relevant information is found, say so clearly.
6. Be concise and accurate.`

/** Build the agent graph with RAG + optional web search tools. Call once per request (needs userId for RAG). */
export async function getAgentGraph(userId: string) {
  const docTool = createDocumentSearchTool(userId)
  const webTool = await getWebSearchTool()
  const tools = [docTool, ...(webTool ? [webTool] : [])]

  const model = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
  })

  return createReactAgent({
    llm: model,
    tools,
    prompt: AGENT_SYSTEM_PROMPT,
  })
}

/** State shape from createReactAgent (messages array). */
export interface AgentGraphState {
  messages: BaseMessage[]
}

/** Max agent steps (agent → tools → agent …) to avoid long runs. */
const DEFAULT_RECURSION_LIMIT = 10

/** Stream the agent; input messages must be LangChain BaseMessage[]. */
export async function streamAgent(
  userId: string,
  messages: BaseMessage[],
  options?: { maxConcurrency?: number; recursionLimit?: number }
) {
  const graph = await getAgentGraph(userId)
  return graph.stream(
    { messages },
    {
      streamMode: ['values', 'messages'],
      maxConcurrency: options?.maxConcurrency ?? 5,
      recursionLimit: options?.recursionLimit ?? DEFAULT_RECURSION_LIMIT,
    }
  )
}
