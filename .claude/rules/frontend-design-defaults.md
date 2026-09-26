---
paths:
  - "src/dashboard/**"
---

# Frontend Design Defaults

대상: `src/dashboard/**`. AOS는 운영 대시보드다 — 절제된 실무형 UI, 명확한 정보 계층, 높은 정보 밀도.
"AI 느낌 피하기" 같은 일반 지시 대신 아래의 **구체 패턴**을 피한다. 결과물이 다른 기본 스타일로 새면 이 목록에 추가한다.
근거·현황(파일:라인)은 `docs/design-rules/REPORT-opus55-design-defaults.md`.

## Don't — 신규 작업에서 쓰지 않는다
1. 그라데이션 배경·로고 타일, 특히 blue→violet(`from-primary-500 to-accent`, `from-blue-* to-purple-*`).
2. 지표마다 다른 색을 입힌 KPI 카드(값 색 + 색조 아이콘 타일 세트). 색은 상태 의미가 있을 때만.
3. 히어로급 숫자(`text-4xl` 이상)·거대한 헤드라인. 대시보드 수치는 `text-2xl` 상한.
4. 큰 라운드(`rounded-2xl`/`3xl`)와 pill 형태 버튼·필터 칩. 버튼은 `rounded-md`/`rounded-lg`.
5. 이모지를 아이콘·강조로 쓰기(💡✨🚀 등). 아이콘은 `lucide-react`.
6. 콘텐츠 표면의 글래스모피즘(`backdrop-blur` + 반투명 카드). 모달 스크림 외 사용 금지.
7. 카드·패널의 큰 그림자(`shadow-lg` 이상). 큰 그림자는 모달·드로어 전용.
8. 크림/오프화이트/베이지 배경. 라이트 배경은 흰색(`--background: 0 0% 100%`)과 `gray-50`.
9. 헤드라인 속 이탤릭 강조어, 세리프 디스플레이 폰트. 폰트는 `--font-sans`(Inter) 하나.
10. "01/02/03" 식 섹션 번호 라벨, 장식용 monospace 라벨. `font-mono` 허용 범위는 `aos-frontend.md`(코드 컨텍스트 한정)가 정본.
11. 의미 없는 hero 영역·일러스트·마케팅 문구(환영 배너, "Supercharge your…"). 첫 화면은 데이터.
12. 장식 애니메이션(`hover:scale`, `animate-bounce`, 떠다니는 요소). `animate-ping`은 라이브 상태 점에만.
13. 로딩 상태를 직접 만든 원형 스피너로 대신하기(목록·표·카드). 스켈레톤을 쓴다.
14. 과도한 여백으로 밀도를 낮추기(데이터 카드 `p-8` 이상, 섹션 간 `gap-12` 이상. 빈 상태 중앙 영역의 `p-8`은 허용).

## Do — 대신 이것을 쓴다 (저장소에 실제로 있는 것)
- 색: 텍스트 `text-gray-900 dark:text-white`(1차) / `text-gray-500 dark:text-gray-400`(2차),
  경계 `border-gray-200 dark:border-gray-700`, 강조 `primary-600 dark:primary-400`(index.css `--color-primary-*`).
  상태색은 의미 고정: 성공 green, 경고 amber, 오류 red. violet `accent`는 신규 강조에 쓰지 않는다(확인 필요).
- 카드: `bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4`
  (`DashboardPage.tsx:79`, `SkeletonStatCard`). 그림자는 없음 또는 `shadow-sm`.
- 타이포: 페이지 제목 `text-xl`~`text-2xl font-semibold`, 섹션 제목 `text-sm`~`text-base font-semibold`,
  라벨 `text-sm text-gray-500`, 보조 `text-xs`. 굵기로 계층을 만들고 색·크기 남발 금지.
- 간격: 페이지 `p-6`, 그리드 `gap-4`~`gap-6`, 카드 `p-4`. 반응형 `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`.
- 버튼: `px-3 py-1.5 text-sm rounded-md`(또는 `rounded-lg`), 1차 `bg-primary-600 text-white`,
  2차 `border border-gray-300 dark:border-gray-600`. 공용 Button 컴포넌트 부재 — 신설 여부 확인 필요.
- 표·수치: 목록은 `VirtualizedDataTable` + `Pagination`(`components/common/`).
  숫자 열은 `text-right tabular-nums`, 천 단위 `toLocaleString()`, 단위는 헤더에.
- 로딩: `Skeleton`, `SkeletonStatCard`(`components/ui/Skeleton.tsx`), 화면 단위는 `components/skeletons/*`.
  버튼 안 짧은 대기만 `RefreshCw`/`Loader2` + `animate-spin` 허용.
- 빈 상태: 아이콘 1개 + 한 줄 설명 + (가능하면) 다음 행동 버튼, 회색 톤. 공용 EmptyState 부재 — 신설 확인 필요.
- 오류: 인라인 `border-red-200 bg-red-50 text-red-700 dark:…` + 재시도 버튼, 원인 문구를 그대로 표시.
- 클래스 조합은 `cn()`(`@/lib/utils`), 다크모드 `dark:` 필수(기존 `aos-frontend.md` 준수).

## 기존 화면
위 금지 패턴이 기존 화면에 있으면(REPORT 참조) **이번 작업 범위가 아닌 한 수정하지 않는다** — 제안으로만 남긴다.
