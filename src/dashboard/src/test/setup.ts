import '@testing-library/jest-dom'
import { vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────
// localStorage Mock (Zustand persist middleware 지원)
// jsdom의 localStorage는 URL 없이 실행 시 setItem 등이 undefined임
// ─────────────────────────────────────────────────────────────

class LocalStorageMock {
  private store: Record<string, string> = {}

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value)
  }

  removeItem(key: string): void {
    delete this.store[key]
  }

  clear(): void {
    this.store = {}
  }

  get length(): number {
    return Object.keys(this.store).length
  }

  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null
  }
}

const localStorageMock = new LocalStorageMock()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})

Object.defineProperty(window, 'sessionStorage', {
  value: new LocalStorageMock(),
  writable: true,
  configurable: true,
})

// 각 테스트 전에 localStorage 초기화
beforeEach(() => {
  localStorageMock.clear()
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock fetch
global.fetch = vi.fn()
