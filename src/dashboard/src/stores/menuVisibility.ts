import { create } from 'zustand'
import { apiClient } from '../services/apiClient'

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

    try {
      const data = await apiClient.get<{ visibility: MenuVisibility; menu_order?: string[] }>('/api/admin/menu-visibility')
      set({
        visibility: data.visibility,
        menuOrder: data.menu_order || [],
        isLoaded: true,
      })
    } catch {
      // 실패 시 기본값 유지 (모든 메뉴 표시)
    }
  },
}))
