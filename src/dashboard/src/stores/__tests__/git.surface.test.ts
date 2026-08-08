/**
 * git 스토어 분할이 공개 표면을 바꾸지 않았음을 보증한다.
 *
 * 이 파일은 **다른 테스트와 같은 파일에 두지 않는다.** Vitest 는 파일 단위로
 * 모듈을 격리하므로, 스토어를 변경하는 테스트와 한 파일에 있으면 초기 상태가
 * 아니라 변경된 상태를 스냅샷하게 된다.
 */

/**
 * ── 이 테스트가 레드일 때 ────────────────────────────────────────────────────
 * 먼저 판단한다: 상태 키·액션·초기값을 **의도적으로** 바꿨는가?
 *   - 아니라면 **회귀다.** JSON 이 아니라 스토어를 고쳐라.
 *   - 맞다면 아래로 재생성한다. **JSON 을 손으로 편집하지 마라** — 실패 출력의 현재 상태를
 *     붙여 넣으면 같은 커밋에 섞인 의도치 않은 변경까지 함께 베이스라인이 되어 그물이
 *     조용히 사라진다.
 *
 * 재생성 (임시 `_gen.test.ts` 를 이 디렉토리에 만든다 → 실행 → 삭제):
 *
 *   import { writeFileSync } from 'node:fs'
 *   import { it } from 'vitest'
 *   import { useGitStore } from '../git'
 *   import { surface } from './storeSurface'
 *   it('gen', () => {
 *     writeFileSync('src/stores/__tests__/git.surface.json',
 *       JSON.stringify(surface(useGitStore.getState() as Record<string, unknown>), null, 2) + '\n')
 *   })
 *
 *   CWD `src/dashboard` 에서 `npx vitest run src/stores/__tests__/_gen.test.ts`
 *   그다음 `_gen.test.ts` 를 지우고 JSON diff 를 **한 줄씩 읽어** 의도한 변경만 확인한다.
 *
 * 지뢰 2개 (둘 다 실측):
 *   - 경로는 **CWD 상대**여야 한다 — Vitest 의 CWD 는 `vitest.config.ts` 가 있는 `src/dashboard`.
 *   - `new URL('./x.json', import.meta.url)` 을 쓰지 마라 — Vite 가 `import.meta.url` 을 `http:`
 *     스킴으로 주므로 `node:fs` 가 `TypeError: The URL must be of scheme file` 로 죽는다.
 *
 * 한계: `surface()` 는 JSON 왕복이라 `Set`/`Map` 초기값이 `{}` 로 평탄화된다 — 그 내용이
 * 바뀌어도 이 스냅샷은 통과한다.
 *
 * 액션을 하나 추가하면 손댈 곳은 6군데: `types.ts` 의 State · 도메인 모듈 · `index.ts` 스텁 ·
 * 이 베이스라인 JSON · delegation 개수 단언 · arity 개수 단언.
 */
import { describe, expect, it } from 'vitest'
import { useGitStore } from '../git'
import baseline from './git.surface.json'
import { surface } from './storeSurface'

describe('git 스토어 표면', () => {
  it('상태 키·액션 이름·초기값이 분할 전과 같다', () => {
    expect(surface(useGitStore.getState() as Record<string, unknown>)).toEqual(baseline)
  })
})
