# Power Stack 통합 가이드

Power Stack = **GSD** (상태 관리) + **Superpowers** (TDD/스펙) + **Gstack** (워크플로우 스킬 + 브라우저 자동화) 의 3-Layer 워크플로우 프레임워크.

---

## 설치 현황

| 프레임워크 | 설치 방식 | 상태 | 버전/경로 |
|-----------|----------|------|----------|
| **GSD** | 글로벌 CLI 설치 | ✅ 활성 | `~/.claude/commands/gsd/` (v1.26.0) |
| **Superpowers** | Claude Code 마켓플레이스 플러그인 | ✅ 활성 | `~/.claude/plugins/data/superpowers-*` |
| **Gstack** | 글로벌 설치 (`--prefix` 모드) | ✅ 활성 | `~/.claude/skills/gstack/` (v0.15.8.0) |

> **중요**: GSD와 Superpowers는 글로벌 플러그인으로 설치되어 있으므로 Git Submodule로 추가할 필요 없음.
> 프로젝트 내 `external/` 디렉토리나 `.gitmodules`는 불필요.

---

## 사용 방법

### GSD — 프로젝트/마일스톤/페이즈 관리

```
/gsd:new-project        # 새 프로젝트 초기화 + PROJECT.md 생성
/gsd:plan-phase         # 페이즈 계획 수립 (PLAN.md)
/gsd:execute-phase      # 페이즈 실행 (wave 기반 병렬화)
/gsd:progress           # 현재 진행 상황 확인
/gsd:ship               # PR 생성 + 리뷰 + 머지 준비
/gsd:debug              # 체계적 디버깅 (과학적 방법론)
/gsd:help               # 전체 명령어 목록
```

**프로젝트 로컬 디렉토리** (untracked, `.gitignore` 처리됨):
- `.gsd/states/` — 세션별 상태 파일
- `.planning/` — GSD가 생성하는 PROJECT.md, STATE.md, 페이즈별 PLAN.md

### Superpowers — TDD, 스펙, 검증

```
/superpowers:brainstorming                # 구현 전 아이디어 탐색
/superpowers:writing-plans                # 구현 계획 작성
/superpowers:executing-plans              # 계획 실행 (리뷰 체크포인트 포함)
/superpowers:test-driven-development      # TDD: RED → GREEN → IMPROVE
/superpowers:verification-before-completion  # 완료 주장 전 증거 기반 검증
/superpowers:requesting-code-review       # 코드 리뷰 요청
/superpowers:systematic-debugging         # 체계적 버그 추적
```

### Gstack — 워크플로우 스킬 + 영속적 브라우저

> **상태**: ✅ 글로벌 설치 완료 (`--prefix` 모드 → `/gstack-*` 네임스페이스)

Gstack은 Garry Tan이 만든 **23개 워크플로우 스킬 + headless Chromium 브라우저 데몬** 패키지.
GitHub Stars 64K+, MIT 라이선스, Bun 런타임 기반.

**주요 스킬:**
| 카테고리 | 스킬 |
|---------|------|
| 기획 | `/office-hours`, `/autoplan`, `/plan-eng-review` |
| QA/보안 | `/qa`, `/cso` (OWASP+STRIDE), `/benchmark` |
| 코드 리뷰 | `/review`, `/codex` (OpenAI 크로스체크) |
| 배포 | `/ship`, `/land-and-deploy` |
| 브라우저 | `/browse` (영속적 Chromium, 100ms 응답) |

**AOS 스킬과 이름 충돌 주의:**
- Gstack `/review` ↔ AOS `/code-review` (다른 이름이라 OK)
- Gstack `/plan-*` ↔ AOS `/plan` (충돌 가능 → `--prefix gstack` 사용 권장)

---

## 워크플로우 파이프라인

```
┌──────────────┐    ┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  1. Gstack   │───▶│   2. GSD    │───▶│ 3. Superpowers│───▶│  4. Gstack   │
│  (기획/리뷰) │    │ (상태관리)   │    │   (TDD 구현)  │    │   (QA/배포)  │
└──────────────┘    └─────────────┘    └──────────────┘    └──────────────┘
  /office-hours       /gsd:plan-phase   /superpowers:tdd     /gstack-qa
  /plan-eng-review    마일스톤 설정       스펙 → 테스트 →      /gstack-cso
  /autoplan          페이즈 분할          구현 → 검증          /gstack-ship
```

### 단계별 실행 예시

```bash
# Phase 1: 기획 (Gstack)
/gstack-office-hours    # 아키텍처 리뷰 + 요구사항 정리
/gstack-autoplan        # 자동 계획 생성

# Phase 2: 상태 초기화 (GSD)
/gsd:new-project        # 또는 /gsd:plan-phase

# Phase 3: TDD 구현 (Superpowers)
/superpowers:writing-plans
/superpowers:test-driven-development
/superpowers:executing-plans

# Phase 4: 품질 검증 + 배포 (Gstack + Superpowers)
/gstack-qa              # QA 자동화
/gstack-cso             # 보안 검토 (OWASP+STRIDE)
/superpowers:verification-before-completion
/gstack-ship            # 배포 준비
```

---

## 라우팅 매트릭스

| 작업 유형 | 1차 도구 | 2차 도구 | 설명 |
|----------|---------|---------|------|
| 새 프로젝트 시작 | GSD | Superpowers | `/gsd:new-project` → `/superpowers:brainstorming` |
| 기능 구현 | Superpowers | GSD | TDD로 구현, GSD로 상태 추적 |
| 버그 수정 | Superpowers | — | `/superpowers:systematic-debugging` |
| 아키텍처 변경 | Gstack | GSD | `/gstack-office-hours` → `/gsd:plan-phase` |
| 코드 리뷰 | Gstack | Superpowers | `/gstack-review` → 검증 루프 |
| 보안 감사 | Gstack | — | `/gstack-cso` (OWASP+STRIDE) |
| 브라우저 QA | Gstack | — | `/gstack-browse` (영속 Chromium) |
| 릴리스 준비 | GSD | Gstack | `/gsd:ship` → `/gstack-ship` |

---

## 프로젝트 로컬 디렉토리 구조

```
Agent-System/
├── .gsd/states/           # GSD 세션 상태 (gitignored)
├── .planning/             # GSD 프로젝트/페이즈 계획 (gitignored)
│   ├── PROJECT.md
│   ├── STATE.md
│   └── phases/
├── .claude/rules/         # Claude 행동 규칙 (tracked)
│   ├── aos-workflow.md    # 기존 워크플로우 규칙
│   ├── aos-frontend.md
│   └── aos-backend.md
└── docs/guides/           # 가이드 문서 (tracked)
    └── power-stack-integration.md  # 이 파일
```

> **참고**: `.gsd/`, `.planning/`, `.superpowers/`, `.gstack/`은 모두 `.gitignore`에 등록되어 있음.
> 이 디렉토리들은 세션별 상태 파일이므로 Git에 추적하지 않음.

---

## AOS 기존 스킬과의 관계

Power Stack은 AOS의 기존 스킬 시스템과 **보완적**으로 작동합니다:

| AOS 기존 스킬 | Power Stack 대응 | 관계 |
|--------------|-----------------|------|
| `react-web-development` | — | AOS 전용 (Power Stack 무관) |
| `verification-loop` | `superpowers:verification-before-completion` | 유사 목적, 둘 다 사용 가능 |
| `test-automation` | `superpowers:test-driven-development` | 보완적 (TDD는 Superpowers, 커버리지는 AOS) |
| `code-review` 명령어 | `gstack-review` / `superpowers:requesting-code-review` | Gstack이 더 심층적 |
| `plan` 명령어 | `gstack-autoplan` / `gsd:plan-phase` | GSD가 상태 관리 포함 |
| `mcp__claude-in-chrome__*` | `gstack-browse` | 역할 분리: chrome MCP은 일반용, gstack은 QA용 |

---

## Gstack 설치 가이드

> **전제조건**: Bun 런타임 설치 필요 (`curl -fsSL https://bun.sh/install | bash`)

### 권장: 글로벌 설치 (개인 워크스테이션용)

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup
```

설치 시 `--prefix gstack` 옵션 사용하여 `/gstack-qa`, `/gstack-review` 등으로 네임스페이스 분리 권장.

### 대안: 프로젝트 벤더링 (팀 공유용)

```bash
cp -Rf ~/.claude/skills/gstack .claude/skills/gstack
rm -rf .claude/skills/gstack/.git
cd .claude/skills/gstack && ./setup
```

> **주의**: Gstack 공식 문서가 명시적으로 Git Submodule을 반대함.
> "Real files get committed to your repo (not a submodule)"

### 설치 후 확인

- `~/.gstack/config.yaml` 생성 확인
- Claude Code 세션에서 `/gstack-qa` 등 스킬 호출 가능 여부 확인
- `mcp__claude-in-chrome__*` 도구와 `/browse`의 역할 분리 확인

---

## Git Submodule을 사용하지 않는 이유

1. **GSD/Superpowers는 프롬프트 기반 프레임워크** — 소스 코드를 프로젝트에 포함해도 Claude 세션에 자동 연결되지 않음
2. **Gstack 공식 문서가 Submodule 반대** — 직접 파일 복사(벤더링) 또는 글로벌 설치를 권장
3. **글로벌 플러그인 시스템이 업데이트를 관리** — Submodule은 수동 `git submodule update` 필요
4. **Worktree 호환성** — Submodule은 각 worktree마다 별도 checkout이 필요하여 복잡도 증가
5. **Hook 충돌** — Path protection hook이 `.git/` 포함 경로를 차단하여 submodule 초기화 실패 가능
6. **YAGNI** — 소스 코드 참조가 필요한 사용 사례가 없음
