"""Tool definitions for the Agent Orchestration System."""

from tools.bash_tools import execute_bash
from tools.code_tools import run_lint, run_tests, run_typecheck
from tools.file_tools import (
    edit_file,
    list_directory,
    read_file,
    search_content,
    search_files,
    write_file,
)
from tools.warp_tools import warp_agent_run, warp_agent_with_mcp, warp_list_models

# All available tools
ALL_TOOLS = [
    # File tools
    read_file,
    write_file,
    edit_file,
    list_directory,
    search_files,
    search_content,
    # Bash tools
    execute_bash,
    # Code tools
    run_tests,
    run_lint,
    run_typecheck,
    # Warp AI agent tools
    warp_agent_run,
    warp_list_models,
    warp_agent_with_mcp,
]

__all__ = [
    "ALL_TOOLS",
    "read_file",
    "write_file",
    "edit_file",
    "list_directory",
    "search_files",
    "search_content",
    "execute_bash",
    "run_tests",
    "run_lint",
    "run_typecheck",
    "warp_agent_run",
    "warp_list_models",
    "warp_agent_with_mcp",
]
