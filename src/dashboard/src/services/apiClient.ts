/**
 * API Client with interceptors, retry with exponential backoff,
 * automatic token refresh, timeout, and request cancellation.
 *
 * This is the ONLY module that uses raw `fetch`. All other code
 * must use this client or a service built on top of it.
 */

import { ApiError, ApiErrorCode, errorCodeFromStatus } from './errors'
import { getApiUrl } from '../config/api'
import { analytics } from './analytics'
import { useAuthStore } from '../stores/auth'

// ---------------------------------------------------------------------------
// Config & interceptor types
// ---------------------------------------------------------------------------

export interface ApiClientConfig {
  baseURL: string
  timeout?: number
  headers?: Record<string, string>
  maxRetries?: number
}

export interface RequestConfig {
  url: string
  method: string
  headers: Record<string, string>
  body?: string | FormData
  signal?: AbortSignal
  timeout?: number
  /** Disable retry for this specific request */
  skipRetry?: boolean
}

export interface RequestInterceptor {
  onRequest: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>
  onRequestError?: (error: Error) => void
}

export interface ResponseInterceptor {
  onResponse: (response: Response) => Response | Promise<Response>
  onResponseError?: (error: ApiError) => ApiError | Promise<ApiError>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && (err as TypeError).message === 'Failed to fetch'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// ApiClient class
// ---------------------------------------------------------------------------

class ApiClient {
  private config: Required<Pick<ApiClientConfig, 'baseURL' | 'timeout' | 'maxRetries'>> & {
    headers: Record<string, string>
  }

  private requestInterceptors: RequestInterceptor[] = []
  private responseInterceptors: ResponseInterceptor[] = []
  private refreshPromise: Promise<void> | null = null

  constructor(config: ApiClientConfig) {
    this.config = {
      baseURL: config.baseURL,
      timeout: config.timeout ?? 30_000,
      headers: config.headers ?? { 'Content-Type': 'application/json' },
      maxRetries: config.maxRetries ?? 3,
    }
  }

  // ── Interceptor registration ──────────────────────────────

  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor)
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor)
  }

  // ── Public HTTP methods ───────────────────────────────────

  get<T>(url: string, options?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({ ...options, url, method: 'GET', headers: {} })
  }

  post<T>(url: string, data?: unknown, options?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      ...options,
      url,
      method: 'POST',
      headers: {},
      body: data !== undefined ? JSON.stringify(data) : undefined,
    })
  }

  put<T>(url: string, data?: unknown, options?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      ...options,
      url,
      method: 'PUT',
      headers: {},
      body: data !== undefined ? JSON.stringify(data) : undefined,
    })
  }

  patch<T>(url: string, data?: unknown, options?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({
      ...options,
      url,
      method: 'PATCH',
      headers: {},
      body: data !== undefined ? JSON.stringify(data) : undefined,
    })
  }

  delete<T = void>(url: string, options?: Partial<RequestConfig>): Promise<T> {
    return this.request<T>({ ...options, url, method: 'DELETE', headers: {} })
  }

  // ── Core request logic ────────────────────────────────────

  private async request<T>(reqConfig: RequestConfig): Promise<T> {
    // Merge default headers
    const mergedConfig: RequestConfig = {
      ...reqConfig,
      url: `${this.config.baseURL}${reqConfig.url}`,
      headers: { ...this.config.headers, ...reqConfig.headers },
      timeout: reqConfig.timeout ?? this.config.timeout,
    }

    // Run request interceptors
    let config = mergedConfig
    for (const interceptor of this.requestInterceptors) {
      try {
        config = await interceptor.onRequest(config)
      } catch (err) {
        interceptor.onRequestError?.(err instanceof Error ? err : new Error(String(err)))
        throw err
      }
    }

    // Attempt with retries
    return this.executeWithRetry<T>(config, 0)
  }

  private async executeWithRetry<T>(config: RequestConfig, attempt: number): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.timeout ?? this.config.timeout)

    // Combine external signal with our timeout signal
    const externalSignal = config.signal
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timeoutId)
        throw new ApiError({
          message: 'Request cancelled',
          status: 0,
          code: ApiErrorCode.REQUEST_CANCELLED,
        })
      }
      externalSignal.addEventListener('abort', () => controller.abort())
    }

    try {
      const response = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.body,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Run response interceptors (success path)
      let processed = response
      for (const interceptor of this.responseInterceptors) {
        processed = await interceptor.onResponse(processed)
      }

      if (!processed.ok) {
        const apiError = await this.buildApiError(processed)

        // 401 → attempt token refresh then retry once with updated token
        if (processed.status === 401 && attempt === 0) {
          await this.refreshToken()
          const { accessToken } = useAuthStore.getState()
          if (accessToken) {
            const updatedHeaders = { ...config.headers, Authorization: `Bearer ${accessToken}` }
            return this.executeWithRetry<T>({ ...config, headers: updatedHeaders }, attempt + 1)
          }
        }

        // Run response error interceptors
        let finalError = apiError
        for (const interceptor of this.responseInterceptors) {
          if (interceptor.onResponseError) {
            finalError = await interceptor.onResponseError(finalError)
          }
        }

        analytics.track('api_error', {
          url: config.url,
          method: config.method,
          status: processed.status,
        })

        throw finalError
      }

      // 204 No Content
      if (processed.status === 204) {
        return undefined as T
      }

      return (await processed.json()) as T
    } catch (err) {
      clearTimeout(timeoutId)

      // Request was aborted (timeout or cancellation)
      if (err instanceof DOMException && err.name === 'AbortError') {
        const wasCancelled = externalSignal?.aborted
        throw new ApiError({
          message: wasCancelled ? 'Request cancelled' : 'Request timed out',
          status: 0,
          code: wasCancelled ? ApiErrorCode.REQUEST_CANCELLED : ApiErrorCode.TIMEOUT,
        })
      }

      // Network error → retry with backoff
      if (isNetworkError(err) && !config.skipRetry && attempt < this.config.maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt, 10_000)
        await sleep(delay)
        return this.executeWithRetry<T>(config, attempt + 1)
      }

      // Already an ApiError? Re-throw
      if (err instanceof ApiError) {
        throw err
      }

      // Wrap unknown error
      throw new ApiError({
        message: isNetworkError(err) ? 'Network error' : String(err),
        status: 0,
        code: isNetworkError(err) ? ApiErrorCode.NETWORK_ERROR : ApiErrorCode.UNKNOWN,
      })
    }
  }

  // ── Token refresh ────────────────────────────────────────

  private async refreshToken(): Promise<void> {
    // Coalesce concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise
    }

    this.refreshPromise = (async () => {
      try {
        const success = await useAuthStore.getState().refreshAccessToken()
        if (!success) {
          throw new ApiError({
            message: 'Token refresh failed',
            status: 401,
            code: ApiErrorCode.TOKEN_EXPIRED,
          })
        }
      } finally {
        this.refreshPromise = null
      }
    })()

    return this.refreshPromise
  }

  // ── Error builder ────────────────────────────────────────

  private async buildApiError(response: Response): Promise<ApiError> {
    let body: Record<string, unknown> | undefined

    try {
      body = (await response.json()) as Record<string, unknown>
    } catch {
      // response may not have JSON body
    }

    const message =
      (body?.message as string | undefined) ??
      (body?.detail as string | undefined) ??
      response.statusText ??
      'Request failed'

    return new ApiError({
      message,
      status: response.status,
      code: (body?.code as string | undefined) ?? errorCodeFromStatus(response.status),
      details: body,
    })
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config)
}

export const apiClient = createApiClient({
  baseURL: getApiUrl(''),
  timeout: 30_000,
})

export type { ApiClient }
