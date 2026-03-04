'use client'

import React, { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(' Error caught by boundary:', error, errorInfo)
  }

  resetError = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError)
      }

      return (
        <div className="flex h-screen items-center justify-center bg-slate-50 p-4">
          <Card className="max-w-md space-y-4 p-6 border-red-200 bg-red-50">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h2 className="font-semibold text-red-900">
                  Something went wrong
                </h2>
                <p className="mt-1 text-sm text-red-800">
                  {this.state.error.message}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Button
                onClick={this.resetError}
                variant="outline"
                className="w-full border-red-200 text-red-700 hover:bg-red-100"
              >
                Try Again
              </Button>
              <Button
                onClick={() => (window.location.href = '/')}
                className="w-full"
              >
                Go Home
              </Button>
            </div>
            <details className="cursor-pointer">
              <summary className="text-xs font-medium text-red-700 hover:underline">
                Error Details
              </summary>
              <pre className="mt-2 overflow-auto rounded bg-red-100 p-2 text-xs text-red-900">
                {this.state.error.stack}
              </pre>
            </details>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
