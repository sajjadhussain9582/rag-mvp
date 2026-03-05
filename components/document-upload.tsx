'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface DocumentUploadProps {
  onUploadSuccess?: () => void
  onError?: (error: string) => void
}

export function DocumentUpload({ onUploadSuccess, onError }: DocumentUploadProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (pollingRef.current) {
        clearTimeout(pollingRef.current)
      }
    }
  }, [])

  const clearPolling = () => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current)
      pollingRef.current = null
    }
  }

  const finalizeSuccess = (message: string) => {
    clearPolling()
    setProcessingStatus('completed')
    setProgress(`✓ ${message}`)

    setIsLoading(false)
    setProcessingStatus(null)
    setTimeout(() => {
      if (!isMountedRef.current) return
      setProgress('')
      setIsLoading(false)
      setProcessingStatus(null)
      onUploadSuccess?.()
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }, 1800)
  }

  const finalizeFailure = (message: string) => {
    clearPolling()
    setProcessingStatus('failed')
    setProgress('')
    setIsLoading(false)
    onError?.(message)
  }

  const pollJobStatus = async (jobId: string) => {
    try {
      const response = await fetch(`/api/documents/jobs/${jobId}`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to track job status')
      }

      if (!isMountedRef.current) return
      const nextStatus = (data.status as ProcessingStatus) ?? 'pending'
      setProcessingStatus(nextStatus)
      setProgress(data.message || 'Processing document...')

      if (nextStatus === 'completed') {
        finalizeSuccess(data.message || 'Document ready')
        return
      }

      if (nextStatus === 'failed') {
        finalizeFailure(data.error_details || data.message || 'Background processing failed.')
        return
      }

      pollingRef.current = setTimeout(() => pollJobStatus(jobId), 2500)
    } catch (error) {
      if (!isMountedRef.current) return
      finalizeFailure(error instanceof Error ? error.message : 'Failed to track job status')
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const maxSizeBytes = 20 * 1024 * 1024 // 20 MB
    if (file.size > maxSizeBytes) {
      const maxSizeMB = maxSizeBytes / 1024 / 1024
      const fileSizeMB = file.size / 1024 / 1024
      onError?.(`File too large. Maximum: ${maxSizeMB}MB. Your file: ${fileSizeMB.toFixed(2)}MB`)
      return
    }

    const allowedTypes = ['application/json', 'text/plain', 'text/json', 'application/pdf']
    const isPdfByExtension = file.name.toLowerCase().endsWith('.pdf')
    if (!allowedTypes.includes(file.type) && !isPdfByExtension) {
      onError?.(`Invalid file type: ${file.type}. Supported: JSON, TXT, PDF`)
      return
    }

    setIsLoading(true)
    setProgress('Uploading document...')
    clearPolling()

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Upload failed')
      }

      const jobId = data.jobId
      if (jobId) {
        setProcessingStatus('pending')
        setProgress(data.message || 'Document queued for processing')
        pollJobStatus(jobId)
      } else {
        finalizeSuccess(data.message || 'Document processed successfully')
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Upload failed'
      console.error(' Upload error:', error)
      finalizeFailure(errorMsg)
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900">Upload Documents</h3>
          <p className="text-xs text-slate-600">
            Supported formats: JSON, TXT, PDF
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.txt,.pdf"
            onChange={handleFileChange}
            disabled={isLoading}
            className="hidden"
          />

          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="w-full"
            variant="outline"
          >
            {isLoading ? 'Processing...' : 'Choose File'}
          </Button>

          {progress && (
            <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
              {isLoading && <Spinner className="h-4 w-4 text-slate-500" />}
              <p>{progress}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
