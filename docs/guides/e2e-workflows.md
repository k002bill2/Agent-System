# End-to-End 개발 워크플로우 (AOS)

AOS 프로젝트의 전체 개발 수명 주기를 다루는 종합 워크플로우 가이드.

---

## 목차

1. [기능 개발 수명 주기](#workflow-1-기능-개발-수명-주기)
2. [빌드 & 배포 사이클](#workflow-2-빌드--배포-사이클)
3. [트러블슈팅](#workflow-3-트러블슈팅)
4. [코드 리뷰 준비](#workflow-4-코드-리뷰-준비)
5. [긴급 핫픽스](#workflow-5-긴급-핫픽스)

---

## Workflow 1: 기능 개발 수명 주기

### Phase 1: 계획 (Dev Docs)

```bash
# Dev Docs 3-파일 시스템 생성
/dev-docs
```

**결과물**:
```
dev/active/[feature-name]/
├── [feature-name]-plan.md     # 승인된 계획
├── [feature-name]-context.md  # 핵심 결정사항
└── [feature-name]-tasks.md    # 체크리스트
```

**단계**:
1. 요구사항 분석
2. 기존 코드베이스 구조 파악
3. 단계별 구현 계획 수립
4. 사용자 승인 후 진행

### Phase 2: 구현

**Backend** (FastAPI + LangGraph):
```bash
# 에이전트/서비스 구현
cd src/backend

# 코드 변경 후 즉시 검증
ruff check . --fix
pytest ../../tests/backend --tb=short -x
```

**Dashboard** (React + TypeScript):
```bash
# 컴포넌트/페이지 구현
cd src/dashboard

# 코드 변경 후 즉시 검증
npx tsc --noEmit
npm test -- --run
```

**품질 게이트**:
- [ ] ruff check 에러 0
- [ ] tsc --noEmit 에러 0
- [ ] pytest 전체 통과
- [ ] npm test 전체 통과
- [ ] 타입 힌트 포함 (Python + TypeScript)

### Phase 3: 로컬 검증

```bash
# 인프라 시작
cd infra/scripts && ./dev.sh

# Backend 실행
cd src/backend && uvicorn api.app:app --reload --port 8000

# Dashboard 실행
cd src/dashboard && npm run dev
```

**검증 항목**:
- [ ] Backend API 응답 정상 (localhost:8000/docs)
- [ ] Dashboard 렌더링 정상 (localhost:5173)
- [ ] 에러 로그 없음
- [ ] 새 기능 동작 확인

### Phase 4: 테스트

```bash
# Backend 테스트
cd src/backend && pytest ../../tests/backend -v --tb=short

# Dashboard 테스트
cd src/dashboard && npm test -- --run --coverage

# 통합 검증
/verify-app
```

### Phase 5: 커밋 & PR

```bash
# 전체 검증 후 커밋
/commit-push-pr
```

**워크플로우 요약**:
```
요구사항 → /dev-docs → 구현 → PostToolUse 훅 (자동 포매팅)
→ /verify-app → 로컬 검증 → /commit-push-pr → PR 생성
```

---

## Workflow 2: 빌드 & 배포 사이클

코드 변경 후 빠른 재빌드/재배포 사이클.

### Backend

```bash
# 1. 의존성 업데이트 (필요시)
cd src/backend && uv pip install -e .

# 2. 린트 + 포맷
ruff format . && ruff check . --fix

# 3. 테스트
pytest ../../tests/backend --tb=short -x

# 4. 서버 재시작 (uvicorn --reload 사용 시 자동)
```

### Dashboard

```bash
# 1. 의존성 업데이트 (필요시)
cd src/dashboard && npm install

# 2. 타입 체크
npx tsc --noEmit

# 3. 테스트
npm test -- --run

# 4. 프로덕션 빌드
npm run build
```

### Docker 배포

```bash
cd infra
docker compose up --build -d
```

### 스킬 체인

```
ruff format → ruff check → pytest → tsc → npm test → npm run build
```

---

## Workflow 3: 트러블슈팅

### Step 1: 에러 식별

```bash
# Backend 에러 확인
cd src/backend
# uvicorn 로그 확인 또는
pytest ../../tests/backend --tb=long -x

# Dashboard 에러 확인
cd src/dashboard
npx tsc --noEmit  # 타입 에러
npm test -- --run  # 테스트 실패
```

### Step 2: 근본 원인 분석

**FastAPI 관련**:
| 증상 | 가능 원인 | 확인 방법 |
|------|----------|----------|
| 500 Internal Error | 서비스 로직 예외 | 스택 트레이스 확인 |
| 422 Validation Error | Pydantic 스키마 불일치 | 요청 body 검증 |
| CORS 에러 | CORS_ORIGINS 설정 | `.env` CORS_ORIGINS 확인 |

**LangGraph 관련**:
| 증상 | 가능 원인 | 확인 방법 |
|------|----------|----------|
| 노드 실행 실패 | 상태 스키마 불일치 | `orchestrator/graph.py` 확인 |
| 무한 루프 | 조건부 엣지 로직 | max_iterations 설정 확인 |
| LLM 호출 실패 | API 키/프로바이더 설정 | `.env` LLM_PROVIDER 확인 |

**asyncpg/PostgreSQL 관련**:
| 증상 | 가능 원인 | 확인 방법 |
|------|----------|----------|
| prepared statement 에러 | 캐시 충돌 (우선 확인!) | connection pool 설정 확인 |
| connection refused | DB 미실행 | `docker compose ps` 확인 |
| migration 에러 | 스키마 불일치 | alembic history 확인 |

**React/Dashboard 관련**:
| 증상 | 가능 원인 | 확인 방법 |
|------|----------|----------|
| 빈 화면 | JS 런타임 에러 | 브라우저 콘솔 확인 |
| 상태 미반영 | Zustand 구독 누락 | 스토어 셀렉터 확인 |
| API 호출 실패 | Backend 미실행/CORS | 네트워크 탭 확인 |

### Step 3: 수정 & 검증

```bash
# 수정 후 검증
/verify-app

# 특정 테스트만 재실행
pytest ../../tests/backend/test_specific.py -v
npm test -- --run src/specific.test.ts
```

### 디버깅 규칙 (CLAUDE.md)

- 같은 수정을 **2회 시도 후 실패**하면 멈추기
- 근본 원인 분석 후 다른 접근 제안
- 같은 전략 3회 재시도 금지

---

## Workflow 4: 코드 리뷰 준비

### 리뷰 체크리스트

```markdown
## 빌드 검증
- [ ] ruff check 에러 0
- [ ] tsc --noEmit 에러 0
- [ ] pytest 전체 통과
- [ ] npm test 전체 통과
- [ ] npm run build 성공

## API 검증 (Backend 변경 시)
- [ ] 엔드포인트 응답 정상
- [ ] Pydantic 스키마 일치
- [ ] 인증/인가 적용
- [ ] 에러 핸들링 구현

## 코드 품질
- [ ] Python 타입 힌트 일관 사용
- [ ] TypeScript strict 모드 준수
- [ ] 에러 처리 포괄적
- [ ] 로깅 추가 (디버깅용)
- [ ] 보안 취약점 없음 (SQL 인젝션, XSS)

## 테스트
- [ ] 새 기능에 대한 테스트 추가
- [ ] 엣지 케이스 테스트
- [ ] 에러 시나리오 테스트

## 문서
- [ ] API 변경 시 docs/api-reference.md 업데이트
- [ ] 기능 변경 시 docs/features.md 업데이트
```

### 스킬 체인

```
/review → /verify-app → /commit-push-pr
```

---

## Workflow 5: 긴급 핫픽스

프로덕션 문제 긴급 대응 프로토콜.

### 빠른 대응 순서

```bash
# 1. 에러 분석
cd src/backend
grep -i "ERROR\|Exception" logs/*.log | tail -50

# 2. 영향 범위 파악
git log --oneline -5  # 최근 변경 확인

# 3. 최소 수정 구현
# (문제 해결에 필요한 최소한의 코드만 변경)

# 4. 빠른 검증
pytest ../../tests/backend --tb=short -x
cd ../dashboard && npx tsc --noEmit

# 5. 핫픽스 커밋
git checkout -b hotfix/[issue-description]
git add [changed-files]
git commit -m "fix: [critical issue description]"
git push -u origin hotfix/[issue-description]

# 6. PR 생성
gh pr create --title "HOTFIX: [issue]" --body "긴급 수정"
```

### 핫픽스 후 조치

- [ ] 적절한 수정 일정 수립 (근본 원인 해결)
- [ ] 문서 업데이트
- [ ] 유사 이슈 모니터링 설정
- [ ] 근본 원인 분석 완료

---

## 빠른 참조

| 워크플로우 | 주요 스킬/커맨드 | 예상 소요 |
|-----------|----------------|----------|
| 기능 개발 | `/dev-docs`, `/verify-app`, `/commit-push-pr` | 2-8시간 |
| 빌드 & 배포 | `ruff`, `pytest`, `npm run build` | 5-15분 |
| 트러블슈팅 | `/verify-app`, `systematic-debugging` 스킬 | 30-120분 |
| 코드 리뷰 | `/review`, `/verify-app` | 30-60분 |
| 긴급 핫픽스 | `pytest`, `gh pr create` | 15-30분 |

---

## 관련 문서

- `CLAUDE.md` - 프로젝트 메인 가이드
- `docs/architecture.md` - 시스템 아키텍처
- `docs/api-reference.md` - API 문서
- `docs/guides/boris-cherny-workflow-guide.md` - Boris Cherny 원칙
- `docs/guides/agent-teams-guide.md` - Agent Teams
