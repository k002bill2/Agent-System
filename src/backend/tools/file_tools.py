"""File manipulation tools."""

import glob as glob_module
import json
import os
import re
from typing import Any

from langchain_core.tools import tool


class FileChangeResult:
    """
    Result class that includes before/after content for diff display.

    The result can be serialized to include change information
    that the frontend can use to display diffs.
    """

    def __init__(
        self,
        success: bool,
        message: str,
        path: str | None = None,
        old_content: str | None = None,
        new_content: str | None = None,
    ):
        self.success = success
        self.message = message
        self.path = path
        self.old_content = old_content
        self.new_content = new_content

    def __str__(self) -> str:
        """Return message for tool output."""
        return self.message

    def to_dict(self) -> dict[str, Any]:
        """Return full result as dict (for WebSocket events)."""
        result = {
            "success": self.success,
            "message": self.message,
        }
        if self.path:
            result["path"] = self.path
        if self.old_content is not None:
            result["old_content"] = self.old_content
        if self.new_content is not None:
            result["new_content"] = self.new_content
        return result


@tool
def read_file(path: str) -> str:
    """
    파일을 읽고 내용을 반환합니다.

    Args:
        path: 읽을 파일의 경로

    Returns:
        파일 내용 또는 오류 메시지
    """
    try:
        path = os.path.expanduser(path)
        with open(path, encoding="utf-8") as f:
            content = f.read()
        return content
    except FileNotFoundError:
        return f"Error: File not found: {path}"
    except PermissionError:
        return f"Error: Permission denied: {path}"
    except Exception as e:
        return f"Error reading file: {str(e)}"


@tool
def write_file(path: str, content: str) -> str:
    """
    파일에 내용을 씁니다. 파일이 없으면 생성하고, 있으면 덮어씁니다.

    Args:
        path: 파일 경로
        content: 쓸 내용

    Returns:
        성공 또는 오류 메시지 (JSON with old/new content for diff)
    """
    try:
        path = os.path.expanduser(path)

        # Read existing content for diff
        old_content = ""
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    old_content = f.read()
            except Exception:
                old_content = ""

        # Create parent directories if they don't exist
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)

        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

        # Return JSON with change info for diff viewer
        result = FileChangeResult(
            success=True,
            message=f"Successfully wrote to {path}",
            path=path,
            old_content=old_content,
            new_content=content,
        )
        return json.dumps(result.to_dict())

    except PermissionError:
        return f"Error: Permission denied: {path}"
    except Exception as e:
        return f"Error writing file: {str(e)}"


@tool
def edit_file(path: str, old_string: str, new_string: str) -> str:
    """
    파일에서 특정 문자열을 찾아 다른 문자열로 교체합니다.

    Args:
        path: 파일 경로
        old_string: 찾을 문자열
        new_string: 교체할 문자열

    Returns:
        성공 또는 오류 메시지 (JSON with old/new content for diff)
    """
    try:
        path = os.path.expanduser(path)
        with open(path, encoding="utf-8") as f:
            old_content = f.read()

        if old_string not in old_content:
            return f"Error: String not found in file: {old_string[:50]}..."

        # Count occurrences
        count = old_content.count(old_string)
        if count > 1:
            return f"Error: String appears {count} times. Please provide more context for unique match."

        new_content = old_content.replace(old_string, new_string)

        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)

        # Return JSON with change info for diff viewer
        result = FileChangeResult(
            success=True,
            message=f"Successfully replaced string in {path}",
            path=path,
            old_content=old_content,
            new_content=new_content,
        )
        return json.dumps(result.to_dict())

    except FileNotFoundError:
        return f"Error: File not found: {path}"
    except Exception as e:
        return f"Error editing file: {str(e)}"


@tool
def list_directory(path: str = ".", pattern: str | None = None) -> str:
    """
    디렉토리의 파일 및 하위 디렉토리 목록을 반환합니다.

    Args:
        path: 디렉토리 경로 (기본값: 현재 디렉토리)
        pattern: 필터링할 glob 패턴 (예: "*.py")

    Returns:
        파일 목록 또는 오류 메시지
    """
    try:
        path = os.path.expanduser(path)

        if not os.path.exists(path):
            return f"Error: Path does not exist: {path}"

        if not os.path.isdir(path):
            return f"Error: Not a directory: {path}"

        entries = os.listdir(path)

        # Apply pattern filter if provided
        if pattern:
            entries = [e for e in entries if glob_module.fnmatch.fnmatch(e, pattern)]

        # Sort and format
        entries.sort()
        result = []
        for entry in entries:
            full_path = os.path.join(path, entry)
            if os.path.isdir(full_path):
                result.append(f"📁 {entry}/")
            else:
                size = os.path.getsize(full_path)
                result.append(f"📄 {entry} ({_format_size(size)})")

        if not result:
            return f"Directory is empty: {path}"

        return f"Contents of {path}:\n" + "\n".join(result)

    except PermissionError:
        return f"Error: Permission denied: {path}"
    except Exception as e:
        return f"Error listing directory: {str(e)}"


@tool
def search_files(pattern: str, path: str = ".") -> str:
    """
    glob 패턴을 사용하여 파일을 검색합니다.

    Args:
        pattern: glob 패턴 (예: "**/*.py", "src/**/*.ts")
        path: 검색 시작 경로 (기본값: 현재 디렉토리)

    Returns:
        매칭된 파일 목록 또는 오류 메시지
    """
    try:
        path = os.path.expanduser(path)
        search_pattern = os.path.join(path, pattern)

        matches = glob_module.glob(search_pattern, recursive=True)
        matches = [m for m in matches if os.path.isfile(m)]
        matches.sort()

        if not matches:
            return f"No files found matching pattern: {pattern}"

        # Limit results
        max_results = 100
        if len(matches) > max_results:
            return (
                f"Found {len(matches)} files (showing first {max_results}):\n"
                + "\n".join(matches[:max_results])
                + f"\n... and {len(matches) - max_results} more"
            )

        return f"Found {len(matches)} files:\n" + "\n".join(matches)

    except Exception as e:
        return f"Error searching files: {str(e)}"


@tool
def search_content(pattern: str, path: str = ".", file_pattern: str | None = None) -> str:
    """
    파일 내용에서 정규식 패턴을 검색합니다 (grep과 유사).

    Args:
        pattern: 검색할 정규식 패턴
        path: 검색 경로 (기본값: 현재 디렉토리)
        file_pattern: 검색할 파일 glob 패턴 (예: "*.py")

    Returns:
        매칭된 결과 또는 오류 메시지
    """
    try:
        path = os.path.expanduser(path)
        regex = re.compile(pattern)
        results = []
        files_searched = 0
        max_results = 100

        # Determine files to search
        if os.path.isfile(path):
            files_to_search = [path]
        else:
            glob_pattern = file_pattern or "**/*"
            search_path = os.path.join(path, glob_pattern)
            files_to_search = [
                f for f in glob_module.glob(search_path, recursive=True)
                if os.path.isfile(f)
            ]

        for file_path in files_to_search:
            # Skip binary files
            if _is_binary(file_path):
                continue

            files_searched += 1
            try:
                with open(file_path, encoding="utf-8", errors="ignore") as f:
                    for line_num, line in enumerate(f, 1):
                        if regex.search(line):
                            results.append(f"{file_path}:{line_num}: {line.rstrip()}")
                            if len(results) >= max_results:
                                break
            except Exception:
                continue

            if len(results) >= max_results:
                break

        if not results:
            return f"No matches found for pattern: {pattern}"

        header = f"Found {len(results)} matches in {files_searched} files"
        if len(results) >= max_results:
            header += f" (limited to {max_results})"

        return header + ":\n" + "\n".join(results)

    except re.error as e:
        return f"Error: Invalid regex pattern: {str(e)}"
    except Exception as e:
        return f"Error searching content: {str(e)}"


def _format_size(size: int) -> str:
    """Format file size in human-readable format."""
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def _is_binary(file_path: str) -> bool:
    """Check if a file is binary."""
    try:
        with open(file_path, "rb") as f:
            chunk = f.read(1024)
            return b"\x00" in chunk
    except Exception:
        return True
