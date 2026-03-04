'use client'

import { AlertCircle, FileText } from 'lucide-react'

interface Source {
  id: string
  documentId: string
  filename: string
  excerpt: string
  chunkNumber: number
}

interface SourceCitationsProps {
  sources?: Source[]
}

export function SourceCitations({ sources }: SourceCitationsProps) {
  if (!sources || sources.length === 0) {
    return (
      <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>
          No relevant sources found. The answer above is based on general knowledge.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold text-slate-700">SOURCES:</p>
      <div className="space-y-2">
        {sources.map((source) => (
          <div
            key={source.id}
            className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
          >
            <div className="flex gap-2">
              <FileText className="h-4 w-4 flex-shrink-0 text-slate-500 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-xs">
                  {source.filename}
                </p>
                <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                  {source.excerpt}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Chunk {source.chunkNumber}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
