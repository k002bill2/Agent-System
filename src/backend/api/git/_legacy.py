"""Git API 집계 라우터 (분할 잔여).

`api/git.py`(2,022줄) 분할의 마지막 잔여물이다. 라우트 63개는 전부 도메인
모듈로 이동했고, 이 파일에는 집계 라우터 선언만 남았다.

`__init__.py`가 아직 여기서 `router`를 가져와 각 도메인 모듈을
`include_router` 한다. Task 11 에서 이 파일은 소멸하고 `__init__.py`가
라우터를 직접 생성한다.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/git", tags=["git"])
