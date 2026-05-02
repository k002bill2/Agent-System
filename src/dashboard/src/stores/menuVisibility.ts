import { create } from 'zustand'
import { apiClient } from '../services/apiClient'
import { useAuthStore } from './auth'

type MenuVisibility = Record<string, Record<string, boolean>>

interface MenuVisibilityState {
  visibility: MenuVisibility
  menuOrder: string[]
  isLoaded: boolean
  fetchVisibility: () => Promise<void>
}

export const useMenuVisibilityStore = create<MenuVisibilityState>((set, get) => ({
  visibility: {},
  menuOrder: [],
  isLoaded: false,

  fetchVisibility: async () => {
    // 이미 로드됐으면 스킵
    if (get().isLoaded) return
    // 미인증 또는 토큰 만료 시 스킵 (401 방지).
    // isLoaded=true로 표시해 Sidebar가 영구 Skeleton에 갇히지 않도록 한다.
    const auth = useAuthStore.getState()
    if (!auth.isAuthenticated() || auth.isTokenExpired()) {
      set({ isLoaded: true })
      return
    }

    try {
      const data = await apiClient.get<{ visibility: MenuVisibility; menu_order?: string[] }>('/api/admin/menu-visibility')
      set({
        visibility: data.visibility,
        menuOrder: data.menu_order || [],
        isLoaded: true,
      })
    } catch {
      // 실패 시 기본값 유지(모든 메뉴 표시) + isLoaded=true로 폴백 렌더 진입
      set({ isLoaded: true })
    }
  },
}))
