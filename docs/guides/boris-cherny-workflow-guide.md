# Boris Cherny 워크플로우 가이드 (AOS 적응)

Boris Cherny의 Claude Code 실전 워크플로우 원칙을 AOS 프로젝트에 적용한 가이드.

---

## 핵심 원칙 5가지

### 원칙 1: 검증 피드백 루프 (가장 중요)

> "가장 중요한 요소는 Claude에게 작업 결과를 스스로 검증할 수 있는 방법을 제공하는 것입니다."

**AOS 적용**:

```bash
# Backend 검증
cd src/backend && pytest ../../tests/backend --tb=short

# Dashboard 검증
cd src/dashboard && npx tsc --noEmit && npm test

# 통합 검증 (verification-loop 스킬)
/verify-app
```

**검증 파이프라인**:
```
코드 변경 → tsc --noEmit → ruff check → pytest → npm test → npm run build
```

**관련 도구**:
- `verification-loop` 스킬 - 자동 검증 루프
- `/verify-app` 커맨드 - 한 번에 전체 검증
- `/check-health` 커맨드 - 프로젝트 건강 상태 확인

### 원칙 2: 워크플로우 자동화 (Slash Commands)

> "매일 반복되는 작업은 슬래시 커맨드로 자동화"

**AOS 커맨드 체인**:

| 워크플로우 | 커맨드 | 단계 |
|-----------|--------|------|
| 코드 커밋 | `/commit-push-pr` | diff → lint → test → commit → push → PR |
| 배포 검증 | `/deploy-with-tests` | test → build → deploy → health check |
| 건강 검진 | `/check-health` | tsc + ruff + pytest + build |
| 컨텍스트 저장 | `/save-and-compact` | dev-docs 업데이트 → compact |

**커맨드 생성 원칙**:
1. 반복 작업을 식별 (3회 이상 수동 실행)
2. `.claude/commands/` 에 마크다운 파일 생성
3. `description` frontmatter로 자동 호출 가능하게
4. `allowed-tools`로 필요한 도구만 허용

### 원칙 3: PostToolUse 훅 (자동 포매팅)

> "PostToolUse 훅을 통해 코드 포매팅을 처리하여 CI 오류를 방지"

**AOS 자동 포매팅**:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | { read f; [[ \"$f\" == *.py ]] && ruff format \"$f\" && ruff check --fix \"$f\" 2>/dev/null; [[ \"$f\" == *.ts || \"$f\" == *.tsx ]] && npx prettier --write \"$f\" 2>/dev/null; exit 0; }"
          }
        ]
      }
    ]
  }
}
```

**AOS 포매터 매핑**:

| 파일 유형 | 포매터 | 린터 |
|----------|--------|------|
| `.py` | ruff format | ruff check |
| `.ts`, `.tsx` | prettier | ESLint |
| `.css` | prettier | - |
| `.json` | prettier | - |

### 원칙 4: 서브에이전트 활용

> "작업 완료 후 코드를 단순화하는 code-simplifier 서브에이전트 사용"

**AOS 서브에이전트 생태계**:

| 에이전트 | 모델 | 역할 |
|---------|------|------|
| `quality-validator` | haiku | 코드 품질 검증 |
| `performance-optimizer` | haiku | 성능 최적화 |
| `test-automation-specialist` | haiku | 테스트 자동 생성 |
| `web-ui-specialist` | inherit | React/Tailwind UI |
| `backend-integration-specialist` | inherit | FastAPI/LangGraph |

**활용 패턴**:
```
구현 완료 → quality-validator (검증) → performance-optimizer (최적화)
         → test-automation-specialist (테스트 보강)
```

### 원칙 5: 품질 2-3x 향상

> "견고한 검증 루프를 구축하면 최종 결과물의 품질이 2~3배 향상됩니다"

**AOS 품질 게이트 체크리스트**:

```
□ TypeScript: tsc --noEmit (에러 0)
□ Python: ruff check (에러 0)
□ Backend 테스트: pytest --tb=short (전체 통과)
□ Dashboard 테스트: npm test (전체 통과)
□ 빌드: npm run build (성공)
□ 타입 안전성: 새 함수에 타입 힌트 포함
□ 에러 처리: try-catch 및 적절한 에러 메시지
```

---

## AOS 검증 도구 매핑

| Boris Cherny 원칙 | KiiPS (원본) | AOS (적응) |
|-------------------|-------------|-----------|
| 빌드 검증 | Maven `mvn package` | `pytest` + `npm run build` |
| 테스트 실행 | JUnit | pytest (Backend) + Vitest (Dashboard) |
| 코드 포매팅 | google-java-format | ruff (Python) + prettier (TS) |
| 린트 | Checkstyle | ruff check (Python) + ESLint (TS) |
| 타입 체크 | Java compiler | tsc --noEmit (TS) + mypy (Python, optional) |
| 배포 | WAR/JAR deploy | Docker compose + uvicorn |
| VCS | SVN commit | Git commit + push + PR |

---

## 워크플로우 적용 예시

### 새 기능 구현 시

```
1. /dev-docs → 계획 수립
2. 구현 (코드 작성)
3. PostToolUse 훅 → 자동 포매팅 (ruff, prettier)
4. /verify-app → tsc + ruff + pytest + build
5. quality-validator 에이전트 → 코드 리뷰
6. /commit-push-pr → 커밋 + 푸시 + PR
```

### 버그 수정 시

```
1. 문제 재현 및 분석
2. 수정 구현
3. /verify-app → 검증
4. test-automation-specialist → 회귀 테스트 추가
5. /commit-push-pr → 커밋 + PR
```

---

## 관련 문서

- `verification-loop` 스킬 - 검증 루프 상세
- `.claude/commands/` - 워크플로우 커맨드
- `.claude/agents/shared/quality-reference.md` - 품질 기준
