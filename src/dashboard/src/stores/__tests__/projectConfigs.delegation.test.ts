/**
 * projectConfigs 스토어의 액션 스텁 72개가 모두 같은 이름의 impl 을 위임함을 보증한다.
 *
 * **`INLINE_ALLOWED` 를 편의로 늘리지 마라.** 여기 이름을 추가하는 것은
 * "이 액션은 전수 그물에서 빼겠다"는 선언이다. 늘려야 한다고 느끼면 그 액션을
 * 도메인 모듈로 옮기는 것이 정답이다.
 *
 * 이 스토어에서 특히 중요하다 — 액션 72개 중 **37개가 `projectConfigs.test.ts` 에서
 * 호출되지 않는다**(실측 커버리지 35/72). `commands` · `rules` · `memories` ·
 * `dbProjects` 는 도메인 전체가 미커버라, 그 액션들에는 이 전수 검사가 유일한 그물이다.
 */
import { describe, expect, it } from 'vitest'
import { parseDelegations } from './delegation'
// CWD 에 의존하지 않게 Vite 의 `?raw` 로 원문을 가져온다 (Task 5 리뷰 M-1).
// 브리프의 `new URL(..., import.meta.url)` 은 Vitest 에서 http: 스킴이라 쓸 수 없다 —
// `git.delegation.test.ts` 상단 주석 참조(실측).
import SOURCE from '../projectConfigs/index.ts?raw'

/** 도메인 모듈로 옮기지 않고 index.ts 에 남기기로 **의식적으로** 결정한 스텁. */
const INLINE_ALLOWED: readonly string[] = []

describe('projectConfigs 액션 스텁 위임', () => {
  it('스텁 이름과 위임 대상 함수 이름이 같다', () => {
    const mismatched = parseDelegations(SOURCE)
      .filter((d) => d.target !== null && d.target !== d.stub)
      .map((d) => `${d.stub} → ${d.target}`)

    expect(mismatched).toEqual([])
  })

  it('허용 목록 밖의 스텁은 반드시 위임한다', () => {
    const notDelegating = parseDelegations(SOURCE)
      .filter((d) => d.target === null && !INLINE_ALLOWED.includes(d.stub))
      .map((d) => d.stub)

    expect(notDelegating).toEqual([])
  })

  it('액션 72개 전부를 검사 대상으로 잡았다', () => {
    // 파서가 조용히 절반만 잡으면 위 두 테스트가 통과해도 그물이 아니다.
    expect(parseDelegations(SOURCE)).toHaveLength(72)
  })
})
