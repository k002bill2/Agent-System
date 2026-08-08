/**
 * projectConfigs 스토어: 위임 스텁 72개의 파라미터가 impl 시그니처와 개수·순서까지 같음을 보증한다.
 *
 * 이 스토어에서 특히 중요하다 — 액션 72개 중 **37개가 기존 테스트에 호출되지 않아**
 * (실측 커버리지 35/72) 인자 소실이 런타임까지 살아남을 수 있다.
 *
 * 모듈 목록은 **명시적으로 나열한다** — `readdirSync` 로 훑으면 모듈 파일이 사라져도
 * 검사가 조용히 적응해 개수 단언이 그물 구실을 못 한다.
 */
import { describe, expect, it } from 'vitest'
import { parseStubArity } from './arity'
// CWD 에 의존하지 않게 Vite 의 `?raw` 로 원문을 가져온다 (Task 5 리뷰 M-1).
import INDEX from '../projectConfigs/index.ts?raw'
import agents from '../projectConfigs/agents.ts?raw'
import commands from '../projectConfigs/commands.ts?raw'
import dbProjects from '../projectConfigs/dbProjects.ts?raw'
import hooks from '../projectConfigs/hooks.ts?raw'
import mcp from '../projectConfigs/mcp.ts?raw'
import memories from '../projectConfigs/memories.ts?raw'
import projects from '../projectConfigs/projects.ts?raw'
import rules from '../projectConfigs/rules.ts?raw'
import skills from '../projectConfigs/skills.ts?raw'

// 키는 파일명(=`index.ts` 의 `import * as` 별칭)이어야 한다.
const MODULES = {
  agents,
  commands,
  dbProjects,
  hooks,
  mcp,
  memories,
  projects,
  rules,
  skills,
}

describe('projectConfigs 스텁 파라미터 arity', () => {
  it('선언 = 전달 = impl 파라미터가 개수·순서까지 일치한다', () => {
    expect(parseStubArity(INDEX, MODULES).problems).toEqual([])
  })

  it('액션 72개·impl 72개를 전부 검사 대상으로 잡았다', () => {
    const { stubCount, implCount } = parseStubArity(INDEX, MODULES)
    expect({ stubCount, implCount }).toEqual({ stubCount: 72, implCount: 72 })
  })
})
