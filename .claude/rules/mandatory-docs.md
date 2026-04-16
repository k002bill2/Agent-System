# 필수 문서 참조 규칙

코드 수정 전 해당 영역의 문서를 Read 도구로 반드시 읽어야 합니다.

| 수정 대상 | 필수 Read 문서 |
|-----------|---------------|
| `src/backend/` 파일 | `docs/architecture.md` |
| `src/dashboard/` 파일 | `docs/dashboard.md` |
| API 엔드포인트 추가/수정 | `docs/api-reference.md` (→ `docs/api/` 도메인별 인덱스) |
| 새 기능 번호 추가 | `docs/features.md` |
| Agent/Task 관련 모델 | `docs/ontology.md` |
| Claude Code 통합 아키텍처 | `docs/architecture/claude-code-integration.md` |
| 기능 구현 완료 후 | `docs/doc-update-rules.md` |

문서를 읽지 않고 수정하면 기존 패턴과 충돌합니다. "이미 알고 있다"는 근거가 아닙니다.

## 문서 관리

- CLAUDE.md에 새 기능 설명 추가 금지 → `docs/`에 추가
- 기능 구현 후 관련 `docs/` 문서 업데이트 필수
