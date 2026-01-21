/**
 * Zustand persist용 쿠키 스토리지 어댑터
 *
 * localStorage 대신 쿠키를 사용하여 hydration 타이밍 문제 해결
 * - SSR/CSR 환경에서 일관된 동작
 * - 새로고침 시 세션 유지 안정성 향상
 */

import type { StateStorage } from 'zustand/middleware'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface CookieOptions {
  expires?: number // 만료일 (일 단위)
  path?: string
  domain?: string
  sameSite?: 'strict' | 'lax' | 'none'
  secure?: boolean
}

// ─────────────────────────────────────────────────────────────
// Cookie Utilities
// ─────────────────────────────────────────────────────────────

/**
 * 쿠키 값 가져오기
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') {
    return null
  }

  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [cookieName, ...cookieValueParts] = cookie.split('=')
    if (cookieName.trim() === name) {
      const cookieValue = cookieValueParts.join('=')
      try {
        return decodeURIComponent(cookieValue)
      } catch {
        return cookieValue
      }
    }
  }
  return null
}

/**
 * 쿠키 설정
 */
export function setCookie(
  name: string,
  value: string,
  options: CookieOptions = {}
): void {
  if (typeof document === 'undefined') {
    return
  }

  const {
    expires = 7, // 기본 7일
    path = '/',
    domain,
    sameSite = 'lax',
    secure = import.meta.env.PROD,
  } = options

  let cookieString = `${name}=${encodeURIComponent(value)}`

  // 만료일 설정
  if (expires) {
    const expirationDate = new Date()
    expirationDate.setDate(expirationDate.getDate() + expires)
    cookieString += `; expires=${expirationDate.toUTCString()}`
  }

  // 경로 설정
  cookieString += `; path=${path}`

  // 도메인 설정 (선택적)
  if (domain) {
    cookieString += `; domain=${domain}`
  }

  // SameSite 설정
  cookieString += `; SameSite=${sameSite}`

  // Secure 설정 (production에서만 기본 활성화)
  if (secure) {
    cookieString += '; Secure'
  }

  document.cookie = cookieString
}

/**
 * 쿠키 삭제
 */
export function deleteCookie(name: string, path = '/'): void {
  if (typeof document === 'undefined') {
    return
  }

  // 만료일을 과거로 설정하여 삭제
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}`
}

// ─────────────────────────────────────────────────────────────
// Zustand Storage Adapter
// ─────────────────────────────────────────────────────────────

/**
 * Zustand persist용 쿠키 스토리지 생성
 *
 * @param cookieName 쿠키 이름 (기본: 'zustand-storage')
 * @param expirationDays 만료 기간 (일, 기본: 7)
 *
 * @example
 * ```ts
 * import { createJSONStorage } from 'zustand/middleware'
 * import { createSyncedCookieStorage } from '../lib/cookieStorage'
 *
 * persist(
 *   (set, get) => ({ ... }),
 *   {
 *     name: 'auth-storage',
 *     storage: createJSONStorage(() =>
 *       createSyncedCookieStorage('aos-auth', 7)
 *     ),
 *   }
 * )
 * ```
 */
export function createSyncedCookieStorage(
  cookieName = 'zustand-storage',
  expirationDays = 7
): StateStorage {
  return {
    getItem: (_name: string): string | null => {
      // _name은 Zustand persist의 'name' 옵션 값
      // 하지만 우리는 cookieName을 사용
      const value = getCookie(cookieName)

      if (!value) {
        return null
      }

      return value
    },

    setItem: (_name: string, value: string): void => {
      setCookie(cookieName, value, {
        expires: expirationDays,
        path: '/',
        sameSite: 'lax',
        secure: import.meta.env.PROD,
      })
    },

    removeItem: (_name: string): void => {
      deleteCookie(cookieName)
    },
  }
}

// ─────────────────────────────────────────────────────────────
// Migration Utilities
// ─────────────────────────────────────────────────────────────

const MIGRATION_FLAG_KEY = 'aos-auth-migrated'

/**
 * localStorage에서 쿠키로 데이터 마이그레이션
 *
 * @param localStorageKey localStorage 키
 * @param cookieName 쿠키 이름
 * @param expirationDays 쿠키 만료일
 * @returns 마이그레이션 수행 여부
 */
export function migrateLocalStorageToCookie(
  localStorageKey: string,
  cookieName: string,
  expirationDays = 7
): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  // 이미 마이그레이션 완료된 경우 스킵
  if (localStorage.getItem(MIGRATION_FLAG_KEY) === 'true') {
    return false
  }

  // 쿠키에 이미 데이터가 있으면 스킵
  const existingCookie = getCookie(cookieName)
  if (existingCookie) {
    // 마이그레이션 완료 플래그 설정
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true')
    return false
  }

  // localStorage에서 데이터 가져오기
  const localStorageData = localStorage.getItem(localStorageKey)
  if (!localStorageData) {
    // 마이그레이션 완료 플래그 설정
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true')
    return false
  }

  try {
    // 쿠키에 데이터 저장
    setCookie(cookieName, localStorageData, {
      expires: expirationDays,
      path: '/',
      sameSite: 'lax',
      secure: import.meta.env.PROD,
    })

    // 기존 localStorage 데이터 삭제
    localStorage.removeItem(localStorageKey)

    // 마이그레이션 완료 플래그 설정
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true')

    console.log(`[Auth] Migrated auth data from localStorage to cookie`)
    return true
  } catch (error) {
    console.error('[Auth] Migration failed:', error)
    return false
  }
}

/**
 * 쿠키와 localStorage 모두 정리 (로그아웃용)
 */
export function clearAllAuthStorage(
  localStorageKey: string,
  cookieName: string
): void {
  if (typeof window === 'undefined') {
    return
  }

  // 쿠키 삭제
  deleteCookie(cookieName)

  // localStorage 잔여 데이터 삭제
  localStorage.removeItem(localStorageKey)

  // 마이그레이션 플래그도 삭제 (다음 로그인 시 다시 체크)
  localStorage.removeItem(MIGRATION_FLAG_KEY)
}
