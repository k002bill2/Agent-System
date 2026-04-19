# Phase Runner

`dev/active/<phase>/*-tasks.md` 파일의 YAML frontmatter를 단일 진실 소스(single source of truth)로 삼아 웨이브 순차 + 태스크 병렬로 실행하는 경량 오케스트레이터.

Claude Code 슬래시 커맨드 `/execute-tasks-file` 가 이 엔진을 사용하며, GSD 워크플로우(`/gsd:execute-phase`)와 병행 운영된다. 장기/복잡 phase는 GSD, 일상 3-파일 시스템 phase는 Phase Runner.

---

## 왜 필요한가

기존 3-파일 시스템(`plan.md`, `context.md`, `tasks.md`)은 수동 진행이 기본이었다. Phase Runner는 다음을 자동화한다:

- **스키마 검증** — frontmatter가 올바른 구조(phase → waves → tasks)인지 Pydantic으로 검증
- **DAG 실행** — 같은 웨이브 내 `depends_on` 을 존중하는 토폴로지 순서
- **병렬 디스패치** — 의존성 충족된 태스크를 `superpowers:dispatching-parallel-agents` 로 동시 실행 (기본 3)
- **체크박스 동기화** — YAML `status: done` → 본문 `[x]` 자동 갱신
- **재시도** — 태스크당 최대 3회 재시도, 의존 태스크 연쇄 실패 마킹

---

## 파일 구성

| 경로 | 역할 |
|------|------|
| `src/backend/phase_runner/schema.py` | `PhaseSpec`, `Wave`, `Task` Pydantic 모델 + 사이클/중복 ID 검증 |
| `src/backend/phase_runner/runner.py` | `PhaseRunner` - 웨이브 순차 + 태스크 병렬 실행 엔진 |
| `src/backend/phase_runner/migrate.py` | 기존 tasks.md에서 frontmatter 추론하여 prepend |
| `src/backend/phase_runner/checkbox_sync.py` | YAML 상태 → 본문 `[x]/[ ]` 마커 동기화 |
| `src/backend/phase_runner/__main__.py` | `python -m phase_runner <cmd> <dir>` CLI |
| `scripts/phase_runner.py` | 리포 루트용 thin wrapper (sys.path 조정) |
| `.claude/commands/execute-tasks-file.md` | `/execute-tasks-file <dir>` 슬래시 커맨드 |

---

## YAML Frontmatter 스키마

```yaml
---
phase: react-19-migration       # 필수. phase 식별자
description: React 18 → 19 마이그레이션  # 선택
waves:                          # 최소 1개
  - name: "1 (schema)"          # 웨이브 이름
    tasks:
      - id: T1-1                # [A-Za-z0-9_-]+
        desc: "타입 패키지 업그레이드"  # 선택. 요약
        agent_hint: web-ui-specialist  # 선택. 선호 subagent_type
        status: pending         # pending | in_progress | done | failed
      - id: T1-2
        depends_on: [T1-1]      # 같은 wave 내 id만 허용
        status: pending
  - name: "2 (migration)"
    tasks:
      - id: T2-1
        status: pending
---

# 본문 (마크다운)

## Wave 1 (schema)

- [ ] **T1-1**: 타입 패키지 업그레이드 상세 설명...
- [ ] **T1-2**: ...

## Wave 2 (migration)

- [ ] **T2-1**: ...
```

### 스키마 규칙

- `id` 는 `^[A-Za-z0-9_-]+$` 정규식 필수
- 같은 웨이브 내 `id` 중복 불가, `depends_on` 사이클 불가 (DFS로 감지)
- `depends_on` 은 **같은 웨이브 내 id만** 허용 (웨이브 간 의존은 웨이브 순서로 표현)
- `extra="forbid"` — 알 수 없는 필드는 검증 실패

---

## CLI 사용법

```bash
# frontmatter 없는 기존 tasks.md에 추론하여 prepend
src/backend/.venv/bin/python scripts/phase_runner.py migrate dev/active/<phase>

# 스키마 검증 ("OK — 3 waves, 7 tasks")
src/backend/.venv/bin/python scripts/phase_runner.py validate dev/active/<phase>

# YAML status → 본문 체크박스 재동기화 (수동 편집 후 되돌리기 등)
src/backend/.venv/bin/python scripts/phase_runner.py sync dev/active/<phase>

# run은 CLI에서 지원하지 않음 → /execute-tasks-file 슬래시 커맨드 사용
```

---

## 실행 플로우 (`/execute-tasks-file`)

1. **Validate** — 스키마 실패 시 즉시 중단
2. **Parse** — `PhaseSpec.from_tasks_md()` 로 로드
3. **Execute per wave** (순차) — 웨이브 내부에서:
   - `depends_on` 충족된 태스크 → `dispatching-parallel-agents` 로 동시 디스패치 (기본 최대 3)
   - 각 태스크는 본문에서 `**<id>**` 섹션을 추출해 설명으로 전달
   - `agent_hint` 있으면 해당 subagent_type 우선
4. **Checkbox Sync** — 웨이브 완료 후 `[x]/[ ]` 재작성 및 파일 저장
5. **Verification Loop** — 모든 웨이브 완료 시 `verification-loop` 스킬 호출 (tsc → eslint → vitest → build)
6. **재시도** — 태스크당 최대 3회. 3회 실패 시 `status=failed` 유지 + 의존 태스크 연쇄 failed
7. **완료 제안** — 모든 검증 통과 시 `/commit-push-pr` 제안

---

## 실패 처리

| 상황 | 동작 |
|------|------|
| frontmatter validation 실패 | 스키마 에러 출력 + 즉시 중단 |
| 태스크 3회 실패 | 해당 태스크 `[x]` 로 마킹 안 함, 의존 태스크 건너뜀 |
| verification-loop 실패 | 실패 단계(tsc/eslint/vitest/build) 보고 + 사용자에게 제어권 반환 |

---

## 테스트

| 파일 | 커버 범위 |
|------|----------|
| `tests/backend/test_phase_runner_schema.py` | PhaseSpec/Wave/Task 검증 (ID 규칙, 중복, 사이클, 웨이브 간 의존 거부) |
| `tests/backend/test_phase_runner_migrate.py` | Wave 헤딩 추출, 체크 상태 보존, flat tasks fallback, idempotency |
| `tests/backend/test_phase_runner_checkbox_sync.py` | `[ ] → [x]` 갱신, 알 수 없는 id 무시, 수동 체크리스트 보존 |
| `tests/backend/test_phase_runner_runner.py` | 병렬 디스패치, depends_on 직렬화, 재시도, 연쇄 실패 |

---

## GSD 와의 관계

| 속성 | Phase Runner | `gsd:execute-phase` |
|------|--------------|---------------------|
| 대상 | `dev/active/<phase>/*-tasks.md` | `.planning/phases/<phase>/PLAN.md` |
| 실행 단위 | YAML 웨이브 + 병렬 | PLAN.md 태스크 DAG |
| 검증 | `verification-loop` | `gsd-verifier` |
| 적합한 작업 | 3-파일 시스템 일상 phase | 장기/복잡/요구사항 backward-derived phase |

두 시스템은 독립적이며 하나의 리포에서 병행 사용한다.
