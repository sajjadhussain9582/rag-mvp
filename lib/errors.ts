/**
 * Error handling utilities for Chatty
 */

export class RAGError extends Error {
  constructor(
    message: string,
    public code: string = 'UNKNOWN_ERROR',
    public statusCode: number = 500
  ) {
    super(message)
    this.name = 'RAGError'
  }
}

export class AuthenticationError extends RAGError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401)
    this.name = 'AuthenticationError'
  }
}

export class ValidationError extends RAGError {
  constructor(message: string = 'Validation failed') {
    super(message, 'VALIDATION_ERROR', 400)
    this.name = 'ValidationError'
  }
}

export class DocumentError extends RAGError {
  constructor(message: string = 'Document processing failed') {
    super(message, 'DOCUMENT_ERROR', 400)
    this.name = 'DocumentError'
  }
}

export class EmbeddingError extends RAGError {
  constructor(message: string = 'Embedding generation failed') {
    super(message, 'EMBEDDING_ERROR', 500)
    this.name = 'EmbeddingError'
  }
}

export class DatabaseError extends RAGError {
  constructor(message: string = 'Database operation failed') {
    super(message, 'DATABASE_ERROR', 500)
    this.name = 'DatabaseError'
  }
}

export class RateLimitError extends RAGError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_ERROR', 429)
    this.name = 'RateLimitError'
  }
}

/**
 * Handle file validation for document uploads
 */
export function validateUploadFile(
  file: File,
  maxSizeBytes: number = 52428800 // 50MB
): string | null {
  // Check file type
  const allowedTypes = ['application/json', 'text/plain', 'text/json', 'application/pdf']
  const isPdfByExtension = file.name.toLowerCase().endsWith('.pdf')
  if (!allowedTypes.includes(file.type) && !isPdfByExtension) {
    return `Invalid file type. Supported types: JSON, TXT, PDF. Received: ${file.type}`
  }

  // Check file size
  if (file.size > maxSizeBytes) {
    const maxSizeMB = maxSizeBytes / 1024 / 1024
    return `File too large. Maximum size: ${maxSizeMB}MB. Your file: ${(file.size / 1024 / 1024).toFixed(2)}MB`
  }

  // Check file extension
  const validExtensions = ['.json', '.txt', '.pdf']
  const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!validExtensions.includes(fileExtension)) {
    return `Invalid file extension. Supported: ${validExtensions.join(', ')}`
  }

  return null
}

/**
 * Extract text from various file formats
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const content = await file.text()

  if (file.type === 'application/json' || file.name.endsWith('.json')) {
    try {
      const parsed = JSON.parse(content)
      return extractTextFromJSON(parsed)
    } catch (error) {
      throw new DocumentError(
        `Invalid JSON file: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
    return content
  }

  throw new DocumentError(`Unsupported file type: ${file.type}`)
}

/**
 * Recursively extract text from JSON objects
 */
function extractTextFromJSON(obj: any): string {
  const parts: string[] = []

  function traverse(value: any) {
    if (value === null || value === undefined) {
      return
    }

    if (typeof value === 'string') {
      if (value.trim().length > 0) {
        parts.push(value)
      }
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(String(value))
    } else if (Array.isArray(value)) {
      value.forEach(traverse)
    } else if (typeof value === 'object') {
      Object.values(value).forEach(traverse)
    }
  }

  traverse(obj)
  return parts.join('\n')
}

/**
 * Format error response for API endpoints
 */
export function formatErrorResponse(error: unknown) {
  if (error instanceof RAGError) {
    return {
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
    }
  }

  if (error instanceof Error) {
    console.error(' Unexpected error:', error)
    return {
      error: error.message || 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
      statusCode: 500,
    }
  }

  console.error(' Unknown error:', error)
  return {
    error: 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR',
    statusCode: 500,
  }
}

/**
 * Check if query has relevant documents
 */
export function validateQueryContext(searchResults: any[]): boolean {
  return searchResults && searchResults.length > 0
}

/**
 * Generate a user-friendly error message for no relevant documents
 */
export function getNoDocumentsMessage(userQuery: string): string {
  return `I couldn't find relevant information about "${userQuery}" in your uploaded documents. 

Here's what you can do:
1. Upload documents related to your question
2. Try rephrasing your question to match terms in your documents
3. Check that your documents contain the information you're looking for

Would you like to upload more documents or ask something else?`
}
