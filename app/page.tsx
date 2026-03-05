'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowRight } from 'lucide-react'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to chat page after a short delay
    const timer = setTimeout(() => {
      router.push('/chat')
    }, 2000)

    return () => clearTimeout(timer)
  }, [router])
//
  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100">
      <Card className="max-w-md space-y-6 p-8">
        <div className="text-center">
          {/* <h1 className="text-3xl font-bold text-slate-900">Chatty</h1> */}
          <p className="mt-2 text-slate-600">
            Chat with your documents using AI
          </p>
        </div>

        <div className="space-y-3 text-sm text-slate-600">
          <div className="flex items-start gap-3">
            <span className="text-lg">📄</span>
            <p>Upload JSON or text documents with your custom data</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-lg">🤖</span>
            <p>Ask questions and get AI-powered answers from your documents</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-lg">✨</span>
            <p>Get source citations showing where information came from</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500">
            Redirecting to chat...
          </p>
          <Button
            onClick={() => router.push('/chat')}
            className="w-full"
          >
            Go to Chat <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    </div>
  )
}
