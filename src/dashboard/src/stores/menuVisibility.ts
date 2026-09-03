import { create } from 'zustand'
import { apiClient } from '../services/apiClient'
import { useAuthStore, getAuthSessionKey } from './auth'

type MenuVisibility = Record<string, Record<string, boolean>>

export interface MenuVisibilityPayload {
  visibility: MenuVisibility
  menu_order: string[]
}

interface MenuVisibilityState {
  visibility: MenuVisibility
  menuOrder: string[]
  isLoaded: boolean
  isFallback: boolean
  fetchVisibility: () => Promise<void>
  hydrateVisibility: (payload: MenuVisibilityPayload) => void
  reset: () => void
}

export const useMenuVisibilityStore = create<MenuVisibilityState>((set, get) => ({
  visibility: {},
  menuOrder: [],
  isLoaded: false,
  isFallback: false,

  hydrateVisibility: (payload) => {
    set({
      visibility: payload.visibility,
      menuOrder: payload.menu_order,
      isLoaded: true,
      isFallback: false,
    })
  },

  reset: () => {
    set({ visibility: {}, menuOrder: [], isLoaded: false, isFallback: false })
  },

  fetchVisibility: async () => {
    // 이미 로드됐으면 스킵
    if (get().isLoaded) return
    // 미인증 또는 토큰 만료 시 스킵 (401 방지).
    // isLoaded=true로 표시해 Sidebar가 영구 Skeleton에 갇히지 않도록 한다.
    const auth = useAuthStore.getState()
    if (!auth.isAuthenticated() || auth.isTokenExpired()) {
      set({ isLoaded: true, isFallback: false })
      return
    }

    const requestSessionKey = getAuthSessionKey()
    try {
      const data = await apiClient.get<{ visibility: MenuVisibility; menu_order?: string[] }>('/api/admin/menu-visibility')
      if (getAuthSessionKey() !== requestSessionKey) return
      set({
        visibility: data.visibility,
        menuOrder: data.menu_order || [],
        isLoaded: true,
      })
    } catch {
      if (getAuthSessionKey() !== requestSessionKey) return
      // Unknown visibility must fail closed for authenticated non-admin users.
      set({ isLoaded: true, isFallback: true, menuOrder: ['dashboard'], visibility: {} })
    }
  },
}))
