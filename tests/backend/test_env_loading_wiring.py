"""Wiring for where the backend reads its ``.env`` from.

The backend has two config paths that must agree on one file. ``Settings``
(``config.py``) declares ``env_file`` for pydantic; ``api/app.py`` calls
``load_dotenv`` so the module-level ``os.getenv`` readers — ``db.database``'s
``DATABASE_URL``, ``agents.base``'s model defaults, ``api.llm``'s
``USE_DATABASE`` — see the same values.

When they disagree, the failure is invisible to the suite. Every test passes
because pytest injects its own environment, and the app dies only at startup,
with an error naming the *consequence* (an auth failure against Postgres)
rather than the cause. That is what a git worktree produces: the repo-root
``.env`` is present, ``src/backend/.env`` is not, and only the ``load_dotenv``
half falls back to its defaults.

The independently computed ``_REPO_ROOT`` below is the point of these tests. An
assertion that the two constants merely equal each other stays green when both
move to the same wrong place.

These compare *declared* paths and never call ``resolve()`` on the ``.env``
component. A checkout may carry a ``src/backend/.env`` symlink pointing at the
repo root — resolving would collapse the wrong path onto the right one and make
the whole file pass no matter which one the code picked.
"""

import ast
from pathlib import Path

import api.app
import config

# Anchor derived from this file's own location, not from the code under test:
# tests/backend/test_env_loading_wiring.py -> tests/backend -> tests -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[2]


def test_settings_env_file_is_repo_root_dotenv() -> None:
    """``Settings`` reads the repo-root ``.env``, not a backend-local one."""
    assert config.PROJECT_ROOT_ENV == _REPO_ROOT / ".env"


def test_app_loads_the_same_dotenv_as_settings() -> None:
    """``api.app`` imports the constant instead of recomputing the path.

    Recomputing is what drifted: ``app.py`` resolved ``src/backend/.env`` while
    ``config.py`` resolved the repo root. Importing the name is what keeps the
    two halves from diverging again, so assert the import itself.
    """
    assert api.app.PROJECT_ROOT_ENV is config.PROJECT_ROOT_ENV


def test_dotenv_path_is_not_inside_src_backend() -> None:
    """The old location is stated explicitly so a revert reads as a failure."""
    backend_local = _REPO_ROOT / "src" / "backend" / ".env"
    assert config.PROJECT_ROOT_ENV != backend_local


def _dotenv_call_arguments(source: Path) -> list[str]:
    """Return the source text of every ``load_dotenv`` argument in a file.

    Reading the call site rather than the runtime state is deliberate: by the
    time a test imports the module, ``load_dotenv`` has already run and left no
    record of which path it was handed.
    """
    tree = ast.parse(source.read_text(encoding="utf-8"))
    calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "load_dotenv"
    ]
    return [ast.unparse(call.args[0]) if call.args else "" for call in calls]


def test_every_backend_load_dotenv_passes_the_shared_constant() -> None:
    """No backend module loads a ``.env`` of its own choosing.

    Importing ``PROJECT_ROOT_ENV`` is not the same as passing it. A module can
    import the name and still call ``load_dotenv(Path(__file__).parent /
    ".env")``, or drop the argument entirely — a bare call walks up from the
    calling file and stops at the first ``.env`` it meets, which is how
    ``engine.py`` drifted. Both forms are what this asserts against, across the
    whole backend so a newly added module cannot reopen the split.
    """
    backend = _REPO_ROOT / "src" / "backend"
    sources = [p for p in backend.rglob("*.py") if ".venv" not in p.parts]
    assert sources, "backend sources not found — the anchor is wrong"

    offenders: dict[str, list[str]] = {}
    for path in sources:
        arguments = _dotenv_call_arguments(path)
        if any(argument != "PROJECT_ROOT_ENV" for argument in arguments):
            offenders[str(path.relative_to(_REPO_ROOT))] = arguments
    assert offenders == {}, f"load_dotenv called with a non-shared path: {offenders}"
