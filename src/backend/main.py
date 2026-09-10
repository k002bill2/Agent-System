"""Main entry point for the backend server."""

import uvicorn

from config import get_settings


def main():
    """Run the FastAPI server.

    바인드 주소·포트를 하드코딩하지 않는다 — `config.Settings` 가 정본이고
    `HOST`/`PORT` 환경변수가 그 위에 얹힌다. 하드코딩된 `0.0.0.0` 은 설정의
    안전한 기본값을 무력화한다.
    """
    settings = get_settings()
    uvicorn.run(
        "api.app:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
