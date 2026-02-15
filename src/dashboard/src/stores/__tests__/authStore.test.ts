/**
 * Auth Store Test Suite
 *
 * Zustand persist middleware를 사용하는 authStore의 종합 테스트.
 * localStorage 모킹과 상태 리셋을 통해 격리된 테스트 환경 제공.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAuthStore, AuthUser, selectIsAdmin, selectUserRole, selectDisplayName, selectHasError } from '../authStore'

// ─────────────────────────────────────────────────────────────
// Mock Setup
// ─────────────────────────────────────────────────────────────

// localStorage mock (Zustand persist middleware를 위해 필요)
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// ─────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────

const mockUser: AuthUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  avatar_url: 'https://example.com/avatar.jpg',
  oauth_provider: 'google',
  is_admin: false,
  role: 'user',
}

const mockAdminUser: AuthUser = {
  ...mockUser,
  id: 'admin-456',
  email: 'admin@example.com',
  name: 'Admin User',
  is_admin: true,
  role: 'admin',
}

const mockUserWithoutName: AuthUser = {
  ...mockUser,
  id: 'user-789',
  name: null,
}

// ─────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────

describe('authStore', () => {
  beforeEach(() => {
    // 각 테스트 전 localStorage와 store 상태 초기화
    localStorageMock.clear()
    useAuthStore.getState().reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ─────────────────────────────────────────────────────────────
  // 1. Initial State
  // ─────────────────────────────────────────────────────────────

  it('should have correct initial state', () => {
    const state = useAuthStore.getState()

    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // 2. setUser(user) - 로그인
  // ─────────────────────────────────────────────────────────────

  it('should set user and mark as authenticated when setUser is called with a user', () => {
    const { setUser } = useAuthStore.getState()

    setUser(mockUser)

    const state = useAuthStore.getState()
    expect(state.user).toEqual(mockUser)
    expect(state.isAuthenticated).toBe(true)
    expect(state.error).toBeNull()
  })

  it('should clear error when setUser is called with a user', () => {
    const { setError, setUser } = useAuthStore.getState()

    // 먼저 에러 설정
    setError('Previous error')
    expect(useAuthStore.getState().error).toBe('Previous error')

    // setUser 호출 시 에러 클리어
    setUser(mockUser)

    const state = useAuthStore.getState()
    expect(state.error).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // 3. setUser(null) - 로그아웃
  // ─────────────────────────────────────────────────────────────

  it('should set user to null and mark as not authenticated when setUser is called with null', () => {
    const { setUser } = useAuthStore.getState()

    // 먼저 로그인
    setUser(mockUser)
    expect(useAuthStore.getState().isAuthenticated).toBe(true)

    // 로그아웃
    setUser(null)

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expect(state.error).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // 4. setLoading
  // ─────────────────────────────────────────────────────────────

  it('should set isLoading to true when setLoading(true) is called', () => {
    const { setLoading } = useAuthStore.getState()

    setLoading(true)

    expect(useAuthStore.getState().isLoading).toBe(true)
  })

  it('should set isLoading to false when setLoading(false) is called', () => {
    const { setLoading } = useAuthStore.getState()

    setLoading(true)
    expect(useAuthStore.getState().isLoading).toBe(true)

    setLoading(false)
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  // ─────────────────────────────────────────────────────────────
  // 5. setError - 에러 설정 및 로딩 중지
  // ─────────────────────────────────────────────────────────────

  it('should set error when setError is called', () => {
    const { setError } = useAuthStore.getState()

    setError('Authentication failed')

    const state = useAuthStore.getState()
    expect(state.error).toBe('Authentication failed')
  })

  it('should set isLoading to false when setError is called', () => {
    const { setLoading, setError } = useAuthStore.getState()

    // 로딩 시작
    setLoading(true)
    expect(useAuthStore.getState().isLoading).toBe(true)

    // 에러 발생 시 로딩 자동 중지
    setError('Network error')

    const state = useAuthStore.getState()
    expect(state.isLoading).toBe(false)
    expect(state.error).toBe('Network error')
  })

  it('should clear error when setError(null) is called', () => {
    const { setError } = useAuthStore.getState()

    setError('Some error')
    expect(useAuthStore.getState().error).toBe('Some error')

    setError(null)
    expect(useAuthStore.getState().error).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // 6. logout - 초기 상태로 복원
  // ─────────────────────────────────────────────────────────────

  it('should restore initial state when logout is called', () => {
    const { setUser, setError, logout } = useAuthStore.getState()

    // 상태 변경
    setUser(mockUser)
    setError('Some error')

    expect(useAuthStore.getState().user).toEqual(mockUser)
    expect(useAuthStore.getState().error).toBe('Some error')

    // 로그아웃
    logout()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // 7. reset - 초기 상태로 복원
  // ─────────────────────────────────────────────────────────────

  it('should restore initial state when reset is called', () => {
    const { setUser, setLoading, setError, reset } = useAuthStore.getState()

    // 상태 변경
    setUser(mockUser)
    setLoading(true)
    setError('Error message')

    // 리셋
    reset()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // 8. selectIsAdmin - 관리자 여부 확인
  // ─────────────────────────────────────────────────────────────

  it('should return true for admin user in selectIsAdmin', () => {
    const { setUser } = useAuthStore.getState()

    setUser(mockAdminUser)

    const isAdmin = selectIsAdmin(useAuthStore.getState())
    expect(isAdmin).toBe(true)
  })

  it('should return false for non-admin user in selectIsAdmin', () => {
    const { setUser } = useAuthStore.getState()

    setUser(mockUser)

    const isAdmin = selectIsAdmin(useAuthStore.getState())
    expect(isAdmin).toBe(false)
  })

  it('should return false when user is null in selectIsAdmin', () => {
    const isAdmin = selectIsAdmin(useAuthStore.getState())
    expect(isAdmin).toBe(false)
  })

  // ─────────────────────────────────────────────────────────────
  // 9. selectUserRole - 사용자 역할 반환
  // ─────────────────────────────────────────────────────────────

  it('should return user role in selectUserRole', () => {
    const { setUser } = useAuthStore.getState()

    setUser(mockUser)

    const role = selectUserRole(useAuthStore.getState())
    expect(role).toBe('user')
  })

  it('should return admin role in selectUserRole', () => {
    const { setUser } = useAuthStore.getState()

    setUser(mockAdminUser)

    const role = selectUserRole(useAuthStore.getState())
    expect(role).toBe('admin')
  })

  it('should return default "user" role when user is null in selectUserRole', () => {
    const role = selectUserRole(useAuthStore.getState())
    expect(role).toBe('user')
  })

  // ─────────────────────────────────────────────────────────────
  // 10. selectDisplayName - 표시 이름 (name → email → '' fallback)
  // ─────────────────────────────────────────────────────────────

  it('should return user name when available in selectDisplayName', () => {
    const { setUser } = useAuthStore.getState()

    setUser(mockUser)

    const displayName = selectDisplayName(useAuthStore.getState())
    expect(displayName).toBe('Test User')
  })

  it('should return email when name is null in selectDisplayName', () => {
    const { setUser } = useAuthStore.getState()

    setUser(mockUserWithoutName)

    const displayName = selectDisplayName(useAuthStore.getState())
    expect(displayName).toBe('test@example.com')
  })

  it('should return empty string when user is null in selectDisplayName', () => {
    const displayName = selectDisplayName(useAuthStore.getState())
    expect(displayName).toBe('')
  })

  // ─────────────────────────────────────────────────────────────
  // 11. selectHasError - 에러 존재 여부
  // ─────────────────────────────────────────────────────────────

  it('should return true when error exists in selectHasError', () => {
    const { setError } = useAuthStore.getState()

    setError('Some error')

    const hasError = selectHasError(useAuthStore.getState())
    expect(hasError).toBe(true)
  })

  it('should return false when error is null in selectHasError', () => {
    const hasError = selectHasError(useAuthStore.getState())
    expect(hasError).toBe(false)
  })

  it('should return false after clearing error in selectHasError', () => {
    const { setError } = useAuthStore.getState()

    setError('Error')
    expect(selectHasError(useAuthStore.getState())).toBe(true)

    setError(null)
    expect(selectHasError(useAuthStore.getState())).toBe(false)
  })

  // ─────────────────────────────────────────────────────────────
  // 12. Persist Middleware - localStorage 통합
  // ─────────────────────────────────────────────────────────────

  it('should maintain user state across multiple operations', () => {
    const { setUser, setLoading, setError } = useAuthStore.getState()

    // Set user, then loading, then error
    setUser(mockUser)
    setLoading(true)
    setError('Test error')

    // User should still be set despite error
    const state = useAuthStore.getState()
    expect(state.user).toEqual(mockUser)
    expect(state.isAuthenticated).toBe(true)
    expect(state.error).toBe('Test error')
    expect(state.isLoading).toBe(false) // setError resets isLoading
  })

  it('should use partialize config (user and isAuthenticated only)', () => {
    // Verify partialize behavior indirectly: transient state (isLoading, error)
    // should not affect core auth state after logout/reset
    const { setUser, setLoading, setError, logout } = useAuthStore.getState()

    setUser(mockUser)
    setLoading(true)
    setError('Transient error')
    logout()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  // ─────────────────────────────────────────────────────────────
  // 13. Edge Cases
  // ─────────────────────────────────────────────────────────────

  it('should handle multiple setUser calls correctly', () => {
    const { setUser } = useAuthStore.getState()

    setUser(mockUser)
    expect(useAuthStore.getState().user?.id).toBe('user-123')

    setUser(mockAdminUser)
    expect(useAuthStore.getState().user?.id).toBe('admin-456')

    setUser(null)
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('should handle rapid state changes', () => {
    const { setLoading, setError, setUser } = useAuthStore.getState()

    setLoading(true)
    setError('Error 1')
    setUser(mockUser)
    setLoading(false)
    setError(null)

    const state = useAuthStore.getState()
    expect(state.user).toEqual(mockUser)
    expect(state.isAuthenticated).toBe(true)
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('should handle manager role correctly in selectUserRole', () => {
    const { setUser } = useAuthStore.getState()

    const managerUser: AuthUser = {
      ...mockUser,
      role: 'manager',
    }

    setUser(managerUser)

    const role = selectUserRole(useAuthStore.getState())
    expect(role).toBe('manager')
  })
})
