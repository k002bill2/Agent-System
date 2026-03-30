# 평가기준

## 공통 기준 (Code Convention)

이번 작업의 기술 스택(React, TypeScript, Tailwind CSS, Zustand, FastAPI, SQLAlchemy, Python)에 해당하는 컨벤션만 필터링.

### TypeScript (error 등급)
- strict 모드 필수
- noUnusedLocals, noUnusedParameters 활성화
- `any` 타입 최소화 → `unknown` + 타입 가드 사용 (warning)

### React (error/warning 등급)
- `React.memo()` + `displayName` 필수 (warning)
- Props interface 선언 필수 (error)
- `useMemo`, `useCallback` 적절히 사용 (warning)
- `react-hooks/rules-of-hooks: error`, `exhaustive-deps: warn`

### Tailwind CSS (error 등급)
- Tailwind CSS 전용 — 인라인 스타일 금지 (error)
- 다크모드 필수: `dark:` prefix 적용 (warning)
- `font-mono` 사용은 허용 — 코드/터미널 컨텍스트에서 적절히 사용 (ADR-006 해제됨)
- 조건부 클래스는 `cn()` 유틸리티 사용 (error)

### Zustand
- `create<State>((set) => ({...}))` 패턴 유지 (error)
- 전역 상태 최소화, 로컬 상태 우선 (warning)

### FastAPI / SQLAlchemy (error 등급)
- Router: `APIRouter(prefix, tags)` + `Depends(get_session)`
- 비즈니스 로직은 Service 클래스로 분리
- Pydantic 모델로 request/response 검증
- async/await 일관 사용
- `logging.getLogger(__name__)` 사용, 민감 정보 로깅 금지

### Python 타입/스타일
- 타입 힌트 필수: 모든 함수 시그니처 및 반환값 (error)
- ruff 린터: line-length 100, py311 (error)
- union 타입: `str | None` 파이프 문법 (warning)

### 네이밍
- React 컴포넌트: PascalCase, Props: `[Component]Props`
- Python: snake_case (변수/함수), PascalCase (클래스)
- 파일: TSX=PascalCase, Python=snake_case, 스토어=camelCase

### 코드 품질
- 함수 50줄, 파일 800줄, 네스팅 4단계 이내 (warning)
- Immutability 우선: const, readonly, 스프레드 연산자
- console.log 금지 (console.warn/error만)

### 테스트
- Vitest + @testing-library/react (프론트)
- pytest + pytest-asyncio (백엔드)
- e2e 잔여물 방지: afterAll/afterEach에서 리소스 정리 필수 (error)

### Git
- Conventional Commits: `<type>: <description>`
- 커밋 전 검증: tsc + lint + test + build (error)
- 빌드 깨진 채 커밋 금지 (error)

---

## 이 작업에 적용되는 ADR

### ADR-003: Tailwind CSS 전용 스타일링
- **적용 방법**:
  - font-mono 제거 후 대체 스타일이 Tailwind 유틸리티인지 확인 (인라인 style 금지)
  - 다크모드 보정 시 `dark:` prefix 누락이 없는지 체크
  - 조건부 클래스 변경 시 `cn()` 유틸리티 사용 확인
- **체크포인트**: ServiceStatusBar의 `dark:bg-gray-750` → `dark:bg-gray-700` 변경이 Tailwind 유효 클래스인지

### ADR-006: font-mono 사용 금지 → **해제(superseded)**
- **결정**: font-mono 전면 금지 정책을 해제. 코드/터미널 컨텍스트에서는 `font-mono` 사용 허용.
- **적용 방법**:
  - 일반 UI 요소(라벨, 경로, ID 등)에서 font-mono 제거는 정상
  - **DiffViewer, OutputLog, YamlEditor, `<pre>`/`<code>` 블록에서의 font-mono 제거는 결함** — 복원 필요
  - 리뷰 시 "코드 컨텍스트인데 font-mono가 제거된 곳"을 식별하여 지적
- **후속 작업**: `code-convention.yaml`의 font-mono 규칙, `adr.yaml`의 ADR-006을 superseded로 업데이트 필요

### ADR-007: ACE Framework 폐기
- **적용 방법**:
  - 삭제 범위 완전성 검증: `ace`, `ACE`, `ace_capabilities`, `aceMatrix` 키워드로 전체 코드베이스 검색
  - `.claude/skills/ace-framework/` 디렉토리 삭제 확인
  - `claude-workspace-template`의 ace-framework.md 삭제 확인
  - 백엔드 모델/서비스에서 `ace_capabilities` 필드 잔여 참조 없음 확인
  - 프론트엔드 AgentsTab의 ACE UI 블록 제거 확인
  - 테스트 모킹 데이터에서 `ace_capabilities` 제거 확인
- **체크포인트**: `ace_capabilities` DB 컬럼이 있었다면 Alembic 마이그레이션 필요 여부

### ADR-008: 심볼릭 링크 기반 프로젝트 등록
- **적용 방법**:
  - ADR 원문은 symlink "생성"을 결정했지 symlink "만" 허용한다고 하지 않음
  - `init_projects()`, `ProjectDiscovery`, `ProjectCleanupService`에서 `is_symlink()` 체크가 과도하게 적용되어 일반 디렉토리(git clone 결과물)를 배제하고 있는지 확인
  - Docker 볼륨 마운트 환경에서 정상 동작하는지 확인
- **체크포인트**: symlink 전용 필터가 정상 워크플로우를 차단하는 결함으로 리뷰 시 지적

### ADR-002: Zustand 상태 관리
- **적용 방법**:
  - `projectConfigs.ts` 스토어에서 `ace_capabilities` 타입 제거 후 다른 스토어와 의존성 파괴 없음 확인
  - DashboardPage의 세션 프로젝트 데이터가 적절한 스토어에서 관리되는지 확인
- **체크포인트**: `allSessionProjects` 상태가 전역 스토어에 적합한지, 로컬 상태가 나을지 판단

### ADR-004: FastAPI + SQLAlchemy Async
- **적용 방법**:
  - `ace_capabilities` 필드 제거가 DB 스키마(Alembic 마이그레이션)에 영향 주는지 확인
  - 프로젝트 발견/정리 서비스 변경 시 async/await 일관성 유지 확인
  - `ProjectCleanupService`에 추가된 `shutil.rmtree`가 sync 호출인지, async 컨텍스트에서 블로킹 이슈 있는지 확인
- **체크포인트**: `shutil.rmtree`는 sync I/O — `asyncio.to_thread(shutil.rmtree, path)`로 래핑하여 별도 스레드에서 실행해야 이벤트 루프 블로킹 방지 (severity: warning)

### ADR-014: Vitest + Testing Library 테스트
- **적용 방법**:
  - `AgentsTab.test.tsx`, `ProjectClaudeConfigPanel.test.tsx`에서 `ace_capabilities` mock 데이터 제거 후 테스트 PASS 확인
  - 변경된 컴포넌트들의 기존 테스트가 깨지지 않았는지 검증
- **체크포인트**: `npm test` 실행으로 전체 테스트 통과 확인

---

## 평가 우선순위

| 순위 | 영역 | 근거 |
|------|------|------|
| 1 | **결함 3건** (font-mono 과도 제거, symlink 과도 제약, 에러 핸들링 미흡) | 설계의도와 구현의 gap, 기능 결함 |
| 2 | **ACE 잔여 참조** | 불완전한 제거는 런타임 에러 유발 가능 |
| 3 | **async 컨텍스트의 sync I/O** | `shutil.rmtree`를 `asyncio.to_thread()`로 래핑 권장 |
| 4 | **Tailwind/다크모드 일관성** | 스타일 회귀 방지 |
| 5 | **테스트 통과 여부** | 배포 전 필수 게이트 |
| 6 | **코드 품질 (함수 크기, 네이밍 등)** | 유지보수성 |
