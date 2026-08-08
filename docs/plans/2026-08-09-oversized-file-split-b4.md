# Batch 4 — 프론트 페이지·컴포넌트 분할 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
>
> **상위 계획**: `docs/plans/2026-08-04-oversized-file-split.md` (B1·B2·B3 완료)
> **직전 배치**: `docs/plans/2026-08-08-oversized-file-split-b3.md` — 그 문서의 "B2와 안전 논거가 뒤집힌다" 절과 정정 블록들을 먼저 읽을 것

**상태: 착수 전.** 아래 인벤토리는 **2026-08-09 실측**이며, 사용자 결정 2건이 반영돼 있다.
다음 세션은 이 문서의 태스크 분해부터 이어서 작성하면 된다.

**Goal:** 800줄 한도를 넘는 프론트 페이지·컴포넌트 3개(3,799줄)를 동작 보존 분할로 한도 이내로 되돌린다.

**Tech Stack:** React 19 / TypeScript / Vitest / Tailwind

---

## 사용자 결정 (2026-08-09)

1. **B4 대상은 3개다.** 상위 계획의 "프론트 페이지·컴포넌트 4종 5,547줄" 중
   `PlaygroundPage.tsx`(1,748줄)를 **제외**한다 — 최상위 정의가 2개인데 `useState`가 26개인
   **단일 거대 컴포넌트**라 B6(`TaskAnalyzer.tsx` 포함)의 성질이다. 파일 분할이 아니라
   상태 구조 재설계 문제이므로 별도 판단 대상으로 미룬다.
2. **`AnalyticsPage`는 데이터 페칭 훅 추출까지 간다.** 파일 분할만으로는 941줄이 남아
   한도에 못 들어간다(아래 실측). 훅 추출은 렌더 타이밍을 바꿀 수 있으므로 **별도 태스크**로
   분리한다.

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

## 착수 전 반드시 실측할 것

B3에서 **인벤토리 실측은 0번 틀렸고 주장·처방만 6번 틀렸다.** 아래는 아직 실측하지 않은
항목들이며, 계획을 완성하기 전에 채워야 한다.

- [ ] **소비자 전수 조사** — 세 파일 각각을 import 하는 파일과 가져가는 이름.
      **한 줄 grep 을 쓰지 마라** — B3 에서 멀티라인 `import type {` 를 놓쳐 4개가 빠졌다.
      dotall(`s`) 플래그 방식은 B3 계획서의 "소비자가 실제로 가져가는 이름" 절에 스크립트가 있다.
- [ ] **테스트가 내부 구조를 참조하는가** — B3 는 훅 하나만 import 해서 패치 타깃이 0건이었다.
      컴포넌트 테스트는 서브컴포넌트를 직접 렌더하거나 `getByTestId` 로 내부에 닿을 수 있다.
- [ ] **`WorkingDirectory` 의 얇은 안전망 대응** — 952줄에 테스트 287줄뿐이다. B4 의
      "안전망 두꺼움" 전제가 이 파일에는 성립하지 않는다. 분할 전 characterization 이 필요한지
      판단할 것 (렌더 스냅샷? 서브컴포넌트별 최소 테스트?).
- [ ] **`AnalyticsPage` 의 878줄 안에서 데이터 페칭이 차지하는 비중** — `useEffect` ·
      `apiClient` 호출 · 로딩/에러 상태를 세어 `useAnalyticsData` 훅으로 뽑았을 때 몇 줄이
      빠지는지. 941 − (뽑은 줄) < 800 이어야 이 배치가 성립한다.
- [ ] **컴포넌트 분할 선례** — 이 레포에 이미 나뉜 페이지/컴포넌트가 있는지
      (`stores/orchestration/` 이 B3 의 선례였던 것처럼). 있으면 그 구조를 따른다.

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

## 태스크 순서 (초안 — 다음 세션이 확정할 것)

B1→B3 의 "레시피를 가장 싼 대상에서, 가장 두꺼운 그물 아래서 검증한다" 를 계승한다.

| 순서 | 파일 | 근거 |
|---|---|---|
| **1** | `NotificationRuleEditor` (1,156) | 파일 분할만으로 725줄. 테스트 1,426줄로 그물이 가장 두껍다. 서브컴포넌트가 1개(`ChannelConfigForm`)뿐이라 레시피가 가장 단순 |
| **2** | `WorkingDirectory` (952) | 파일 분할만으로 535줄이지만 **테스트가 287줄뿐**이다. 레시피가 한 번 검증된 뒤에, 필요하면 characterization 을 선행해 착수 |
| **3a** | `AnalyticsPage` 파일 분할 | 타입·서브컴포넌트·헬퍼 추출 → 941줄 (한도 초과 상태로 끝남, 의도된 것) |
| **3b** | `AnalyticsPage` 훅 추출 | `useAnalyticsData` 로 데이터 페칭 분리 → 800 미만. **이 배치의 유일한 판단 작업** |

3a/3b 를 가르는 이유는 B3 의 Task 4/5, 7/8 과 같다 — 기계적 이동과 판단 작업을 한 커밋에
섞으면 리뷰가 둘을 구별할 수 없다.

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
