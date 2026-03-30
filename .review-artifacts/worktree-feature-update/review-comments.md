# 코드리뷰 결과

## 요약
- 총 코멘트: 18개
- [MUST]: 4개
- [SHOULD]: 6개
- [COULD]: 4개
- [PRAISE]: 4개

---

## 결함 검증 (설계의도 기반)

### 결함 1: font-mono 과도 제거

설계의도에서 명시한 대로, **코드/터미널 컨텍스트에서 font-mono가 제거된 것은 결함**이다. 아래 파일들에서 모노스페이스 폰트가 코드 정렬과 가독성에 필수적인 컨텍스트임에도 제거되었다.

**[MUST] DiffViewer.tsx — 코드 diff 뷰에서 font-mono 제거됨**
- `src/dashboard/src/components/DiffViewer.tsx:112` — UnifiedDiffView 루트 `<div>`: `font-mono` 제거. 코드 diff는 모노스페이스 정렬이 필수. 들여쓰기, 공백 차이가 가독성에 직결됨.
- `src/dashboard/src/components/DiffViewer.tsx:162` — SplitDiffView 루트 `<div>`: 동일한 문제.
- **Fix**: 두 곳 모두 `className="font-mono text-sm ..."` 으로 복원.

**[MUST] OutputLog.tsx — 터미널 로그 출력에서 font-mono 제거됨**
- `src/dashboard/src/components/monitor/OutputLog.tsx:174` — 로그 콘텐츠 영역: `bg-gray-900`/`bg-gray-950` 배경의 터미널 스타일 로그 표시 영역. 터미널 출력은 모노스페이스가 표준.
- **Fix**: `className="flex-1 overflow-auto p-4 font-mono text-sm bg-gray-900 dark:bg-gray-950"` 으로 복원.

**[MUST] YamlEditor.tsx — YAML 에디터/프리뷰에서 font-mono 제거됨**
- `src/dashboard/src/components/workflows/YamlEditor.tsx:127` — YAML 편집 `<textarea>`: YAML은 들여쓰기 기반 문법으로 모노스페이스 필수.
- `src/dashboard/src/components/workflows/YamlEditor.tsx:133` — YAML 프리뷰 `<pre>`: JSON 프리뷰도 모노스페이스 필요.
- **Fix**: 두 곳 모두 `font-mono` 복원.

**[SHOULD] 추가 코드 컨텍스트에서의 font-mono 제거 — 복원 권장**

다음 파일들도 코드/데이터 표시 컨텍스트에서 font-mono가 제거되어 복원을 권장한다:

| 파일 | 줄 | 컨텍스트 |
|------|-----|---------|
| `ConflictResolverPanel.tsx` | 253, 273, 293 | `<pre>` 태그 내 코드 콘텐츠 (base/ours/theirs) |
| `ConflictResolverPanel.tsx` | 308 | 충돌 해결 코드 `<textarea>` |
| `MCPToolCaller.tsx` | 266 | JSON 인자 입력 `<textarea>` |
| `MCPToolCaller.tsx` | 484, 598 | `<pre>` 태그 내 API 결과 표시 |
| `RAGQueryPanel.tsx` | 505 | `<pre>` 태그 내 문서 콘텐츠 프리뷰 |
| `EnhancedRunLogs.tsx` | 131 | 실행 로그 출력 영역 |
| `WorkflowRunLogs.tsx` | 67 | 워크플로우 실행 로그 영역 |
| `CommandEditModal.tsx` | 154, 167 | 명령어 `<pre>` 프리뷰 및 `<textarea>` 편집 |
| `TranscriptViewer.tsx` | 224 | JSON 트리 데이터 표시 |

**[SHOULD] aos-frontend.md 규칙이 과도함**
- `.claude/rules/aos-frontend.md:12` — `font-mono 클래스 사용 금지 (시스템 기본 폰트 유지)` 규칙은 코드/터미널 컨텍스트 예외를 명시하지 않아, 향후 코드 에디터 등에서도 font-mono를 사용하지 못하게 된다.
- **Fix**: `font-mono 클래스 사용 금지 — 단, 코드 diff, 터미널 로그, YAML/JSON 에디터, <pre>/<code> 블록 등 코드 컨텍스트는 예외` 로 수정.

---

### 결함 2: symlink 과도 제약

**[MUST] init_projects()에서 일반 디렉토리 등록이 차단됨**
- `src/backend/models/project.py:472` — `if item.is_symlink():` 조건으로 변경하여, `git clone`이나 디렉토리 복사로 `projects/` 에 생성된 프로젝트가 등록되지 않음. 설계의도에서도 "symlink 전용 필터링은 과도한 제약"으로 명시.
- **Fix**: symlink뿐 아니라 일반 디렉토리도 등록하되, e2e 잔여물을 식별하는 별도 로직을 추가. 예:
  ```python
  if item.is_symlink() or (item.is_dir() and not item.name.startswith('.') and not item.name.startswith('test-')):
  ```
  또는 마커 파일(`.aos-project`) 기반 필터, 혹은 e2e 테스트 측에서 생성 시 prefix 규칙을 강제하는 방안.

**[SHOULD] project_discovery.py에서 동일한 과도 제약**
- `src/backend/services/project_discovery.py:197` — `if entry.is_symlink():` 로 변경됨. `init_projects()`와 동일한 문제.
- **Fix**: `init_projects()`와 동일한 정책을 적용하여 일관성 유지.

**[COULD] ProjectCleanupService의 shutil.rmtree — 양호하나 주의 필요**
- `src/backend/services/project_cleanup_service.py:209` — `shutil.rmtree(project_entry)` 로 잔여 디렉토리를 정리하는 것은 cleanup 맥락에서 합리적. 단, `project_entry.parent == projects_dir` 체크가 안전 가드 역할을 하고 있어 양호.

---

### 결함 3: 에러 핸들링 미흡

**[SHOULD] DashboardPage의 fetchSessionProjects 에러 시 폴백 불동작**
- `src/dashboard/src/pages/DashboardPage.tsx:51-53` — `allSessionProjects.length > 0` 조건으로 폴백하는데, API 실패 시 `fetchProjects`의 catch 블록에서 아무것도 하지 않아(`// Silently ignore errors`) `allProjects`가 초기값 `[]`로 유지됨. 빈 배열(`length === 0`)이면 폴백이 동작하긴 하지만, **API가 성공적으로 빈 배열을 반환하는 경우**(실제 프로젝트가 0개)와 **API 호출 실패**를 구분할 수 없음.
- `src/dashboard/src/stores/claudeSessions.ts:356-358` — catch 블록에서 에러 상태 미설정.
- **Fix**: 스토어에 `projectsFetchError: boolean` 상태를 추가하고, catch 시 `set({ projectsFetchError: true })`를 설정. DashboardPage에서는 `projectsFetchError || allSessionProjects.length === 0` 일 때 폴백 사용.

**[SHOULD] fetchProjects의 silent error 패턴**
- `src/dashboard/src/stores/claudeSessions.ts:356-358` — `// Silently ignore errors` 코멘트와 함께 에러를 완전히 무시. 최소한 `console.error` 또는 스토어 `error` 상태에 기록해야 디버깅 가능.
- **Fix**: `catch (e) { console.error('Failed to fetch session projects:', e) }` 또는 기존 스토어의 `error` 상태 활용.

---

## ADR 체크포인트 검증

### ADR-007: ACE 잔여 참조

`ace_capabilities`, `aceMatrix`, `ace-framework`, `ACE Framework` 키워드로 `src/`, `.claude/`, `claude-workspace-template/` 전체를 검색한 결과:

- **src/ 디렉토리**: 잔여 참조 **0건** -- 완전 제거 확인
- **.claude/ 디렉토리**: 잔여 참조 **0건** -- 스킬 디렉토리 삭제 확인
- **claude-workspace-template/**: 잔여 참조 **0건** -- ace-framework.md 삭제 확인
- **docs/adr.yaml**: `aceMatrixSync` 참조 2건 존재하나, 이는 ADR-007 폐기 결정 기록 자체이므로 정상 (히스토리 문서)

**판정**: ACE 제거는 완전하며, 런타임에 영향을 주는 잔여 참조 없음.

### ADR-003: Tailwind CSS 전용 스타일링

- `dark:hover:bg-gray-750` → `dark:hover:bg-gray-700` 변경 (`ServiceStatusBar.tsx:103`): `gray-750`은 Tailwind 기본 팔레트에 없는 비표준 값이므로, `gray-700`으로 변경은 올바름. **체크포인트 통과**.
- `dark:bg-green-900/10` → `dark:bg-green-900/20`, `dark:bg-amber-900/10` → `dark:bg-amber-900/20` 변경: 유효한 Tailwind opacity 수정자. **양호**.

### ADR-004: FastAPI + SQLAlchemy Async — shutil.rmtree sync I/O

**[SHOULD] async 컨텍스트에서 sync I/O 호출**
- `src/backend/services/project_cleanup_service.py:209` — `shutil.rmtree(project_entry)`는 동기 파일시스템 I/O. `cascade_delete()`는 `async def`로 정의되어 있으며(라인 121), 이벤트 루프를 블로킹할 수 있음.
- 프로젝트 삭제 빈도가 낮아 실질적 영향은 제한적이나, 원칙상 `asyncio.to_thread()`로 래핑하는 것이 올바름.
- **Fix**:
  ```python
  import asyncio
  await asyncio.to_thread(shutil.rmtree, project_entry)
  ```
- 참고: 기존 `project_entry.unlink()` (라인 204)도 sync이나, symlink 삭제는 매우 빠르므로 실질적 문제 없음. `rmtree`는 디렉토리 크기에 따라 블로킹이 길어질 수 있어 래핑 필요성이 더 높음.

### ADR-008: 심볼릭 링크 기반 프로젝트 등록

결함 2에서 상세히 다룸. ADR 원문은 symlink "생성"을 권장했으나 "만" 허용하지는 않음. 현재 구현의 symlink 전용 필터는 과도. **체크포인트 실패 — 수정 필요**.

### ADR-002: Zustand 상태 관리

- `projectConfigs.ts`에서 `ace_capabilities` 타입 제거: 다른 스토어와의 의존성 파괴 없음 확인. **양호**.
- `allSessionProjects`가 `claudeSessions` 스토어에 있는 것은 세션 관련 데이터이므로 적절한 위치. **양호**.

### ADR-014: Vitest + Testing Library 테스트

- `AgentsTab.test.tsx:38,47` — `ace_capabilities: null` mock 데이터 제거 확인.
- `ProjectClaudeConfigPanel.test.tsx:96` — `ace_capabilities: null` mock 데이터 제거 확인.
- 테스트 통과 여부는 CI/로컬 실행으로 별도 검증 필요. (PR 본문의 Test Plan 항목)

---

## 파일별 코멘트

### src/dashboard/src/components/DiffViewer.tsx
- [MUST] **112, 162**: 코드 diff 뷰에서 `font-mono` 제거됨. 코드 정렬이 깨져 diff 가독성이 심각하게 저하됨. 복원 필수.

### src/dashboard/src/components/monitor/OutputLog.tsx
- [MUST] **174**: 터미널 로그 출력 영역에서 `font-mono` 제거됨. 터미널 출력은 모노스페이스가 업계 표준. 복원 필수.

### src/dashboard/src/components/workflows/YamlEditor.tsx
- [MUST] **127, 133**: YAML 에디터 textarea와 pre 프리뷰에서 `font-mono` 제거됨. YAML은 들여쓰기 기반 문법으로 모노스페이스 필수. 복원 필수.

### src/dashboard/src/components/git/ConflictResolverPanel.tsx
- [SHOULD] **253, 273, 293**: `<pre>` 태그 내 코드 콘텐츠에서 `font-mono` 제거됨. 충돌 해결 시 코드 비교를 위해 모노스페이스 필요.
- [SHOULD] **308**: 충돌 해결 textarea에서 `font-mono` 제거됨. 코드 편집 영역.

### src/dashboard/src/components/mcp/MCPToolCaller.tsx
- [SHOULD] **266**: JSON 인자 입력 textarea에서 `font-mono` 제거됨. JSON 편집에 모노스페이스 권장.
- [SHOULD] **484, 598**: `<pre>` 태그 내 API 결과 표시에서 `font-mono` 제거됨.

### src/dashboard/src/components/git/CommitHistory.tsx
- [COULD] **287**: `className=""` 빈 문자열 잔여. `font-mono`를 제거하면서 `<span className="">` 이 됨. 불필요한 빈 속성.
- **Fix**: `className=""` 속성 자체를 제거하거나, 브랜치명이므로 `font-mono`를 유지하는 것도 고려.
- [COULD] **358**: commit SHA 표시에서 `font-mono` 제거됨. SHA 해시는 모노스페이스가 관례적으로 사용되는 컨텍스트.

### src/dashboard/src/components/workflows/EnhancedRunLogs.tsx
- [SHOULD] **131**: 실행 로그 출력 영역에서 `font-mono` 제거됨. 로그 출력은 터미널과 동일한 컨텍스트.

### src/dashboard/src/components/workflows/WorkflowRunLogs.tsx
- [SHOULD] **67**: 워크플로우 실행 로그 영역에서 `font-mono` 제거됨. EnhancedRunLogs와 동일한 이유.

### src/dashboard/src/components/rag/RAGQueryPanel.tsx
- [SHOULD] **505**: `<pre>` 태그 내 문서 콘텐츠 프리뷰에서 `font-mono` 제거됨. 코드 문서를 표시할 때 모노스페이스 필요.

### src/dashboard/src/components/project-configs/CommandEditModal.tsx
- [SHOULD] **154, 167**: 명령어 프리뷰 `<pre>` 및 편집 `<textarea>`에서 `font-mono` 제거됨. 명령어/스크립트 편집 컨텍스트.

### src/dashboard/src/components/claude-sessions/TranscriptViewer.tsx
- [SHOULD] **224**: JSON 트리 데이터 표시에서 `font-mono` 제거됨. 구조화된 데이터는 모노스페이스로 정렬되어야 함.

### src/backend/models/project.py
- [MUST] **472**: `if item.is_symlink():` — 일반 디렉토리를 프로젝트로 등록하지 않음. git clone 등 정상 워크플로우 차단.

### src/backend/services/project_discovery.py
- [SHOULD] **197**: `if entry.is_symlink():` — init_projects()와 동일한 과도 제약.

### src/backend/services/project_cleanup_service.py
- [SHOULD] **209**: `shutil.rmtree(project_entry)` — async 함수 내 sync I/O. `asyncio.to_thread()`로 래핑 권장.
- [PRAISE] **115-117**: `project_entry.is_symlink() or (project_entry.is_dir() and project_entry.parent == projects_dir)` — cleanup에서는 symlink와 일반 디렉토리를 모두 처리할 수 있게 한 것은 좋은 판단. 등록(init/discovery)과 정리(cleanup)의 비대칭성은 있으나, cleanup이 더 관대한 것은 안전한 방향.

### src/dashboard/src/pages/DashboardPage.tsx
- [SHOULD] **51-53**: API 실패와 빈 결과를 구분할 수 없는 폴백 로직. 에러 상태 기반 분기 추가 필요.
- [COULD] **39-47**: `agentStats`의 reduce에서 accumulator를 직접 mutation하고 있음 (`acc.total++`). reduce 내부 accumulator mutation은 일반적으로 허용되는 패턴이나, immutability 원칙을 엄격히 적용한다면 spread 패턴이 나음. 현재 코드가 이 PR의 변경이 아닌 기존 코드일 가능성이 높으므로 낮은 우선순위.

### src/dashboard/src/stores/claudeSessions.ts
- [SHOULD] **356-358**: `fetchProjects`의 catch에서 에러를 완전히 무시. 최소한 에러 로깅 또는 상태 저장 필요.

### .claude/rules/aos-frontend.md
- [SHOULD] **12**: `font-mono 클래스 사용 금지` 규칙에 코드 컨텍스트 예외 누락. 이 규칙대로라면 향후 모든 코드 표시 UI에서도 font-mono 사용 불가.

### src/dashboard/src/components/project-management/ServiceStatusBar.tsx
- [PRAISE] **103**: `dark:hover:bg-gray-750` → `dark:hover:bg-gray-700` 변경은 Tailwind 기본 팔레트 준수. 비표준 값 수정은 올바른 개선.
- [PRAISE] **152, 155**: 다크모드 배경 불투명도 10% → 20% 조정은 가시성 개선에 적절.

### ACE Framework 제거 전체
- [PRAISE] **10개 파일, -511줄**: ACE Framework 완전 제거가 깔끔하게 수행됨. 백엔드 모델(`project_config.py`), 서비스(`agent_manager.py`, `project_config_monitor.py`), 프론트엔드(`AgentsTab.tsx`, `projectConfigs.ts`), 테스트(`AgentsTab.test.tsx`, `ProjectClaudeConfigPanel.test.tsx`), 스킬/템플릿 파일 모두 일관적으로 제거. 잔여 참조 0건 확인.

---

## 최종 판정

### REQUEST CHANGES

**근거**: MUST 등급 이슈 4건 (font-mono 코드 컨텍스트 복원 3건, symlink 과도 제약 1건)이 존재하여 머지 전 수정이 필요함.

**요약 우선순위**:

| 순위 | 영역 | 조치 |
|------|------|------|
| 1 | font-mono 코드 컨텍스트 복원 (DiffViewer, OutputLog, YamlEditor + 추가 10개 파일) | MUST — 복원 |
| 2 | symlink 전용 필터 완화 (project.py, project_discovery.py) | MUST — 일반 디렉토리도 등록 가능하도록 |
| 3 | aos-frontend.md font-mono 규칙에 예외 추가 | SHOULD — 코드 컨텍스트 예외 명시 |
| 4 | DashboardPage 에러/빈값 구분 | SHOULD — 에러 상태 추가 |
| 5 | shutil.rmtree async 래핑 | SHOULD — asyncio.to_thread() |
| 6 | CommitHistory className="" 정리 | COULD — 빈 속성 제거 |
