"""Backward compatibility shim — real implementation in services.rag.

All imports from this module are re-exported from the rag subpackage.
Existing import sites need zero changes.
"""

from .rag import *  # noqa: F401, F403
