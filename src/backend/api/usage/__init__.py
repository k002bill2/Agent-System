"""Usage API 패키지.

원래 단일 `api/usage.py`(1,244줄)를 도메인별로 분할한 결과.
소비자의 `from api.usage import router` 는 그대로 유효하다.

재노출은 **좁게** 한다 — 실측상 외부 소비자는 `api/app.py:89` 의
`router` 하나뿐이다. 이동한 이름까지 별칭으로 재노출하면
`monkeypatch.setattr(usage_mod, ...)` 가 별칭만 갈아끼우고 정작 그
이름을 읽는 서브모듈은 원본을 계속 봐서 테스트가 조용히 통과한다.
"""

from .routes import router

__all__ = ["router"]
