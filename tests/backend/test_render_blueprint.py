"""render.yaml Blueprint 이 파싱 후에도 모든 서비스를 유지하는지 검증.

백엔드 테스트 디렉터리에 두는 이유: CI 가 실행하는 테스트 스위트가 여기 하나뿐이라
(`uv run pytest ../../tests/backend`) 배포 매니페스트 회귀를 잡을 수 있는 유일한 지점이다.

배경: YAML 매핑에서 같은 키가 두 번 나오면 뒤엣것이 앞엣것을 조용히 덮어쓴다.
render.yaml 에 `services:` 가 두 번 있어 web 서비스 정의가 통째로 사라진 적이 있다.
"""

from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
RENDER_YAML = REPO_ROOT / "render.yaml"

EXPECTED_SERVICES = {"aos-backend", "aos-dashboard", "aos-redis"}


def _load_blueprint() -> dict:
    return yaml.safe_load(RENDER_YAML.read_text(encoding="utf-8"))


def test_render_yaml_exists() -> None:
    assert RENDER_YAML.is_file(), f"render.yaml 없음: {RENDER_YAML}"


def test_all_services_survive_parsing() -> None:
    """파싱 결과에 backend / dashboard / redis 가 모두 남아야 한다."""
    blueprint = _load_blueprint()
    names = {svc.get("name") for svc in blueprint.get("services", [])}
    missing = EXPECTED_SERVICES - names
    assert not missing, (
        f"render.yaml 파싱 후 소실된 서비스: {sorted(missing)}. "
        f"파싱된 서비스: {sorted(n for n in names if n)}. "
        "최상위에 중복 키가 있으면 뒤엣것이 앞엣것을 덮어쓴다."
    )


def test_no_duplicate_top_level_keys() -> None:
    """중복 최상위 키 자체를 금지해 같은 회귀가 다시 생기지 않게 한다."""
    top_level_keys = [
        line.split(":", 1)[0]
        for line in RENDER_YAML.read_text(encoding="utf-8").splitlines()
        if line and not line[0].isspace() and not line.lstrip().startswith("#") and ":" in line
    ]
    duplicates = {key for key in top_level_keys if top_level_keys.count(key) > 1}
    assert not duplicates, f"render.yaml 최상위 중복 키: {sorted(duplicates)}"


def test_database_definition_present() -> None:
    """중복 키 병합 과정에서 databases 블록이 유실되지 않아야 한다."""
    blueprint = _load_blueprint()
    db_names = {db.get("name") for db in blueprint.get("databases", [])}
    assert "aos-db" in db_names, f"databases 에 aos-db 없음: {sorted(n for n in db_names if n)}"
