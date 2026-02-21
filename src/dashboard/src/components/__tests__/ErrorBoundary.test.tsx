import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ErrorBoundary, LoadingSkeleton, withErrorBoundary, lazyWithBoundary } from '../ErrorBoundary'
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

  // ── 6. onError receives errorInfo ─────────────────────────

  it('passes errorInfo with componentStack to onError', () => {
    const onError = vi.fn()

    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent message="Stack check" />
      </ErrorBoundary>,
    )

    expect(onError).toHaveBeenCalledTimes(1)
    const [, errorInfo] = onError.mock.calls[0] as [Error, { componentStack: string }]
    expect(errorInfo).toBeDefined()
    expect(errorInfo.componentStack).toBeDefined()
  })

  // ── 7. Multiple children with one throwing ────────────────

  it('catches error even when mixed with non-throwing children', () => {
    render(
      <ErrorBoundary>
        <p>Before</p>
        <ThrowingComponent message="Middle error" />
        <p>After</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Middle error')).toBeInTheDocument()
    // "Before" and "After" are not rendered because the boundary caught
    expect(screen.queryByText('Before')).not.toBeInTheDocument()
    expect(screen.queryByText('After')).not.toBeInTheDocument()
  })

  // ── 8. No onError callback provided ───────────────────────

  it('works without onError callback', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="No callback" />
      </ErrorBoundary>,
    )

    // Should still show fallback
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('No callback')).toBeInTheDocument()
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

  it('renders a spinner element', () => {
    const { container } = render(<LoadingSkeleton />)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// withErrorBoundary HOC
// ---------------------------------------------------------------------------

describe('withErrorBoundary', () => {
  it('renders the wrapped component normally when no error', () => {
    function MyComponent() {
      return <p>HOC child works</p>
    }

    const Wrapped = withErrorBoundary(MyComponent)
    render(<Wrapped />)

    expect(screen.getByText('HOC child works')).toBeInTheDocument()
  })

  it('catches errors from the wrapped component', () => {
    function FailingComponent(): never {
      throw new Error('HOC error')
    }

    const Wrapped = withErrorBoundary(FailingComponent)
    render(<Wrapped />)

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('HOC error')).toBeInTheDocument()
  })

  it('uses custom fallback when provided', () => {
    function FailingComponent(): never {
      throw new Error('HOC custom error')
    }

    function CustomFallback({ error }: FallbackProps) {
      return <div>Custom HOC fallback: {error.message}</div>
    }

    const Wrapped = withErrorBoundary(FailingComponent, CustomFallback)
    render(<Wrapped />)

    expect(screen.getByText('Custom HOC fallback: HOC custom error')).toBeInTheDocument()
  })

  it('sets correct displayName', () => {
    function MyNamedComponent() {
      return <p>Named</p>
    }

    const Wrapped = withErrorBoundary(MyNamedComponent)
    expect(Wrapped.displayName).toBe('withErrorBoundary(MyNamedComponent)')
  })

  it('uses displayName if component has one', () => {
    function SomeComp() {
      return <p>Display</p>
    }
    SomeComp.displayName = 'MyCustomName'

    const Wrapped = withErrorBoundary(SomeComp as React.ComponentType<Record<string, unknown>>)
    expect(Wrapped.displayName).toBe('withErrorBoundary(MyCustomName)')
  })

  it('passes props through to the wrapped component', () => {
    function Greeting({ name }: { name: string }) {
      return <p>Hello, {name}!</p>
    }

    const Wrapped = withErrorBoundary(Greeting as React.ComponentType<Record<string, unknown>>)
    render(<Wrapped name="World" />)

    expect(screen.getByText('Hello, World!')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// lazyWithBoundary
// ---------------------------------------------------------------------------

describe('lazyWithBoundary', () => {
  it('sets displayName to lazyWithBoundary', () => {
    const LazyComp = lazyWithBoundary(() =>
      Promise.resolve({ default: () => <p>Lazy loaded</p> }),
    )

    expect(LazyComp.displayName).toBe('lazyWithBoundary')
  })

  it('shows loading skeleton while lazy component loads', async () => {
    // Create a promise that we can control
    let resolveImport: (value: { default: React.ComponentType<Record<string, unknown>> }) => void
    const importPromise = new Promise<{ default: React.ComponentType<Record<string, unknown>> }>((resolve) => {
      resolveImport = resolve
    })

    const LazyComp = lazyWithBoundary(() => importPromise)
    render(<LazyComp />)

    // Should show loading skeleton while resolving
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    // Resolve the import
    resolveImport!({ default: () => <p>Lazy content loaded</p> })

    await waitFor(() => {
      expect(screen.getByText('Lazy content loaded')).toBeInTheDocument()
    })
  })

  it('shows error boundary fallback when lazy import fails', async () => {
    const LazyComp = lazyWithBoundary(() =>
      Promise.reject(new Error('Import failed')),
    )

    render(<LazyComp />)

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })
  })
})
