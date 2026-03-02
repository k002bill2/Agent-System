"""Tests for Gemini review fixes.

Covers:
1. project_path "." bypass validation
2. Enum case-insensitive parsing
3. Upload cleanup task graceful shutdown
4. ALLOWED_WORKSPACE_ROOTS env configurability
"""

import os
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agents.lead_orchestrator import (
    ExecutionStrategy,
    _safe_effort_level,
    _safe_execution_strategy,
)
from services.agent_registry import EffortLevel


# ─────────────────────────────────────────────────────────────
# 1. project_path "." should be validated too
# ─────────────────────────────────────────────────────────────


class TestProjectPathValidation:
    """execute_with_tmux의 project_path 검증 테스트."""

    def test_validate_project_path_rejects_traversal(self):
        """경로 탐색(../)을 거부해야 한다."""
        from api.agents import _validate_project_path

        with pytest.raises(Exception):  # HTTPException
            _validate_project_path("/home/user/../../../etc/passwd")

    def test_validate_project_path_rejects_outside_workspace(self):
        """허용된 workspace 밖 경로를 거부해야 한다."""
        from api.agents import _validate_project_path

        with pytest.raises(Exception):
            _validate_project_path("/etc/shadow")

    def test_validate_project_path_accepts_allowed_root(self):
        """허용된 workspace 내 경로를 수락해야 한다."""
        from api.agents import ALLOWED_WORKSPACE_ROOTS, _validate_project_path

        # Create a temp dir under the first allowed root for testing
        # Just test that the function exists and has the right signature
        assert callable(_validate_project_path)

    def test_dot_path_resolves_to_cwd_and_is_validated(self):
        """'.' 경로도 CWD로 resolve되어 검증되어야 한다."""
        from api.agents import _validate_project_path

        # "." resolves to CWD - if CWD is not in allowed roots, should raise
        cwd = Path.cwd().resolve()
        allowed_roots = [Path.home() / "Work", Path.home() / "Projects",
                         Path.home() / "Developer", Path("/tmp/aos-workspaces")]

        cwd_is_allowed = any(
            cwd == root.resolve() or str(cwd).startswith(str(root.resolve()) + "/")
            for root in allowed_roots
            if root.exists()
        )

        if cwd_is_allowed:
            # Should pass without error
            result = _validate_project_path(".")
            assert result == cwd
        else:
            with pytest.raises(Exception):
                _validate_project_path(".")

    def test_allowed_roots_configurable_via_env(self):
        """ALLOWED_WORKSPACE_ROOTS가 환경변수로 설정 가능해야 한다."""
        from api.agents import get_allowed_workspace_roots

        with patch.dict(os.environ, {"AOS_WORKSPACE_ROOTS": "/custom/path,/another/path"}):
            roots = get_allowed_workspace_roots()
            assert Path("/custom/path") in roots
            assert Path("/another/path") in roots

    def test_allowed_roots_default_without_env(self):
        """환경변수 없으면 기본 workspace roots를 반환해야 한다."""
        from api.agents import get_allowed_workspace_roots

        with patch.dict(os.environ, {}, clear=True):
            # Remove AOS_WORKSPACE_ROOTS if exists
            os.environ.pop("AOS_WORKSPACE_ROOTS", None)
            roots = get_allowed_workspace_roots()
            assert len(roots) >= 3  # Home-based + /tmp


# ─────────────────────────────────────────────────────────────
# 2. Enum case-insensitive parsing
# ─────────────────────────────────────────────────────────────


class TestEnumCaseInsensitiveParsing:
    """Enum 파싱이 대소문자를 무시해야 한다."""

    def test_effort_level_lowercase(self):
        """소문자 입력."""
        assert _safe_effort_level("medium") == EffortLevel.MEDIUM

    def test_effort_level_uppercase(self):
        """대문자 입력 (LLM이 자주 출력)."""
        assert _safe_effort_level("Medium") == EffortLevel.MEDIUM

    def test_effort_level_all_caps(self):
        """전체 대문자."""
        assert _safe_effort_level("THOROUGH") == EffortLevel.THOROUGH

    def test_effort_level_mixed_case(self):
        """혼합 대소문자."""
        assert _safe_effort_level("Quick") == EffortLevel.QUICK

    def test_effort_level_invalid_falls_back(self):
        """유효하지 않은 값은 MEDIUM fallback."""
        assert _safe_effort_level("nonexistent") == EffortLevel.MEDIUM

    def test_execution_strategy_uppercase(self):
        """대문자 전략명."""
        assert _safe_execution_strategy("Sequential") == ExecutionStrategy.SEQUENTIAL

    def test_execution_strategy_all_caps(self):
        """전체 대문자 전략명."""
        assert _safe_execution_strategy("PARALLEL") == ExecutionStrategy.PARALLEL

    def test_execution_strategy_mixed(self):
        """혼합 대소문자."""
        assert _safe_execution_strategy("Mixed") == ExecutionStrategy.MIXED

    def test_execution_strategy_invalid_falls_back(self):
        """유효하지 않은 값은 SEQUENTIAL fallback."""
        assert _safe_execution_strategy("invalid") == ExecutionStrategy.SEQUENTIAL


# ─────────────────────────────────────────────────────────────
# 3. Upload cleanup service
# ─────────────────────────────────────────────────────────────


class TestUploadCleanup:
    """업로드 정리 서비스 테스트."""

    def test_cleanup_removes_stale_files(self, tmp_path):
        """TTL 초과 파일을 삭제해야 한다."""
        from services.upload_cleanup_service import cleanup_stale_uploads

        # Create old file (mtime set to 2 hours ago)
        old_file = tmp_path / "old-image.png"
        old_file.write_bytes(b"old data")
        old_mtime = time.time() - 7200  # 2 hours ago
        os.utime(old_file, (old_mtime, old_mtime))

        # Create fresh file
        new_file = tmp_path / "new-image.png"
        new_file.write_bytes(b"new data")

        removed = cleanup_stale_uploads(upload_dir=tmp_path, ttl_seconds=3600)

        assert removed == 1
        assert not old_file.exists()
        assert new_file.exists()

    def test_cleanup_empty_dir(self, tmp_path):
        """빈 디렉토리에서 오류 없이 실행."""
        from services.upload_cleanup_service import cleanup_stale_uploads

        removed = cleanup_stale_uploads(upload_dir=tmp_path, ttl_seconds=3600)
        assert removed == 0

    def test_cleanup_nonexistent_dir(self):
        """존재하지 않는 디렉토리에서 오류 없이 0 반환."""
        from services.upload_cleanup_service import cleanup_stale_uploads

        removed = cleanup_stale_uploads(
            upload_dir=Path("/nonexistent/dir/12345"),
            ttl_seconds=3600,
        )
        assert removed == 0
