/**
 * git 스토어의 액션 스텁 63개가 모두 같은 이름의 impl 을 위임함을 보증한다.
 *
 * **`INLINE_ALLOWED` 를 편의로 늘리지 마라.** 여기 이름을 추가하는 것은
 * "이 액션은 전수 그물에서 빼겠다"는 선언이다. 늘려야 한다고 느끼면 그 액션을
 * 도메인 모듈로 옮기는 것이 정답이다.
 */
import { describe, expect, it } from 'vitest'
import { parseDelegations } from './delegation'
// CWD 에 의존하지 않게 Vite 의 `?raw` 로 원문을 가져온다 (Task 5 리뷰 M-1).
// `readFileSync('src/stores/...')` 는 repo 루트에서 돌리면 ENOENT 였고,
// 브리프가 제안한 `new URL(..., import.meta.url)` 은 **여기서 쓸 수 없다** —
// Vitest 의 `import.meta.url` 은 file: 이 아니라 http: 스킴이라
// `readFileSync` 가 "The URL must be of scheme file" 로 던진다(실측).
import SOURCE from '../git/index.ts?raw'

/** 도메인 모듈로 옮기지 않고 index.ts 에 남기기로 **의식적으로** 결정한 스텁. */
const INLINE_ALLOWED: readonly string[] = []

describe('git 액션 스텁 위임', () => {
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

  it('액션 63개 전부를 검사 대상으로 잡았다', () => {
    // 파서가 조용히 절반만 잡으면 위 두 테스트가 통과해도 그물이 아니다.
    expect(parseDelegations(SOURCE)).toHaveLength(63)
  })
})
