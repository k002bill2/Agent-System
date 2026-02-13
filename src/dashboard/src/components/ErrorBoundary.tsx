/**
 * ErrorBoundary component and HOC.
 *
 * Catches render-time errors, displays a fallback UI with a retry button,
 * and supports code-splitting via React.lazy + Suspense.
 */

import React, { Component, Suspense } from 'react'
import type { ErrorInfo, ReactNode, ComponentType } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FallbackProps {
  error: Error
  resetError: () => void
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ComponentType<FallbackProps>
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

// ---------------------------------------------------------------------------
// Default fallback
// ---------------------------------------------------------------------------

function DefaultFallback({ error, resetError }: FallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] p-8 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <svg
        className="w-12 h-12 text-red-400 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
      <h3 className="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">
        Something went wrong
      </h3>
      <p className="text-sm text-red-600 dark:text-red-400 mb-4 text-center max-w-md">
        {error.message}
      </p>
      <button
        onClick={resetError}
        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
      >
        Try Again
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton for Suspense
// ---------------------------------------------------------------------------

export function LoadingSkeleton() {
  return (
    <div className="flex items-center justify-center min-h-[200px] p-8">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-700 border-t-primary-500 rounded-full animate-spin" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ErrorBoundary class component
// ---------------------------------------------------------------------------

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo)
  }

  private resetError = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      const FallbackComponent = this.props.fallback ?? DefaultFallback
      return (
        <FallbackComponent
          error={this.state.error}
          resetError={this.resetError}
        />
      )
    }

    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// HOC wrapper
// ---------------------------------------------------------------------------

export function withErrorBoundary<P extends Record<string, unknown>>(
  WrappedComponent: ComponentType<P>,
  fallback?: ComponentType<FallbackProps>,
): ComponentType<P> {
  function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    )
  }
  WithErrorBoundary.displayName = `withErrorBoundary(${WrappedComponent.displayName ?? WrappedComponent.name ?? 'Component'})`
  return WithErrorBoundary
}

// ---------------------------------------------------------------------------
// Lazy-loading utility with Suspense & ErrorBoundary
// ---------------------------------------------------------------------------

/** Lazy-load pages with built-in Suspense and ErrorBoundary. */
export function lazyWithBoundary(
  factory: () => Promise<{ default: ComponentType<Record<string, unknown>> }>,
  fallbackUI?: ComponentType<FallbackProps>,
): ComponentType<Record<string, unknown>> {
  const LazyComponent = React.lazy(factory)

  function LazyWithBoundary(props: Record<string, unknown>) {
    return (
      <ErrorBoundary fallback={fallbackUI}>
        <Suspense fallback={<LoadingSkeleton />}>
          <LazyComponent {...props} />
        </Suspense>
      </ErrorBoundary>
    )
  }

  LazyWithBoundary.displayName = 'lazyWithBoundary'
  return LazyWithBoundary
}

// ---------------------------------------------------------------------------
// Code-split page examples
// ---------------------------------------------------------------------------

export const LazyDashboardPage = React.lazy(() =>
  import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
export const LazyAgentsPage = React.lazy(() =>
  import('../pages/AgentsPage').then((m) => ({ default: m.AgentsPage })),
)
export const LazyWorkflowsPage = React.lazy(() =>
  import('../pages/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage })),
)
export const LazyMonitorPage = React.lazy(() =>
  import('../pages/MonitorPage').then((m) => ({ default: m.MonitorPage })),
)
export const LazySettingsPage = React.lazy(() =>
  import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
