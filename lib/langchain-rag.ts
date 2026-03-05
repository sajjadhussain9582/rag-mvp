import { BaseRetriever } from '@langchain/core/retrievers'
import { Document } from '@langchain/core/documents'
import type { BaseRetrieverInput } from '@langchain/core/retrievers'
import { PromptTemplate } from '@langchain/core/prompts'
import { generateEmbedding } from '@/lib/embeddings'
import {
  searchDocuments,
  searchDocumentsFallback,
  type SearchResult,
  type ChatSource,
} from '@/lib/rag-db'

const DEFAULT_K = 5
const DEFAULT_THRESHOLD = 0.4

export interface RAGRetrieverInput extends BaseRetrieverInput {
  userId: string
  k?: number
  threshold?: number
}

/**
 * LangChain retriever that uses our Supabase/pgvector search.
 * Embeds the query and returns LangChain Documents for RAG.
 */
export class SupabaseRAGRetriever extends BaseRetriever {
  userId: string
  k: number
  threshold: number

  constructor(fields: RAGRetrieverInput) {
    super(fields)
    this.userId = fields.userId
    this.k = fields.k ?? DEFAULT_K
    this.threshold = fields.threshold ?? DEFAULT_THRESHOLD
  }

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    const trimmed = query?.trim()
    if (!trimmed) return []

    let queryEmbedding: number[] = []
    try {
      queryEmbedding = await generateEmbedding(trimmed)
    } catch (e) {
      console.error('LangChain retriever: embedding failed', e)
      return []
    }

    if (queryEmbedding.length === 0) return []

    let results: SearchResult[] = []
    try {
      results = await searchDocuments(this.userId, queryEmbedding, this.k, this.threshold)
    } catch {
      results = await searchDocumentsFallback(this.userId, queryEmbedding, this.k)
    }

    return results.map((r) => ({
      pageContent: r.content,
      metadata: {
        chunkId: r.chunkId,
        documentId: r.documentId,
        filename: r.filename,
        similarity: r.similarity,
      },
    })) as Document[]
  }
}

/** Map LangChain documents to ChatSource[] for citations (RAG tool and route). */
export function documentsToSources(docs: Document[]): ChatSource[] {
  return docs.map((d) => ({
    chunkId: (d.metadata?.chunkId as string) ?? '',
    filename: (d.metadata?.filename as string) ?? 'Unknown',
    content: d.pageContent,
    similarity: (d.metadata?.similarity as number) ?? 0,
  }))
}

/** Build RAG context string from LangChain documents (for system prompt) */
export function formatDocumentsAsContext(docs: Document[]): string {
  if (docs.length === 0) {
    return 'No relevant documents found in the knowledge base. Responding based on general knowledge:\n\n'
  }
  let out = 'Based on the provided documents, here is relevant information:\n\n'
  for (const d of docs) {
    const filename = (d.metadata?.filename as string) ?? 'Unknown'
    out += `[From ${filename}]\n${d.pageContent}\n\n`
  }
  return out
}

/** LangChain prompt template for the RAG system instructions */
export const RAG_SYSTEM_PROMPT_TEMPLATE = PromptTemplate.fromTemplate(
  `You are a helpful AI assistant that answers questions based on provided documents.

Document Context:
{context}

IMPORTANT INSTRUCTIONS:
1. Only provide information that exists in the provided documents
2. If the user asks about something not covered in the documents, clearly state that it's not in your knowledge base
3. When referencing information from documents, cite the source
4. If no relevant documents were found, politely explain that you cannot answer the question based on your current knowledge base
5. Be honest about the limitations of your knowledge
`
)