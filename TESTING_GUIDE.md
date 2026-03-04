# RAG Chatbot Testing Guide

This guide covers testing the RAG Chatbot application, including manual testing workflows, error scenarios, and debugging tips.

## Quick Start Testing

### 1. Initial Setup Test

```bash
# 1. Install dependencies
pnpm install

# 2. Start development server
pnpm dev

# 3. Navigate to http://localhost:3000
# Expected: Redirect to /chat page after 2 seconds
```

### 2. Document Upload Test

**Test Case: Upload sample document**

1. Click "Upload Documents" button in sidebar
2. Choose `/public/sample-data.json`
3. Expected: Success message showing "Successfully processed sample-data.json with X chunks"
4. Navigate to Documents page to verify upload
5. Expected: Document appears in list with file size and timestamp

**Troubleshooting:**
- If upload fails, check browser console for specific error
- Verify file exists at `/public/sample-data.json`
- Check that OpenAI API key is configured

### 3. Chat Functionality Test

**Test Case: Basic RAG chat**

1. Upload sample-data.json (see above)
2. In chat, ask: "What are the pricing plans?"
3. Expected: Response includes pricing information with sources
4. Expected: Sources section shows document name and excerpt

**Test Case: No relevant data**

1. Upload only sample-data.json
2. Ask: "Tell me about Mars"
3. Expected: Response indicates information not in documents

**Test Case: Chat history**

1. Ask first question: "What is RAG?"
2. Ask follow-up: "How does it work?"
3. Expected: Model references previous context
4. Navigate away and back to chat
5. Expected: New session is created

## Error Scenarios Testing

### File Upload Errors

```
Test Case: Invalid File Type
- Action: Try to upload PDF file
- Expected: Error message about unsupported file type
- Error code: VALIDATION_ERROR

Test Case: File Too Large
- Action: Upload file > 50MB
- Expected: Error message about file size limit
- Error code: VALIDATION_ERROR

Test Case: Empty File
- Action: Upload empty JSON or text file
- Expected: Error message "File contains no readable text"
- Error code: DOCUMENT_ERROR

Test Case: Invalid JSON
- Action: Upload JSON file with syntax errors
- Expected: Error message "Invalid JSON format"
- Error code: DOCUMENT_ERROR
```

### Chat Errors

```
Test Case: No OpenAI API Key
- Setup: Remove OPENAI_API_KEY from environment
- Action: Try to send message
- Expected: Error about API key configuration
- Error code: EMBEDDING_ERROR or similar

Test Case: Empty Message
- Action: Send empty message
- Expected: Send button disabled, no request made

Test Case: Unauthenticated Access
- Setup: Clear all cookies/session
- Action: Try to send chat message
- Expected: 401 Unauthorized response
- Error code: AUTH_ERROR
```

## Database Verification Tests

### Check Database Schema

```sql
-- Connect to Supabase SQL editor and run:

-- 1. Verify tables exist
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('documents', 'document_chunks', 'embeddings', 'chat_sessions', 'chat_messages');

-- 2. Check pgvector extension
SELECT * FROM pg_extension WHERE extname = 'vector';

-- 3. Count documents for current user
SELECT id, filename, file_size, created_at 
FROM documents 
ORDER BY created_at DESC;

-- 4. Verify embeddings were created
SELECT COUNT(*) as embedding_count FROM embeddings;

-- 5. Check chat history
SELECT COUNT(*) as message_count FROM chat_messages;
```

### Verify Vector Search

```sql
-- Test pgvector similarity search

-- 1. Get a sample embedding
SELECT id, chunk_id, embedding FROM embeddings LIMIT 1;

-- 2. Test similarity search (requires sample embedding)
SELECT 
  e.id,
  dc.content,
  d.filename,
  e.embedding <-> '[0.1, 0.2, 0.3, ...]'::vector AS distance
FROM embeddings e
JOIN document_chunks dc ON e.chunk_id = dc.id
JOIN documents d ON dc.document_id = d.id
ORDER BY distance
LIMIT 5;
```

## Performance Testing

### Document Upload Performance

```
Test Case: Large Document Processing
- Action: Upload 5MB JSON file
- Measure: Time to process and store
- Target: < 30 seconds
- Verify: Check embedding generation in logs
```

### Chat Response Performance

```
Test Case: Search and Response Time
- Action: Send message after uploading document
- Measure: Time from message to first response chunk
- Target: < 5 seconds
- Measure: Time to complete response
- Target: < 15 seconds
```

### Database Performance

```
Test Case: Vector Search Performance
- Setup: Upload 10+ documents
- Action: Send chat message
- Measure: Database query time
- Target: < 1 second for similarity search
```

## API Testing

### Using curl

```bash
# 1. Test document upload
curl -X POST http://localhost:3000/api/documents/upload \
  -F "file=@sample-data.json"

# 2. Test document list
curl http://localhost:3000/api/documents/list

# 3. Test chat endpoint
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "What is RAG?"}],
    "sessionId": "test-session-id"
  }'

# 4. Test session creation
curl -X POST http://localhost:3000/api/chat/session \
  -H "Content-Type: application/json" \
  -d '{"title": "Test Session"}'
```

### Using Postman

1. Create new collection "RAG Chatbot"
2. Add requests:
   - POST /api/documents/upload (form-data with file)
   - GET /api/documents/list
   - POST /api/chat (JSON body)
   - POST /api/documents/delete (JSON body)
   - POST /api/chat/session (JSON body)

## Browser Developer Tools Testing

### Network Tab

1. Upload a document
   - Verify POST to `/api/documents/upload`
   - Check response includes `documentId`
   - Verify chunked content in response

2. Send chat message
   - Verify POST to `/api/chat`
   - Check streaming response (text/event-stream)
   - Monitor SSE chunks

### Console Testing

```javascript
// Test embedding generation
const testEmbedding = async () => {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'test' }],
      sessionId: 'test'
    })
  })
  console.log(response.status, response.statusText)
}
testEmbedding()

// Check local storage
console.log('Session data:', localStorage)
```

## UI Component Testing

### Chat Message Component

```
Test Cases:
1. User message - blue background, right-aligned
2. Assistant message - gray background, left-aligned
3. With sources - shows source citations below message
4. Loading state - shows "Thinking..." message
5. Empty state - shows welcome message
```

### Document Upload Component

```
Test Cases:
1. Normal upload - shows progress, success message
2. File validation - shows error for invalid types
3. Large file - shows size limit error
4. Multiple files - only processes first file
5. Upload with sidebar - proper layout
```

### Document List Component

```
Test Cases:
1. Empty list - shows "No documents uploaded"
2. With documents - shows all user documents
3. Delete button - confirms deletion
4. File size formatting - shows KB/MB appropriately
5. Date formatting - shows readable date
```

## Common Issues & Solutions

### Issue: Documents not appearing in chat context

**Diagnosis:**
```sql
-- Check if embeddings were created
SELECT COUNT(*) FROM embeddings 
WHERE chunk_id IN (
  SELECT id FROM document_chunks 
  WHERE document_id = 'YOUR_DOCUMENT_ID'
);
```

**Solutions:**
- Verify document upload completed successfully
- Check OpenAI API key is valid
- Ensure document has readable text content
- Try uploading sample-data.json

### Issue: Chat responses are generic (no RAG context)

**Diagnosis:**
```javascript
// Check if vector search returns results
console.log('Search results:', searchResults)
```

**Solutions:**
- Verify documents are uploaded
- Check similarity threshold is appropriate
- Try different search queries
- Review document content relevance

### Issue: Upload fails with "No file provided"

**Diagnosis:**
- Check browser console for network errors
- Verify file input is properly wired

**Solutions:**
- Refresh page
- Try different file
- Clear browser cache
- Check network in DevTools

## Regression Testing Checklist

Use this checklist before deploying:

- [ ] Document upload works (JSON and TXT)
- [ ] Embeddings generate successfully
- [ ] Vector search returns relevant results
- [ ] Chat responses include sources
- [ ] Chat history is maintained
- [ ] Error handling shows user-friendly messages
- [ ] UI is responsive on mobile
- [ ] Navigation between pages works
- [ ] Document deletion removes all related data
- [ ] No console errors during normal use
- [ ] API rate limits are respected
- [ ] Database connections are stable

## Load Testing

### Simulate Multiple Users

```javascript
// Load test script
async function loadTest() {
  const queries = [
    'What is RAG?',
    'How does it work?',
    'What are the features?',
    'How much does it cost?'
  ]
  
  for (let i = 0; i < 10; i++) {
    const query = queries[i % queries.length]
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: query }],
        sessionId: `session-${i}`
      })
    })
    console.log(`Query ${i}:`, response.status)
  }
}

loadTest()
```

## Debugging Tips

### Enable Debug Logs

```typescript
// In any API route or component:
console.log(' Debug message:', variable)

// Check browser console for "" prefixed logs
```

### Test Embeddings Directly

```javascript
// Check if embeddings endpoint exists
const testEmbedding = async (text) => {
  const response = await fetch('/api/embed', { // if endpoint exists
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text })
  })
  const data = await response.json()
  console.log('Embedding:', data)
}
```

### Monitor Database Queries

1. In Supabase dashboard, go to Logs
2. Filter by API and look for queries
3. Check performance of Vector search queries
4. Monitor for RLS policy violations

## Production Readiness Checklist

Before deploying to production:

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] RLS policies enabled
- [ ] API rate limiting configured
- [ ] Error monitoring setup (Sentry/etc)
- [ ] User authentication fully implemented
- [ ] HTTPS enabled
- [ ] CORS properly configured
- [ ] Database backups configured
- [ ] Monitoring and logging enabled
- [ ] Documentation reviewed
- [ ] Security audit completed
