# RAG Chatbot - Quick Start Guide

Get your AI-powered document chatbot running in 5 minutes.

## 1. Provide OpenAI API Key (1 minute)

The system will prompt you to add your OpenAI API key:
1. Get API key from https://platform.openai.com/api-keys
2. Add `OPENAI_API_KEY` in the v0 Vars section (left sidebar)
3. The application automatically uses your key for embeddings and chat

**No other setup needed!** Supabase and database are pre-configured.

## 2. Start Using (Immediately)

### Option A: Use Sample Data (Recommended for Testing)

1. Go to **Documents** page
2. Click "Choose File" and upload `/public/sample-data.json`
3. Wait for success message (< 30 seconds)
4. Go to **Chat** page
5. Ask questions like:
   - "What are the pricing plans?"
   - "How does RAG work?"
   - "What file formats are supported?"

### Option B: Upload Your Own Documents

1. Prepare a JSON or text file with your data
2. Go to **Documents** page
3. Upload your file
4. Wait for processing
5. Start chatting

## 3. Understanding the Interface

### Chat Page
- **Sidebar**: Upload documents and manage settings
- **Main Area**: Conversation with AI
- **Sources**: Every response shows which documents provided the answer

### Documents Page
- **Upload Section**: Add JSON or text files
- **Document List**: View all uploaded documents
- **Delete**: Remove documents you don't need
- **Info Box**: Explains how the RAG system works

## 4. Best Practices

### Document Format

**JSON Format** (Recommended)
```json
{
  "sections": [
    {
      "title": "Introduction",
      "content": "Your content here..."
    },
    {
      "title": "Features",
      "content": "More content..."
    }
  ]
}
```

**Text Format**
Just plain text, one topic per file recommended.

### Questions

- **Be specific**: "What is included in the Pro plan?" works better than "Tell me everything"
- **Use document terms**: Questions matching document wording get better results
- **Ask one thing at a time**: "Pricing" and "Features" as separate questions

### Document Management

- **File size**: Max 50MB per file
- **Organization**: Upload one topic per file for better retrieval
- **Chunking**: System automatically splits documents into searchable chunks
- **Cleanup**: Delete unused documents to keep knowledge base focused

## 5. Troubleshooting

### Document upload fails
- Check file is JSON or TXT
- Verify file size < 50MB
- Ensure file has readable text content

### No relevant answers
- Upload documents related to your question
- Try rephrasing with terms from your documents
- Check document was processed successfully (Documents page)

### Chat is slow
- Large documents take longer to search
- Uploading many documents increases search time
- Check OpenAI API status

### "No relevant documents found"
- Upload documents containing the information
- Try asking different questions
- Check sample-data.json was uploaded (use that to test)

## 6. How It Works (Simple)

1. **Upload**: You upload a document
2. **Index**: System breaks it into chunks and creates embeddings
3. **Search**: When you ask a question, system finds relevant chunks
4. **Ask**: Question + relevant chunks go to GPT-4o Mini
5. **Answer**: Model responds with citations showing sources

**Key Feature**: The model only answers based on your documents - no hallucinations!

## 7. Common Questions

**Q: Can I upload PDFs?**
A: Currently JSON and TXT only. PDFs coming soon.

**Q: How long does document processing take?**
A: Usually < 30 seconds. Larger files may take longer.

**Q: Is my data safe?**
A: Yes! All data is encrypted and isolated to your account with RLS policies.

**Q: Can I delete documents?**
A: Yes, go to Documents page and click Delete.

**Q: What happens if documents don't contain the answer?**
A: The AI tells you it can't find the information - no made-up answers!

**Q: How many documents can I upload?**
A: Unlimited (check your plan for limits on vercel.com).

**Q: Can I use different AI models?**
A: Currently GPT-4o Mini. Other models coming soon.

## 8. Example Workflow

```
Step 1: Upload company handbook (PDF as JSON export)
  ↓
Step 2: Ask "What is our vacation policy?"
  ↓
Step 3: System finds relevant handbook sections
  ↓
Step 4: GPT-4o Mini generates answer
  ↓
Step 5: You see answer + source citations
```

## 9. API Usage (For Developers)

If you want to integrate into your own app:

```javascript
// Send a chat message
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Your question' }],
    sessionId: 'session-id'
  })
})

// Upload a document
const formData = new FormData()
formData.append('file', fileInput.files[0])
const upload = await fetch('/api/documents/upload', {
  method: 'POST',
  body: formData
})
```

See `RAG_CHATBOT_README.md` for full API documentation.

## 10. Next Steps

- Read `RAG_CHATBOT_README.md` for detailed documentation
- Check `TESTING_GUIDE.md` for advanced testing procedures
- Review `IMPLEMENTATION_SUMMARY.md` to understand the architecture
- Customize the UI in Vercel's Design Mode
- Deploy to production when ready

## Support

- Check error messages in browser console
- Review documentation files in the project
- Check Supabase status at status.supabase.com
- Verify OpenAI API key is valid

---

**You're all set!** Start by uploading the sample document and asking questions. The AI will respond with answers grounded in your documents.
