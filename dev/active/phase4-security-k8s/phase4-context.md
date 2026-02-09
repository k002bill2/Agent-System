# Phase 4 구현 컨텍스트

## 개요

**Phase 4: Kubernetes 스케일링, RBAC 고도화, E2E 암호화**

- 구현 일자: 2026-02-10
- 구현 방식: 3개 에이전트 병렬 실행 (encryption-agent, rbac-agent, k8s-agent)
- 이전 상태: Docker Compose 기반 배포, 기본 역할(user/manager/admin), SHA-256 패스워드, 암호화 없음

---

## 핵심 설계 결정

### 1. E2E 암호화

**암호화 알고리즘**: AES-256-GCM (AESGCM from cryptography.hazmat)
- 선택 이유: authenticated encryption (무결성 + 기밀성), 업계 표준
- 포맷: `v{version}:{nonce_b64}:{ciphertext_b64}` - 버전 관리로 향후 알고리즘 변경 가능

**키 관리**: HKDF 기반 마스터키에서 서비스별 키 파생
- `ENCRYPTION_MASTER_KEY` (hex-encoded 32+ bytes) → HKDF → 필드 암호화 키
- 키 로테이션: `KeyManager.rotate_key()` - 모든 암호화 필드 재암호화

**SQLAlchemy 통합**: `EncryptedString(TypeDecorator)` 커스텀 타입
- `process_bind_param`: 저장 시 자동 암호화
- `process_result_value`: 읽기 시 자동 복호화
- `ENCRYPTION_MASTER_KEY` 미설정 시 평문 저장 (하위 호환)
- config에서 직접 키 참조 (순환 import 방지)

**패스워드 마이그레이션**: SHA-256 → bcrypt 점진적 업그레이드
- SHA-256 레거시 해시 감지: 97자 길이, `{salt32}:{hash64}` 포맷
- 로그인 성공 시 자동으로 bcrypt 재해싱
- config.bcrypt_rounds = 12 사용

### 2. RBAC 프로젝트별 접근제어

**역할 계층**: `viewer(0) < editor(1) < owner(2)`

**하위 호환 전략** (가장 중요한 결정):
- `project_access` 테이블에 레코드가 없는 프로젝트 → 모든 인증 사용자 접근 허용
- 첫 owner 추가 시 접근제어 활성화
- 시스템 admin (role=="admin" or is_admin==True)은 모든 프로젝트 바이패스

**기존 API 보호**:
- GET /projects → 접근 가능한 프로젝트만 반환
- GET /projects/{id} → viewer+
- PUT /projects/{id} → editor+
- DELETE /projects/{id} → owner

### 3. Kubernetes

**배포 아키텍처**:
- Backend: Deployment (2-10 replicas, HPA CPU 70%)
- Dashboard: Deployment (2 replicas, nginx-alpine)
- PostgreSQL: StatefulSet (1 replica, 10Gi PVC)
- Redis: StatefulSet (1 replica, 5Gi PVC)
- NetworkPolicy: 기본 deny + 선택적 허용

**Helm Chart**: 환경별 values 분리 (dev/production)

**Dockerfile 최적화**: 멀티스테이지 빌드, non-root user, HEALTHCHECK

---

## 의존성 추가

**pyproject.toml** (`src/backend/`):
- `cryptography` - AES-256-GCM 암호화
- `bcrypt` - 패스워드 해싱

---

## 환경변수 추가

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `ENCRYPTION_MASTER_KEY` | (빈값) | AES-256 마스터키 (미설정시 암호화 비활성) |
| `DB_SSL_MODE` | (빈값) | PostgreSQL SSL 모드 (require, verify-ca 등) |
| `DB_SSL_CERT_PATH` | (빈값) | SSL 인증서 경로 |
| `REDIS_SSL` | false | Redis TLS 활성화 |

---

## DB 마이그레이션

**Migration 6** (`database.py`): `project_access` 테이블 생성
- Columns: id, project_id, user_id, role, granted_by, created_at, updated_at
- Indexes: project_id, user_id, (project_id+user_id) unique
- FK: users.id ON DELETE CASCADE
