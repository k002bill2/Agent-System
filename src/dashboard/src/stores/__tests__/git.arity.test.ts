/**
 * git 스토어: 위임 스텁 63개의 파라미터가 impl 시그니처와 개수·순서까지 같음을 보증한다.
 *
 * 모듈 목록은 **명시적으로 나열한다** — `readdirSync` 로 훑으면 모듈 파일이 사라져도
 * 검사가 조용히 적응해 개수 단언이 그물 구실을 못 한다.
 */
import { describe, expect, it } from 'vitest'
import { parseStubArity } from './arity'
// CWD 에 의존하지 않게 Vite 의 `?raw` 로 원문을 가져온다 (Task 5 리뷰 M-1).
import INDEX from '../git/index.ts?raw'
import branchProtection from '../git/branchProtection.ts?raw'
import branches from '../git/branches.ts?raw'
import commits from '../git/commits.ts?raw'
import github from '../git/github.ts?raw'
import merge from '../git/merge.ts?raw'
import mergeRequests from '../git/mergeRequests.ts?raw'
import remotes from '../git/remotes.ts?raw'
import repositories from '../git/repositories.ts?raw'
import staging from '../git/staging.ts?raw'
import workspace from '../git/workspace.ts?raw'

// 키는 파일명(=`index.ts` 의 `import * as` 별칭)이어야 한다.
const MODULES = {
  branchProtection,
  branches,
  commits,
  github,
  merge,
  mergeRequests,
  remotes,
  repositories,
  staging,
  workspace,
}

describe('git 스텁 파라미터 arity', () => {
  it('선언 = 전달 = impl 파라미터가 개수·순서까지 일치한다', () => {
    expect(parseStubArity(INDEX, MODULES).problems).toEqual([])
  })

  it('액션 63개·impl 63개를 전부 검사 대상으로 잡았다', () => {
    const { stubCount, implCount } = parseStubArity(INDEX, MODULES)
    expect({ stubCount, implCount }).toEqual({ stubCount: 63, implCount: 63 })
  })
})
