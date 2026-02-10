# Phase 4 태스크 체크리스트

## 1. E2E 암호화

- [x] `src/backend/services/encryption_service.py` - AES-256-GCM encrypt/decrypt
- [x] `src/backend/services/key_management.py` - HKDF 키 파생, 키 로테이션
- [x] `src/backend/db/types.py` - EncryptedString SQLAlchemy TypeDecorator
- [x] `src/backend/db/models.py` - ChannelConfigModel/SAMLConfigModel에 EncryptedString 적용
- [x] `src/backend/services/auth_service.py` - bcrypt 마이그레이션 (SHA-256→bcrypt 자동 업그레이드)
- [x] `src/backend/config.py` - encryption_master_key, db_ssl_mode, db_ssl_cert_path, redis_ssl 추가
- [x] `src/backend/db/database.py` - SSL connect_args 지원
- [x] `src/backend/pyproject.toml` - cryptography, bcrypt 의존성 추가
- [x] `.env.example` - 새 환경변수 추가
- [x] `infra/tls/generate-certs.sh` - 자체서명 CA + 서비스 인증서 생성
- [x] `infra/tls/openssl.cnf` - SAN 포함 TLS 설정
- [x] `tests/backend/test_encryption_service.py` - 12 tests passed
- [x] `tests/backend/test_password_upgrade.py` - 13 tests passed

## 2. RBAC 프로젝트별 접근제어

- [x] `src/backend/db/models.py` - ProjectAccessModel 추가
- [x] `src/backend/db/database.py` - Migration 6: project_access 테이블
- [x] `src/backend/services/project_access_service.py` - grant/revoke/update/list/check
- [x] `src/backend/api/project_access.py` - REST API (GET/POST/PUT/DELETE + /me)
- [x] `src/backend/api/deps.py` - require_project_role() 추가
- [x] `src/backend/api/app.py` - project_access_router 등록
- [x] `src/backend/api/routes.py` - 기존 프로젝트 CRUD에 RBAC 적용
- [x] `src/dashboard/src/stores/projectAccess.ts` - Zustand 스토어
- [x] `src/dashboard/src/components/projects/ProjectMembersPanel.tsx` - 멤버 관리 UI
- [x] `tests/backend/test_project_access_service.py` - 서비스 테스트
- [x] `tests/backend/test_project_access_api.py` - API 테스트

## 3. Kubernetes 스케일링

### K8s Base 매니페스트 (`infra/k8s/base/`)
- [x] `namespace.yaml`
- [x] `backend-deployment.yaml` - 2 replicas, probes, resource limits
- [x] `backend-service.yaml` - ClusterIP:8000
- [x] `dashboard-deployment.yaml` - 2 replicas
- [x] `dashboard-service.yaml` - ClusterIP:80
- [x] `postgres-statefulset.yaml` - 1 replica, 10Gi PVC
- [x] `postgres-service.yaml` - ClusterIP:5432
- [x] `redis-statefulset.yaml` - 1 replica, 5Gi PVC
- [x] `redis-service.yaml` - ClusterIP:6379
- [x] `configmap.yaml` - 비민감 설정
- [x] `secrets.yaml` - base64 플레이스홀더
- [x] `ingress.yaml` - nginx, TLS, 경로 라우팅
- [x] `hpa.yaml` - CPU 70%, 2-10 replicas
- [x] `network-policies.yaml` - default deny + 허용 규칙

### Helm Chart (`infra/helm/aos/`)
- [x] `Chart.yaml` - v0.1.0
- [x] `values.yaml` - 개발 기본값
- [x] `values-production.yaml` - 프로덕션 오버라이드
- [x] `templates/_helpers.tpl` - 공통 헬퍼
- [x] `templates/*.yaml` - 전체 리소스 템플릿 (14개)
- [x] `templates/NOTES.txt` - 설치 후 안내
- [x] `templates/tests/test-connection.yaml` - 헬스체크 테스트

### Dockerfile 최적화
- [x] `infra/docker/Dockerfile.backend` - 멀티스테이지 빌드, non-root, HEALTHCHECK
- [x] `infra/docker/Dockerfile.dashboard` - node→nginx 멀티스테이지
- [x] `infra/docker/nginx.conf` - SPA 라우팅, gzip, 캐시

## 4. 문서 업데이트

- [x] `docs/features.md` - #35 E2E 암호화, #36 RBAC, #37 K8s 스케일링 섹션 추가
- [x] `docs/api-reference.md` - Project Access API 테이블 추가
- [x] `docs/dashboard.md` - ProjectMembersPanel, projectAccess 스토어, 디렉토리 구조 추가

## 5. 검증

- [x] TypeScript 타입 체크 (tsc --noEmit) - 통과
- [x] Python 구문 검증 (새 파일 5개) - 통과
- [x] Dashboard 프로덕션 빌드 (npm run build) - 통과
- [x] 공유 파일 충돌 검사 (models.py, database.py, deps.py) - 충돌 없음
- [x] 전체 테스트: 190 passed (encryption 25 + rbac 16 + 기존)
