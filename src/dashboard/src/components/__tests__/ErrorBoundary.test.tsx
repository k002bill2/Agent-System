import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ErrorBoundary, LoadingSkeleton } from '../ErrorBoundary'
import type { FallbackProps } from '../ErrorBoundary'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A component that throws on render. */
function ThrowingComponent({ message }: { message: string }): never {
  throw new Error(message)
}

/** Suppress React error boundary console noise during tests. */
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ErrorBoundary', () => {
  // ── 1. Renders children when no error ─────────────────────

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <p>Everything is fine</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('Everything is fine')).toBeInTheDocument()
  })

  // ── 2. Shows default fallback on error ────────────────────

  it('shows fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Boom!" />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Boom!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  // ── 3. Retry button resets the error state ────────────────

  it('resets error and re-renders children when retry is clicked', () => {
    let shouldThrow = true

    function ConditionalThrower() {
      if (shouldThrow) {
        throw new Error('Temporary failure')
      }
      return <p>Recovered</p>
    }

    render(
      <ErrorBoundary>
        <ConditionalThrower />
      </ErrorBoundary>,
    )

    // Error state visible
    expect(screen.getByText('Temporary failure')).toBeInTheDocument()

    // Fix the error condition and click retry
    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))

    expect(screen.getByText('Recovered')).toBeInTheDocument()
  })

  // ── 4. Custom fallback prop ───────────────────────────────

  it('renders a custom fallback when provided', () => {
    function CustomFallback({ error, resetError }: FallbackProps) {
      return (
        <div>
          <span>Custom: {error.message}</span>
          <button onClick={resetError}>Reset</button>
        </div>
      )
    }

    render(
      <ErrorBoundary fallback={CustomFallback}>
        <ThrowingComponent message="Custom error" />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Custom: Custom error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument()
  })

  // ── 5. onError callback is invoked ────────────────────────

  it('calls onError when an error is caught', () => {
    const onError = vi.fn()

    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent message="Caught" />
      </ErrorBoundary>,
    )

    expect(onError).toHaveBeenCalledTimes(1)
    const [error] = onError.mock.calls[0] as [Error]
    expect(error.message).toBe('Caught')
  })
})

// ---------------------------------------------------------------------------
// LoadingSkeleton
// ---------------------------------------------------------------------------

describe('LoadingSkeleton', () => {
  it('renders a loading indicator', () => {
    render(<LoadingSkeleton />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
