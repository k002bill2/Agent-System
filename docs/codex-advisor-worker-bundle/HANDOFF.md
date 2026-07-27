# HANDOFF · 컨텍스트 예산 트리거 + 리서치 격리 구현

작성: 2026-07-27 · 작성 사유: 컨텍스트 예산 경고(WARNING) 발동 — 본 기능이 실전에서 스스로 트리거

> `.planning/STATE.md` 가 존재하나 그것은 GSD 워크플로우 상태이고 **이 작업을 추적하지 않는다.**
> 따라서 `/gsd:pause-work` 대신 이 문서를 쓴다 (규칙의 의도 = 이미 추적되는 것을 중복 저장하지 않기).

## 상태: 구현 완료 · Codex 3라운드 검증 대기

## 산출물 (미커밋)

```
M  docs/codex-advisor-worker-bundle/install.sh                      (+245줄 규모)
M  docs/codex-advisor-worker-bundle/README_조언자-작업자-전략.md
?? docs/codex-advisor-worker-bundle/REVIEW_컨텍스트예산-리서치격리.md   ← 설계 근거 정본
?? docs/codex-advisor-worker-bundle/HANDOFF.md                       ← 이 문서
```

실환경(`~/.claude/`)에는 이미 설치 반영됨: `agents/researcher.md` 신설,
`agents/architect.md` tools 축소, `awesome-statusline.sh` 에 마커 블록 삽입,
`CLAUDE.md` 번들 블록에 3개 절 추가. **`settings.json` 은 무변경**(mtime `Jul 26 23:19` 유지).

## 설계 요약 (상세는 REVIEW 문서)

- 임계치 = **베이스라인 델타 59k** (퍼센트 아님 — 실측 baseline 50,905 = 200k 창의 25.5%라 퍼센트는 양쪽 끝에서 깨짐). 59k 는 사용자 지정 "200k 창 사용률 50~55%" 에서 역산한 값 = `200,000 × 0.55 − 50,905`
- 배선 = `awesome-statusline.sh` 마커 블록 → `$TMPDIR/claude-ctx-{sid}.json` → **이미 등록된** `gsd-context-monitor.js`
- 합성 매핑: `remaining_percentage = 100 - delta*100/78666` → WARNING(35)=delta 51,133, CRITICAL(25)=delta 59,000 (`78666 = floor(59000/0.75)` — 셸 정수 나눗셈이라 반올림한 78667 은 경계에서 1 어긋난다)
- 저장 포맷 **신설 안 함** — GSD/HANDOFF/`wip-save` 중 상황에 맞는 것에 위임
- 역할: `researcher`(sonnet, 외부 조사) 신설 / `analyzer`(haiku) 로컬 전담 / `architect` 웹도구 제거

## 검증 완료 (전부 조언자가 직접 재현)

| 항목 | 결과 |
|---|---|
| 브리지 경계값 | delta 51,133→35, delta 59,000→25, 재래치→100 + `-warned.json` 삭제 |
| **Red-Green 종단 주입** | GREEN: `CONTEXT CRITICAL` 실제 주입 / RED: 삭제 시 소멸 |
| `set -e` 회귀 | GREEN `OK` 생존 / RED(`\|\| true` 제거) 출력 `[]` 사망 |
| statusLine 5형태 | `~/…`, `bash ~/…`, `env FOO=1 ~/…`, `bash $HOME/…`, `${HOME}/…` 전부 마커 1개 |
| 원자성 | 퍼미션 755 보존, tmp 잔여 0, **rename 실패 시 원본 md5 동일 + exit 1** |
| 멱등성 | 미설치→삽입→재실행 `diff -r` 0, 마커 수 1 |
| 실전 발동 | 2026-07-27 세션에서 WARNING 자연 발동 확인 |

## Codex 검증 이력

- 1라운드 P2×2: 래퍼 커맨드 파싱 / `set -e` 사망 → 반영·재현 확인
- 2라운드 P2×2: 비원자적 덮어쓰기 / `$HOME` 미확장 → 반영·재현 확인
- **3라운드: 실행 중** (`scratchpad/codex-review3.log`)

## 다음 단계

1. 3라운드 결과 확인 — 새로 만진 코드의 실질 결함이면 반영, 무관한 사소 지적이면 승인(무한 루프 방지)
2. 승인 시 `TaskStop ctx-budget-worker`
3. 커밋 (사용자 지시 대기 중). 제안 메시지:
   `feat(bundle): 컨텍스트 예산 트리거 배선 + researcher 에이전트 신설`

## 알려진 잔여 사항

- **R1(High)**: `gsd-context-monitor.js` 는 GSD 플러그인 소유(`gsd-hook-version: 1.26.0` 핀). 업데이트로 임계치·스키마·메시지가 바뀌면 조용히 깨진다. install.sh 가 버전 불일치를 경고한다
- `isGsdActive` 판정은 신뢰 불가 — `.planning/STATE.md` 가 실재해도 비-GSD 분기가 떴다(`data.cwd` 가 프로젝트 루트가 아님). REVIEW §1.3 정정 블록 참조
- 서브에이전트 `tools:` 필드의 MCP 와일드카드 지원 여부 **미검증** — `researcher` 는 `WebSearch, WebFetch, Read, Grep, Glob` 만 부여
- `~/.claude/hooks/universal/contextMonitor.js` 폐기 검토 = 별도 후속 과제(범위 밖)
