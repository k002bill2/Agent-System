# CLAUDE.md

AOS (Agent Orchestration Service) - LangGraph 기반 멀티 에이전트 오케스트레이션 서비스.

## Quick Start

```bash
# 인프라 (Postgres, Redis, Qdrant) — shared-infra 공용 스택을 기동
cd infra/scripts && ./dev.sh

# Backend
cd src/backend && uv pip install -e . && uvicorn api.app:app --reload

# Dashboard
cd src/dashboard && npm install && npm run dev
```

Backend: `localhost:8000` | Dashboard: `localhost:5173` | 환경변수: @.env.example 참조

AOS는 자체 DB 스택을 띄우지 않고 `~/Work/shared-infra`를 공유합니다 (ppt-maker, image-maker도 동일). `dev.sh`/`start-all.sh`/`stop-all.sh`는 모두 shared-infra를 대상으로 동작합니다.

## 새 프로젝트를 shared-infra에 합치기

기존 DB를 보존하면서 새 프로젝트용 DB만 추가합니다.

```bash
cd ~/Work/shared-infra
./add-project.sh <db_name> <redis_db_number>
# 예: ./add-project.sh livemetro 3
```

스크립트가 `init-databases.sql` append + 실행 중인 `shared-postgres`에 idempotent SQL 적용. 기존 aos/elitedeck/image_maker 데이터는 건드리지 않음.

**절대 금지**: `docker compose down -v`, `docker volume rm shared-infra_*` — 모든 프로젝트 데이터 소실.

## Testing

```bash
# Backend
cd src/backend && pytest ../../tests/backend

# Dashboard (Vitest)
cd src/dashboard && npm test

# 전체 검증 (tsc + lint + test + build)
/check-health
```

## Common Pitfalls

- Docker 포트 충돌 시 `.env`의 `PG_PORT`, `REDIS_PORT` 등으로 오버라이드
- Vite proxy 설정(`vite.config.ts`)이 `/api` → `localhost:8000`으로 프록시함
- Zustand store 테스트 시 각 테스트마다 store 리셋 필요 (격리)
- SQLAlchemy async session은 반드시 `async with` 패턴 사용 (수동 close 금지)
- CORS 문제 발생 시 `.env`의 `CORS_ORIGINS` 확인
- `docker compose` 명령은 `~/Work/shared-infra/docker-compose.yml`을 대상. `infra/docker/docker-compose.yml`은 더 이상 DB 스택 소스가 아님 (빌드/배포 참조용)

## 하네스: AOS 기능 개발

**목표:** 풀스택 기능을 계획→빌드(백엔드∥프론트)→통합검증→테스트→리뷰→문서동기화까지 전문 에이전트 팀으로 자동 조율.

**트리거:** 풀스택/엔드투엔드 기능 개발·수정·부분 재실행 요청 시 `aos-feature-harness` 스킬을 사용하라. 단순 단일 파일 수정·질문은 직접 처리.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-20 | 초기 구성 (서브에이전트 모드, 기존 6 에이전트 재사용) | aos-feature-harness, integration-qa | 전문가 에이전트는 있으나 조율 레이어 부재 |
| 2026-06-20 | Phase 7 진화: planner 영속화 명시, `_workspace/` gitignore, integration-qa 픽스처 fan-out 체크 추가 | SKILL.md, integration-qa.md, .gitignore | 드라이런 스모크 테스트가 드러낸 개선점 |
| 2026-06-20 | docs-sync 에이전트 추가 (Phase G: F 게이트 통과 후 변경 델타↔mandatory-docs 매핑으로 docs/ 자동 동기화) | docs-sync.md, SKILL.md | 구현 후 문서 갱신 Phase 부재 (mandatory-docs 갭) |
| 2026-06-20 | 정비: B-2에 `verify-frontend` 배선(B-1의 verify-backend와 대칭 복원) | SKILL.md | 감사에서 프론트 패턴검증 스킬 미배선 비대칭 발견 |
| 2026-07-17 | 신뢰성 강화(P0/P1): Phase F를 풀스택 게이트로(BE ruff+mypy+pytest, FE tsc+lint+vitest run+build, 전 명령 CWD 명시, 루트 test no-op 제거), Phase 산출물 완결성 관문+`{phase}_SKIPPED.md` 사유 계약, Phase C 2회 실패 시 BLOCKED(D~G 금지) 정책 통일, 커버리지 SSOT=vitest.config.ts(문서 수치 제거), 미배선 Learning Protocol 프롬프트 절 삭제(훅 구현 `.claude/hooks/agentLearnings.js`는 미등록·비활성으로 잔존), 읽기 전용 에이전트 산출물 반환→오케스트레이터 저장 일반화, Phase D 백엔드 테스트 소유권·pytest 결과 계약 명시 | verification-loop, aos-feature-harness SKILL.md, agents 5종, quality-reference.md, test-automation SKILL.md, aos-backend.md, package.json, commands 3종(test-coverage·check-health·verify-loop) | 2026-07 하네스 심층 감사 — F 게이트 백엔드 미검증(P0)·D 산출물 무검증 완주(P0) 등 |
| 2026-07-17 | Codex 리뷰 반영: 실패의 SKIPPED 우회 차단(SKIPPED=NOT_APPLICABLE 사전 선언 전용, 적용 대상 Phase 2회 실패=BLOCKED·이후 Phase 금지), verify-loop 게이트를 CI·verification-loop와 정합(uv 허용, BE ruff+format+mypy 추가, FE 커버리지), check-health 커버리지 주장은 test:coverage 실행으로만, pytest rootdir=repo 루트·asyncio STRICT 실측 문구, Learning Protocol 비활성(구현 잔존·미배선) 상태를 README/아키텍처 HTML/훅 파일에 명시 | aos-feature-harness SKILL.md, verify-loop.md, check-health.md, verification-loop SKILL.md, agentLearnings.js, .claude/README.md, claude-code-system-architecture.html | Codex 적대 리뷰 — 필수 Phase 실패가 SKIPPED로 완주 가능(P0) 등 |
| 2026-07-19 | P2 착수: 실행 상태 매니페스트 `_workspace/RUN_STATE.md` 신설(Phase별 상태/시도/타임스탬프, Phase 0 재개 판별의 진실원, 관측성 최소 배선), Phase E 리뷰 범위 델타화(baseline 제외 — docs-sync 델타 규칙 재사용, code-reviewer에 동일 지시), 사문화 학습 훅 agentLearnings.js 완전 제거(README·아키텍처 HTML 동기화) | aos-feature-harness SKILL.md, code-reviewer.md, .claude/README.md, claude-code-system-architecture.html, hooks/agentLearnings.js(삭제) | 감사 P2 #9·#10·#13 + 학습 훅 사용자 결정(완전 제거) |

## Compact 시 보존

현재 작업 파일 경로와 변경 의도, 실패한 검증 에러, `dev/active/` 진행 태스크, 미커밋 diff 요약, 합의한 설계 결정.
