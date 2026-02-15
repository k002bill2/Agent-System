/**
 * Test suite for useErrorHandler hook.
 *
 * Tests error state management, toast notifications,
 * severity-aware error handling, and auto-dismiss behavior.
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useErrorHandler } from '../useErrorHandler'
import { ApiError, ApiErrorCode } from '../../services/errors'

describe('useErrorHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------

  it('should initialize with null error and empty toasts', () => {
    const { result } = renderHook(() => useErrorHandler())

    expect(result.current.error).toBeNull()
    expect(result.current.toasts).toEqual([])
  })

  // ---------------------------------------------------------------------------
  // handleError with ApiError
  // ---------------------------------------------------------------------------

  it('should handle ApiError and set error state with correct severity', () => {
    const { result } = renderHook(() => useErrorHandler())

    const apiError = new ApiError({
      message: 'Unauthorized access',
      status: 401,
      code: ApiErrorCode.UNAUTHORIZED,
      severity: 'warning',
    })

    act(() => {
      result.current.handleError(apiError)
    })

    expect(result.current.error).toBe(apiError)
    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0].message).toBe(
      'You are not authenticated. Please log in.',
    )
    expect(result.current.toasts[0].severity).toBe('warning')
  })

  it('should create toast with correct user-friendly message for ApiError', () => {
    const { result } = renderHook(() => useErrorHandler())

    const apiError = new ApiError({
      message: 'Resource not found',
      status: 404,
      code: ApiErrorCode.NOT_FOUND,
    })

    act(() => {
      result.current.handleError(apiError)
    })

    expect(result.current.toasts[0].message).toBe(
      'The requested resource was not found.',
    )
    expect(result.current.toasts[0].severity).toBe('error')
  })

  // ---------------------------------------------------------------------------
  // handleError with regular Error
  // ---------------------------------------------------------------------------

  it('should wrap regular Error in ApiError with UNKNOWN code and error severity', () => {
    const { result } = renderHook(() => useErrorHandler())

    const regularError = new Error('Something went wrong')

    act(() => {
      result.current.handleError(regularError)
    })

    expect(result.current.error).toBeInstanceOf(ApiError)
    expect(result.current.error?.code).toBe('UNKNOWN')
    expect(result.current.error?.message).toBe('Something went wrong')
    expect(result.current.toasts[0].severity).toBe('error')
    expect(result.current.toasts[0].message).toBe('Something went wrong')
  })

  // ---------------------------------------------------------------------------
  // handleError with string
  // ---------------------------------------------------------------------------

  it('should wrap string error in ApiError with UNKNOWN code', () => {
    const { result } = renderHook(() => useErrorHandler())

    act(() => {
      result.current.handleError('Network timeout')
    })

    expect(result.current.error).toBeInstanceOf(ApiError)
    expect(result.current.error?.code).toBe('UNKNOWN')
    expect(result.current.error?.message).toBe('Network timeout')
    expect(result.current.toasts[0].message).toBe('Network timeout')
    expect(result.current.toasts[0].severity).toBe('error')
  })

  // ---------------------------------------------------------------------------
  // clearError
  // ---------------------------------------------------------------------------

  it('should clear error state but not toasts', () => {
    const { result } = renderHook(() => useErrorHandler())

    const apiError = new ApiError({
      message: 'Test error',
      status: 500,
      code: ApiErrorCode.INTERNAL_SERVER_ERROR,
    })

    act(() => {
      result.current.handleError(apiError)
    })

    expect(result.current.error).toBe(apiError)
    expect(result.current.toasts).toHaveLength(1)

    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.toasts).toHaveLength(1) // Toast should remain
  })

  // ---------------------------------------------------------------------------
  // showToast
  // ---------------------------------------------------------------------------

  it('should add toast with generated id and timestamp', () => {
    const { result } = renderHook(() => useErrorHandler())

    act(() => {
      result.current.showToast('Custom notification', 'info')
    })

    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0]).toMatchObject({
      message: 'Custom notification',
      severity: 'info',
    })
    expect(result.current.toasts[0].id).toMatch(/^toast-\d+-\d+$/)
    expect(result.current.toasts[0].timestamp).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // showToast auto-dismiss
  // ---------------------------------------------------------------------------

  it('should auto-dismiss toast after 5000ms', () => {
    const { result } = renderHook(() => useErrorHandler())

    act(() => {
      result.current.showToast('Auto-dismiss test', 'info')
    })

    expect(result.current.toasts).toHaveLength(1)

    // Advance timers by 4999ms - toast should still exist
    act(() => {
      vi.advanceTimersByTime(4999)
    })

    expect(result.current.toasts).toHaveLength(1)

    // Advance timers by 1ms more (total 5000ms) - toast should be dismissed
    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(result.current.toasts).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // dismissToast
  // ---------------------------------------------------------------------------

  it('should dismiss specific toast by id', () => {
    const { result } = renderHook(() => useErrorHandler())

    act(() => {
      result.current.showToast('Toast 1', 'info')
      result.current.showToast('Toast 2', 'warning')
    })

    expect(result.current.toasts).toHaveLength(2)

    const firstToastId = result.current.toasts[0].id

    act(() => {
      result.current.dismissToast(firstToastId)
    })

    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0].message).toBe('Toast 2')
  })

  // ---------------------------------------------------------------------------
  // Multiple toasts
  // ---------------------------------------------------------------------------

  it('should support multiple active toasts simultaneously', () => {
    const { result } = renderHook(() => useErrorHandler())

    act(() => {
      result.current.showToast('First toast', 'error')
      result.current.showToast('Second toast', 'warning')
      result.current.showToast('Third toast', 'info')
    })

    expect(result.current.toasts).toHaveLength(3)
    expect(result.current.toasts.map((t) => t.message)).toEqual([
      'First toast',
      'Second toast',
      'Third toast',
    ])
    expect(result.current.toasts.map((t) => t.severity)).toEqual([
      'error',
      'warning',
      'info',
    ])
  })

  it('should auto-dismiss multiple toasts independently', () => {
    const { result } = renderHook(() => useErrorHandler())

    act(() => {
      result.current.showToast('First', 'info')
    })

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    act(() => {
      result.current.showToast('Second', 'info')
    })

    expect(result.current.toasts).toHaveLength(2)

    // Advance 3000ms more (total 5000ms for first toast)
    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0].message).toBe('Second')

    // Advance 2000ms more (total 5000ms for second toast)
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current.toasts).toHaveLength(0)
  })

  // ---------------------------------------------------------------------------
  // Multiple errors
  // ---------------------------------------------------------------------------

  it('should overwrite previous error when handleError is called multiple times', () => {
    const { result } = renderHook(() => useErrorHandler())

    const firstError = new ApiError({
      message: 'First error',
      status: 404,
      code: ApiErrorCode.NOT_FOUND,
    })

    const secondError = new ApiError({
      message: 'Second error',
      status: 500,
      code: ApiErrorCode.INTERNAL_SERVER_ERROR,
    })

    act(() => {
      result.current.handleError(firstError)
    })

    expect(result.current.error).toBe(firstError)
    expect(result.current.toasts).toHaveLength(1)

    act(() => {
      result.current.handleError(secondError)
    })

    expect(result.current.error).toBe(secondError)
    expect(result.current.toasts).toHaveLength(2) // Both toasts should exist
    expect(result.current.toasts[1].message).toBe(
      'An unexpected server error occurred.',
    )
  })

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('should handle ApiError with custom severity overriding default', () => {
    const { result } = renderHook(() => useErrorHandler())

    const apiError = new ApiError({
      message: 'Server error',
      status: 500,
      code: ApiErrorCode.INTERNAL_SERVER_ERROR,
      severity: 'info', // Override default 'error' severity
    })

    act(() => {
      result.current.handleError(apiError)
    })

    expect(result.current.toasts[0].severity).toBe('info')
  })

  it('should handle dismissing non-existent toast gracefully', () => {
    const { result } = renderHook(() => useErrorHandler())

    act(() => {
      result.current.showToast('Test toast', 'info')
    })

    expect(result.current.toasts).toHaveLength(1)

    act(() => {
      result.current.dismissToast('non-existent-id')
    })

    expect(result.current.toasts).toHaveLength(1) // Should not affect existing toast
  })

  it('should generate unique toast ids', () => {
    const { result } = renderHook(() => useErrorHandler())

    act(() => {
      result.current.showToast('Toast 1', 'info')
      result.current.showToast('Toast 2', 'info')
      result.current.showToast('Toast 3', 'info')
    })

    const ids = result.current.toasts.map((t) => t.id)
    const uniqueIds = new Set(ids)

    expect(uniqueIds.size).toBe(3) // All ids should be unique
  })
})
