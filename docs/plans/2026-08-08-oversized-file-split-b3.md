# Batch 3 — 프론트 Zustand 스토어 분할 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **상위 계획**: `docs/plans/2026-08-04-oversized-file-split.md` (프로그램 레벨 · B1·B2 완료)
> **직전 배치**: `docs/plans/2026-08-08-oversized-file-split-b2.md`

**Goal:** 800줄 한도를 넘는 Zustand 스토어 3개(3,811줄)를 동작 보존 분할로 한도 이내로 되돌린다.

**Architecture:** 스토어를 **디렉토리 패키지로 승격**하고 `index.ts`가 기존 공개 이름(훅 + 타입)을 재노출한다. 소비자의 import 경로(`@/stores/git`)는 바뀌지 않는다. 레포에 이미 선례가 있다 — `stores/orchestration/`(`types.ts` · `wsConnection.ts` · `wsHandler.ts` · `index.ts`).

**Tech Stack:** React 19 / TypeScript / Zustand / Vitest / Vite

---

## ⚠️ B2와 안전 논거가 뒤집힌다 — 가장 먼저 읽을 것

B1·B2의 하중 지지대는 **"핸들러를 한 글자도 바꾸지 않는다"**였다. FastAPI 라우트 핸들러는 최상위 `def`라 통째로 잘라 붙일 수 있었고, `split_audit.py`가 바이트 동일성을 증명했다.

**B3에서는 그 논거를 쓸 수 없다.** 액션은 최상위 정의가 아니라 `create()` 호출 **안의 객체 프로퍼티**다:

```ts
// 분할 전 — index.ts 의 create() 안
fetchBranches: async (projectId: string) => {
  set({ isLoadingBranches: true })
  // ...
},

// 분할 후 — branches.ts
export async function fetchBranches(set: SetFn, get: GetFn, projectId: string) {
  set({ isLoadingBranches: true })
  // ...
}
```

**시그니처가 바뀐다.** `set`·`get`이 클로저 캡처에서 명시 인자로 승격되기 때문이다. 따라서:

- `split_audit.py`는 **쓸 수 없다** (Python `ast` 전용). TypeScript 판을 만들지 않는다 — 세 파일을 위해 TS AST differ를 만드는 것은 비례하지 않고, Python에 없던 `tsc`가 있다.
- 대신 **본문은 래퍼 안으로 그대로 옮긴다.** 바뀌는 것은 시그니처 줄과 `set`/`get` 참조 방식뿐이다. 본문 한 줄이라도 "정리"하고 싶은 유혹이 들면 그 순간 안전망이 사라진다.

### B3의 안전망 3겹

| 그물 | 잡는 것 | 못 잡는 것 |
|---|---|---|
| `tsc --noEmit` | 86개 소비자 파일 전부에서 export 유실·개명·타입 불일치 | 값 변경, 동작 변경 |
| 기존 테스트 3,400줄 | 액션 동작 회귀 | 테스트가 없는 액션 |
| **스토어 표면 스냅샷** (Task 1에서 신설) | 상태 키·액션 이름 집합, **초기 상태 값** | 액션 본문 동작 |

세 번째가 이 배치의 신규 산출물이다. `tsc`가 못 잡는 것을 잡는다:

- 액션을 추출했는데 스텁이 **다른 impl에 배선**된 경우 (타입은 맞고 동작만 뒤바뀜)
- 같은 타입 안에서 **초기값이 바뀐** 경우 (`[]` → `null`, `'desc'` → `'asc'`, `0` → `-1`)
- 액션이 조용히 **no-op이 된** 경우

세 번째가 B2의 `return results` 유실에 해당하는 실패 모드다. `claudeSessions`의 파생 게터(`getFilteredSessions` · `getEmptySessionsCount` · `isGhostSession`)가 가장 노출돼 있다 — `get()` 참조가 틀리면 예외가 아니라 **그럴듯한 잘못된 값**을 반환한다.

---

## Global Constraints

상위 계획 Global Constraints 1~9를 상속하되, 프론트 트랙에 맞게 아래를 적용한다.

1. **동작 보존이 유일한 성공 기준이다.** 기능 추가·수정·삭제 없음. 리팩터링 중 발견한 버그는 고치지 말고 별도 이슈로 기록한다 (Surgical Changes).
2. **공개 import 경로는 불변이다.** `import { useGitStore } from '@/stores/git'`와 `import type { GitBranch } from '@/stores/git'`가 분할 후에도 유효해야 한다. `index.ts` 재노출로 보장한다.
3. **한도 = 파일 800줄** (golden-principles.md). 목표는 200~400줄.
   - **적용 시점은 각 스토어의 마지막 태스크다**(claudeSessions=Task 2 · git=Task 5 · projectConfigs=Task 8). 승격+타입 추출 태스크(Task 4·7)는 `index.ts`가 의도적으로 한도를 넘긴 상태로 끝난다 — 액션 승격이 다음 태스크이기 때문이다. 해당 태스크 본문에 기대 줄수를 명시했다.
   - 이는 완화가 아니라 **분할 단계 구분**이다. 각 스토어의 마지막 태스크에서 산출 파일 전부가 800 미만이어야 한다.
4. **테스트 파일은 분할 대상이 아니다.** 단 스토어 표면 스냅샷 테스트는 이 계획이 **추가**한다.
   - 실측(2026-08-08): 세 테스트 파일은 **훅 하나와 `apiClient`만 import한다.** B2의 `patch.object` 같은 내부 구조 참조가 0건이라 패치 타깃 갱신이 필요 없다.
   - `vi.mock('../../services/apiClient', ...)`은 경로 문자열이 아니라 **해석된 모듈 ID**로 모킹하므로, 추출된 모듈이 다른 상대 경로로 import해도 모킹이 유지된다. **Task 1의 S5b에서 실증한다** — 가정으로 두지 않는다.
5. **게이트 SSOT는 `verification-loop` 스킬이다.** 프론트 트랙 = `tsc --noEmit` + ESLint + `vitest run` + `build`. 이 문서에 명령을 복제하지 않는다.
6. **새 의존성 추가 금지.**
7. **커밋은 Conventional Commits.** 스냅샷 테스트 추가는 `test:`, 코드 이동은 `refactor:`. 한 태스크 = 한 커밋.
8. **`create()` 호출은 하나로 유지한다.** 여러 `create`로 가르면 공개 표면(훅 개수)이 바뀐다. 분할은 타입과 액션 **구현**만 옮긴다.
9. **`persist` 미들웨어 없음** (실측: 세 스토어 모두 `X`). `orchestration/`과 달리 hydration 순서를 고려할 필요가 없다.

---

## 인벤토리 (실측 2026-08-08)

| 파일 | 줄수 | 타입 블록 | 액션 | 액션 본문 합 | export type/interface | 소비자 | 테스트 |
|---|---:|---|---:|---:|---:|---:|---:|
| `stores/claudeSessions.ts` | 812 | 13–120 (109줄) | 35 | — | 2 | 16파일 | 1,928줄 |
| `stores/git.ts` | 1,448 | 14–497 (485줄) | 63 | 894 | 34 | 28파일 | 765줄 |
| `stores/projectConfigs.ts` | 1,554 | 6–352 (348줄) | 72 | 1,126 | 20 | 42파일 | 707줄 |

### 소비자가 실제로 가져가는 이름 (전수 조사)

`index.ts`가 **반드시** 재노출해야 하는 목록이다. 하나라도 빠지면 `tsc`가 즉시 잡지만, 미리 알고 쓰는 편이 왕복이 적다.

- **`stores/git`** (23): `useGitStore`, `BranchProtectionRule`, `CommitFile`, `ConflictFile`, `ConflictStatus`, `DiffHunk`, `DraftCommit`, `FileStatusType`, `GitBranch`, `GitCommit`, `GitHubPRReview`, `GitHubPullRequest`, `GitRemote`, `GitStatus`, `GitStatusFile`, `GitTab`, `GitWorkingStatus`, `GitWorktree`, `MergePreview`, `MergeRequest`, `MergeRequestStatus`, `MergeStatus`, `PruneExecuteResult`
- **`stores/projectConfigs`** (12): `useProjectConfigsStore`, `AgentConfig`, `CommandConfig`, `DBProject`, `HookConfig`, `MCPServerConfig`, `MemoryConfig`, `ProjectConfigSummary`, `ProjectInfo`, `RuleConfig`, `SkillConfig`, `TabType`
- **`stores/claudeSessions`** (2): `useClaudeSessionsStore`, `SortField`

> `index.ts`에는 위 목록 **외의 이름을 추가로 재노출하지 않는다.** 필요 없는 이름을 노출하면 다음 분할에서 "쓰이는 이름"과 "쓰이지 않는 이름"을 구별할 수 없게 된다.

---

## 태스크 순서

크기가 아니라 **레시피 검증 비용**으로 정한다. B1→B2의 논리를 그대로 계승한다.

| 순서 | 파일 | 근거 |
|---|---|---|
| **1** | `claudeSessions` (812줄) | **타입 추출만으로 끝난다**(812−109=703). 레시피의 절반을 가장 싼 대상에서, 가장 두꺼운 그물(테스트 1,928줄) 아래서 검증한다. 재노출 이름도 2개뿐 |
| **2** | `git` (1,448줄) | 타입 추출 후에도 963줄이라 액션 승격이 필요하다. 도메인 10개가 방금 분할한 `api/git/` 패키지와 대칭이라 그룹 판단이 쉽다 |
| **3** | `projectConfigs` (1,554줄) | 액션 72개·소비자 42파일로 폭발 반경이 가장 크다. 레시피가 두 번 검증된 뒤에 착수한다 |

---

## File Structure

### `stores/claudeSessions/` (타입 추출만)

| 파일 | 책임 | 예상 줄수 |
|---|---|---:|
| `types.ts` | `SortField` · `SortOrder` · `ClaudeSessionsState` | ~109 |
| `index.ts` | `create()` 본체 + 타입 재노출 | ~703 |

### `stores/git/` (타입 + 액션 도메인 10)

도메인은 착수 시 S1로 실측 확정한다. 아래는 액션 이름 실측(2026-08-08)에서 도출한 **초안**이다.

| 파일 | 액션 | 개수 |
|---|---|---:|
| `types.ts` | 타입 34종 + 타임아웃 상수 3 | — |
| `workspace.ts` | setActiveTab, setSelectedProject, setGitHubRepo, clearError, fetchWorktrees, setSelectedWorktree, fetchGitStatus, updateGitPath, fetchWorkingStatus | 9 |
| `staging.ts` | stageFiles, unstageFiles, commitChanges, commitAndPush, fetchFileDiff, clearFileDiffs, fetchStagedDiff, fetchFileHunks, stageHunks, generateDraftCommits, clearDraftCommits | 11 |
| `repositories.ts` | fetchRepositories, createRepository, updateRepository, deleteRepository | 4 |
| `branches.ts` | fetchBranches, createBranch, checkoutBranch, deleteBranch, pruneMergedBranches | 5 |
| `commits.ts` | fetchCommits, fetchCommitFiles, fetchCommitDiff | 3 |
| `merge.ts` | previewMerge, executeMerge, clearMergePreview, fetchConflictFiles, fetchMergeStatus, resolveConflict, abortMerge, completeMerge, clearConflictState | 9 |
| `mergeRequests.ts` | fetchMergeRequests, createMergeRequest, approveMergeRequest, mergeMergeRequest, closeMergeRequest, deleteMergeRequest | 6 |
| `github.ts` | fetchPullRequests, fetchPullRequest, fetchPRReviews, mergePullRequest, createPRReview | 5 |
| `remotes.ts` | fetchRemotes, addRemote, removeRemote, updateRemote, fetchRemote, pullRemote, pushRemote | 7 |
| `branchProtection.ts` | fetchBranchProtectionRules, createBranchProtectionRule, updateBranchProtectionRule, deleteBranchProtectionRule | 4 |
| `index.ts` | 초기 상태 ~56줄 + 스텁 63줄 + 재노출 | **~140** |

합계 63 ✓

### `stores/projectConfigs/` (타입 + 액션 도메인 9)

| 파일 | 액션 | 개수 |
|---|---|---:|
| `types.ts` | 타입 20종 | — |
| `projects.ts` | fetchProjects, selectProject, fetchProjectSummary, fetchGlobalConfigs, addExternalPath, removeExternalPath, removeProject, startStreaming, stopStreaming, setActiveTab, clearError, refresh | 12 |
| `skills.ts` | fetchAllSkills, fetchSkillContent, openSkillModal, closeSkillModal, createSkill, updateSkill, deleteSkill, copySkill | 8 |
| `agents.ts` | fetchAllAgents, fetchAgentContent, openAgentModal, closeAgentModal, createAgent, updateAgent, deleteAgent, copyAgent | 8 |
| `mcp.ts` | toggleMCPServer, openMCPModal, closeMCPModal, createMCPServer, updateMCPServer, deleteMCPServer, copyMCPServer | 7 |
| `hooks.ts` | addHookEntry, deleteHook, copyHook | 3 |
| `commands.ts` | openCommandModal, closeCommandModal, fetchCommandContent, createCommand, updateCommand, deleteCommand, copyCommand | 7 |
| `rules.ts` | openRuleModal, closeRuleModal, fetchRuleContent, fetchGlobalRuleContent, createRule, updateRule, deleteRule, createGlobalRule, updateGlobalRule, deleteGlobalRule, copyRule | 11 |
| `memories.ts` | openMemoryModal, closeMemoryModal, fetchMemoryContent, fetchMemoryIndex, createMemory, updateMemory, deleteMemory, updateMemoryIndex | 8 |
| `dbProjects.ts` | fetchDBProjects, fetchAllDBProjects, createDBProject, updateDBProject, deleteDBProject, hardDeleteDBProject, restoreDBProject, toggleDBProjectActive | 8 |
| `index.ts` | 초기 상태 ~80줄 + 스텁 72줄 + 재노출 | **~170** |

합계 72 ✓

> **index.ts 줄수는 뺄셈이 아니라 스텁 개수로 계산한 값이다.** 액션 본문이 나가도 위임 스텁 한 줄씩은 남는다. 워커가 이 수치를 크게 넘기면(예: git `index.ts` > 250줄) 액션 본문이 덜 빠진 것이므로 커밋 전에 멈추고 확인한다.

---

## 태스크 읽는 법

**Task 1·2·5가 정본 절차다.** Task 3·4·6·7·8은 같은 절차를 다른 파라미터로 1회 수행하며,
**파라미터·기대 수치·커밋 메시지를 전부 자기 안에 적어 둔다.** 정본으로 돌아가야 하는 것은
스텝의 순서와 코드 형태뿐이고, 값은 각 태스크에 다 있다. 참조는 **한 단계만** 한다 —
Task 6은 Task 3이 아니라 Task 1을 가리킨다.

레시피를 8번 복제하지 않는 것은 상위 계획(B1)이 확립한 관례이며, 그 문서가 8회 반복으로
검증했다. 복제하면 세 파일 사이에서 절차가 갈릴 때 어느 쪽이 정본인지 모호해진다.

### 세 스토어 공통 — 옮길 때 반드시 바꾸는 것

세 스토어 모두 상태 인터페이스에 **`export`가 없다**(실측: `interface GitState {` ·
`interface ProjectConfigsState {` · `interface ClaudeSessionsState {`). `types.ts`로 옮길 때
`export interface`로 바꾼다 — 액션 모듈의 `SetFn`/`GetFn`이 이 타입을 참조하기 때문이다.
**이것과 상대 경로 깊이 외에는 타입 블록을 한 글자도 바꾸지 않는다.**

---

## Task 1: 스토어 표면 스냅샷 헬퍼 + `claudeSessions` 베이스라인

**Files:**
- Create: `src/dashboard/src/stores/__tests__/storeSurface.ts`
- Create: `src/dashboard/src/stores/__tests__/claudeSessions.surface.json` (생성물, 커밋 대상)
- Create: `src/dashboard/src/stores/__tests__/claudeSessions.surface.test.ts`

**Interfaces:**
- Produces: `surface(state: Record<string, unknown>): StoreSurface` — Task 3·6이 `git`·`projectConfigs` 베이스라인 생성에 재사용한다. 시그니처를 바꾸지 마라.

- [ ] **Step 1: 헬퍼 작성**

`src/dashboard/src/stores/__tests__/storeSurface.ts`:

```ts
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
```

- [ ] **Step 2: 베이스라인 JSON 생성**

임시 테스트로 뽑는다. `src/dashboard/src/stores/__tests__/_gen.test.ts`:

```ts
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { useClaudeSessionsStore } from '../claudeSessions'
import { surface } from './storeSurface'

it('__generate_surface__', () => {
  // Vitest 의 CWD 는 vitest.config.ts 가 있는 디렉토리(`src/dashboard`)다.
  // **`new URL('./x.json', import.meta.url)` 을 쓰지 마라** — Vite 는
  // `import.meta.url` 을 file:// 이 아니라 dev-server URL 로 해석해서
  // `node:fs` 가 `TypeError: The URL must be of scheme file` 로 죽는다
  // (2026-08-08 실측 확인).
  writeFileSync(
    'src/stores/__tests__/claudeSessions.surface.json',
    JSON.stringify(surface(useClaudeSessionsStore.getState() as Record<string, unknown>), null, 2) +
      '\n'
  )
})
```

Run (CWD `src/dashboard`): `npx vitest run src/stores/__tests__/_gen.test.ts`
Expected: 1 passed, `claudeSessions.surface.json` 생성됨.
**실측 기대치(2026-08-08)**: `stateKeys` 36개 · `actionNames` 35개 · `initialState` 36키.
수치가 다르면 그 사이 스토어가 바뀐 것이므로 인벤토리 표를 갱신하고 진행한다.

그다음 임시 파일을 삭제한다: `rm src/dashboard/src/stores/__tests__/_gen.test.ts`

- [ ] **Step 3: 스냅샷 테스트 작성**

`src/dashboard/src/stores/__tests__/claudeSessions.surface.test.ts`:

```ts
/**
 * claudeSessions 스토어 분할이 공개 표면을 바꾸지 않았음을 보증한다.
 *
 * 이 파일은 **다른 테스트와 같은 파일에 두지 않는다.** Vitest 는 파일 단위로
 * 모듈을 격리하므로, 스토어를 변경하는 테스트와 한 파일에 있으면 초기 상태가
 * 아니라 변경된 상태를 스냅샷하게 된다.
 */
import { describe, expect, it } from 'vitest'
import { useClaudeSessionsStore } from '../claudeSessions'
import baseline from './claudeSessions.surface.json'
import { surface } from './storeSurface'

describe('claudeSessions 스토어 표면', () => {
  it('상태 키·액션 이름·초기값이 분할 전과 같다', () => {
    expect(surface(useClaudeSessionsStore.getState())).toEqual(baseline)
  })
})
```

- [ ] **Step 4: 통과 확인 (GREEN)**

Run (CWD `src/dashboard`): `npx vitest run src/stores/__tests__/claudeSessions.surface.test.ts`
Expected: 1 passed

- [ ] **Step 5: Red-Green 증명 — 초기값 하나를 뒤집는다**

`src/dashboard/src/stores/claudeSessions.ts`에서 초기 상태의 `sortOrder: 'desc'`를 `sortOrder: 'asc'`로 임시 변경한다.

Run: `npx vitest run src/stores/__tests__/claudeSessions.surface.test.ts`
Expected: **FAIL** — `initialState.sortOrder: 'asc' !== 'desc'`.

이것이 `tsc`가 못 잡는 실패다(`SortOrder` 타입은 여전히 맞다). 확인 후 원복한다:

Run: `git checkout src/dashboard/src/stores/claudeSessions.ts`
Run: `npx vitest run src/stores/__tests__/claudeSessions.surface.test.ts` → **PASS**

- [ ] **Step 6: Red-Green 증명 2 — 액션 이름 유실**

액션 하나(`clearError`)를 초기 상태에서 임시로 주석 처리하고 `ClaudeSessionsState`에서도 주석 처리한다(타입 에러 회피).

Run: `npx vitest run src/stores/__tests__/claudeSessions.surface.test.ts`
Expected: **FAIL** — `actionNames` 배열에서 `clearError` 누락.

Run: `git checkout src/dashboard/src/stores/claudeSessions.ts` → 재실행 시 PASS

- [ ] **Step 7: 게이트**

`verification-loop` 스킬의 프론트 트랙(Level 2)을 실행한다.
Expected: tsc 0 errors · ESLint 0 errors · vitest 전체 통과 · build 성공.

- [ ] **Step 8: 커밋**

```bash
git add src/dashboard/src/stores/__tests__/storeSurface.ts \
        src/dashboard/src/stores/__tests__/claudeSessions.surface.json \
        src/dashboard/src/stores/__tests__/claudeSessions.surface.test.ts
git commit -m "test(stores): 스토어 표면 스냅샷 헬퍼 + claudeSessions 베이스라인

tsc 는 86개 소비자에서 export 유실·개명을 잡지만 (1) 스텁이 다른 impl 에
배선된 경우 (2) 같은 타입 안의 초기값 변경 (3) 액션이 no-op 이 된 경우를
못 잡는다. B1·B2 의 route_table.snapshot() 에 해당하는 그물이다.

Red-Green 2건: sortOrder 'desc'→'asc' 뒤집기 → FAIL, clearError 제거 → FAIL."
```

---

## Task 2: `claudeSessions` 패키지 승격 + 타입 추출

**Files:**
- Create: `src/dashboard/src/stores/claudeSessions/types.ts`
- Create: `src/dashboard/src/stores/claudeSessions/index.ts` (기존 `claudeSessions.ts`에서 이동)
- Delete: `src/dashboard/src/stores/claudeSessions.ts`

**Interfaces:**
- Consumes: Task 1의 `surface()` · `claudeSessions.surface.json`
- Produces: `stores/claudeSessions/types.ts`가 `SortField` · `SortOrder` · `ClaudeSessionsState`를 export한다. `index.ts`가 `useClaudeSessionsStore` · `SortField`를 재노출한다 (소비자 실측 목록).

- [ ] **Step 1: 디렉토리 생성 + 파일 이동 (git 이 rename 으로 인식하게)**

```bash
cd src/dashboard/src/stores
mkdir -p claudeSessions
git mv claudeSessions.ts claudeSessions/index.ts
```

- [ ] **Step 2: 타입 블록을 `types.ts`로 이동**

`claudeSessions/index.ts`의 **13–120행**(`export type SortField`부터 `ClaudeSessionsState` 인터페이스 닫는 `}`까지)을 잘라 `claudeSessions/types.ts`로 옮긴다. 헤더는 다음과 같다:

```ts
/** claudeSessions 스토어의 타입 정의.
 *
 * `ClaudeSessionsState` 는 패키지 내부 전용이지만, 액션을 모듈로 승격할 때
 * `SetFn`/`GetFn` 타입이 이것을 참조하므로 export 한다.
 */
import type {
  ClaudeSessionDetail,
  ClaudeSessionInfo,
  TranscriptEntry,
} from '../../types/claudeSession'

// ↓ 여기에 원본 13–120행을 그대로 붙인다 (한 글자도 바꾸지 않는다)
```

**상대 경로가 한 단계 깊어진다**: `'../types/claudeSession'` → `'../../types/claudeSession'`. 이것이 이 태스크에서 유일하게 허용되는 본문 변경이다.

- [ ] **Step 3: `index.ts`에서 타입 재노출**

`claudeSessions/index.ts` 상단(import 블록 직후):

```ts
import type { ClaudeSessionsState } from './types'

// 소비자 실측(2026-08-08): `SortField` 만 패키지 밖에서 쓰인다.
// `SortOrder` 는 쓰이지 않지만 `SortField` 와 짝이라 함께 노출한다.
export type { SortField, SortOrder } from './types'
```

`index.ts`의 나머지 상대 경로도 한 단계 깊어진다(`'../services/apiClient'` → `'../../services/apiClient'` 등). ESLint·tsc가 전부 잡으므로 빠뜨릴 수 없다.

- [ ] **Step 4: 표면 스냅샷 즉시 검증**

Run (CWD `src/dashboard`): `npx vitest run src/stores/__tests__/claudeSessions.surface.test.ts`
Expected: 1 passed. **FAIL이면 다음 스텝으로 가지 않는다** — 어떤 키/액션/초기값이 달라졌는지 실패 메시지가 정확히 알려준다.

- [ ] **Step 5: 기존 테스트 1,928줄 통과 확인**

Run (CWD `src/dashboard`): `npx vitest run src/stores/__tests__/claudeSessions.test.ts`
Expected: 전체 통과, 0 failed.

**이 스텝이 `vi.mock` 모듈 ID 가정의 실증이다.** 테스트는 `vi.mock('../../services/apiClient')`로 모킹하고 스토어는 이제 `'../../services/apiClient'`(깊이 변경)로 import한다. Vitest가 해석된 모듈 ID로 모킹하므로 통과해야 한다. **실패하면 모킹 경로 문제이지 분할 문제가 아니다** — 테스트의 `vi.mock` 경로를 고치는 것이 정답이고, 분할을 되돌리지 마라.

- [ ] **Step 6: 줄 수 확인**

Run: `wc -l src/dashboard/src/stores/claudeSessions/*.ts`
Expected: `types.ts` ~109줄, `index.ts` ~703줄. **둘 다 800 미만.**

- [ ] **Step 7: 게이트**

`verification-loop` 프론트 트랙(Level 2). Expected: tsc 0 · ESLint 0 · vitest 전체 통과 · build 성공.

`tsc`가 16개 소비자 파일에서 에러를 내면 재노출이 빠진 것이다 — `index.ts`의 `export type`에 그 이름을 추가한다.

- [ ] **Step 8: 커밋**

```bash
git add -A src/dashboard/src/stores/claudeSessions
git commit -m "refactor(stores): claudeSessions.ts를 패키지로 승격 + 타입 추출

812줄 → types.ts 109줄 + index.ts 703줄. 액션 승격 없이 타입 추출만으로
한도 이내에 들어간다. create() 호출은 하나로 유지된다.

소비자 16파일의 import 경로 불변 (index.ts 가 useClaudeSessionsStore ·
SortField 재노출). 표면 스냅샷 + 기존 테스트 1,928줄 통과."
```

---

## Task 3~5: `git` 분할

`git`은 타입 추출만으로 963줄이 남아 한도를 넘는다. 따라서 **타입 + 액션 도메인 10개**를 추출한다.

### Task 3: `git` 표면 베이스라인

**Task 1의 Step 2~4·8 절차**를 아래 파라미터로 수행한다.

- 임시 생성 테스트의 import: `import { useGitStore } from '../git'`
- 베이스라인: `src/dashboard/src/stores/__tests__/git.surface.json`
- 테스트 파일: `src/dashboard/src/stores/__tests__/git.surface.test.ts`
- Red-Green 대상: 초기 상태 `activeTab: 'changes'`(실측 501행)를 `'branches'`로 임시 변경 → FAIL 확인 → `git checkout` 원복 → PASS
- Step 4 Expected: 상태 키 + 액션 **63개** 기록됨

커밋 메시지:

```
test(stores): git 스토어 표면 베이스라인 추가

분할 전 상태 키·액션 63개·초기값을 고정한다.
Red-Green: activeTab 'changes'→'branches' → FAIL → 원복 → PASS.
```

### Task 4: `git` 패키지 승격 + 타입 추출

**Task 2의 Step 1~8 절차**를 아래 파라미터로 수행한다.

- `git mv git.ts git/index.ts`
- 이동 대상: **14–497행**(타입 34종). `interface GitState`(319행)에 `export`를 붙인다
- **타임아웃 상수 3개도 함께 옮긴다** — `GIT_LONG_RUNNING_READ_TIMEOUT_MS` · `GIT_REMOTE_OPERATION_TIMEOUT_MS` · `GIT_DRAFT_COMMITS_TIMEOUT_MS`(6–8행). 액션 모듈들이 공유하므로 `types.ts`에 두고 `import { GIT_REMOTE_OPERATION_TIMEOUT_MS } from './types'` 로 참조한다. 소비자가 쓰지 않으므로 `index.ts`에서 **재노출하지 않는다**
- `index.ts` 재노출: 소비자 실측 23개 — `BranchProtectionRule` · `CommitFile` · `ConflictFile` · `ConflictStatus` · `DiffHunk` · `DraftCommit` · `FileStatusType` · `GitBranch` · `GitCommit` · `GitHubPRReview` · `GitHubPullRequest` · `GitRemote` · `GitStatus` · `GitStatusFile` · `GitTab` · `GitWorkingStatus` · `GitWorktree` · `MergePreview` · `MergeRequest` · `MergeRequestStatus` · `MergeStatus` · `PruneExecuteResult` (+ 훅 `useGitStore`)
- Step 4·5 Expected: `git.surface.test.ts` 1 passed · `git.test.ts`(765줄) 0 failed
- Step 6 Expected: `types.ts` ~485줄, `index.ts` ~963줄 — **아직 한도 초과다. Task 5에서 해소되므로 이 태스크에서는 허용한다**
- 커밋 메시지에 "액션 승격은 Task 5" 를 명시한다

### Task 5: `git` 액션을 도메인 모듈 10개로 승격

- [ ] **Step 1: 도메인 그룹 실측 확정 (S1)**

Run (CWD `src/dashboard/src/stores`):

```bash
node -e "
const fs=require('fs');const L=fs.readFileSync('git/index.ts','utf8').split('\n');
const i=L.findIndex(l=>/=\s*create[<(]/.test(l));
L.slice(i).forEach((l,n)=>{const m=l.match(/^  ([a-zA-Z_][a-zA-Z0-9_]*): (async )?\(/); if(m) console.log((i+n+1)+': '+m[1]);});
"
```

출력된 액션 이름이 **File Structure 절의 초안 표 63개와 일치하는지 확인한다.** 다르면 멈추고 표를 갱신한다 — 초안은 2026-08-08 실측이며 그 사이 액션이 추가·삭제됐을 수 있다.

- [ ] **Step 2: 첫 모듈 생성 — `branches.ts`**

`src/dashboard/src/stores/git/branches.ts`:

```ts
/** 브랜치 도메인 액션. `api/git/branches.py` 와 대칭이다. */
import { apiClient } from '../../services/apiClient'
import type { GitState } from './types'

/** `orchestration/wsConnection.ts` 와 같은 형태. set/get 을 명시 인자로 받는다. */
type SetFn = (state: Partial<GitState> | ((state: GitState) => Partial<GitState>)) => void
type GetFn = () => GitState

export async function fetchBranches(set: SetFn, get: GetFn, projectId: string) {
  // ↓ index.ts 의 `fetchBranches: async (projectId: string) => { ... }` 본문을
  //   **한 글자도 바꾸지 않고** 그대로 붙인다. set/get 은 이제 인자다.
}
```

**본문 이동 규칙**: 바뀌는 것은 (a) 시그니처 줄, (b) 상대 경로 깊이뿐이다. 조건 분기·에러 처리·`get().otherAction()` 호출은 전부 원문 유지. 특히 `get().fetchBranches(...)` 같은 **액션 간 호출은 그대로 둔다** — 런타임에 스토어에서 해석되므로 순환 import가 생기지 않는다(실측: git 13종·projectConfigs 12종 전부 이 형태).

- [ ] **Step 3: `index.ts`에서 스텁으로 위임**

```ts
import * as branches from './branches'

// create() 안에서
fetchBranches: (projectId: string) => branches.fetchBranches(set, get, projectId),
```

- [ ] **Step 4: 표면 스냅샷 즉시 검증**

Run (CWD `src/dashboard`): `npx vitest run src/stores/__tests__/git.surface.test.ts`
Expected: 1 passed. **스텁을 잘못 배선하면(예: `fetchBranches` 스텁이 `createBranch` impl 을 호출) 표면 스냅샷은 통과한다** — 이름·타입이 같기 때문이다. 그 배선 오류를 잡는 것은 다음 스텝이다.

- [ ] **Step 5: 기존 테스트로 동작 검증**

Run (CWD `src/dashboard`): `npx vitest run src/stores/__tests__/git.test.ts`
Expected: 전체 통과, 0 failed.

- [ ] **Step 6: Step 2~5를 나머지 9개 도메인에 반복**

`workspace` · `staging` · `repositories` · `commits` · `merge` · `mergeRequests` · `github` · `remotes` · `branchProtection`. 각 모듈마다 Step 2~5를 그대로 수행한다. 모듈 하나를 끝낼 때마다 Step 4·5를 돌려 **어느 모듈에서 깨졌는지 즉시 알 수 있게 한다** — 10개를 다 옮기고 나서 한 번에 돌리면 원인 추적이 10배로 비싸진다.

- [ ] **Step 7: 줄 수 확인**

Run: `wc -l src/dashboard/src/stores/git/*.ts`
Expected: 전부 800 미만. **`index.ts`가 250줄을 넘으면 멈춘다** — 액션 본문이 덜 빠진 것이다(예상치 ~140줄 = 초기상태 56 + 스텁 63 + 헤더).

- [ ] **Step 8: 게이트 + 커밋**

`verification-loop` 프론트 트랙(Level 3, PR 전이므로 두 트랙 전체).

```bash
git add -A src/dashboard/src/stores/git
git commit -m "refactor(stores): git 액션 63개를 도메인 모듈 10개로 승격

index.ts 963줄 → ~140줄(초기상태 + 위임 스텁). 도메인 구분은 방금 분할한
api/git/ 패키지와 대칭이다.

set/get 을 명시 인자로 받는 형태는 stores/orchestration/wsConnection.ts
선례를 따른다. 액션 간 호출은 get().otherAction() 형태라 모듈을 갈라도
순환 import 가 생기지 않는다(실측 13종 전부).

**본문은 시그니처 줄과 상대 경로 깊이만 바뀌었다.** B1·B2 와 달리 바이트
동일성이 성립하지 않으므로, 안전망은 표면 스냅샷 + 기존 테스트 765줄 + tsc
(소비자 28파일) 세 겹이다."
```

---

## Task 6~8: `projectConfigs` 분할

Task 3~5와 같은 구조를 `projectConfigs`로 반복한다. 파라미터만 다르다.

### Task 6: `projectConfigs` 표면 베이스라인

**Task 1의 Step 2~4·8 절차**를 아래 파라미터로 수행한다.

- 임시 생성 테스트의 import: `import { useProjectConfigsStore } from '../projectConfigs'`
- 베이스라인: `src/dashboard/src/stores/__tests__/projectConfigs.surface.json`
- 테스트 파일: `src/dashboard/src/stores/__tests__/projectConfigs.surface.test.ts`
- Red-Green 대상: 초기 상태 `activeTab: 'overview'`(실측 370행)를 `'skills'`로 임시 변경 → FAIL 확인 → `git checkout` 원복 → PASS
- Step 4 Expected: 상태 키 + 액션 **72개** 기록됨

커밋 메시지:

```
test(stores): projectConfigs 스토어 표면 베이스라인 추가

분할 전 상태 키·액션 72개·초기값을 고정한다.
Red-Green: activeTab 'overview'→'skills' → FAIL → 원복 → PASS.
```

### Task 7: `projectConfigs` 패키지 승격 + 타입 추출

**Task 2의 Step 1~8 절차**를 아래 파라미터로 수행한다.

- `git mv projectConfigs.ts projectConfigs/index.ts`
- 이동 대상: **6–352행**(타입 20종). `interface ProjectConfigsState`(169행)에 `export`를 붙인다
- `index.ts` 재노출: 소비자 실측 12개 — `AgentConfig` · `CommandConfig` · `DBProject` · `HookConfig` · `MCPServerConfig` · `MemoryConfig` · `ProjectConfigSummary` · `ProjectInfo` · `RuleConfig` · `SkillConfig` · `TabType` (+ 훅 `useProjectConfigsStore`)
- Step 4·5 Expected: `projectConfigs.surface.test.ts` 1 passed · `projectConfigs.test.ts`(707줄) 0 failed
- Step 6 Expected: `types.ts` ~348줄, `index.ts` ~1,206줄 — **아직 한도 초과다. Task 8에서 해소되므로 이 태스크에서는 허용한다**
- 커밋 메시지에 "액션 승격은 Task 8" 을 명시한다

### Task 8: `projectConfigs` 액션 72개를 도메인 모듈 9개로 승격

**Task 5의 Step 1~8 절차**를 아래 파라미터로 수행한다.
- 도메인 9개는 File Structure 절의 표를 따른다 (`projects` · `skills` · `agents` · `mcp` · `hooks` · `commands` · `rules` · `memories` · `dbProjects`)
- Step 7 Expected: `index.ts` ~170줄. **300줄을 넘으면 멈춘다**
- **주의**: 모달 UI 상태 액션(`openSkillModal` · `closeSkillModal` 등)은 해당 도메인 모듈에 함께 둔다. 기술 계층(UI vs API)이 아니라 도메인으로 가르는 것이 이 계획의 규칙이다

---

## 게이트

상위 계획 Global Constraints 5를 상속한다. SSOT는 `verification-loop` 스킬이며 이 문서에 명령을 복제하지 않는다.

- 태스크마다 **Level 2**(변경 트랙 = 프론트), PR 직전 **Level 3**(두 트랙 전체).
- 백엔드 트랙의 알려진 로컬 플레이크 `test_embedding_model_consistency` 1건만 실패하면 통과로 간주한다. 프론트 트랙에는 알려진 플레이크가 없다 — **프론트 실패는 전부 진짜다.**
- 커밋 후 Codex 검증은 `--scope branch --base main`으로 한다. 실행 방법은 `~/.claude/CLAUDE.md`의 "Codex 검증 실행 방법" 절.

---

## 이 계획이 명시적으로 하지 않는 것

- **`split_audit.py` 적용**: Python `ast` 전용이라 TS에 쓸 수 없다. TS 판을 만들지 않는다(세 파일을 위해 비례하지 않으며, Python에 없던 `tsc`가 86개 소비자 전부를 검사한다). 다음 세션이 R2b를 찾다가 못 돌리는 일이 없도록 여기 못 박는다.
- **`stores/` 의 다른 800줄 초과 파일**: 이 배치의 대상은 3개다. 다른 파일은 B4 이후의 판단 대상이다.
- **액션 본문 "정리"**: 시그니처 줄과 상대 경로 깊이 외의 변경은 이 계획이 허용하지 않는다.

---

## 저장 위치

상위 계획과 같은 규칙(`docs/plans/YYYY-MM-DD-<name>.md`). `superpowers:writing-plans`의 기본값 `docs/superpowers/plans/`보다 프로젝트 관례가 우선한다 — B1·B2 계획서가 모두 `docs/plans/`에 있다.
