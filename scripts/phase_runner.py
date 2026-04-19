#!/usr/bin/env python3
"""Thin wrapper so repo root can run: python scripts/phase_runner.py <cmd> <dir>.

Adds src/backend to sys.path then delegates to phase_runner.__main__:main.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "src" / "backend"))

from phase_runner.__main__ import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
