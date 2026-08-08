# GSD 로컬 패치

`~/.claude/get-shit-done/`(GSD 관리형 설치)에 적용한 로컬 수정의 영구 사본이다.
`/gsd:update`는 설치 파일을 덮어쓰므로, 이 디렉토리가 복원의 진실원이다.

## 왜 여기인가

GSD는 update 시 로컬 수정을 `~/.claude/gsd-local-patches/`에 자동 백업하고
`/gsd:reapply-patches`로 되돌리는 경로를 제공한다. 다만 그건 **update를 실행해야
동작하는 사후 장치**이고, 백업 디렉토리 자체가 홈 밑에 있어 레포와 함께 이동하지 않는다.
여기 사본은 git으로 추적되므로 update 실패·홈 초기화·머신 이전에도 남는다.

## 파일

| 파일 | 원 위치 | 비고 |
|---|---|---|
| `gsd-pause-work.md` | `~/.claude/get-shit-done/workflows/pause-work.md` | 2026-08-09 수정본 (265줄) |

## 복원

```bash
cp docs/patches/gsd-pause-work.md ~/.claude/get-shit-done/workflows/pause-work.md
# 무결성 확인 — 출력이 없어야 한다
diff docs/patches/gsd-pause-work.md ~/.claude/get-shit-done/workflows/pause-work.md
```

`/gsd:update` 실행 후에는 위 명령으로 재적용하거나 `/gsd:reapply-patches`를 쓴다.
둘 중 하나만 하면 된다 — 상류 파일이 함께 바뀌었다면 reapply 쪽이 병합을 시도한다.

## gsd-pause-work.md — 무엇을 고쳤나 (2026-08-09)

upstream 대비 **+93 / -4줄** (176 → 265줄). 원인은 하나였다: 셸 glob 의존.

| 스텝 | 결함 | 수정 |
|---|---|---|
| detect | `phases/*/PLAN.md` — GSD 실제 규약은 `*-PLAN.md`라 **감지 100% 실패**. zsh는 glob 미매치 시 명령을 아예 실행하지 않는다. `grep -oP`/`\K`는 GNU 전용이라 CC의 ugrep 래퍼 밖(opencode·gemini 런타임)에서 깨진다 | `find … -mindepth 2 -maxdepth 2 -name '*PLAN.md' -exec ls -t {} +` + `cut -d/ -f3` |
| gather | 같은 glob 문제 | `find … -exec grep -l … {} +` |
| commit | glob 미매치로 **명령 전체가 미실행** → 핸드오프가 untracked로 남음 | 두 개의 명시적 `find` 루트 + 산출물 개수 검사 |
| confirm | commit 실패와 무관하게 항상 `✓ Committed as WIP` 출력 — **가장 위험했던 지점** | commit 결과 × `git status` 교차 판독표로 성공/실패 분기 |

Codex 리뷰 4라운드에서 실질 지적 8건을 반영했다: 아카이브(`milestones/v*-phases/`) 오염,
`nothing_to_commit`(=이미 커밋됨) 오분류, `-path`의 `*`가 `/`를 넘는 문제, 산출물 하나만
있어도 성공 보고, `-mindepth` 누락, bare `PLAN.md` 호환, GNU xargs의 빈 입력 실행.

**기각한 지적 1건:** "macOS BSD find는 `-mindepth`/`-maxdepth`를 거부한다"(P1). 사실이 아니다 —
`/usr/bin/find … -mindepth 2 -maxdepth 2`가 exit 0으로 정상 동작하고, 진짜 미지원 옵션은
`unknown primary or operator`를 낸다. `man find`에도 명시돼 있다. 그대로 따랐다면 회귀였다.

검증: 파일에서 bash 블록을 추출해 10케이스 실행(정상 / 아카이브 공존 / 이미 커밋됨 /
`phases` 밖 / 구조 없음 / 중첩 `backup/` / 산출물 하나만 2종 / `phases` 직하 오배치 /
bare `PLAN.md`) — 전부 의도대로. 정적 감사에서 잔여 셸 glob·`grep -P`·`-path` 0건.

## 주의 — 이 프로젝트는 pause-work 대상이 아니다

AOS는 `.planning/phases/` 구조를 쓰지 않는다(`.planning/STATE.md` 참조: "계획은 `docs/plans/`에
있고 배치(B1~B6)가 phase 역할을 한다"). pause-work는 phases 구조 전용이므로 이 레포에서
일시정지할 때는 STATE.md의 `Current Position`·`Session Continuity`를 갱신한다.
이 패치는 phases 구조를 쓰는 **다른** 프로젝트에서 GSD를 쓸 때를 위한 것이다.

이에 맞춰 전역 `~/.claude/CLAUDE.md`의 컨텍스트 예산 절(상태 저장 단계)도 2026-08-09에
고쳤다. 분기 조건이 `.planning/STATE.md` 유무였는데 pause-work의 실제 의존은 `phases/`라
STATE.md만 있는 레포로 잘못 라우팅됐다. 세 갈래로 정정: `phases/` 있음 → `/gsd:pause-work` /
phases 없이 STATE.md만 → STATE.md의 `Current Position`·`Session Continuity` 갱신 /
둘 다 없음 → HANDOFF.md. **`~/.claude`는 git 레포가 아니므로 그 수정은 추적되지 않는다** —
이 문단이 유일한 기록이다.
