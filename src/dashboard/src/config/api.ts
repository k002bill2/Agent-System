/**
 * API Configuration
 *
 * In development: Uses Vite's proxy (/api -> localhost:8000)
 * In production: Uses VITE_API_URL environment variable
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || ''

/**
 * Construct full API URL
 * @param path - API path starting with /api
 */
export function getApiUrl(path: string): string {
  if (API_BASE_URL) {
    // Production: prepend base URL
    return `${API_BASE_URL}${path}`
  }
  // Development: use relative path (handled by Vite proxy)
  return path
}

/**
 * WebSocket URL for real-time features
 */
export function getWsUrl(path: string): string {
  if (API_BASE_URL) {
    // Production: convert http to ws
    const wsBase = API_BASE_URL.replace(/^http/, 'ws')
    return `${wsBase}${path}`
  }
  // Development: use relative path
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}
