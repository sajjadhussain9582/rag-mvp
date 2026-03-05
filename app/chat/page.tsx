'use client'

import { useEffect, useState, useRef } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChatMessage } from '@/components/chat-message'
import { ChatInput } from '@/components/chat-input'
import { DocumentUpload } from '@/components/document-upload'
import Link from 'next/link'

const SESSION_STORAGE_KEY = 'rag-chat-session-id'

interface UIMessage {
  id: string
  role: 'user' | 'assistant'
  content?: string
  parts?: Array<{
    type: string
    text?: string
  }>
  createdAt?: Date
}

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string>('')
  const [initialMessages, setInitialMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string; sources?: unknown }>>([])
  const [isInitializing, setIsInitializing] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function initSession() {
      setInitError(null)
      try {
        const stored = typeof window !== 'undefined' ? localStorage.getItem(SESSION_STORAGE_KEY) : null
        
          const res = await fetch(`/api/chat`)
          if (res.ok) {
            const data = await res.json()
            const all = Array.isArray(data.messages) ? data.messages : []
            setSessionId(stored ?? '')
            setInitialMessages(all)
            setIsInitializing(false)
            return
          }
          console.log(initialMessages,"all messages")
       
        const response = await fetch('/api/chat/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: 'Chat' }),
        })
        if (!response.ok) {
          console.error('Failed to create session')
          setInitError('Could not start chat. Please sign in and refresh the page.')
          setSessionId('')
          setInitialMessages([])
          setIsInitializing(false)
          return
        }
        const data = await response.json()
        const newId = data?.sessionId
        if (!newId || typeof newId !== 'string') {
          setInitError('Could not start chat. Please refresh the page.')
          setSessionId('')
          setInitialMessages([])
          setIsInitializing(false)
          return
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem(SESSION_STORAGE_KEY, newId)
        }
        setSessionId(newId)
        setInitialMessages([])
        setIsInitializing(false)
      } catch (error) {
        console.error('Session init error:', error)
        setInitError('Could not start chat. Please refresh the page.')
        setSessionId('')
        setInitialMessages([])
        setIsInitializing(false)
      }
    }
    initSession()
  }, [])

  const seedMessages = initialMessages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    parts: [{ type: 'text' as const, text: m.content }],
    ...(m.sources != null && { sources: m.sources }),
  }))

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest: ({ messages: msgs }) => ({
        body: {
          messages: msgs,
          sessionId,
        },
      }),
    }),
    ...(seedMessages.length > 0 && { messages: seedMessages }),
  } as Parameters<typeof useChat>[0])
  useEffect(() => {
    if (initialMessages.length === 0) return
    const seed = initialMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      parts: [{ type: 'text' as const, text: m.content }],
      ...(m.sources != null && { sources: m.sources }),
    }))
    setMessages(seed)
  }, [initialMessages, setMessages])

  const isLoading = status === 'submitted' || status === 'streaming'

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const extractTextFromMessage = (msg: UIMessage): string => {
    if (msg.content) return msg.content
    if (msg.parts) {
      return msg.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('')
    }
    return ''
  }

  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Card className="p-8">
          <p className="text-slate-600">Initializing chat...</p>
        </Card>
      </div>
    )
  }

  if (initError || !sessionId) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Card className="p-8 max-w-md text-center space-y-4">
          <p className="text-slate-700">{initError ?? 'Could not start chat. Please refresh the page.'}</p>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="w-full"
          >
            Refresh page
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-screen gap-4 bg-slate-50 p-4">
      {/* Sidebar */}
      <aside className="w-80 space-y-4">
        <div className="space-y-2">
          {/* <h2 className="font-bold text-slate-900">Chatty</h2> */}
          <p className="text-xs text-slate-600">
            Chat with your documents using AI
          </p>
        </div>

        <div className="space-y-2">
          <Button
            onClick={() => setShowUpload(!showUpload)}
            variant="outline"
            className="w-full"
          >
            {showUpload ? 'Hide Upload' : 'Upload Documents'}
          </Button>
          {showUpload && (
            <DocumentUpload onError={(error) => console.error(error)} />
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-700">RESOURCES</h3>
          <Link
            href="/documents"
            className="block rounded-lg bg-white px-3 py-2 text-xs hover:bg-slate-100"
          >
            📄 Manage Documents
          </Link>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <Card className="flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 p-6">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <p className="text-xl font-semibold text-slate-900">
                    Welcome to  Chatbot
                  </p>
                  <p className="text-sm text-slate-600 mt-2">
                    Upload documents and ask questions about them
                  </p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    role={msg.role === 'system' ? 'assistant' : msg.role}
                    content={extractTextFromMessage(msg as UIMessage)}
                    sources={
                      Array.isArray((msg as unknown as { sources?: unknown }).sources)
                        ? ((msg as unknown as { sources: unknown }).sources as { filename: string; content: string; similarity: number; chunkId: string }[])
                        : undefined
                    }
                  />
                ))}
                {isLoading && (
                  <div className="flex gap-4 justify-start">
                    <div className="rounded-lg bg-slate-100 px-4 py-3">
                      <p className="text-sm text-slate-600">Thinking...</p>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Form */}
          <ChatInput
            onSubmit={(message) => {
              if (!message.trim() || !sessionId) return
              sendMessage({ text: message.trim() })
            }}
            disabled={isLoading || !sessionId}
            placeholder="Ask a question about your documents..."
          />
        </Card>
      </main>
    </div>
  )
}
