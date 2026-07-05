# 프로젝트 작업 원칙

> 이 파일은 현재 프로젝트의 `./.claude/CLAUDE.md` 이다. 전역 `~/.claude/CLAUDE.md`를 바꾸지 않는다.
> 이 지침은 프로젝트 컨텍스트이며, 모델 고정은 `./.claude/agents/` 서브에이전트의 `model:` 필드가 담당한다.
> 검증은 Codex 플러그인이 담당한다.

## 핵심: 조언자-작업자-검증 (Advisor-Worker-Codex)
- 조언자(Advisor · 상위 모델 Fable 5): 설계·판단·위임·최종 결정. 직접 코딩하지 않는다.
- 작업자(Worker · Opus): 조언자의 브리프대로 구현·테스트만. 범위 확장·무한 리팩터링 금지.
- 검증(Codex): 작업자 결과는 조언자가 직접 보지 않고 Codex 리뷰로 검증한다.
  - 표준 검증: `/codex:review`
  - 설계·트레이드오프 도전: `/codex:adversarial-review`
- 저렴한 모델은 스스로 멈추지 못하므로, 조언자가 완료 기준·시도 상한을 주고 Codex 검증으로 관문을 만든다.

## 검증은 무조건
작업자의 "완료" 보고를 그대로 믿지 않는다. `/codex:review` 또는 `/codex:adversarial-review`를 실행해
diff를 실제로 검토한 뒤, 조언자가 지적사항 반영을 지시하고 통과했을 때만 승인한다.

## 작업 순서 기본형
1. `architect`(조언자) - 설계 + 브리프(완료 기준·검증 방법·시도 상한)
2. `worker`(작업자·Opus) - 구현 + diff/테스트 보고
3. Codex 검증 - `/codex:review` (설계 도전 필요 시 `/codex:adversarial-review`)
4. 조언자 - Codex 지적 반영 지시 -> 통과 시 승인

## 운용 모드
- 모드 A(기본): 메인 세션 = 조언자(Fable 5). 구현은 `worker`(Opus), 검증은 `/codex:review`.
- 모드 B(비용 최소): 메인은 Sonnet. 설계는 `architect` 버스트(Fable 5), 구현은 `worker`(Opus), 검증은 Codex.
- 자동 검증은 필요한 프로젝트에서만 켠다: `/codex:setup --enable-review-gate`

## 모델 폴백
어드바이저는 `fable` 별칭을 쓴다. 한도 소진 또는 접근 문제가 있으면 세션에서 `/model opus`로 전환하거나,
프로젝트/셸 환경에서 사용 가능한 모델 별칭으로 `architect`의 `model:` 값을 조정한다.

## Reasoning effort
- Claude 기본은 high 권장. `xhigh`/`max`는 아키텍처급 판단에만 쓴다.
- Codex 검증 effort는 프로젝트 `./.codex/config.toml`의 `model_reasoning_effort`로 조절한다.
  프로젝트 설정은 Codex가 해당 프로젝트를 trusted로 인식할 때 반영된다.

## 토큰 무거운 작업은 분리
코드베이스 분석·긴 로그·대량 요약은 `analyzer`(Haiku)에 먼저 위임하고 압축 결론만 넘긴다.
규모가 큰 구현·버그 조사는 `/codex:rescue`로 Codex에 위임할 수 있다.

## 출력 규약
요약 -> 근거 -> 주의/가정 -> 다음 단계. 근거 수준 L1/L2/L3, 불확실성 High/Medium/Low 표시.
