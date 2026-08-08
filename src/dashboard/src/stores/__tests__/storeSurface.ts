/**
 * Zustand 스토어의 공개 표면을 스냅샷으로 고정하는 헬퍼.
 *
 * `tsc --noEmit` 은 86개 소비자 파일에서 export 유실·개명을 잡지만,
 * 세 가지를 못 잡는다:
 *   1. 액션을 추출했는데 스텁이 다른 impl 에 배선된 경우 (타입은 맞음)
 *   2. 같은 타입 안에서 초기값이 바뀐 경우 (`[]` → `null`, `'desc'` → `'asc'`)
 *   3. 액션이 조용히 no-op 이 된 경우 (이름·타입 그대로)
 *
 * B1·B2 의 `route_table.snapshot()` 에 해당한다.
 */
export interface StoreSurface {
  /** 함수가 아닌 상태 키. 정렬 — 선언 순서는 계약이 아니다. */
  stateKeys: string[]
  /** 함수인 프로퍼티(액션·파생 게터). 정렬. */
  actionNames: string[]
  /** 초기 상태 **값**. 타입이 같아도 값이 바뀌면 잡는다. */
  initialState: Record<string, unknown>
}

export function surface(state: Record<string, unknown>): StoreSurface {
  const entries = Object.entries(state)
  const values = entries.filter(([, v]) => typeof v !== 'function')
  const fns = entries.filter(([, v]) => typeof v === 'function')

  return {
    stateKeys: values.map(([k]) => k).sort(),
    actionNames: fns.map(([k]) => k).sort(),
    // JSON 왕복으로 비직렬화 값을 드러낸다 — Map/Set/Date 가 초기값에 있으면
    // 여기서 형태가 무너지므로 베이스라인 생성 시점에 발견된다.
    initialState: JSON.parse(
      JSON.stringify(Object.fromEntries(values.sort(([a], [b]) => a.localeCompare(b))))
    ),
  }
}
