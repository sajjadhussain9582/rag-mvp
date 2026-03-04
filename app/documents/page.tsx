'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DocumentUpload } from '@/components/document-upload'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeftIcon } from 'lucide-react'

interface Document {
  id: string
  filename: string
  file_size: number
  created_at: string
  content_type: string
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Load documents
  async function loadDocuments() {
    setIsLoading(true)
    try {
      const response = await fetch('/api/documents/list')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load documents')
      }

      setDocuments(data.documents || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadDocuments()
  }, [])

  async function handleDeleteDocument(documentId: string) {
    if (!confirm('Are you sure you want to delete this document?')) return

    try {
      const response = await fetch('/api/documents/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })

      if (!response.ok) {
        throw new Error('Failed to delete document')
      }

      setDocuments((prev) => prev.filter((d) => d.id !== documentId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                Documents
              </h1>
              <p className="mt-2 text-slate-600">
                Manage your uploaded documents for RAG
              </p>
            </div>
            <Link href="/chat">
              <Button>
                <ArrowLeftIcon className="w-4 h-4" /> Back to Chat</Button>
            </Link>
          </div>
        </div>

        {/* Upload Section */}
        <DocumentUpload onUploadSuccess={loadDocuments} onError={setError} />

        {/* Error Message */}
        {error && (
          <Card className="border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </Card>
        )}

        {/* Documents List */}
        <div className='bg-blue-500/50 rounded-lg p-4 max-h-[500px] overflow-y-auto '>
          <h2 className="mb-4 text-2xl font-bold text-white">
            Uploaded Documents
          </h2>

          {isLoading ? (
            <Card className="p-8 text-center">
              <p className="text-slate-600">Loading documents...</p>
            </Card>
          ) : documents.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-slate-600">
                No documents uploaded yet. Upload your first document to get started.
              </p>
            </Card>
          ) : (
            <div className=" space-y-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {documents.map((doc) => (
                <Card
                  key={doc.id}
                  className="flex items-center justify-between p-4 bg-gray-200 hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      📄 {doc.filename}
                    </p>
                    <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
                      <span>
                        {(doc.file_size / 1024).toFixed(1)} KB
                      </span>
                      <span>
                        {format(new Date(doc.created_at), 'MMM d, yyyy HH:mm')}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteDocument(doc.id)}
                  >
                    Delete
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <Card className="bg-blue-50 p-6 border-blue-200">
          <h3 className="font-semibold text-blue-900">How it works</h3>
          <ul className="mt-3 space-y-2 text-sm text-blue-800">
            <li>• Upload JSON or text documents containing your data</li>
            <li>• The system extracts text and creates semantic embeddings</li>
            <li>• Ask questions in the chat - it will find relevant sections</li>
            <li>• Get answers with citations showing source documents</li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
