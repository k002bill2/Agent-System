---
description: dev/active phase의 tasks.md를 frontmatter 기반으로 자동 실행합니다.
---

# Execute Tasks File

`dev/active/<phase>/*-tasks.md` 의 YAML frontmatter를 읽어 웨이브 순차 + 태스크 병렬로 서브에이전트에게 디스패치합니다.

## 사용법

```
/execute-tasks-file <phase-dir>
```

예: `/execute-tasks-file dev/active/react-19-migration`

## 전제

1. `<phase-dir>` 에 `*-tasks.md` 또는 `tasks.md` 파일이 있어야 함
2. 파일 앞부분에 YAML frontmatter가 있어야 함. 없으면 먼저:
   ```
   src/backend/.venv/bin/python scripts/phase_runner.py migrate <phase-dir>
   ```
3. `phase_runner` 패키지가 `src/backend/` 에 설치되어 있어야 함 (이미 포함)

## 동작 절차

1. **Validate** — `python scripts/phase_runner.py validate <phase-dir>` 실행. 실패 시 즉시 중단하고 에러 보고.
2. **Parse** — `phase_runner.schema.PhaseSpec.from_tasks_md()` 로 frontmatter 로드. `waves[*].tasks[*]` 구조 확보.
3. **Execute per wave (순차)**
   - 웨이브 내 `depends_on` 토폴로지 정렬
   - 의존성 충족된 태스크를 `superpowers:dispatching-parallel-agents` 스킬로 동시 디스패치 (기본 최대 3개)
   - 각 태스크는 본문(`body`)에서 `**<id>**` 섹션을 읽어 서브에이전트에게 설명으로 전달
   - `agent_hint` 필드가 있으면 해당 subagent_type 우선
4. **Checkbox Sync** — 각 웨이브 완료 후 `phase_runner.checkbox_sync.sync_checkboxes()` 실행. `[x]` / `[ ]` 갱신하고 파일 저장.
5. **Verification Loop** — 모든 웨이브 완료 시 `verification-loop` 스킬 호출 (`tsc` → `eslint` → `vitest` → `build`).
6. **재시도** — 실패 태스크는 같은 웨이브 내에서 최대 3회 재실행. 3회 실패 시 status=failed 유지 후 의존 태스크를 failed로 연쇄 마킹.
7. **완료 제안** — 모든 검증 통과 시 `/commit-push-pr` 제안. phase 디렉토리를 `dev/archive/` 이동은 사용자 확인 후.

## 실패 처리

- frontmatter validation 실패 → 스키마 에러 전체 출력 + 중단
- 태스크 3회 실패 → 해당 태스크 [x] 로 마킹하지 않음, 의존 태스크도 건너뜀
- verification-loop 실패 → 어느 단계(tsc/eslint/vitest/build)에서 실패했는지 보고 + 사용자에게 제어권 반환

## 주의

- `gsd:execute-phase`는 건드리지 않음 — 둘은 병행 운영. 장기/복잡 phase는 GSD, 3-파일 시스템의 일상 phase는 이 커맨드
- 재시도 로직은 runner 내부에 있음 — 여기서 별도 루프 작성 금지
- `dev/active/`는 `.gitignore` 대상이라 직접 commit 되지 않음. phase archive 시에만 diff 생성됨
