import { describe, it, expect } from 'vitest'
import { syncMenuOrder } from '../menuOrder'
import { DEFAULT_MENU_ORDER } from '../../components/admin/types'

describe('syncMenuOrder', () => {
  it('returns DEFAULT_MENU_ORDER when server order is empty', () => {
    expect(syncMenuOrder([])).toEqual(DEFAULT_MENU_ORDER)
  })

  it('keeps server order intact when fully aligned with defaults', () => {
    const reversed = [...DEFAULT_MENU_ORDER].reverse()
    expect(syncMenuOrder(reversed)).toEqual(reversed)
  })

  it('drops keys that no longer exist in DEFAULT_MENU_ORDER', () => {
    const result = syncMenuOrder(['dashboard', 'removed-menu', 'projects'])
    expect(result).not.toContain('removed-menu')
    expect(result.slice(0, 2)).toEqual(['dashboard', 'projects'])
  })

  it('appends newly-added defaults to the end', () => {
    const partial = ['dashboard', 'projects']
    const result = syncMenuOrder(partial)
    expect(result.slice(0, 2)).toEqual(['dashboard', 'projects'])
    // 나머지 기본 메뉴가 모두 끝에 추가되어야 함
    for (const key of DEFAULT_MENU_ORDER) {
      expect(result).toContain(key)
    }
    expect(result.length).toBe(DEFAULT_MENU_ORDER.length)
  })

  it('does not mutate the input array', () => {
    const input = ['dashboard']
    const inputCopy = [...input]
    syncMenuOrder(input)
    expect(input).toEqual(inputCopy)
  })

  it('deduplicates repeated keys from a corrupted persisted order', () => {
    // 서버에 저장된 menu_order가 중복 누적된 경우(사이드바 메뉴 복제 버그).
    const corrupted = [
      'dashboard',
      'audit',
      'notifications',
      'audit',
      'notifications',
      'audit',
      'analytics',
      'playground',
      'analytics',
    ]
    const result = syncMenuOrder(corrupted)

    // 각 키는 정확히 한 번만 등장
    expect(new Set(result).size).toBe(result.length)
    // 첫 등장 순서 보존
    expect(result.slice(0, 4)).toEqual(['dashboard', 'audit', 'notifications', 'analytics'])
    // 모든 기본 메뉴 포함 + 중복 없음 → 길이는 DEFAULT_MENU_ORDER와 동일
    expect(result.length).toBe(DEFAULT_MENU_ORDER.length)
    for (const key of DEFAULT_MENU_ORDER) {
      expect(result).toContain(key)
    }
  })
})
