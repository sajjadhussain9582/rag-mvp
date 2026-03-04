'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Source {
  filename: string
  content: string
  similarity: number
  chunkId: string
}

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
}

export function ChatMessage({ role, content, sources }: ChatMessageProps) {
  const isAssistant = role === 'assistant'

  return (
    <div className={`flex gap-4 ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-2xl ${isAssistant ? 'w-full' : 'w-fit'}`}>
        <div
          className={`rounded-lg px-4 py-3 ${
            isAssistant
              ? 'bg-slate-100 text-slate-900'
              : 'bg-blue-500 text-white'
          }`}
        >
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        </div>

        {/* Show sources for assistant responses */}
        {isAssistant && sources && sources.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-slate-600">Sources:</p>
            {sources.map((source) => (
              <Card key={source.chunkId} className="bg-slate-50 p-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-700">
                      📄 {source.filename}
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      {(source.similarity * 100).toFixed(0)}% match
                    </Badge>
                  </div>
                  <p className="line-clamp-3 text-xs text-slate-600">
                    {source.content}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
