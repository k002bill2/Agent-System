"""Provider-neutral session summary helper tests."""

from pathlib import Path

import pytest

from services.session_summary import (
    SUMMARY_FAILED,
    generate_summary_from_messages,
    read_cached_summary,
    summary_cache_path,
)


def test_cache_path_uses_the_configured_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SUMMARY_CACHE_DIR", str(tmp_path))

    assert summary_cache_path("codex-1") == tmp_path / "codex-1.txt"


@pytest.mark.parametrize("session_id", ["../escape", "nested/id", "", "."])
def test_cache_path_rejects_ids_that_could_escape(
    session_id: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A Codex id comes out of the rollout's own metadata, so it is untrusted."""
    monkeypatch.setenv("SUMMARY_CACHE_DIR", str(tmp_path))

    with pytest.raises(ValueError):
        summary_cache_path(session_id)

    assert read_cached_summary(session_id) is None


@pytest.mark.asyncio
async def test_generate_refuses_an_unsafe_id_before_any_call(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SUMMARY_CACHE_DIR", str(tmp_path))

    result = await generate_summary_from_messages("../escape", [{"role": "user", "content": "hi"}])

    assert result == SUMMARY_FAILED
    assert list(tmp_path.iterdir()) == []
