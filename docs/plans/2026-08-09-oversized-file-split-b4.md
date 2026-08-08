# Batch 4 — 프론트 페이지·컴포넌트 분할 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
>
> **상위 계획**: `docs/plans/2026-08-04-oversized-file-split.md` (B1·B2·B3 완료)
> **직전 배치**: `docs/plans/2026-08-08-oversized-file-split-b3.md` — 그 문서의 "B2와 안전 논거가 뒤집힌다" 절과 정정 블록들을 먼저 읽을 것

**상태: 착수 준비 완료 (2026-08-09).** 인벤토리·소비자·안전망·선례 실측이 전부 끝났고
태스크 순서가 확정됐다. 실측 과정에서 **사용자 결정 2번(훅 추출)이 폐기되고 섹션 추출로
교체**됐다 — "AnalyticsPage 처방 정정" 절 참조. 다음 세션은 Task 1(`NotificationRuleEditor`)
부터 바로 착수하면 된다.

**Goal:** 800줄 한도를 넘는 프론트 페이지·컴포넌트 3개(3,799줄)를 동작 보존 분할로 한도 이내로 되돌린다.

**Tech Stack:** React 19 / TypeScript / Vitest / Tailwind

---

## 사용자 결정 (2026-08-09)

1. **B4 대상은 3개다.** 상위 계획의 "프론트 페이지·컴포넌트 4종 5,547줄" 중
   `PlaygroundPage.tsx`(1,748줄)를 **제외**한다 — 최상위 정의가 2개인데 `useState`가 26개인
   **단일 거대 컴포넌트**라 B6(`TaskAnalyzer.tsx` 포함)의 성질이다. 파일 분할이 아니라
   상태 구조 재설계 문제이므로 별도 판단 대상으로 미룬다.
2. ~~**`AnalyticsPage`는 데이터 페칭 훅 추출까지 간다.**~~ **폐기 (2026-08-09 실측).**
   아래 "AnalyticsPage 처방 정정" 참조 — 뽑을 페칭 코드가 없고, 뽑아도 한도에 못 들어간다.
   대신 **JSX 섹션 컴포넌트 추출**로 간다.

---

## 인벤토리 (실측 2026-08-09)

| 파일 | 총 | 타입·상수 | 서브컴포넌트 | 헬퍼 | 메인 컴포넌트 | 파일분할 후 잔여 | 테스트 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `components/notifications/NotificationRuleEditor.tsx` | 1,156 | 164 | 260 | — | 691 | **725 ✅** | 1,426줄 |
| `components/git/WorkingDirectory.tsx` | 952 | 73 | 345 | — | 505 | **535 ✅** | **287줄** |
| `pages/AnalyticsPage.tsx` | 1,691 | 248 | 307 | 125 | **878** | **941 ❌** | 1,915줄 |

**핵심 발견**: 같은 배치 안에서 필요한 수술의 깊이가 다르다. 앞의 둘은 파일 분할만으로
한도에 들어가지만, `AnalyticsPage`는 메인 컴포넌트 878줄을 줄여야 한다. B3에서
`claudeSessions`(타입 추출만) vs `git`·`projectConfigs`(액션 승격 필요)가 갈렸던 것과 같은 구조다.

### 파일별 내부 구조 (실측 라인)

**`NotificationRuleEditor.tsx`**
- 35–198 타입 7종 + 상수 5종 (`CHANNEL_ICONS` · `CHANNEL_COLORS` · `EVENT_LABELS` · `PRIORITY_COLORS`)
- 199–889 `NotificationRuleEditor` (691줄)
- 890–1157 `ChannelConfigFormProps` + `ChannelConfigForm` (260줄)

**`WorkingDirectory.tsx`**
- 31–103 `ViewMode` · `WorkingDirectoryProps`
- 104–226 `FileItem` (123줄)
- 227–300 `StagedDiffReviewPanel` (74줄)
- 301–374 `SensitiveFilesDialog` (74줄)
- 375–448 `HunkStagingPanel` (74줄)
- 449–953 `WorkingDirectory` (505줄)

**`AnalyticsPage.tsx`**
- 64–311 타입 17종 + 상수 6종 (`TIME_RANGES` · `CHART_COLORS` · `PROVIDER_COLORS` · `PROVIDER_LABELS` · `DAY_LABELS` · `strategyIcons`)
- 312–1189 `AnalyticsPage` (**878줄**) ← 훅 추출 대상
- 1190–1286 `MetricCard`(25) · `CostComparisonCard`(30) · `ChartCard`(20)
- 1287–1442 `EvalDetailView` (156줄)
- 1443–1518 `ActivityHeatmapChart` (76줄)
- 1537–1686 헬퍼 5종: `formatTrendLabel`(18) · `transformMultiSeriesData`(17) ·
  `buildModelTokenBreakdown`(53) · `normalizeProvider`(22) · `renderAosModelSourceBadge`(15)

---

## 착수 전 실측 — 완료 (2026-08-09)

B3에서 **인벤토리 실측은 0번 틀렸고 주장·처방만 6번 틀렸다.** 아래 5건을 실측했고,
그 결과 이 계획의 처방 하나가 폐기됐다(사용자 결정 2번).

- [x] **소비자 전수 조사** — dotall 로 측정(`\{[^{}]*\}` 로 중첩·과탐욕 회피). **세 파일 모두 소비자 1건뿐이다.**

  | 파일 | 소비자 | 가져가는 이름 |
  |---|---|---|
  | `NotificationRuleEditor` | 자기 테스트 | `NotificationRuleEditor` (named) |
  | `WorkingDirectory` | 자기 테스트 | `WorkingDirectory` (named) |
  | `AnalyticsPage` | `routes.tsx:59` | **`AnalyticsPage` (named)** — 아래 경고 |

  > **⚠️ `AnalyticsPage` 의 계약은 default 가 아니라 named 다.**
  > `routes.tsx:59` 는 `import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage as React.ComponentType<...> }))`
  > 이다. lazy import 지만 가져가는 이름은 named 이며, **`as` 캐스트 때문에 `tsc` 가 이름
  > 유실을 잡지 못한다** — 패키지 승격 후 `index.tsx` 가 `AnalyticsPage` 를 named 로
  > 내보내지 않으면 런타임에 `undefined` 컴포넌트로 조용히 깨진다.

- [x] **테스트가 내부 구조를 참조하는가** → **패치 타깃 0건.** 세 테스트 모두 대상 컴포넌트만
      import 하고(`from '../WorkingDirectory'` 형태) 서브컴포넌트를 직접 렌더하거나 내부를
      패치하지 않는다. `AnalyticsPage.test.tsx` 는 `getByTestId` 를 쓰지만 DOM 표면이지
      모듈 내부가 아니다.
- [x] **`WorkingDirectory` 의 얇은 안전망** — 287줄에 **테스트 23케이스**(`describe` 1개).
      줄수는 얇지만 케이스 밀도는 있다. 서브컴포넌트 4개를 옮기므로 레시피가 한 번 검증된
      뒤에 착수하는 것으로 충분하다 — **별도 characterization 은 만들지 않는다.**
- [x] **`AnalyticsPage` 데이터 페칭 비중** → **처방 폐기.** 아래 절 참조.
- [x] **컴포넌트 분할 선례** — 배럴(`components/{organizations,monitor,...}/index.ts` 10건)이
      아니라 **한 컴포넌트를 쪼갠 구조**가 이미 있다:
      `components/claude-sessions/TranscriptViewer.tsx`(502줄)와
      `components/feedback/TaskEvaluationCard.tsx`(162줄)는 같은 디렉토리에 있으면서
      **`index.ts` 가 재노출하지 않는 내부 전용 서브컴포넌트**다.
      **B4 는 이 배치를 따른다** — 디렉토리 + `index.ts` 는 공개 이름만.

---

## AnalyticsPage 처방 정정 (2026-08-09 실측)

**폐기된 처방**: `useAnalyticsData` 훅으로 데이터 페칭 분리 → 800 미만.

**왜 틀렸나** — 메인 컴포넌트 878줄(312–1189)을 실측하니:

| 항목 | 실측 |
|---|---|
| `return (` 이전 로직부 | **132줄** |
| JSX | **~746줄** |
| `apiClient` · `fetch` 호출 | **0건** — 데이터는 Zustand 스토어에서 온다 (`useProjectsStore` · `useAuthStore` · `useExternalUsageStore`) |
| `useEffect` | 5개 (스토어 액션 동기화) |
| `useMemo` · `useCallback` | 0개 |

뽑아낼 페칭 코드가 없고, 로직부를 통째로 뽑아도 **941 − 132 = 809 > 800** 이라 한도에 못 든다.

**대체 처방: JSX 섹션 컴포넌트 추출.** 섹션별 줄수 대비 state 읽기 수(비율이 높을수록
prop 부담 대비 이득이 크다):

| 원본 줄 | 줄수 | 읽는 state | 비율 | 섹션 |
|---|---:|---:|---:|---|
| 765–831 | 67 | 1 | 67.0 | 차트 그리드 |
| 650–764 | 115 | 2 | 57.5 | 차트 그리드 |
| 578–649 | 72 | 2 | 36.0 | 차트 그리드 |
| 932–1189 | 258 | 8 | 32.2 | Model Details |
| 514–577 | 64 | 2 | 32.0 | KPI 카드 |
| 833–925 | 93 | 5 | 18.6 | 프로젝트 비교 |
| 446–513 | 68 | 4 | 17.0 | 헤더·필터 |

**비율 상위 3개(765–831 · 650–764 · 578–649)만으로 254줄이 빠지고 props 는 state 5개뿐이다
→ 941 − 254 = 687 ✅.** 차트 그리드라 데이터만 내려보내면 된다.

**이것이 `AnalyticsPage` 를 B6 로 미루지 않는 근거다.** `PlaygroundPage`(제외됨)는
최상위 정의 2개에 `useState` 26개인 단일 거대 컴포넌트라 prop 표면이 폭발하지만,
`AnalyticsPage` 는 섹션이 상태를 거의 읽지 않는다. **판정 지표는 줄수가 아니라 이 비율이다.**

---

## 안전망 — B3 와 무엇이 같고 다른가

| 그물 | B4 에서 |
|---|---|
| `tsc --noEmit` | **동일하게 주력.** 소비자 전 파일의 export 유실·개명·타입 불일치 |
| 기존 테스트 | `NotificationRuleEditor` 1,426 · `AnalyticsPage` 1,915 는 두껍고, **`WorkingDirectory` 287 은 얇다** |
| 표면 스냅샷 | **적용 불가.** Zustand 스토어의 `getState()` 같은 관측 지점이 컴포넌트에는 없다 |
| 위임·arity 검사 | **적용 불가.** 스텁 위임 구조가 없다 |

B3 의 세 신규 그물(`storeSurface` · `delegation` · `arity`)은 **스토어 전용**이다.
`src/dashboard/src/stores/__tests__/` 에 그대로 두고 B4 로 끌어오려 하지 마라.

**B4 의 하중 지지대는 "컴포넌트 본문이 바뀌지 않는다"** 이다 — 서브컴포넌트를 파일로 옮길 때
JSX·props·훅 호출 순서를 한 글자도 바꾸지 않는다. 훅 호출 순서가 바뀌면 React 가 상태를
잘못 매칭한다(rules-of-hooks). `AnalyticsPage` 의 훅 추출 태스크만 이 규칙의 예외이며,
그래서 별도 태스크로 분리했다.

---

## 태스크 순서 (확정 2026-08-09)

B1→B3 의 "레시피를 가장 싼 대상에서, 가장 두꺼운 그물 아래서 검증한다" 를 계승한다.

| 순서 | 파일 | 결과 | 근거 |
|---|---|---|---|
| **1** | `NotificationRuleEditor` (1,156) | → 725 | 파일 분할만으로 한도 통과. 테스트 1,426줄로 그물이 가장 두껍다. 서브컴포넌트가 1개(`ChannelConfigForm`)뿐이라 레시피가 가장 단순 — **여기서 정한 디렉토리 배치가 나머지 둘의 선례가 된다** |
| **2** | `WorkingDirectory` (952) | → 535 | 서브컴포넌트 4개 이동. 테스트 287줄/23케이스로 얇지만 밀도는 있다. 레시피가 한 번 검증된 뒤 착수 |
| **3a** | `AnalyticsPage` 파일 분할 | → 941 | 타입 17종·상수 6종·서브컴포넌트 5종·헬퍼 5종 추출. **한도 초과 상태로 끝나는 것이 의도된 것** |
| **3b** | `AnalyticsPage` 섹션 추출 | → **687** | 비율 상위 3섹션(254줄, props state 5개)을 컴포넌트로. **이 배치의 유일한 판단 작업** |

3a/3b 를 가르는 이유는 B3 의 Task 4/5, 7/8 과 같다 — 기계적 이동과 판단 작업을 한 커밋에
섞으면 리뷰가 둘을 구별할 수 없다. 3a 는 정의를 **이름 그대로** 옮기는 작업이고, 3b 는
**새 컴포넌트 경계와 props 를 만드는** 작업이다.

### 각 파일의 공통 절차

1. **패키지 승격** — `X.tsx` → `X/index.tsx`(또는 `X/X.tsx` + `index.ts`). 내용 무변경,
   `git mv` 로 rename 추적. 소비자 import 경로(`from '@/components/.../X'`)는 디렉토리
   해석으로 그대로 유효하다.
2. **정의 이동** — 타입·상수·서브컴포넌트·헬퍼를 도메인별 파일로. **JSX·props·훅 호출
   순서를 한 글자도 바꾸지 않는다.**
3. **`index.ts` 는 공개 이름만 재노출** — 위 실측의 소비자 목록(파일당 1개)으로 좁힌다.
   내부 전용 서브컴포넌트는 재노출하지 않는다(`claude-sessions/TranscriptViewer` 선례).
4. **게이트** — `tsc --noEmit` → ESLint → `vitest run` → `build`.

### 분할 결과 검증 — `split_audit.py` 를 쓸 수 없다

B2 에서 만든 `tests/backend/api/split_audit.py` 는 **Python AST 전용**이라 `.tsx` 에
적용되지 않는다. B4 의 대응물은 **`tsc --noEmit` + 기존 테스트**이며, 그래서 B4 의 하중
지지대는 "컴포넌트 본문이 바뀌지 않는다" 하나뿐이다.

`sed` 라인 슬라이스로 정의를 옮길 때 **범위 밖으로 마지막 줄이 밀려 사라지는 결함**이
B2 `claude_sessions` 에서 실제로 발생했다(`return results` 유실). TypeScript 에서는
`tsc` 가 대부분 잡지만(`Missing return`·미사용 변수), **JSX 마지막 닫는 태그가 사라지면
파싱 에러로 즉시 드러나므로** Python 보다 조용한 실패 여지가 작다. 그래도 **정의 단위
경계(`export const X = ...` 시작 ~ 다음 `export` 직전)로 자르고, 옮긴 뒤 원본과
`diff` 하지 말고 `tsc` 와 테스트로 검증한다** — 라인 산술 자기 확인은 그물이 아니다(B2 실측).

---

## 게이트

`verification-loop` 스킬의 프론트 트랙: `tsc --noEmit` + ESLint + `vitest run` + `build`.
**프론트에는 알려진 플레이크가 없다 — 실패는 전부 진짜다.**

`vitest run` 은 커버리지 임계치를 평가하지 않는다. PR 전에 `npm run test:coverage` 를 별도로
돌려 `vitest.config.ts` 의 65/60/60/65 를 확인할 것 (B3 최종 리뷰가 지적한 사각지대).

---

## B3 에서 가져올 운용 교훈

1. **커밋 후 `git show --stat HEAD` 로 군더더기 확인.** 이 레포의 pre-commit 훅이 무관한
   미추적 파일(`paseo.json`)을 커밋에 쓸어 담은 실측 사례가 있다. `git add` 로 범위를
   좁히는 것만으로는 부족하다.
2. **셸 CWD 가 Bash 호출 간 유지된다.** `cd src/dashboard` 후에는 `src/dashboard/...` 경로가
   pathspec 오류를 낸다. B3 에서 네 태스크가 걸렸다.
3. **`export type { X } from './types'` 는 지역 바인딩을 만들지 않는다.** 재노출 목록과
   "그 파일이 자기 본문에서 쓰는 이름" 은 **서로 다른 집합**이다. B3 에서 세 태스크 연속으로
   `tsc` 가 메웠다.
4. **Vitest 에서 `import.meta.url` 은 `http:` URL 이다.** `node:fs` 가 읽기·쓰기 양쪽을
   거부한다. 파일을 읽어야 하면 Vite 의 `?raw` import 를 쓴다.
5. **검사가 잡는다고 적은 것을 결함 주입으로 확인하라.** B3 에서 안전망이 세 번 불완전했고
   세 번 다 이 방법으로 드러났다. 마지막 한 번은 **검사가 자기가 제공하지 않는 보증을
   주장하는 것** 이었고, 그것이 최종 리뷰의 유일한 차단 사유였다.
