import { createClient } from '@/lib/supabase/server'

export interface DocumentMetadata {
  id: string
  filename: string
  contentType: string
  fileSize: number
  createdAt: string
}

export interface ChunkWithEmbedding {
  id: string
  content: string
  embedding: number[]
  documentId: string
  chunkNumber: number
}

export interface SearchResult {
  chunkId: string
  documentId: string
  filename: string
  content: string
  similarity: number
}

export interface ChatSource {
  chunkId: string
  content: string
  similarity: number
  filename: string
}

const EMBEDDING_MODEL_NAME = 'text-embedding-3-small'

export async function createDocument(
  userId: string,
  filename: string,
  contentType: string,
  fileSize: number
): Promise<{ documentId: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('documents')
    .insert({
      user_id: userId,
      filename,
      content_type: contentType,
      file_size: fileSize,
    })
    .select('id')
    .single()
  if (error) throw error
  return { documentId: data.id }
}


export async function appendChunkEmbeddingBatch(
  documentId: string,
  chunks: Array<{ content: string; index: number }>,
  embeddings: number[][]
): Promise<void> {
  if (chunks.length === 0 || embeddings.length !== chunks.length) return
  const supabase = await createClient()

  const chunkInserts = chunks.map((chunk) => ({
    document_id: documentId,
    chunk_number: chunk.index,
    content: chunk.content,
    token_count: Math.ceil(chunk.content.length / 4),
  }))

  const { data: chunkData, error: chunkError } = await supabase
    .from('document_chunks')
    .insert(chunkInserts)
    .select('id')
  if (chunkError) throw chunkError

  const embeddingInserts = chunkData!.map((row, index) => ({
    chunk_id: row.id,
    embedding: embeddings[index],
    model_name: EMBEDDING_MODEL_NAME,
  }))
  const { error: embError } = await supabase.from('embeddings').insert(embeddingInserts)
  if (embError) throw embError
}

export async function storeDocument(
  userId: string,
  filename: string,
  contentType: string,
  fileSize: number,
  chunks: Array<{ content: string; index: number }>,
  embeddings: number[][]
) {
  const { documentId } = await createDocument(userId, filename, contentType, fileSize)
  await appendChunkEmbeddingBatch(documentId, chunks, embeddings)
  return { success: true, documentId }
}

export async function searchDocuments(
  userId: string,
  queryEmbedding: number[],
  limit: number = 5,
  threshold: number = 0.4
): Promise<SearchResult[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('search_embeddings', {
    query_embedding: queryEmbedding,
    user_id: userId,
    match_count: limit,
    match_threshold: threshold,
  })
  if (error) {
    console.error(' Search error:', error)
    throw error
  }
  const rows = (data ?? []) as Array<{ chunk_id: string; document_id: string; filename: string; content: string; similarity: number }>
  return rows.map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    filename: row.filename,
    content: row.content,
    similarity: row.similarity,
  }))
}

/** Parse embedding from DB (pgvector can return string or number[]) */
function parseEmbedding(embedding: unknown): number[] {
  if (Array.isArray(embedding)) return embedding
  if (typeof embedding === 'string') {
    try {
      const parsed = JSON.parse(embedding) as number[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const FALLBACK_FETCH_SIZE = 100

export async function searchDocumentsFallback(
  userId: string,
  queryEmbedding: number[],
  limit: number = 5
): Promise<SearchResult[]> {
  const supabase = await createClient()

  try {
    // Fetch a larger pool so we can rank by similarity (no vector ORDER BY in this path)
    const { data, error } = await supabase
      .from('embeddings')
      .select(
        `
        id,
        embedding,
        chunk_id,
        document_chunks!inner(
          id,
          content,
          chunk_number,
          documents!inner(
            id,
            filename,
            user_id
          )
        )
      `
      )
      .eq('document_chunks.documents.user_id', userId)
      .limit(FALLBACK_FETCH_SIZE)

    if (error) {
      console.error(' Fallback search error:', error)
      return []
    }

    // Parse embeddings (pgvector often returns string), compute similarity, sort, then filter
    const results = (data || [])
      .map((row: any) => {
        const embedding = parseEmbedding(row.embedding)
        const similarity = cosineSimilarity(queryEmbedding, embedding)
        return {
          chunkId: row.chunk_id,
          documentId: row.document_chunks.documents.id,
          filename: row.document_chunks.documents.filename,
          content: row.document_chunks.content,
          similarity,
        }
      })
      .filter((r) => r.similarity >= 0.7)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)

    return results
  } catch (error) {
    console.error(' Error in fallback search:', error)
    return []
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}

/**
 * Create a new chat session
 */
export async function createChatSession(userId: string, title: string = 'New Chat') {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: userId,
        title,
      })
      .select('id')
      .single()

    if (error) throw error
    return data.id
  } catch (error) {
    console.error(' Error creating chat session:', error)
    throw error
  }
}

/**
 * Save a chat message with sources
 */
export async function saveChatMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  sources?: ChatSource[]
) {
  const supabase = await createClient()

  try {
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      role,
      content,
      sources: sources || null,
    })
  } catch (error) {
    console.error(' Error saving chat message:', error)
    throw error
  }
}

/**
 * Get chat sessions for a user (for listing / switching conversations)
 */
export async function getChatSessions(userId: string) {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id, title, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  } catch (error) {
    console.error(' Error fetching chat sessions:', error)
    return []
  }
}

/**
 * Get chat history for a session
 */
export async function getChatHistory(sessionId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return data
  } catch (error) {
    console.error(' Error fetching chat history:', error)
    return []
  }
}


export async function getMessagesForUser(userId: string) {
  const supabase = await createClient()
  try {
    const { data: sessions, error: sessionsError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('user_id', userId)
    if (sessionsError) throw sessionsError
    const sessionIds = (sessions ?? []).map((s) => s.id)
    if (sessionIds.length === 0) return []
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data ?? []
  } catch (error) {
    console.error(' Error fetching messages for user:', error)
    return []
  }
}

/**
 * Get user's documents
 */
export async function getUserDocuments(userId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  } catch (error) {
    console.error(' Error fetching documents:', error)
    return []
  }
}

/**
 * Delete a document and all its related data
 */
export async function deleteDocument(documentId: string, userId: string) {
  const supabase = await createClient()

  try {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('user_id', userId)

    if (error) throw error
  } catch (error) {
    console.error(' Error deleting document:', error)
    throw error
  }
}

