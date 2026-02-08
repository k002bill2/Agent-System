import { create } from 'zustand'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

type MenuVisibility = Record<string, Record<string, boolean>>

interface MenuVisibilityState {
  visibility: MenuVisibility
  isLoaded: boolean
  fetchVisibility: () => Promise<void>
}

export const useMenuVisibilityStore = create<MenuVisibilityState>((set, get) => ({
  visibility: {},
  isLoaded: false,

  fetchVisibility: async () => {
    // 이미 로드됐으면 스킵
    if (get().isLoaded) return

    try {
      const { useAuthStore } = await import('./auth')
      const token = useAuthStore.getState().accessToken
      if (!token) return

      const res = await fetch(`${API_BASE_URL}/admin/menu-visibility`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (res.ok) {
        const data = await res.json()
        set({ visibility: data.visibility, isLoaded: true })
      }
    } catch {
      // 실패 시 기본값 유지 (모든 메뉴 표시)
    }
  },
}))
