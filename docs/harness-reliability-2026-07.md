# 하네스 신뢰성 강화 2026-07 — 문제·해결 기록과 백로그

> 2026-07 하네스 심층 감사(P0~P2)의 후속 작업 기록. 안착 PR: #188(P0/P1), #190(P2 일부 + 드라이런).
> 계약의 현행 정본은 `.claude/skills/aos-feature-harness/SKILL.md`·`.claude/skills/verification-loop/SKILL.md`이며, 이 문서는 "왜 그렇게 됐는가"의 이력이다.

## 1. 발견된 문제와 해결 (PR #188 — P0/P1)

| # | 등급 | 문제 | 해결 |
|---|------|------|------|
| 1 | P0 | **Phase F 게이트가 백엔드 미검증** — verification-loop가 npm 명령만 보유(ruff/mypy/pytest 0줄). 원인: 프론트 전용 스킬(06-06 생성)을 재적응 없이 게이트로 배선(06-20). 부수: 루트 `npm test`가 no-op(exit 0), `build:development`는 유령 스크립트 | CI 7 job과 1:1 정렬된 풀스택 게이트로 재작성 — BE 트랙(CWD src/backend: ruff check/format→mypy→pytest), FE 트랙(CWD src/dashboard: tsc→eslint→test:coverage→build). 전 명령 CWD 명시, watch 금지, 루트 test는 대시보드 위임, 유령 스크립트 제거. 전 명령 실실행 검증 |
| 2 | P0 | **Phase 무검증 스킵** — 실측 3회 중 2회가 D 산출물 없이 G까지 완주. 산출물 확인 관문 부재 | **Phase 전환 관문**: 산출물 실존 또는 `{phase}_SKIPPED.md`(사유·근거·결정주체) 없이는 다음 Phase 진행 금지. 오케스트레이터가 Glob/Read로 직접 확인 |
| 2' | P0 | (Codex 적대 리뷰) 실패를 SKIPPED로 기록해 관문 우회 가능 | **SKIPPED = NOT_APPLICABLE 사전 선언 전용**. 실행 실패는 SKIPPED 불가 — 적용 대상 Phase 2회 실패 = BLOCKED, 이후 Phase 금지 |
| 3 | P1 | **Phase C 실패 정책 자기모순** — "FAIL이면 명시하고 진행" vs "수정 중단·사용자 판단". 경계면 FAIL은 컴파일 녹색인 채 런타임 파손되는 유형이라 '진행'이면 파손 기능 완료 선언 | "2회 초과 FAIL = BLOCKED, D~G 진행 금지, '미완(BLOCKED)' 종료"로 통일 |
| 4 | P1 | **커버리지 임계치 3원화** — 실제(vitest.config.ts) 60/50/55/60 vs 문서 3곳 75/70/60/75, 가짜 config 인용 1곳 | `vitest.config.ts` = 유일 SSOT. 6개 문서에서 수치·가짜 인용 제거, "config Read + test:coverage 통과/실패가 판정" 포인터화. 값 자체는 미변경(사용자 결정: 유지) |
| 5 | P1 | **Learning Protocol 사문화** — 5개 에이전트가 SubagentStop 파싱을 주장하나 훅 미등록(4중 확인) | 프롬프트 절 삭제(#188) → 잔여 구현 `agentLearnings.js`도 완전 제거+문서 동기화(#190, 사용자 결정) |
| 6 | P1 | **읽기 전용 에이전트 산출물 계약 충돌** — 전원에게 "파일 저장" 지시하나 integration-qa/code·security-reviewer는 Write 없음 | planner 특례를 일반화: **Write 없는 4종은 반환값 제출 → 오케스트레이터 저장**. 디스패치 프롬프트 이원화 |
| 7 | P1 | **Phase D 백엔드 테스트 소유권 공백** — D 담당이 대시보드 전용, pytest asyncio 마커 함정 미기록 | 작성=backend-integration-specialist(Phase B 동반), D=pytest 실행·보고 계약(명령·CWD·개수). `aos-backend.md`에 마커 규칙 추가 |

## 2. P2 착수분 (PR #190)

| 항목 | 문제 | 해결 |
|------|------|------|
| RUN_STATE (#9·#13) | 재개 판별이 파일 존재 추론 의존, Phase별 소요·재시도 미기록 | `_workspace/RUN_STATE.md` — 상태/시도/타임스탬프 표를 상태 변화마다 갱신. 재개의 진실원 + 관측성 |
| 리뷰 델타화 (#10) | 리뷰어가 raw git diff 전체를 봐서 무관 변경 혼입 | Phase E 입력에 baseline 포함, "(현재−baseline) 델타만 리뷰" (docs-sync 규칙 재사용) |

## 3. 드라이런 실증 (헬스 배지 기능, A→G 완주)

- 12개 산출물 전부 실존(완결성 관문), SKIPPED 사전 선언 계약 작동, E-1 API 오류는 재시도로 해소(우회 없음), RUN_STATE에서 Phase별 소요·재시도 표 확보
- **F1 검출**: tsc/eslint 녹색 상태에서 integration-qa가 "prod에서 `VITE_API_URL||'/api'`+`/health` 조합이 app.py:486 스텁 도달 → 배지 영구 Offline" 결함을 검출 → `getApiUrl('/api/health')` 정렬 수정 → 재검증 PASS → prod URL 단언 테스트로 회귀 잠금
- 게이트: 로컬·CI 전부 녹색 (FE 4342 tests, 커버리지 71.5/66.3/67.6/72.8)

## 4. 백로그 (순서 = 우선순위)

| # | 항목 | 내용 | 상태 (2026-07-19) |
|---|------|------|------|
| ① | 헤더 배지 URL 관례 분열 | 3종 폴백 관례(`'/api'` 9곳=prod 파손형 F1 동일, `''` 2곳=정상, `localhost:8000` 3곳=dev 프록시 우회)를 전수 조사 후 **16파일 전부 `getApiUrl('/api/...')`로 통일** (+70/−87). admin `API_BASE` export 제거. raw `VITE_API_URL` 잔여 0건(grep), 전체 4342 tests 0 failed | **완료** |
| ② | Phase A 승인 AFK 정책 | "~5분 무응답 시: 저위험+사전 위임=원안 자동 승인(RUN_STATE·최종 보고 명시, 사후 거부권) / 고위험(스키마·데이터·외부 발신·비가역)=BLOCKED 대기, 모호하면 고위험" 명문화 | **완료** (SKILL.md Phase A) |
| ③ | F 게이트 detach 패턴 | "2분+ 명령은 `nohup ... & disown` 후 로그의 종결 산출로 판정, 부분 로그 ≠ 통과" 명문화 | **완료** (verification-loop) |
| ④ | Codex E-3 배선 | 옵션 E-3(3+ 파일·보안 민감·사용자 요청 시) — companion 스크립트 실행, `E_codex_review.md` 저장, 미실행 시 `E3_SKIPPED.md`. **주의: 현 워크스페이스엔 Codex CLI 미설치**(`npm i -g @openai/codex` + `/codex:setup` 필요) | **완료(배선)** / 실행환경 미비 |
| ⑤ | 게이트 4중 정의 통합 | verification-loop = 유일 SSOT 선언. aos-workflow "배포 전 검증"과 check-health 상단을 포인터화(check-health 고유 가치=audit·구조검증·스코어만 유지) | **완료** |
| ⑥ | 스테일 정리 | test-automation-specialist: `model: haiku`→`opus`, Jest→Vitest 잔재 2곳, `.temp/agent_workspaces` 제거, proposals 문구→하네스 용어, Last Updated 갱신. check-health `.claudecode.json`(부재 파일)→실존 파일. aos-workflow 복잡도표에 "하네스 예외(표=Phase B 빌드 에이전트 수)" 명시 | **완료** |
| ⑦ | duration util 통합 | 전수 6개 조사 → **byte-identical 그룹(CheckCard+WorkflowCheckCard)만** `lib/formatDuration.ts`로 통합(출력 보존). `!seconds→'-'` 0초 버그는 WorkflowRunsTable·InteractiveDAG 2곳에만 실존 — 제자리 수정+Red-Green 회귀 테스트. 나머지 4곳은 출력 상이로 의도적 미통합(표 기록) | **완료(보수적)** |
| ⑧ | 죽은 `/health` 마운트 | **제거 금지로 판정 변경**: bare 마운트는 `/health` 한 경로만 스텁에 가려질 뿐 `/health/live`·`/health/ready` 등 프로브용 하위 경로를 단독 서빙. → app.py 스텁·마운트 양쪽에 섀도잉 경고 주석 추가(동작 변화 0). 완전 정리는 외부 프로브 의존 감사 후에만 가능 | **완료(주석 명시)** |
| ⑨ | 커버리지 임계치 상향 | 실측 71.4% vs 60 — 래칫 상향은 사용자 결정 사항 | **완료** (아래 잔여 3건) |

## 5. 잔여 3건 처리 (2026-07-19, 사용자 지시)

| 항목 | 내용 | 결과 |
|------|------|------|
| 커버리지 래칫 | `vitest.config.ts` thresholds 60/50/55/60 → **65/60/60/65** (실측 71.5/66.2/67.6/72.7 대비 5~7%p 여유). `test:coverage` 4348 passed·임계치 충족 확인 | 완료 |
| Codex CLI | `npm i -g @openai/codex` → **0.144.6 설치**, companion status 정상. E-3 배선을 이번 변경 diff에 대한 적대 리뷰 실행으로 end-to-end 실증 | 완료 |
| `/health` 근본 정리 | **프로브 의존 감사 결과**: helm이 liveness·readiness **둘 다** bare `/health`(항상 200 스텁)를 가리켜 프로브가 무력화 상태였고, Docker HEALTHCHECK류도 동일. 스텁을 그냥 제거하면 liveness가 의존성 검사(rich 핸들러)에 물려 **DB 장애 시 파드 재시작 루프** 위험 → **프로브 분리 먼저**: liveness→`/health/live`(항상 200, `liveness_probe()` 무의존성 확인), readiness/HEALTHCHECK→`/health/ready`(`readiness_probe()`가 실제 의존성 검사·HEALTHY/DEGRADED만 통과 확인). 그 후 app-level 스텁 제거 — bare `/health` = rich 핸들러(status/version/uptime, 200/503)로 `/api/health`와 통일. `railway_mode` 필드는 소비자 0 확인 후 소멸 | 완료 |
| ↳ Codex E-3 적대 리뷰 반영 | 1차 감사(infra/ grep)가 놓친 소비자를 Codex 교차 조사가 노출 → **루트 `docker-compose.yml`**, **`infra/k8s/base/backend-deployment.yaml`**(helm과 별개 raw 매니페스트, liveness·readiness 둘 다 /health), **`src/backend/Dockerfile.full`** 추가 수정. **`src/backend/railway.toml`(healthcheckPath=/health)은 의도적 무변경** — railway는 `Dockerfile`→`app_railway:app`(별도 경량 앱, 자체 항상-200 `/health` 보유·`/health/ready` 없음)를 서빙하므로 변경 시 404로 파손. helm test-connection(wget /health)·docs 예시(curl -f /health)는 rich 200 응답과 호환(무변경) | 완료 |
