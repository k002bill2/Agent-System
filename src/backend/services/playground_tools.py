"""Playground Tools - Real implementations for playground tool execution."""

import asyncio
import os
import re
import subprocess
from typing import Any
from datetime import datetime

import httpx


class PlaygroundTools:
    """
    Actual tool implementations for the playground.

    These tools are designed to be safe for interactive use.
    """

    @staticmethod
    async def web_search(query: str, max_results: int = 5) -> dict[str, Any]:
        """
        Search the web using DuckDuckGo Instant Answer API.

        Args:
            query: Search query string
            max_results: Maximum number of results to return

        Returns:
            Search results with titles, URLs, and snippets
        """
        try:
            # Use DuckDuckGo Instant Answer API (free, no API key needed)
            async with httpx.AsyncClient(timeout=10.0) as client:
                # DuckDuckGo Instant Answer API
                response = await client.get(
                    "https://api.duckduckgo.com/",
                    params={
                        "q": query,
                        "format": "json",
                        "no_html": 1,
                        "skip_disambig": 1,
                    },
                    headers={"User-Agent": "AOS-Playground/1.0"}
                )

                if response.status_code != 200:
                    return {
                        "success": False,
                        "error": f"Search API returned status {response.status_code}",
                        "results": [],
                    }

                data = response.json()
                results = []

                # Abstract (main answer)
                if data.get("Abstract"):
                    results.append({
                        "title": data.get("Heading", "Summary"),
                        "url": data.get("AbstractURL", ""),
                        "snippet": data["Abstract"],
                        "source": data.get("AbstractSource", ""),
                    })

                # Related topics
                for topic in data.get("RelatedTopics", [])[:max_results]:
                    if isinstance(topic, dict) and "Text" in topic:
                        results.append({
                            "title": topic.get("Text", "")[:100],
                            "url": topic.get("FirstURL", ""),
                            "snippet": topic.get("Text", ""),
                        })
                    elif isinstance(topic, dict) and "Topics" in topic:
                        # Nested topics
                        for subtopic in topic["Topics"][:2]:
                            if "Text" in subtopic:
                                results.append({
                                    "title": subtopic.get("Text", "")[:100],
                                    "url": subtopic.get("FirstURL", ""),
                                    "snippet": subtopic.get("Text", ""),
                                })

                # If no results from DDG, try a basic fallback message
                if not results:
                    return {
                        "success": True,
                        "query": query,
                        "results": [],
                        "message": f"No instant answers found for '{query}'. Try a more specific query or rephrase.",
                    }

                return {
                    "success": True,
                    "query": query,
                    "results": results[:max_results],
                    "total": len(results),
                }

        except httpx.TimeoutException:
            return {
                "success": False,
                "error": "Search request timed out",
                "results": [],
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Search failed: {str(e)}",
                "results": [],
            }

    @staticmethod
    async def code_execute(
        language: str,
        code: str,
        timeout: int = 30,
    ) -> dict[str, Any]:
        """
        Execute code in a sandboxed environment.

        Supports: python, javascript (node), bash

        Args:
            language: Programming language
            code: Code to execute
            timeout: Execution timeout in seconds

        Returns:
            Execution result with output and status
        """
        supported_languages = {
            "python": ("python3", ".py"),
            "python3": ("python3", ".py"),
            "javascript": ("node", ".js"),
            "js": ("node", ".js"),
            "node": ("node", ".js"),
            "bash": ("bash", ".sh"),
            "sh": ("bash", ".sh"),
        }

        lang_lower = language.lower()
        if lang_lower not in supported_languages:
            return {
                "success": False,
                "error": f"Unsupported language: {language}. Supported: python, javascript, bash",
                "output": "",
            }

        interpreter, ext = supported_languages[lang_lower]

        # Security checks
        dangerous_patterns = [
            r"import\s+os.*system",
            r"subprocess",
            r"eval\s*\(",
            r"exec\s*\(",
            r"__import__",
            r"rm\s+-rf",
            r":()\s*{",  # fork bomb
            r"while\s+true",
            r"for\s*\(\s*;\s*;\s*\)",
        ]

        for pattern in dangerous_patterns:
            if re.search(pattern, code, re.IGNORECASE):
                return {
                    "success": False,
                    "error": f"Potentially dangerous code pattern detected",
                    "output": "",
                }

        try:
            # Create temp file
            import tempfile
            with tempfile.NamedTemporaryFile(
                mode="w",
                suffix=ext,
                delete=False,
            ) as f:
                f.write(code)
                temp_path = f.name

            try:
                # Execute with timeout
                start_time = datetime.now()

                process = await asyncio.create_subprocess_exec(
                    interpreter,
                    temp_path,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                )

                try:
                    stdout, stderr = await asyncio.wait_for(
                        process.communicate(),
                        timeout=timeout,
                    )
                except asyncio.TimeoutError:
                    process.kill()
                    return {
                        "success": False,
                        "error": f"Execution timed out after {timeout} seconds",
                        "output": "",
                        "execution_time_ms": timeout * 1000,
                    }

                execution_time = (datetime.now() - start_time).total_seconds() * 1000

                stdout_str = stdout.decode("utf-8", errors="replace")
                stderr_str = stderr.decode("utf-8", errors="replace")

                output = stdout_str
                if stderr_str:
                    output += f"\n[stderr]\n{stderr_str}"

                return {
                    "success": process.returncode == 0,
                    "output": output.strip() or "(no output)",
                    "exit_code": process.returncode,
                    "execution_time_ms": int(execution_time),
                }

            finally:
                # Clean up temp file
                os.unlink(temp_path)

        except Exception as e:
            return {
                "success": False,
                "error": f"Execution failed: {str(e)}",
                "output": "",
            }

    @staticmethod
    async def file_read(path: str) -> dict[str, Any]:
        """
        Read a file from the workspace.

        Args:
            path: File path to read

        Returns:
            File content or error
        """
        try:
            # Security: only allow reading from certain directories
            path = os.path.expanduser(path)

            # Block sensitive paths
            blocked_patterns = [
                "/etc/passwd",
                "/etc/shadow",
                ".ssh",
                ".env",
                "credentials",
                "secret",
                ".git/config",
            ]

            path_lower = path.lower()
            for pattern in blocked_patterns:
                if pattern in path_lower:
                    return {
                        "success": False,
                        "error": f"Access to sensitive files is not allowed",
                    }

            if not os.path.exists(path):
                return {
                    "success": False,
                    "error": f"File not found: {path}",
                }

            if not os.path.isfile(path):
                return {
                    "success": False,
                    "error": f"Not a file: {path}",
                }

            # Check file size
            size = os.path.getsize(path)
            max_size = 10 * 1024 * 1024  # 10MB limit
            if size > max_size:
                return {
                    "success": False,
                    "error": f"File too large: {size} bytes (max 10MB)",
                }

            # Handle PDF files
            if path_lower.endswith(".pdf"):
                try:
                    import pypdf
                    reader = pypdf.PdfReader(path)
                    content = ""
                    for i, page in enumerate(reader.pages):
                        text = page.extract_text()
                        if text:
                            content += f"--- Page {i + 1} ---\n{text}\n\n"
                    if not content.strip():
                        return {
                            "success": True,
                            "path": path,
                            "content": "[PDF contains no extractable text - may be scanned/image-based]",
                            "size": size,
                            "pages": len(reader.pages),
                        }
                    return {
                        "success": True,
                        "path": path,
                        "content": content,
                        "size": size,
                        "pages": len(reader.pages),
                    }
                except ImportError:
                    return {
                        "success": False,
                        "error": "PDF reading requires pypdf library. Install with: pip install pypdf",
                    }
                except Exception as e:
                    return {
                        "success": False,
                        "error": f"Error reading PDF: {str(e)}",
                    }

            # Handle binary files
            binary_extensions = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
                                 ".mp3", ".mp4", ".wav", ".avi", ".mov", ".zip", ".tar",
                                 ".gz", ".rar", ".7z", ".exe", ".dll", ".so", ".dylib"]
            if any(path_lower.endswith(ext) for ext in binary_extensions):
                return {
                    "success": False,
                    "error": f"Cannot read binary file: {os.path.basename(path)}. Only text and PDF files are supported.",
                }

            # Read text file
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

            return {
                "success": True,
                "path": path,
                "content": content,
                "size": size,
            }

        except PermissionError:
            return {
                "success": False,
                "error": f"Permission denied: {path}",
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Error reading file: {str(e)}",
            }

    @staticmethod
    async def file_write(path: str, content: str) -> dict[str, Any]:
        """
        Write content to a file.

        Args:
            path: File path to write
            content: Content to write

        Returns:
            Success status
        """
        try:
            path = os.path.expanduser(path)

            # Security: block writing to sensitive locations
            blocked_patterns = [
                "/etc/",
                "/usr/",
                "/bin/",
                "/sbin/",
                ".ssh",
                ".bashrc",
                ".zshrc",
                ".profile",
            ]

            for pattern in blocked_patterns:
                if pattern in path:
                    return {
                        "success": False,
                        "error": f"Writing to system directories is not allowed",
                    }

            # Create parent directories
            parent = os.path.dirname(path)
            if parent and not os.path.exists(parent):
                os.makedirs(parent, exist_ok=True)

            with open(path, "w", encoding="utf-8") as f:
                f.write(content)

            return {
                "success": True,
                "path": path,
                "bytes_written": len(content.encode("utf-8")),
            }

        except PermissionError:
            return {
                "success": False,
                "error": f"Permission denied: {path}",
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Error writing file: {str(e)}",
            }

    @staticmethod
    async def api_call(
        method: str,
        url: str,
        headers: dict[str, str] | None = None,
        body: dict[str, Any] | None = None,
        timeout: int = 30,
    ) -> dict[str, Any]:
        """
        Make an HTTP API call.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE, etc.)
            url: URL to call
            headers: Optional request headers
            body: Optional request body (for POST/PUT)
            timeout: Request timeout in seconds

        Returns:
            Response with status, headers, and body
        """
        # Security: block internal/private IPs
        blocked_hosts = [
            "localhost",
            "127.0.0.1",
            "0.0.0.0",
            "169.254.",
            "10.",
            "172.16.",
            "172.17.",
            "172.18.",
            "172.19.",
            "172.20.",
            "172.21.",
            "172.22.",
            "172.23.",
            "172.24.",
            "172.25.",
            "172.26.",
            "172.27.",
            "172.28.",
            "172.29.",
            "172.30.",
            "172.31.",
            "192.168.",
        ]

        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            host = parsed.hostname or ""

            for blocked in blocked_hosts:
                if host.startswith(blocked) or host == blocked:
                    return {
                        "success": False,
                        "error": "Requests to internal/private addresses are not allowed",
                    }

            method = method.upper()
            if method not in ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]:
                return {
                    "success": False,
                    "error": f"Unsupported HTTP method: {method}",
                }

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    json=body if body and method in ["POST", "PUT", "PATCH"] else None,
                )

                # Try to parse JSON response
                try:
                    response_body = response.json()
                except Exception:
                    response_body = response.text[:10000]  # Limit text response

                return {
                    "success": True,
                    "status": response.status_code,
                    "headers": dict(response.headers),
                    "body": response_body,
                }

        except httpx.TimeoutException:
            return {
                "success": False,
                "error": f"Request timed out after {timeout} seconds",
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Request failed: {str(e)}",
            }


# Tool definitions for LLM function calling
TOOL_DEFINITIONS = [
    {
        "name": "web_search",
        "description": "Search the web for information. Use this when you need to find current information, facts, or answers to questions.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results (default: 5)",
                    "default": 5,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "code_execute",
        "description": "Execute code in a sandboxed environment. Supports Python, JavaScript (Node.js), and Bash.",
        "parameters": {
            "type": "object",
            "properties": {
                "language": {
                    "type": "string",
                    "description": "Programming language: python, javascript, or bash",
                    "enum": ["python", "javascript", "bash"],
                },
                "code": {
                    "type": "string",
                    "description": "The code to execute",
                },
            },
            "required": ["language", "code"],
        },
    },
    {
        "name": "file_read",
        "description": "Read the contents of a file.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The file path to read",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "file_write",
        "description": "Write content to a file. Creates the file if it doesn't exist.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "The file path to write to",
                },
                "content": {
                    "type": "string",
                    "description": "The content to write",
                },
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "api_call",
        "description": "Make an HTTP API request to external services.",
        "parameters": {
            "type": "object",
            "properties": {
                "method": {
                    "type": "string",
                    "description": "HTTP method",
                    "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"],
                },
                "url": {
                    "type": "string",
                    "description": "The URL to request",
                },
                "headers": {
                    "type": "object",
                    "description": "Optional request headers",
                },
                "body": {
                    "type": "object",
                    "description": "Optional request body for POST/PUT/PATCH",
                },
            },
            "required": ["method", "url"],
        },
    },
]


async def execute_tool(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """
    Execute a playground tool by name.

    Args:
        tool_name: Name of the tool to execute
        arguments: Tool arguments

    Returns:
        Tool execution result
    """
    tools = PlaygroundTools()

    if tool_name == "web_search":
        return await tools.web_search(
            query=arguments.get("query", ""),
            max_results=arguments.get("max_results", 5),
        )
    elif tool_name == "code_execute":
        return await tools.code_execute(
            language=arguments.get("language", "python"),
            code=arguments.get("code", ""),
            timeout=arguments.get("timeout", 30),
        )
    elif tool_name == "file_read":
        return await tools.file_read(
            path=arguments.get("path", ""),
        )
    elif tool_name == "file_write":
        return await tools.file_write(
            path=arguments.get("path", ""),
            content=arguments.get("content", ""),
        )
    elif tool_name == "api_call":
        return await tools.api_call(
            method=arguments.get("method", "GET"),
            url=arguments.get("url", ""),
            headers=arguments.get("headers"),
            body=arguments.get("body"),
            timeout=arguments.get("timeout", 30),
        )
    else:
        return {
            "success": False,
            "error": f"Unknown tool: {tool_name}",
        }
