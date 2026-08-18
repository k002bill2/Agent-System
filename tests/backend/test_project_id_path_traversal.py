"""프로젝트 id 가 projects/ 밖으로 이탈하는 경로를 만들지 못하는지 검증.

배경: link/template 엔드포인트가 사용자 입력 id 를 `projects_dir / id` 로 결합해
symlink/디렉터리 생성 대상으로 쓴다. id 에 경로 구분자나 상위 참조가 섞이면
projects/ 밖에 항목이 만들어진다.
"""

from pathlib import Path

import pytest
from pydantic import ValidationError

from models.project import ProjectCreate, ProjectCreateFromTemplate, ProjectLinkRequest

# projects/ 밖으로 나가거나 경로 의미를 갖는 입력들
ESCAPING_IDS = [
    "../evil",
    "../../etc/passwd",
    "a/b",
    "a\\b",
    "/absolute",
    "..",
    ".",
    "",
    "with space",
    "trailing/",
]

VALID_IDS = [
    "my-project",
    "aos-web",
    "proj123",
    "a",
]


@pytest.mark.parametrize("bad_id", ESCAPING_IDS)
def test_link_request_rejects_escaping_id(bad_id: str) -> None:
    """ProjectLinkRequest 는 경로 이탈 가능한 id 를 거부한다."""
    with pytest.raises(ValidationError):
        ProjectLinkRequest(id=bad_id, source_path="/tmp/source")


@pytest.mark.parametrize("bad_id", ESCAPING_IDS)
def test_template_request_rejects_escaping_id(bad_id: str) -> None:
    """ProjectCreateFromTemplate 도 같은 제약을 받는다."""
    with pytest.raises(ValidationError):
        ProjectCreateFromTemplate(id=bad_id, name="Some Name")


@pytest.mark.parametrize("bad_id", ESCAPING_IDS)
def test_create_request_rejects_escaping_id(bad_id: str) -> None:
    """POST /projects 의 ProjectCreate 도 같은 제약을 받는다.

    register_project 가 저장한 id 는 이후 `projects_dir / project_id` 로
    심링크 경로에 쓰이므로 세 요청 모델 중 하나만 열려 있어도 벡터가 남는다.
    """
    with pytest.raises(ValidationError):
        ProjectCreate(id=bad_id, path="/tmp/source")


@pytest.mark.parametrize("good_id", VALID_IDS)
def test_create_request_accepts_slug_id(good_id: str) -> None:
    req = ProjectCreate(id=good_id, path="/tmp/source")
    assert req.id == good_id


@pytest.mark.parametrize("good_id", VALID_IDS)
def test_link_request_accepts_slug_id(good_id: str) -> None:
    """정상 slug 는 그대로 통과한다."""
    req = ProjectLinkRequest(id=good_id, source_path="/tmp/source")
    assert req.id == good_id


@pytest.mark.parametrize("good_id", VALID_IDS)
def test_template_request_accepts_slug_id(good_id: str) -> None:
    req = ProjectCreateFromTemplate(id=good_id, name="Some Name")
    assert req.id == good_id


def test_id_length_matches_db_column_width() -> None:
    """id 상한은 DB 컬럼 폭(ProjectModel.id = String(36))을 넘지 않아야 한다.

    넘어서면 검증은 통과하는데 DB insert 단계에서 실패해, 파일시스템 레지스트리에는
    있고 DB/ACL 테이블에는 없는 불일치가 조용히 생긴다.
    """
    id_36 = "a" * 36
    id_37 = "a" * 37

    assert ProjectCreate(id=id_36, path="/tmp/source").id == id_36

    for model, kwargs in (
        (ProjectCreate, {"path": "/tmp/source"}),
        (ProjectLinkRequest, {"source_path": "/tmp/source"}),
        (ProjectCreateFromTemplate, {"name": "Some Name"}),
    ):
        with pytest.raises(ValidationError):
            model(id=id_37, **kwargs)


@pytest.mark.parametrize("good_id", VALID_IDS)
def test_accepted_id_stays_inside_projects_dir(good_id: str) -> None:
    """불변식: 검증을 통과한 id 로 만든 경로는 항상 projects_dir 하위다.

    모델 제약이 느슨해지면 (예: pattern 완화) 이 테스트가 먼저 깨진다.
    """
    projects_dir = Path("/srv/aos/projects")
    candidate = (projects_dir / good_id).resolve()
    assert candidate.is_relative_to(projects_dir.resolve())
