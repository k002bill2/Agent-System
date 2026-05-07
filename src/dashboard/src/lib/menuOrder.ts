import { DEFAULT_MENU_ORDER } from '../components/admin/types'

/**
 * 서버에서 받은 menu_order를 기본 메뉴 목록과 동기화한다.
 * - 서버에 있지만 더 이상 존재하지 않는 메뉴 키 → 제거
 * - 기본 목록에 새로 추가된 메뉴 → 끝에 append
 *
 * 빈 배열이 들어오면 기본 순서를 그대로 반환한다.
 */
export function syncMenuOrder(serverOrder: readonly string[]): string[] {
  const validKeys = new Set<string>(DEFAULT_MENU_ORDER)
  const synced = serverOrder.filter((key) => validKeys.has(key))
  const present = new Set(synced)
  for (const key of DEFAULT_MENU_ORDER) {
    if (!present.has(key)) synced.push(key)
  }
  return synced
}
