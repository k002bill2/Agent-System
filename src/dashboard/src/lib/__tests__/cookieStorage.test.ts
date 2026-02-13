import { describe, it, expect, beforeEach } from 'vitest'
import {
  getCookie,
  setCookie,
  deleteCookie,
  createSyncedCookieStorage,
  migrateLocalStorageToCookie,
  clearAllAuthStorage,
} from '../cookieStorage'

describe('getCookie', () => {
  beforeEach(() => {
    // Clear all cookies
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim()
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    })
  })

  it('returns null when cookie does not exist', () => {
    expect(getCookie('nonexistent')).toBeNull()
  })

  it('gets a cookie by name', () => {
    document.cookie = 'test-cookie=hello'
    expect(getCookie('test-cookie')).toBe('hello')
  })

  it('handles encoded values', () => {
    document.cookie = `encoded=${encodeURIComponent('hello world')}`
    expect(getCookie('encoded')).toBe('hello world')
  })

  it('handles cookies with = in value', () => {
    document.cookie = 'token=abc=def=ghi'
    expect(getCookie('token')).toBe('abc=def=ghi')
  })
})

describe('setCookie', () => {
  beforeEach(() => {
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim()
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    })
  })

  it('sets a cookie', () => {
    setCookie('test', 'value')
    expect(getCookie('test')).toBe('value')
  })

  it('encodes special characters', () => {
    setCookie('data', 'hello world')
    expect(getCookie('data')).toBe('hello world')
  })

  it('sets cookie with custom options', () => {
    setCookie('custom', 'val', { expires: 30, path: '/', sameSite: 'strict' })
    expect(getCookie('custom')).toBe('val')
  })
})

describe('deleteCookie', () => {
  it('removes a cookie', () => {
    setCookie('to-delete', 'value')
    expect(getCookie('to-delete')).toBe('value')

    deleteCookie('to-delete')
    expect(getCookie('to-delete')).toBeNull()
  })
})

describe('createSyncedCookieStorage', () => {
  let storage: ReturnType<typeof createSyncedCookieStorage>

  beforeEach(() => {
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim()
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    })
    storage = createSyncedCookieStorage('test-store', 7)
  })

  it('getItem returns null when empty', () => {
    expect(storage.getItem('key')).toBeNull()
  })

  it('setItem stores and getItem retrieves', () => {
    const data = JSON.stringify({ state: { token: 'abc' } })
    storage.setItem('key', data)
    expect(storage.getItem('key')).toBe(data)
  })

  it('removeItem deletes cookie', () => {
    storage.setItem('key', 'value')
    storage.removeItem('key')
    expect(storage.getItem('key')).toBeNull()
  })

  it('uses cookieName not zustand name', () => {
    storage.setItem('zustand-name', 'data')
    expect(getCookie('test-store')).toBe('data')
  })
})

describe('migrateLocalStorageToCookie', () => {
  beforeEach(() => {
    localStorage.clear()
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim()
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    })
  })

  it('returns false when already migrated', () => {
    localStorage.setItem('aos-auth-migrated', 'true')
    expect(migrateLocalStorageToCookie('auth', 'cookie', 7)).toBe(false)
  })

  it('returns false when cookie already exists', () => {
    setCookie('cookie', 'existing')
    expect(migrateLocalStorageToCookie('auth', 'cookie', 7)).toBe(false)
    expect(localStorage.getItem('aos-auth-migrated')).toBe('true')
  })

  it('returns false when no localStorage data', () => {
    expect(migrateLocalStorageToCookie('auth', 'cookie', 7)).toBe(false)
  })

  it('migrates data from localStorage to cookie', () => {
    localStorage.setItem('auth', JSON.stringify({ token: 'abc' }))
    const result = migrateLocalStorageToCookie('auth', 'cookie', 7)

    expect(result).toBe(true)
    expect(getCookie('cookie')).toBeTruthy()
    expect(localStorage.getItem('auth')).toBeNull()
    expect(localStorage.getItem('aos-auth-migrated')).toBe('true')
  })
})

describe('clearAllAuthStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim()
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    })
  })

  it('clears cookie, localStorage, and migration flag', () => {
    setCookie('auth-cookie', 'data')
    localStorage.setItem('auth-key', 'data')
    localStorage.setItem('aos-auth-migrated', 'true')

    clearAllAuthStorage('auth-key', 'auth-cookie')

    expect(getCookie('auth-cookie')).toBeNull()
    expect(localStorage.getItem('auth-key')).toBeNull()
    expect(localStorage.getItem('aos-auth-migrated')).toBeNull()
  })
})
