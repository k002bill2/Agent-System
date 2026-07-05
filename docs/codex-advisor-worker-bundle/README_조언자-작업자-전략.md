# 조언자-작업자-Codex 검증 · 프로젝트별 셋업

> 이 번들은 Claude Code의 조언자-작업자-Codex 검증 흐름을 **전역이 아니라 프로젝트별로** 설치한다.
> `~/.claude` 또는 `~/.codex`를 기본으로 수정하지 않는다.

설치 후 프로젝트 루트에는 다음 파일이 생긴다.

```text
./.claude/
├── CLAUDE.md              # 이 프로젝트 전용 작업 원칙
└── agents/
    ├── architect.md       # 조언자 - 설계·위임 브리프 작성
    ├── worker.md          # 작업자 - 구현·테스트
    └── analyzer.md        # 조사·요약

./.codex/
└── config.toml            # 이 프로젝트 전용 Codex 검증 기본값(없을 때만)
```

기존 파일이 있으면 덮어쓰기 전에 같은 위치에 `*.backup-YYYYMMDDHHMMSS`로 백업한다.
구버전 `./.claude/agents/reviewer.md`가 있으면 백업 후 `reviewer.md.disabled-YYYYMMDDHHMMSS`로 비활성화한다.
기존 파일과 새 템플릿의 차이는 `--dry-run` 또는 `--diff`로 적용 전에 확인할 수 있다.

---

## 1. 전략 개요

비싸고 판단력 좋은 모델은 **조언자(Advisor)** 로 쓰고, 실제 코딩은 **작업자(Worker)** 에게 맡기며,
최종 검증은 **Codex 리뷰**로 분리한다. 핵심은 모델 이름 자체가 아니라 역할 분리와 독립 검증이다.

| 역할 | 담당 | 기본 모델/도구 |
|---|---|---|
| 조언자 - 설계·판단·위임·최종 결정 | 메인 세션 또는 `architect` | `fable` |
| 작업자 - 구현·테스트 | `worker` | `opus` |
| 검증 - 코드 리뷰·적대적 검토 | Codex 플러그인 | `/codex:review`, `/codex:adversarial-review` |
| 조사·요약 | `analyzer` | `haiku` |

가장 중요한 원칙은 작업자의 "완료" 보고를 그대로 믿지 않는 것이다.
반드시 Codex 리뷰로 diff를 실제 검토한 뒤, 지적 반영이 끝났을 때만 승인한다.

---

## 2. 왜 프로젝트별 설치인가

기존 전역 설치 방식은 `~/.claude/CLAUDE.md`와 `~/.claude/agents/*`를 직접 바꾼다.
그 방식은 한 프로젝트의 실험이 모든 프로젝트에 영향을 주고, 기존 개인 설정을 덮어쓸 위험이 있다.

이 버전은 다음 원칙을 따른다.

- 기본 설치 위치는 현재 프로젝트의 `./.claude/`와 `./.codex/`이다.
- 전역 `~/.claude/CLAUDE.md`, `~/.claude/agents/`, `~/.codex/config.toml`은 건드리지 않는다.
- Codex CLI 전역 설치는 기본으로 하지 않는다.
- 기존 프로젝트 파일은 백업 후 갱신한다.
- 프로젝트별로 git에 포함할지 여부를 팀 정책에 맞춰 결정할 수 있다.

---

## 3. 설치

프로젝트 루트에서 실행하는 방식을 권장한다.

```bash
bash docs/codex-advisor-worker-bundle/install.sh
```

다른 위치에서 실행할 때는 프로젝트 루트를 명시한다.

```bash
bash docs/codex-advisor-worker-bundle/install.sh --project /path/to/project
```

적용 전에 기존 파일과의 diff만 확인하려면 `--dry-run`을 사용한다. 이 모드는 파일과 디렉터리를 만들지 않는다.

```bash
bash docs/codex-advisor-worker-bundle/install.sh --project /path/to/project --dry-run
```

diff를 확인하면서 실제 적용하려면 `--diff`를 사용한다. 기존 파일이 바뀌는 경우 대화형 확인을 요구한다.
비대화형 환경에서는 `--yes`를 함께 사용한다.

```bash
bash docs/codex-advisor-worker-bundle/install.sh --project /path/to/project --diff
bash docs/codex-advisor-worker-bundle/install.sh --project /path/to/project --diff --yes
```

Codex CLI가 없고 설치기에서 전역 npm 설치까지 시도하게 하려면 명시적으로 옵션을 준다.

```bash
bash docs/codex-advisor-worker-bundle/install.sh --install-codex-cli
```

기본 설치기는 Codex CLI가 없을 때 안내만 출력한다. 전역 패키지 설치는 프로젝트 설정 변경보다 영향 범위가 크기 때문이다.

---

## 4. Claude Code 안에서 추가 설정

플러그인 설치는 Claude Code 세션 안의 슬래시 명령으로 처리한다.

```text
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
/reload-plugins
/codex:setup
!codex login
```

확인:

```text
/agents   -> architect, worker, analyzer, codex:codex-rescue 표시
/model    -> 사용 가능한 모델 별칭 확인
```

검증:

```text
/codex:review
/codex:adversarial-review
/codex:review --background
```

자동 리뷰 게이트는 필요한 프로젝트에서만 켠다.

```text
/codex:setup --enable-review-gate
```

리뷰 게이트는 Claude/Codex 루프와 사용량 소모가 커질 수 있으므로 상시 기본값으로 두지 않는다.

---

## 5. 운용 모드

### 모드 A - 메인이 조언자

1. 메인 세션을 상위 모델로 둔다.
2. 설계는 메인이 직접 하고 구현만 `worker`에 위임한다.
3. `worker`가 diff와 테스트 결과를 보고한다.
4. `/codex:review` 또는 `/codex:adversarial-review`로 검증한다.
5. 조언자가 지적 반영을 지시하고 통과 시 승인한다.

### 모드 B - 메인은 저렴, 조언자는 버스트

1. 메인은 비용 낮은 모델을 사용한다.
2. 설계가 필요한 순간에만 `architect`를 호출한다.
3. 구현은 `worker`가 한다.
4. 검증은 Codex가 한다.

---

## 6. 반드시 지킬 것

- 위임 브리프에는 완료 기준, 검증 방법, 시도 상한을 포함한다.
- `worker`의 완료 보고를 승인으로 간주하지 않는다.
- 큰 변경은 `/codex:review --background` 후 `/codex:status`, `/codex:result`로 확인한다.
- 긴 로그·대량 파일 조사는 먼저 `analyzer`가 압축한다.
- 모델 별칭은 세션에서 `/model`로 실제 사용 가능 여부를 확인한다.

---

## 7. 설치기가 하는 일

`install.sh`는 다음만 수행한다.

- `./.claude/CLAUDE.md` 생성 또는 백업 후 갱신
- `./.claude/agents/architect.md` 생성 또는 백업 후 갱신
- `./.claude/agents/worker.md` 생성 또는 백업 후 갱신
- `./.claude/agents/analyzer.md` 생성 또는 백업 후 갱신
- `./.claude/agents/reviewer.md`가 있으면 백업 후 비활성화
- `./.codex/config.toml`이 없으면 생성
- `--dry-run` 또는 `--diff` 지정 시 기존 파일 대비 unified diff 출력
- Node.js와 Codex CLI 설치 여부 확인

하지 않는 일:

- 기본 동작에서 `~/.claude` 수정
- 기본 동작에서 `~/.codex/config.toml` 수정
- 기본 동작에서 `npm install -g @openai/codex` 실행
- 기존 프로젝트 설정을 백업 없이 삭제
- `--dry-run`에서 파일 또는 디렉터리 생성

---

## 8. 주의 사항

- 프로젝트 `.codex/config.toml`은 Codex가 해당 프로젝트를 trusted로 인식할 때 반영된다.
- `fable`, `opus`, `haiku` 같은 별칭은 실제 Claude Code 세션의 `/model` 결과와 맞는지 확인한다.
- Fable 접근 제한이나 한도 문제가 있으면 `architect.md`의 `model:`을 프로젝트 상황에 맞게 바꾼다.
- 이 번들을 git에 올릴 경우 팀 전체가 같은 프로젝트 에이전트 규칙을 공유하게 된다.
