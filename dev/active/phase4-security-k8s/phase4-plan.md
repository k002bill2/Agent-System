# Phase 4 구현 계획 (완료)

## 목표

프로덕션 수준의 보안 및 인프라 구축:
1. **E2E 암호화** - 민감 필드 암호화 + bcrypt 패스워드 + TLS
2. **RBAC 고도화** - 프로젝트별 접근제어 (viewer/editor/owner)
3. **Kubernetes 스케일링** - K8s 매니페스트 + Helm Chart + Dockerfile 최적화

## 구현 순서

E2E 암호화 → RBAC → Kubernetes (암호화가 K8s Secret/RBAC 기반이 되므로 먼저)

실제로는 3개 에이전트 병렬 실행으로 동시 구현 (파일 충돌 없음 확인됨)

## 파일 변경 요약

| 구분 | 새 파일 | 수정 파일 | 테스트 |
|------|---------|-----------|--------|
| E2E 암호화 | 7개 | 6개 | 25 passed |
| RBAC | 6개 | 5개 | 16 passed |
| Kubernetes | ~35개 | 1개 | - |
| 문서 | - | 3개 | tsc + build 통과 |
| **합계** | **~48개** | **~15개** | **41+ passed** |

## 아키텍처 다이어그램

```
                    ┌─────────────┐
                    │   Ingress   │ TLS 종료
                    │  (nginx)    │
                    └──────┬──────┘
                     /api  │  /
              ┌────────────┼────────────┐
              ▼                         ▼
     ┌────────────────┐      ┌──────────────────┐
     │    Backend      │      │    Dashboard      │
     │  (2-10 pods)    │      │   (2 pods)        │
     │  FastAPI+LG     │      │   nginx+React     │
     │  HPA CPU 70%    │      │                    │
     └───────┬─────────┘      └──────────────────┘
             │
     ┌───────┼───────┐
     ▼               ▼
┌──────────┐  ┌──────────┐
│PostgreSQL │  │  Redis   │
│StatefulSet│  │StatefulSet│
│  10Gi    │  │   5Gi    │
└──────────┘  └──────────┘
```

## 보안 계층

```
┌─ Layer 1: TLS (서비스 간 통신) ─────────────────┐
│  - Ingress TLS 종료                              │
│  - PostgreSQL/Redis TLS (선택적)                  │
│  - 자체서명 CA + 서비스 인증서                     │
├─ Layer 2: 인증 (JWT) ──────────────────────────┤
│  - OAuth (Google/GitHub) + Email/Password        │
│  - Access Token (60분) + Refresh Token (7일)     │
│  - bcrypt 패스워드 해싱 (자동 마이그레이션)        │
├─ Layer 3: 인가 (RBAC) ────────────────────────┤
│  - 시스템 역할: user / manager / admin           │
│  - 조직 역할: viewer / member / admin / owner    │
│  - 프로젝트 역할: viewer / editor / owner        │
├─ Layer 4: 데이터 암호화 ──────────────────────┤
│  - AES-256-GCM 필드 레벨 암호화                  │
│  - HKDF 키 파생 + 키 로테이션                    │
│  - EncryptedString SQLAlchemy 타입               │
├─ Layer 5: 네트워크 격리 ──────────────────────┤
│  - K8s NetworkPolicy (default deny)              │
│  - 명시적 허용 규칙만 적용                        │
└──────────────────────────────────────────────────┘
```

## 배포 가이드

### Docker Compose (기존, 변경 없음)
```bash
cd infra/scripts && ./dev.sh
```

### Kubernetes (신규)
```bash
# 방법 1: 직접 매니페스트
kubectl apply -f infra/k8s/base/

# 방법 2: Helm Chart (권장)
helm install aos infra/helm/aos/                    # 개발
helm install aos infra/helm/aos/ -f infra/helm/aos/values-production.yaml  # 프로덕션
```

### 암호화 활성화
```bash
# 마스터키 생성
python3 -c "import os; print(os.urandom(32).hex())"

# .env에 추가
ENCRYPTION_MASTER_KEY=<생성된 키>
```

## 향후 과제

- [ ] SAML SSO 구현 (SAMLConfigModel 존재, API 미구현)
- [ ] OIDC 지원 (config 필드 존재)
- [ ] MFA/2FA
- [ ] 접근 권한 변경 감사 로그
- [ ] 멤버 초대 이메일 알림
- [ ] CI/CD 파이프라인 (GitHub Actions + K8s 배포)
- [ ] 모니터링 (Prometheus + Grafana)
