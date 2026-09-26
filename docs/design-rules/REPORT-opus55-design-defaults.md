> 적용됨: 규칙 본문은 .claude/rules/frontend-design-defaults.md 로 이동(2026-09-27).
# REPORT — opus55 frontend design defaults (Agent-System)

- 작성: Designer (Claude Opus 5.5), 2026-09-27 / 브리프: `BRIEF-opus55-design-defaults.md`
- 산출 규칙 초안: `docs/design-rules/frontend-design-defaults.md` (금지 14개, 본문 43줄)
- 근거 수준: 모든 현황은 L1(이 worktree에서 grep 실측, `*.test.tsx` 제외). 화면 렌더링 확인은 하지 않음(dev 서버 실행 금지).

## 1. 조사한 디자인 소스
| 구분 | 경로 | 요점 |
|---|---|---|
| 기존 규칙 | `.claude/rules/aos-frontend.md` | memo/displayName, `cn()`, `dark:` 필수, `font-mono` 코드 컨텍스트 한정 |
| 테마/토큰 | `src/dashboard/src/index.css` (Tailwind v4 `@theme`, tailwind.config 없음) | 시맨틱 토큰 `:6-41`, `primary-50..950` 스케일 `:12-22`, `accent-light/dark` violet `:32-33`, 라이트/다크 CSS 변수 `:59-96`, `--radius: 0.5rem` `:76`, Inter/JetBrains Mono `:43-44` |
| 유틸 | `src/dashboard/src/lib/utils.ts` | `cn()` `:4` (119개 파일 사용) |
| 공용 컴포넌트 | `components/ui/Skeleton.tsx`, `components/skeletons/{Dashboard,ProjectsGrid,Sidebar}Skeleton.tsx`, `components/common/{VirtualizedDataTable,Pagination}.tsx` | Button·Card·EmptyState 공용 컴포넌트는 **없음** |
| 대표 화면 | `pages/DashboardPage.tsx`, `pages/AnalyticsPage.tsx`, `pages/AuditPage.tsx`, `pages/ExternalUsagePage.tsx`, `pages/LoginPage.tsx`, `components/Sidebar.tsx` | 카드 레시피·KPI·로딩/오류 패턴 확인 |

실사용 관행(L1): raw `gray-*` 클래스 178개 파일 3,391건, `primary-*` 스케일 93개 파일 379건, 시맨틱 토큰(`bg-card`/`text-muted-foreground`/`border-border` 등) **0건**, `lucide-react` 156개 파일.

## 2. 금지 패턴별 근거와 현황
분류: **신규** = 신규 작업 규칙 / **기존-제안** = 기존 화면에 있음, 수정은 제안만(이번 범위에서 수행 안 함).

| # | 패턴 | 이 제품에 안 맞는 이유 | 현황 (파일:라인) | 분류 |
|---|---|---|---|---|
| 1 | blue→violet 등 그라데이션 | 장식 신호일 뿐 정보가 없고 "AI 생성" 인상의 대표 기본값 | `Sidebar.tsx:108`, `LoginPage.tsx:72`, `RegisterPage.tsx:63` (`from-primary-500 to-accent`), `OrganizationStats.tsx:151`, `git/FileGroup.tsx:202`, `git/WorkingDirectory.tsx:300` — 6곳 | 신규 + 기존-제안 |
| 2 | 지표별 무지개 KPI 카드 | 색이 상태 의미를 잃어 경보색이 묻힘 | `DashboardPage.tsx:83,96,109,122`(값 색 gray/green/blue/purple), 아이콘 타일 `:85,98,111,125` | 신규 + 기존-제안 |
| 3 | 히어로급 숫자 `text-4xl+` | 밀도 저하, 수치 비교가 어려워짐 | `AuditPage.tsx:205` 1곳 | 신규 + 기존-제안 |
| 4 | 큰 라운드·pill 버튼/칩 | 소비자 앱 톤, 표·폼 격자와 어긋남 | `rounded-2xl`: `LoginPage.tsx:72`, `RegisterPage.tsx:63`. pill 버튼(확인분): `workflows/TemplateGallery.tsx:118,128` 필터 칩. `rounded-full` 168건 대부분은 상태 점·아바타·배지(허용)이고 `TaskAnalyzer.tsx:424`는 원형 아이콘 버튼(허용) | 신규 + 기존-제안 |
| 5 | 이모지 아이콘 | 렌더링 편차, 톤이 가벼움, lucide와 불일치 | `notifications/ChannelConfigForm.tsx:213,264` (💡) | 신규 + 기존-제안 |
| 6 | 콘텐츠 글래스모피즘 | 대비·가독성 저하 | 현재 없음. 유일한 `backdrop-blur`는 모달 스크림 `feedback/FeedbackModal.tsx:73`(허용 여부 확인 필요) | 신규 |
| 7 | 카드 큰 그림자 | 평면 격자 대시보드에서 층위 혼란 | 카드에는 현재 없음. `shadow-xl/2xl`은 모달·사이드패널(`ApprovalModal.tsx:44`, `MemberDetailPanel.tsx:454` 등)에만 — 관례상 허용 | 신규 |
| 8 | 크림/오프화이트 배경 | 가이드가 지목한 대표 기본값, 데이터 UI에 부적합 | 현재 없음. 배경 `--background: 0 0% 100%`(`index.css:60`). `bg-amber-50`/`orange-50` 히트는 경고 배너(`App.tsx:387`)·비용 등급색(`CostMonitor.tsx:183`) | 신규 |
| 9 | 헤드라인 이탤릭 강조어·세리프 | 에디토리얼 톤, 실무 UI와 불일치 | 현재 없음. `italic` 8건은 모두 placeholder/빈 값 표기(`ProjectClaudeConfigPanel.tsx:215` 등). `font-serif` 0건 | 신규 |
| 10 | "01/02/03" 번호 라벨·장식 mono 라벨 | 가이드 지목 기본값, 기존 `font-mono` 규칙과 충돌 | 번호 라벨 0건. `font-mono` 31건은 diff·로그·YAML·브랜치명·ID 등 코드 컨텍스트(개별 전수 판정은 안 함) | 신규 |
| 11 | 무의미한 hero·일러스트·마케팅 문구 | 운영 화면의 첫 시선은 데이터여야 함 | 현재 없음(대표 화면 기준, 전수 확인 아님) | 신규 |
| 12 | 장식 애니메이션 | 주의 분산 | `hover:scale` 0건, `animate-bounce` 0건. `animate-ping` 3건은 라이브 상태 점(`TaskBoard.tsx:200` 등) — 허용 | 신규 |
| 13 | 직접 만든 원형 스피너(목록·표) | 레이아웃 점프, 이미 있는 Skeleton과 불일치 | `common/VirtualizedDataTable.tsx:464`, `AnalyticsPage.tsx:179`(전체 화면 `RefreshCw animate-spin`) | 신규 + 기존-제안 |
| 14 | 과도한 여백 | 정보 밀도 요구와 충돌 | 현재 없음. `gap-12+` 0건, `p-8`은 빈 상태 중앙 영역(`TaskAnalyzer.tsx:866`, `ErrorBoundary.tsx:37`)뿐 | 신규 |

**집계: 금지 14개 중 현재 코드에 이미 있는 것 6개(#1·#2·#3·#4·#5·#13).**

보류(금지 목록에서 제외): `uppercase tracking-wide(r)` 섹션 라벨 15건(`VerticalSplitPanel.tsx:96`, `CostMonitor.tsx:370`, `TaskBoard.tsx:309` 등). 밀도 높은 엔터프라이즈 UI의 관례라 금지 대신 "확인 필요"로 둠.

## 3. 대체 기준(Do)의 출처
- 카드: `DashboardPage.tsx:79`, `ui/Skeleton.tsx:21` — `rounded-lg`는 `--radius: 0.5rem`과 일치.
- 텍스트색: `DashboardPage.tsx:82-83` (`text-gray-500 dark:text-gray-400` / `text-gray-900 dark:text-white`).
- 1차 버튼 `bg-primary-600`: 46개 파일에서 사용. 오류 배경 `bg-red-50`: 75개 파일.
- 숫자 정렬: `tabular-nums`는 3건뿐(`AnalyticsPage.tsx:257`, `AuditPage.tsx:493,496`) — 규칙으로 신규 작업에 확산 필요. `toLocaleString` 27개 파일.
- 로딩: `Skeleton`/`SkeletonStatCard`(9개 파일 77건), 버튼 내 `Loader2` 57개 파일.

## 4. 기존 화면 수정 제안 (이번에 수행하지 않음)
1. 로그인/회원가입/사이드바 로고 타일의 그라데이션 → 단색 `bg-primary-600` + `rounded-lg`.
2. `git/FileGroup.tsx:202`, `git/WorkingDirectory.tsx:300`, `OrganizationStats.tsx:151` 헤더 그라데이션 → `bg-gray-50 dark:bg-gray-800/50`.
3. `DashboardPage` KPI 4종 → 값은 `text-gray-900`, 상태 의미 있는 "Active"만 green 유지, 아이콘 타일 단일 중성색.
4. `AuditPage.tsx:205` `text-4xl` → `text-2xl`.
5. `TemplateGallery` 필터 칩 → `rounded-md` 세그먼트/탭, `ChannelConfigForm` 💡 → lucide `Info`/`Lightbulb`.
6. `VirtualizedDataTable` 로딩 → `Skeleton` 행.

## 5. 적용 제안 (다음 단계, Developer 수행)
`.claude/rules/frontend-design-defaults.md`로 **별도 파일**을 두고 frontmatter `paths: [src/dashboard/**]`를 붙이길 권한다. `aos-frontend.md`는 코드 패턴(memo·접근성·성능) 규칙이고 이 초안은 시각 기본값이라 관심사가 다르며, 분리해야 반복 개선(패턴 추가)이 기존 규칙 diff를 흔들지 않는다. 경로 스코프 규칙은 해당 경로 작업 시에만 로드돼 전역 컨텍스트 비용이 없다. 중복 방지를 위해 `font-mono` 조항은 `aos-frontend.md`를 정본으로 두고 새 파일은 참조만 한다. CLAUDE.md 포인터 문안(1줄): `- 프론트엔드 시각 기본값(금지 패턴·대체 기준): .claude/rules/frontend-design-defaults.md — 디자인 지시 없는 UI 작업 시 적용`.

## 6. 확인 필요 (영환님 결정)
- **A. 토큰 체계:** 시맨틱 토큰이 `index.css:6-41`에 정의돼 있으나 사용 0건, 실사용은 raw `gray-*` 3,391건. 신규 작업은 (a) 현 관행(raw gray) 유지 — 초안은 이쪽 — 또는 (b) 시맨틱 토큰으로 전환 시작?
- **B. primary 두 벌:** `--primary`(HSL 221°, blue-600 계열, `:64`)와 `--color-primary-*` 스케일(sky `#0ea5e9`, `:12-22`)이 다른 색. 어느 쪽이 브랜드 1차색인지.
- **C. accent violet:** `--accent` 262°(`:70`)와 `accent-light/dark`(`:32-33`)를 신규 강조에 허용할지. 초안은 비허용.
- **D.** 모달 스크림의 `backdrop-blur-sm`(`FeedbackModal.tsx:73`) 허용 여부.
- **E.** uppercase + tracking 섹션 라벨을 허용 관례로 확정할지.
- **F.** 공용 `Button`/`Card`/`EmptyState` 컴포넌트 신설 여부 — 없으면 규칙이 클래스 레시피에 의존.

## 7. 한계
- Codex 리뷰(`/codex:review`)는 이 브리프의 완료 조건에 없어 실행하지 않음.
- 반복 개선 권고: 규칙 적용 후 첫 신규 화면 결과에서 모델이 대신 쓴 스타일을 확인해 목록을 확장.
