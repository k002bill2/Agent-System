/**
 * 액션 스텁이 **같은 이름**의 impl 을 위임하는지 전수 검사한다.
 *
 * `surface()` 는 액션을 호출하지 않고 이름과 초기값만 보므로 두 가지를 못 잡는다:
 *   (a) 스텁이 다른 이름의 impl 을 부르는 오배선 — 이름·타입이 그대로라 안 보인다
 *   (b) 스텁이 아무것도 위임하지 않는 no-op
 * 기존 테스트가 그 액션을 호출하지 않으면(실측: git 18개 · projectConfigs 37개)
 * 아무 그물도 없다. 이 검사는 커버리지와 무관하게 전수로 본다.
 */
export interface Delegation {
  /** `create()` 안의 프로퍼티 이름 */
  stub: string
  /** `<모듈별칭>.<함수>(set, get, ...)` 의 함수 이름. 위임이 없으면 null */
  target: string | null
}

/** `index.ts` 원문에서 액션 스텁과 그 위임 대상을 뽑는다. */
export function parseDelegations(source: string): Delegation[] {
  const lines = source.split('\n')
  const start = lines.findIndex((l) => /=\s*create[<(]/.test(l))
  const body = lines.slice(start)

  // 프로퍼티 시작 줄의 인덱스를 모아 각 스텁의 텍스트 범위를 만든다.
  // 멀티라인 스텁이 있어도 다음 프로퍼티 직전까지가 그 스텁의 본문이다.
  const heads: { name: string; at: number }[] = []
  body.forEach((line, i) => {
    const m = line.match(/^ {2}([a-zA-Z_][a-zA-Z0-9_]*): (?:async )?\(/)
    if (m) heads.push({ name: m[1], at: i })
  })

  return heads.map(({ name, at }, i) => {
    const until = i + 1 < heads.length ? heads[i + 1].at : body.length
    const text = body.slice(at, until).join('\n')
    // `mod.fn(set, get` 또는 `mod.fn(set,get` — 위임 호출의 형태
    const call = text.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\.([a-zA-Z_][a-zA-Z0-9_]*)\(\s*set\s*,\s*get\b/)
    return { stub: name, target: call ? call[1] : null }
  })
}
