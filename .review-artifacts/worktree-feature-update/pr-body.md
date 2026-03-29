# PR: 기술 부채 정리 — font-mono 제거, ACE 폐기, 프로젝트 등록 강화, 통계 개선

## Summary

AOS Dashboard와 백엔드의 기술 부채를 정리하는 작업. font-mono 클래스 일괄 제거로 UI 폰트 일관성 확보, 사용되지 않는 ACE Framework를 코드베이스 전체에서 완전 삭제, projects/ 디렉토리의 e2e 잔여물 방지를 위한 등록 메커니즘 강화, Dashboard 세션 프로젝트 통계의 정확도 개선을 수행한다.

## Changes

### 1. Dashboard — font-mono 클래스 제거 (63 files, +130/-129)

일반 UI 요소에서 Tailwind `font-mono` 클래스를 제거하여 시스템 기본 폰트(sans-serif)로 통일.

- **컴포넌트**: ApprovalModal, ChatInput, DiffViewer, TaskBoard 등 63개 파일
- **페이지**: AnalyticsPage, DashboardPage, GitPage 등 8개 페이지
- **영역**: 라벨, ID 표시, 경로 텍스트, 키보드 단축키 표시, 상태 뱃지 등
- **규칙 추가**: `.claude/rules/aos-frontend.md`에 `font-mono 클래스 사용 금지` 규칙 추가

### 2. ACE Framework 완전 제거 (10 files, -511 lines)

ACE(Autonomous Cognitive Entity) 4-Pillar 거버넌스 모델을 코드베이스 전체에서 삭제.

- **스킬 삭제**: `.claude/skills/ace-framework/` (SKILL.md, enforcement-matrix.md)
- **템플릿 삭제**: `claude-workspace-template/core/.claude/agents/shared/ace-framework.md`
- **백엔드**: `project_config.py`, `agent_manager.py`, `project_config_monitor.py`에서 `ace_capabilities` 필드 제거
- **프론트엔드**: `AgentsTab.tsx`에서 ACE UI 블록 제거, `projectConfigs.ts` 스토어에서 타입 제거
- **테스트**: `AgentsTab.test.tsx`, `ProjectClaudeConfigPanel.test.tsx`에서 ACE mock 데이터 제거

### 3. 백엔드 — 프로젝트 등록 메커니즘 강화 (3 files, +27/-13)

`projects/` 디렉토리에서 symlink만 프로젝트로 인식하도록 변경하여 e2e 테스트 잔여물이 프로젝트로 등록되는 버그 방지.

- **`project.py`**: `init_projects()`에서 `is_symlink()` 체크 추가
- **`project_discovery.py`**: 스캔 시 symlink만 필터링
- **`project_cleanup_service.py`**: 잔여 일반 디렉토리도 `shutil.rmtree`로 정리 가능하도록 보완

### 4. Dashboard — 세션 프로젝트 통계 및 스타일 개선 (2 files, +14/-9)

- **`DashboardPage.tsx`**: `fetchSessionProjects` 전용 API로 프로젝트 목록 조회, 기존 세션 기반 추출 방식을 폴백으로 유지
- **`ServiceStatusBar.tsx`**: 다크모드 배경 불투명도 10% → 20%로 조정

### 5. 문서 및 설정 업데이트 (27 files, +2,255/-1,743)

- **신규**: `docs/code-convention.yaml` (팀 코드 컨벤션), `docs/adr.yaml` (16개 아키텍처 결정 기록)
- **갱신**: 에이전트 팀 가이드, e2e 워크플로우, 시스템 아키텍처 HTML, 워크스페이스 템플릿 에이전트 설정
- **삭제**: ACE 관련 참조, 사용되지 않는 에이전트 지침

## Breaking Changes

- **`ace_capabilities` 필드 제거**: 기존 API 응답에 `ace_capabilities` 필드가 포함되었으나 삭제됨. 프론트/백엔드가 같은 PR에서 변경되므로 호환성 이슈 없음.
- **프로젝트 등록 방식 변경**: `projects/` 디렉토리에 직접 디렉토리를 생성하는 방식이 더 이상 프로젝트로 인식되지 않음. symlink로만 등록 가능.

> **Note**: 이 PR은 **Draft** 상태로 올립니다. 아래 Known Issues가 해결된 후 Ready for Review로 전환합니다. 해당 코드 라인에 작성자 직접 코멘트로 결함 사항을 표기하여, 리뷰어가 해당 부분을 제외하고 리뷰할 수 있도록 합니다.

## Known Issues

다음 결함 3건은 본 PR의 기술 부채 정리 범위를 벗어나므로 별도 이슈에서 후속 처리합니다:

1. **font-mono 과도 제거** — DiffViewer, OutputLog, YamlEditor 등 코드/터미널 컨텍스트에서도 font-mono가 제거됨. 코드 컨텍스트에서는 복원 필요. → 후속 이슈에서 처리
2. **symlink 과도 제약** — git clone이나 디렉토리 복사로 프로젝트를 등록하는 워크플로우가 차단됨. e2e 잔여물만 필터링하는 방식으로 수정 필요. → 후속 이슈에서 처리
3. **에러 핸들링 미흡** — `DashboardPage.tsx`의 `fetchSessionProjects` API 실패 시 에러 상태를 별도 체크하지 않아 폴백이 동작하지 않을 수 있음. → 후속 이슈에서 처리

## Test Plan

- [ ] `tsc --noEmit` — TypeScript 타입 체크 통과
- [ ] `npm run lint` — ESLint 에러 없음
- [ ] `npm test` — 전체 테스트 통과 (AgentsTab, ProjectClaudeConfigPanel 포함)
- [ ] `npm run build` — 프로덕션 빌드 성공
- [ ] DiffViewer에서 코드 diff 가독성 확인 (font-mono 복원 후)
- [ ] 프로젝트 목록 페이지에서 등록된 프로젝트가 정상 표시되는지 확인
- [ ] Dashboard 세션 프로젝트 통계가 정확한 수치를 표시하는지 확인
- [ ] ACE 관련 키워드(`ace`, `ace_capabilities`) 전체 검색 → 잔여 참조 0건

## Related

- `docs/adr.yaml` — ADR-006 (font-mono 금지 → 해제 예정), ADR-007 (ACE 폐기), ADR-008 (symlink 등록)
- `.review-artifacts/worktree-feature-update/design-intent.md` — 설계의도 문서
- `.review-artifacts/worktree-feature-update/code-quality-guide.md` — 평가기준 문서
