import { apiClient } from './apiClient'
import type { User } from '../stores/auth'
import type { Project } from '../stores/projects'
import type { LLMModel } from '../stores/settings'

export interface BootstrapMenu {
  visibility: Record<string, Record<string, boolean>>
  menu_order: string[]
}

export interface BootstrapResponse {
  user: User
  projects: Project[]
  models: LLMModel[]
  menu: BootstrapMenu | null
}

let inFlightBootstrap: { key: string; promise: Promise<BootstrapResponse> } | null = null

/**
 * Fetch the authenticated startup payload once per request burst and auth key.
 * Concurrent callers for the same auth session share one promise; a different
 * session never inherits an earlier user's response.
 */
export function fetchBootstrap(requestKey = ''): Promise<BootstrapResponse> {
  if (inFlightBootstrap?.key === requestKey) return inFlightBootstrap.promise

  const request = apiClient.get<BootstrapResponse>('/api/bootstrap')
  const trackedRequest = request.finally(() => {
    if (inFlightBootstrap?.promise === trackedRequest) {
      inFlightBootstrap = null
    }
  })
  inFlightBootstrap = { key: requestKey, promise: trackedRequest }
  return trackedRequest
}
