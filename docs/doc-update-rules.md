# 문서 자동 업데이트 규칙

기능 구현 완료 후 아래 테이블 기준으로 문서를 업데이트하세요.

| 변경 내용 | 업데이트 문서 | 업데이트 항목 |
|-----------|--------------|---------------|
| 새 API 엔드포인트 | `docs/api/` 도메인별 파일 | 해당 도메인 파일에 추가 (`docs/api-reference.md` 인덱스 참조) |
| 새 기능/서비스 | `docs/features.md` | 번호 매긴 새 섹션 추가 |
| 새 페이지 | `docs/dashboard.md` | Pages 테이블에 추가 |
| 새 컴포넌트 | `docs/dashboard.md` | Components 섹션에 추가 |
| 새 Store | `docs/dashboard.md` | Zustand Stores 테이블 추가 |
| 새 디렉토리 | `docs/dashboard.md` | Directory Structure 업데이트 |

## 자동화 체크리스트 (구현 완료 시)

1. Backend: models, services, api 파일 작성
2. Frontend: store, components, page 파일 작성
3. Tests: 테스트 파일 작성
4. **Docs: 위 테이블 기준으로 문서 업데이트** (필수)
