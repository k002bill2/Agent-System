"""기본 바인드 주소는 루프백이어야 한다.

`0.0.0.0` 기본값은 개발 노트북을 켜 두는 것만으로 백엔드를 같은 네트워크
(카페 Wi-Fi, 공유 오피스)에 노출한다. AOS 는 로컬 파일 시스템·터미널·MCP 서버를
조작하는 표면이라 노출 비용이 크다.

기본값은 `127.0.0.1`, 배포에서의 와일드카드 바인드는 `HOST` 환경변수로 명시
지정한다 — 기본을 안전하게 하되 탈출구는 남긴다.

`Settings` 는 저장소 루트 `.env` 를 읽으므로(`PROJECT_ROOT_ENV`), 기본값 단언은
`_env_file=None` + `HOST` 삭제로 격리한다. 그러지 않으면 개발자 `.env` 값에
따라 로컬/CI 판정이 갈린다.
"""

import pytest

from config import Settings

LOOPBACK = "127.0.0.1"
WILDCARD = "0.0.0.0"


@pytest.fixture
def isolated_env(monkeypatch):
    """프로세스 환경의 HOST 를 제거해 코드 기본값만 남긴다."""
    monkeypatch.delenv("HOST", raising=False)


def test_default_host_is_loopback(isolated_env):
    """어떤 오버라이드도 없을 때 기본 바인드는 루프백이다."""
    settings = Settings(_env_file=None)

    assert settings.host == LOOPBACK


def test_explicit_deployment_host_override_still_works(monkeypatch):
    """배포용 와일드카드 바인드는 HOST 환경변수로 여전히 가능하다."""
    monkeypatch.setenv("HOST", WILDCARD)

    settings = Settings(_env_file=None)

    assert settings.host == WILDCARD


def test_arbitrary_host_override_is_honored(monkeypatch):
    """특정 인터페이스 지정도 그대로 통과한다."""
    monkeypatch.setenv("HOST", "10.0.0.5")

    settings = Settings(_env_file=None)

    assert settings.host == "10.0.0.5"


@pytest.mark.parametrize(
    ("host_env", "expected"),
    [(None, LOOPBACK), ("10.0.0.5", "10.0.0.5"), (WILDCARD, WILDCARD)],
)
def test_main_binds_to_configured_host(monkeypatch, host_env, expected):
    """엔트리포인트가 설정값을 실제로 uvicorn 에 넘긴다 (하드코딩 금지).

    `get_settings` 는 lru_cache 라 테스트마다 비워야 환경변수가 반영된다.
    """
    import config
    import main as backend_main

    if host_env is None:
        monkeypatch.delenv("HOST", raising=False)
    else:
        monkeypatch.setenv("HOST", host_env)

    captured: dict[str, object] = {}

    def fake_run(app, **kwargs):
        captured["app"] = app
        captured.update(kwargs)

    monkeypatch.setattr(backend_main.uvicorn, "run", fake_run)

    config.get_settings.cache_clear()
    try:
        backend_main.main()
    finally:
        config.get_settings.cache_clear()

    assert captured["host"] == expected
