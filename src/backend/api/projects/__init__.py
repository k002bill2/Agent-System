"""Project Registry API 패키지.

`api/projects.py`(873줄)를 도메인별 모듈로 분할한 결과. 소비자의 import 경로는
분할 전과 동일하게 유지된다.

**이 라우터는 `/project-registry` 를 서빙한다 — `/projects` 가 아니다.**
`/api/projects/*` 는 orchestration 라우터의 소유다(OpenAPI 실측 2026-08-08).
패키지 이름이 이를 오인시키기 쉬우므로 여기 명시한다.

재노출 대상은 `router` 하나가 아니다 — 실측(2026-08-08) 결과 세 모듈이
`_get_admin_org_ids` 를 직접 import 한다: `api/project_configs.py:258`,
`api/claude_sessions.py:430`, `api/routes.py:213`. 언더스코어 접두사지만
실제로는 공개 계약이며, `router` 만 재노출하면 세 모듈이 ImportError 로 깨진다.
"""

from ._legacy import _get_admin_org_ids, router

__all__ = [
    "_get_admin_org_ids",
    "router",
]
