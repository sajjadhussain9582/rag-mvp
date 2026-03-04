-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table: stores uploaded documents with metadata
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT,
  file_size INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_documents ON documents(user_id);

-- Document chunks table: stores text chunks extracted from documents
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunk_number ON document_chunks(document_id, chunk_number);

-- Embeddings table: stores vector embeddings of document chunks
CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL UNIQUE REFERENCES document_chunks(id) ON DELETE CASCADE,
  embedding vector(1536), -- OpenAI embedding dimensions
  model_name TEXT DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embedding_chunk ON embeddings(chunk_id);

-- Document processing jobs table: tracks background chunking status
CREATE TABLE IF NOT EXISTS document_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT,
  error_details TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_document ON document_processing_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_user ON document_processing_jobs(user_id);

-- Chat sessions table: stores conversation sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions ON chat_sessions(user_id);

-- Chat messages table: stores individual messages in a conversation
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB, -- Array of referenced document chunk IDs and their content
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_messages ON chat_messages(session_id);

-- Enable Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for documents table
CREATE POLICY "documents_select_own" ON documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "documents_insert_own" ON documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "documents_update_own" ON documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "documents_delete_own" ON documents FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for document_chunks table (via user's documents)
CREATE POLICY "chunks_select_own" ON document_chunks FOR SELECT USING (
  document_id IN (SELECT id FROM documents WHERE user_id = auth.uid())
);
CREATE POLICY "chunks_insert_own" ON document_chunks FOR INSERT WITH CHECK (
  document_id IN (SELECT id FROM documents WHERE user_id = auth.uid())
);
CREATE POLICY "chunks_delete_own" ON document_chunks FOR DELETE USING (
  document_id IN (SELECT id FROM documents WHERE user_id = auth.uid())
);

-- RLS Policies for embeddings table (via user's document chunks)
CREATE POLICY "embeddings_select_own" ON embeddings FOR SELECT USING (
  chunk_id IN (
    SELECT dc.id FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE d.user_id = auth.uid()
  )
);
CREATE POLICY "embeddings_insert_own" ON embeddings FOR INSERT WITH CHECK (
  chunk_id IN (
    SELECT dc.id FROM document_chunks dc
    JOIN documents d ON dc.document_id = d.id
    WHERE d.user_id = auth.uid()
  )
);

-- RLS Policies for chat_sessions table
CREATE POLICY "sessions_select_own" ON chat_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sessions_insert_own" ON chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_update_own" ON chat_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "sessions_delete_own" ON chat_sessions FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for chat_messages table
CREATE POLICY "messages_select_own" ON chat_messages FOR SELECT USING (
  session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "messages_insert_own" ON chat_messages FOR INSERT WITH CHECK (
  session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "messages_delete_own" ON chat_messages FOR DELETE USING (
  session_id IN (SELECT id FROM chat_sessions WHERE user_id = auth.uid())
);

-- RLS Policies for document processing jobs
ALTER TABLE document_processing_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "processing_jobs_select_own" ON document_processing_jobs FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY "processing_jobs_insert_own" ON document_processing_jobs FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "processing_jobs_update_own" ON document_processing_jobs FOR UPDATE USING (
  user_id = auth.uid()
);

-- Create index for vector similarity search
CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops);
