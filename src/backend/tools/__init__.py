"""Tool definitions for the Agent Orchestration System."""

from tools.file_tools import (
    read_file,
    write_file,
    edit_file,
    list_directory,
    search_files,
    search_content,
)
from tools.bash_tools import execute_bash
from tools.code_tools import run_tests, run_lint, run_typecheck
from tools.warp_tools import warp_agent_run, warp_list_models, warp_agent_with_mcp

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
