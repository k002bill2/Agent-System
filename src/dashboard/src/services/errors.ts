/**
 * Error classes and types for the API service layer.
 *
 * Provides structured error handling with error codes,
 * severity levels, and user-friendly message mapping.
 */

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export type ErrorSeverity = 'error' | 'warning' | 'info'

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export enum ApiErrorCode {
  // Network / transport
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  REQUEST_CANCELLED = 'REQUEST_CANCELLED',

  // Auth
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Client
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFLICT = 'CONFLICT',

  // Server
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Generic
  UNKNOWN = 'UNKNOWN',
}

// ---------------------------------------------------------------------------
// ApiError
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  public readonly status: number
  public readonly code: string
  public readonly details?: Record<string, unknown>
  public readonly severity: ErrorSeverity

  constructor(params: {
    message: string
    status: number
    code: string
    details?: Record<string, unknown>
    severity?: ErrorSeverity
  }) {
    super(params.message)
    this.name = 'ApiError'
    this.status = params.status
    this.code = params.code
    this.details = params.details
    this.severity = params.severity ?? severityForCode(params.code)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map an HTTP status to a canonical error code. */
export function errorCodeFromStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return ApiErrorCode.BAD_REQUEST
    case 401:
      return ApiErrorCode.UNAUTHORIZED
    case 403:
      return ApiErrorCode.FORBIDDEN
    case 404:
      return ApiErrorCode.NOT_FOUND
    case 409:
      return ApiErrorCode.CONFLICT
    case 422:
      return ApiErrorCode.VALIDATION_ERROR
    case 503:
      return ApiErrorCode.SERVICE_UNAVAILABLE
    default:
      return status >= 500
        ? ApiErrorCode.INTERNAL_SERVER_ERROR
        : ApiErrorCode.UNKNOWN
  }
}

/** Default severity for a given error code. */
function severityForCode(code: string): ErrorSeverity {
  switch (code) {
    case ApiErrorCode.NETWORK_ERROR:
    case ApiErrorCode.INTERNAL_SERVER_ERROR:
    case ApiErrorCode.SERVICE_UNAVAILABLE:
      return 'error'
    case ApiErrorCode.UNAUTHORIZED:
    case ApiErrorCode.FORBIDDEN:
    case ApiErrorCode.TOKEN_EXPIRED:
    case ApiErrorCode.TIMEOUT:
      return 'warning'
    default:
      return 'error'
  }
}

/** Human-readable message per error code. */
const ERROR_MESSAGES: Record<string, string> = {
  [ApiErrorCode.NETWORK_ERROR]: 'Network error. Please check your connection.',
  [ApiErrorCode.TIMEOUT]: 'The request timed out. Please try again.',
  [ApiErrorCode.REQUEST_CANCELLED]: 'The request was cancelled.',
  [ApiErrorCode.UNAUTHORIZED]: 'You are not authenticated. Please log in.',
  [ApiErrorCode.FORBIDDEN]: 'You do not have permission for this action.',
  [ApiErrorCode.TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
  [ApiErrorCode.BAD_REQUEST]: 'The request was invalid.',
  [ApiErrorCode.NOT_FOUND]: 'The requested resource was not found.',
  [ApiErrorCode.VALIDATION_ERROR]: 'Please check your input and try again.',
  [ApiErrorCode.CONFLICT]: 'A conflict occurred. The resource may have been modified.',
  [ApiErrorCode.INTERNAL_SERVER_ERROR]: 'An unexpected server error occurred.',
  [ApiErrorCode.SERVICE_UNAVAILABLE]: 'The service is temporarily unavailable.',
  [ApiErrorCode.UNKNOWN]: 'An unexpected error occurred.',
}

export function userMessageForError(error: ApiError): string {
  return ERROR_MESSAGES[error.code] ?? ERROR_MESSAGES[ApiErrorCode.UNKNOWN]
}

/** Type guard */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError
}
