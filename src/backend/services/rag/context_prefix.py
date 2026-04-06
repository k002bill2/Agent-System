"""Contextual Retrieval: generate context prefixes for chunks.

Adds file-path-derived context to each chunk before embedding,
so semantic search benefits from knowing *where* the code belongs.
"""

from pathlib import Path

# Directory name → human-readable domain description
_DIRECTORY_CONTEXT_MAP: dict[str, str] = {
    "services": "service layer",
    "api": "API routes",
    "models": "data models",
    "utils": "utility functions",
    "lib": "shared library",
    "tests": "test code",
    "components": "UI components",
    "hooks": "React hooks",
    "stores": "state management",
    "pages": "page components",
    "layouts": "layout components",
    "middleware": "middleware",
    "config": "configuration",
    "auth": "authentication",
    "orchestrator": "agent orchestration",
    "pipeline": "data pipeline",
    "agents": "agent definitions",
    "db": "database layer",
    "commands": "CLI commands",
    "skills": "skill definitions",
    "evals": "evaluation system",
    "infra": "infrastructure",
}

# File extension → language/framework description
_EXTENSION_CONTEXT_MAP: dict[str, str] = {
    ".py": "Python",
    ".ts": "TypeScript",
    ".tsx": "React TSX component",
    ".js": "JavaScript",
    ".jsx": "React JSX component",
    ".md": "Markdown documentation",
    ".json": "JSON configuration",
    ".yaml": "YAML configuration",
    ".yml": "YAML configuration",
    ".toml": "TOML configuration",
    ".html": "HTML template",
    ".css": "CSS stylesheet",
    ".rst": "reStructuredText documentation",
    ".txt": "plain text",
}

# Well-known filenames with specific context
_KNOWN_FILES: dict[str, str] = {
    "CLAUDE.md": "Claude Code project instructions",
    "README.md": "project documentation",
    "package.json": "Node.js package manifest",
    "pyproject.toml": "Python project configuration",
    "tsconfig.json": "TypeScript compiler configuration",
    "vite.config.ts": "Vite build configuration",
    ".env": "environment variables",
    "docker-compose.yml": "Docker service definitions",
    "Dockerfile": "Docker build instructions",
}


def generate_context_prefix(file_path: str) -> str:
    """Generate a contextual prefix for a chunk based on its file path.

    The prefix is prepended to chunk content BEFORE embedding so that
    semantic vectors capture the file's role in the project.

    Args:
        file_path: Relative path from project root (e.g. "src/backend/services/auth_service.py")

    Returns:
        A bracketed context string, e.g.:
        "[Context: Backend auth service (Python) — src/backend/services/auth_service.py]\\n"
    """
    p = Path(file_path)

    # Check well-known files first
    if p.name in _KNOWN_FILES:
        return f"[Context: {_KNOWN_FILES[p.name]} — {file_path}]\n"

    # Extract language from extension
    lang = _EXTENSION_CONTEXT_MAP.get(p.suffix.lower(), "")

    # Extract domain from directory structure
    domain = _extract_domain_from_path(file_path)

    # Build human-readable file description from stem
    file_desc = _humanize_filename(p.stem)

    parts = []
    if domain:
        parts.append(domain)
    if file_desc:
        parts.append(file_desc)
    if lang:
        parts.append(f"({lang})")

    if not parts:
        return f"[Context: {file_path}]\n"

    description = " ".join(parts)
    return f"[Context: {description} — {file_path}]\n"


def _extract_domain_from_path(file_path: str) -> str:
    """Extract domain context from directory structure.

    Walks the path parts and collects known directory meanings.
    """
    parts = Path(file_path).parts[:-1]  # exclude filename
    domains: list[str] = []

    for part in parts:
        part_lower = part.lower()
        if part_lower in _DIRECTORY_CONTEXT_MAP:
            domains.append(_DIRECTORY_CONTEXT_MAP[part_lower])
        elif part_lower in ("src", "backend", "frontend", "dashboard"):
            # Layer indicators
            if part_lower == "backend":
                domains.append("Backend")
            elif part_lower in ("frontend", "dashboard"):
                domains.append("Frontend")
            # "src" is too generic, skip

    return " ".join(domains) if domains else ""


def _humanize_filename(stem: str) -> str:
    """Convert a filename stem to a human-readable description.

    Examples:
        "auth_service" -> "auth service"
        "RAGQueryPanel" -> "RAG query panel"
        "test_rag_service" -> "test rag service"
    """
    # Handle snake_case
    if "_" in stem:
        return stem.replace("_", " ")

    # Handle camelCase/PascalCase: insert spaces before uppercase runs
    result = ""
    for i, char in enumerate(stem):
        if char.isupper() and i > 0 and not stem[i - 1].isupper():
            result += " "
        result += char

    return result.lower().strip()
