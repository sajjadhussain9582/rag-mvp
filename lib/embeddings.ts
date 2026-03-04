import { embed } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const CHUNK_SIZE = 500 // characters per chunk
const CHUNK_OVERLAP = 50 // overlap between chunks for context

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateEmbedding(text: string): Promise<number[]> {
  const input = typeof text === 'string' ? text.trim() : ''
  if (!input) {
    return []
  }
  try {
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: input,
    })
    return embedding
  } catch (error) {
    console.error(' Error generating embedding:', error)
    throw new Error('Failed to generate embedding')
  }
}

/**
 * Splits text into chunks with overlap for better semantic continuity
 */
export function chunkText(text: string): Array<{ content: string; index: number }> {
  const chunks: Array<{ content: string; index: number }> = []
  let start = 0
  let index = 0

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    const chunk = text.substring(start, end)
    
    if (chunk.trim()) {
      chunks.push({ content: chunk, index })
      index++
    }
    
    start = end - CHUNK_OVERLAP
    if (start < 0) break
  }

  return chunks.length > 0 ? chunks : [{ content: text, index: 0 }]
}

export const CHUNK_SIZE_CHARS = CHUNK_SIZE
export const CHUNK_OVERLAP_CHARS = CHUNK_OVERLAP

/**
 * Yields chunks one at a time (avoids holding full chunks array in memory).
 */
export function* chunkTextIterator(
  text: string
): Generator<{ content: string; index: number }> {
  let start = 0
  let index = 0
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    const slice = text.substring(start, end)
    if (slice.trim()) {
      yield { content: slice, index }
      index++
    }
    start = end - CHUNK_OVERLAP
    if (start < 0) break
  }
  if (index === 0) yield { content: text, index: 0 }
}

/**
 * Extracts text from JSON document structure
 */
export function extractTextFromJSON(data: Record<string, any>): string {
  const texts: string[] = []

  function traverse(obj: any) {
    if (typeof obj === 'string') {
      texts.push(obj)
    } else if (Array.isArray(obj)) {
      obj.forEach(traverse)
    } else if (typeof obj === 'object' && obj !== null) {
      Object.values(obj).forEach(traverse)
    }
  }

  traverse(data)
  return texts.join('\n\n')
}

/**
 * Counts approximate tokens in text (rough estimate)
 */
export function estimateTokenCount(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4)
}
