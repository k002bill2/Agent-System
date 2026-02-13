/**
 * Error handler hook for API and runtime errors.
 *
 * Provides centralised error state management with
 * severity-aware toast notifications.
 */

import { useState, useCallback } from 'react'
import { ApiError, isApiError, userMessageForError } from '../services/errors'
import type { ErrorSeverity } from '../services/errors'

// ---------------------------------------------------------------------------
// Toast type (consumed by UI layers)
// ---------------------------------------------------------------------------

export interface Toast {
  id: string
  message: string
  severity: ErrorSeverity
  timestamp: number
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseErrorHandlerReturn {
  error: ApiError | null
  toasts: Toast[]
  handleError: (error: unknown) => void
  clearError: () => void
  showToast: (message: string, severity: ErrorSeverity) => void
  dismissToast: (id: string) => void
}

let toastCounter = 0

export function useErrorHandler(): UseErrorHandlerReturn {
  const [error, setError] = useState<ApiError | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, severity: ErrorSeverity) => {
    const id = `toast-${++toastCounter}-${Date.now()}`
    const toast: Toast = { id, message, severity, timestamp: Date.now() }
    setToasts((prev) => [...prev, toast])

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5_000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const handleError = useCallback(
    (err: unknown) => {
      if (isApiError(err)) {
        setError(err)
        showToast(userMessageForError(err), err.severity)
        return
      }

      // Wrap non-ApiError
      const wrapped = new ApiError({
        message: err instanceof Error ? err.message : String(err),
        status: 0,
        code: 'UNKNOWN',
      })
      setError(wrapped)
      showToast(wrapped.message, 'error')
    },
    [showToast],
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    error,
    toasts,
    handleError,
    clearError,
    showToast,
    dismissToast,
  }
}
