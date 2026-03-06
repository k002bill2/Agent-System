/**
 * Infrastructure Status Store
 *
 * AOS 인프라 서비스의 포트 상태를 조회하고 관리하는 Zustand 스토어.
 * 프로젝트 경로가 주어지면 해당 프로젝트의 docker-compose에서 서비스를 파싱합니다.
 */

import { create } from 'zustand'
import { apiClient } from '@/services/apiClient'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ServiceStatus {
  name: string
  port: number
  url: string
  status: 'running' | 'stopped' | 'conflict'
  pid: number | null
  process_name: string | null
}

export interface InfraStatusResponse {
  services: ServiceStatus[]
  has_conflicts: boolean
  timestamp: string
}

interface InfraStatusState {
  services: ServiceStatus[]
  hasConflicts: boolean
  timestamp: string | null
  isLoading: boolean
  error: string | null
  /** Currently loaded project path (null = default AOS services) */
  currentProjectPath: string | null

  /** Fetch services. If projectPath given, scans that project's docker-compose. */
  fetchStatus: (projectPath?: string | null) => Promise<void>
}

// ─────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────

export const useInfraStatusStore = create<InfraStatusState>((set) => ({
  services: [],
  hasConflicts: false,
  timestamp: null,
  isLoading: false,
  error: null,
  currentProjectPath: null,

  fetchStatus: async (projectPath?: string | null) => {
    set({ isLoading: true, error: null })
    try {
      const params = projectPath ? `?project_path=${encodeURIComponent(projectPath)}` : ''
      const data = await apiClient.get<InfraStatusResponse>(`/api/health/services${params}`)
      set({
        services: data.services,
        hasConflicts: data.has_conflicts,
        timestamp: data.timestamp,
        currentProjectPath: projectPath ?? null,
        isLoading: false,
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch infrastructure status',
        isLoading: false,
      })
    }
  },
}))
