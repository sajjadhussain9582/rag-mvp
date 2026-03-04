# RAG Chatbot Application

An AI-powered Retrieval-Augmented Generation (RAG) chatbot built with Next.js 16, Supabase, LangChain patterns, and OpenAI's GPT-4o Mini model. This application demonstrates how to combine document retrieval with large language models to create an intelligent Q&A system that answers questions based on custom domain-specific data.

## Features

- **Document Management**: Upload JSON or text files containing domain-specific data
- **Semantic Search**: Uses OpenAI embeddings (text-embedding-3-small) with pgvector for vector similarity search
- **Intelligent Chat**: GPT-4o Mini model answers questions based on retrieved documents
- **Source Citations**: Every response includes citations showing which documents provided the information
- **Chat History**: Maintains conversation history for context awareness
- **Error Handling**: Graceful handling when no relevant data is found
- **Security**: Row Level Security (RLS) policies ensure users only see their own documents
- **Real-time Processing**: Documents are processed and chunked immediately upon upload

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **AI/LLM**: Vercel AI SDK 6, OpenAI GPT-4o Mini
- **Embeddings**: OpenAI text-embedding-3-small
- **Database**: Supabase PostgreSQL with pgvector extension
- **Vector Search**: pgvector for semantic similarity search
- **UI Components**: shadcn/ui, Tailwind CSS
- **Authentication**: Supabase Auth

## Project Structure

```
app/
├── api/
│   ├── chat/
│   │   ├── route.ts           # Main RAG chat endpoint
│   │   └── session/
│   │       └── route.ts       # Chat session management
│   └── documents/
│       ├── upload/
│       │   └── route.ts       # Document upload and processing
│       ├── list/
│       │   └── route.ts       # List user documents
│       └── delete/
│           └── route.ts       # Delete document
├── chat/
│   └── page.tsx               # Chat interface
├── documents/
│   └── page.tsx               # Document management
└── layout.tsx                 # Root layout with header
lib/
├── embeddings.ts              # OpenAI embedding generation
├── rag-db.ts                  # RAG database operations
└── supabase/
    ├── client.ts              # Browser client
    └── server.ts              # Server client
components/
├── chat-input.tsx             # Chat input component
├── chat-message.tsx           # Message display with sources
├── document-upload.tsx        # File upload component
├── header.tsx                 # Navigation header
└── ui/                        # shadcn/ui components
scripts/
└── 001_create_rag_schema.sql # Database migration
public/
└── sample-data.json           # Sample document for testing
```

## Database Schema

### documents
Stores uploaded documents with metadata
- `id` (UUID): Primary key
- `user_id` (UUID): Foreign key to auth.users
- `filename` (TEXT): Original filename
- `content_type` (TEXT): MIME type
- `file_size` (INTEGER): File size in bytes
- `created_at` (TIMESTAMP): Upload timestamp

### document_chunks
Stores text chunks extracted from documents
- `id` (UUID): Primary key
- `document_id` (UUID): Foreign key to documents
- `chunk_number` (INTEGER): Sequential chunk number
- `content` (TEXT): Chunk text content
- `token_count` (INTEGER): Estimated token count

### embeddings
Stores vector embeddings for semantic search
- `id` (UUID): Primary key
- `chunk_id` (UUID): Foreign key to document_chunks
- `embedding` (vector(1536)): OpenAI embedding vector
- `model_name` (TEXT): Embedding model used

### chat_sessions
Stores conversation sessions
- `id` (UUID): Primary key
- `user_id` (UUID): Foreign key to auth.users
- `title` (TEXT): Session title
- `created_at` (TIMESTAMP): Creation timestamp

### chat_messages
Stores individual messages in conversations
- `id` (UUID): Primary key
- `session_id` (UUID): Foreign key to chat_sessions
- `role` (TEXT): 'user' or 'assistant'
- `content` (TEXT): Message content
- `sources` (JSONB): Array of referenced sources

## Setup Instructions

### 1. Environment Variables

Add these to your `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
```

### 2. Database Setup

The SQL migration script (`scripts/001_create_rag_schema.sql`) will be executed automatically. It creates:
- All required tables
- pgvector extension
- Row Level Security policies
- Similarity search indexes

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Run Development Server

```bash
pnpm dev
```

Navigate to `http://localhost:3000` to see the application.

## How It Works

### Document Upload Flow

1. User uploads a JSON or text file from the Documents page
2. File is sent to `/api/documents/upload` endpoint
3. Server reads file and extracts text content
4. Text is chunked into 1000-character segments with overlap
5. Each chunk is embedded using OpenAI's embedding model
6. Embeddings and chunks are stored in Supabase
7. User receives success confirmation

### Chat/RAG Flow

1. User types a question in the chat interface
2. Question is sent to `/api/chat` endpoint with chat history
3. Server generates embedding for the user's query
4. pgvector performs similarity search to find relevant chunks
5. Retrieved chunks are provided as context to GPT-4o Mini
6. Model generates response based on context and chat history
7. Response is streamed back to client with source citations
8. Messages are saved to chat history in database

### Error Handling

- **No Relevant Documents**: If no chunks match the query, system returns message indicating knowledge base doesn't contain relevant information
- **Embedding Failures**: If embedding generation fails, chat continues without RAG context
- **Missing API Key**: Application validates OpenAI API key before making requests
- **Database Errors**: All database operations include error handling and user-friendly error messages
- **Rate Limiting**: Supabase rate limiting is handled with retry logic

## API Endpoints

### POST /api/chat
Handles chat messages with RAG context

**Request:**
```json
{
  "messages": [
    {"role": "user", "content": "What is RAG?"},
    {"role": "assistant", "content": "RAG stands for..."}
  ],
  "sessionId": "uuid"
}
```

**Response:** Streaming text response (SSE) with sources

### POST /api/documents/upload
Upload and process a document

**Request:** FormData with `file` field

**Response:**
```json
{
  "documentId": "uuid",
  "message": "Document processed successfully"
}
```

### GET /api/documents/list
List user's documents

**Response:**
```json
{
  "documents": [
    {
      "id": "uuid",
      "filename": "document.json",
      "file_size": 5000,
      "created_at": "2026-03-03T10:00:00Z",
      "content_type": "application/json"
    }
  ]
}
```

### POST /api/documents/delete
Delete a document

**Request:**
```json
{
  "documentId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Document deleted successfully"
}
```

### POST /api/chat/session
Create a new chat session

**Request:**
```json
{
  "title": "Session Title"
}
```

**Response:**
```json
{
  "sessionId": "uuid"
}
```

## Troubleshooting

### Document Upload Fails
- Check file size (max 50MB)
- Ensure file format is JSON or TXT
- Verify user is authenticated
- Check Supabase connection

### No Sources in Responses
- Ensure documents have been uploaded
- Check that documents are relevant to your question
- Verify embeddings were generated (check database)
- Try uploading sample-data.json from /public

### Slow Chat Responses
- Large documents take longer to embed
- Vector search may be slow with many documents
- Check OpenAI API rate limits
- Consider chunking strategy

### API Errors
- Verify OPENAI_API_KEY environment variable
- Check Supabase credentials
- Ensure pgvector extension is enabled
- Review application logs for specific errors

## Performance Optimization

- **Chunking**: Documents are split into 1000-character chunks with 200-character overlap
- **Vector Search**: pgvector HNSW index enables fast similarity search
- **Streaming**: Responses are streamed for better perceived performance
- **Caching**: Chat history is retrieved efficiently with indexed queries

## Security Considerations

- **Row Level Security**: All tables have RLS policies enforcing user ownership
- **Authentication**: All API routes require valid Supabase session
- **Encryption**: Data encrypted in transit (HTTPS) and at rest (Supabase)
- **API Keys**: OpenAI key stored server-side only
- **CORS**: Cross-origin requests properly restricted

## Sample Data

A `sample-data.json` file is included in `/public` for testing. It contains product documentation with multiple sections. You can:

1. Download the file from http://localhost:3000/sample-data.json
2. Upload it via the Documents page
3. Ask questions like "What are the pricing plans?" or "How do I set up the system?"

## Future Enhancements

- Support for PDF, Word documents
- Custom chunking strategies
- Multiple language support
- Document metadata tagging
- Advanced search filters
- Usage analytics
- Rate limiting and quotas
- Streaming document uploads
- Vector database alternatives (Pinecone, Weaviate)
- Model switching (Claude, Gemini)
- Prompt engineering interface

## Contributing

This is a demonstration RAG application. Feel free to:
- Customize the UI
- Modify RAG parameters (chunk size, similarity threshold)
- Add new features
- Integrate additional document types
- Deploy to production (requires proper authentication setup)

## Deployment

To deploy to Vercel:

```bash
vercel
```

Ensure environment variables are set in Vercel project settings.

## License

MIT License - Feel free to use this project as a template.

## Support

For issues or questions:
1. Check the Troubleshooting section
2. Review API error messages
3. Check Supabase logs
4. Review application console logs
