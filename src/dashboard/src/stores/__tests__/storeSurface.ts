/**
 * Zustand 스토어의 공개 표면을 스냅샷으로 고정하는 헬퍼.
 *
 * 액션을 **호출하지 않고** 이름과 초기값만 본다. 따라서 잡는 것은:
 *   - 상태 키·액션 **이름**의 유실·추가·개명 (`tsc` 가 소비자 쪽에서 잡는 것과 중복이지만,
 *     소비자가 함께 수정된 경우에도 남는 그물이다)
 *   - 같은 타입 안에서 **초기값이 바뀐** 경우 (`[]` → `null`, `'desc'` → `'asc'`)
 *
 * **못 잡는 것**: 스텁이 다른 이름의 impl 을 부르는 오배선, 액션이 no-op 이 된 경우.
 * 이름·타입이 그대로라 호출 없이는 구조적으로 보이지 않는다. 그 둘은
 * `delegation.ts` 의 위임 이름 검사가 전수로 잡는다 (Task 5 신설).
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
