"""Variable expander for workflow ${{ }} expressions."""

import re
from typing import Any


# Pattern: ${{ steps.build.outputs.version }}, ${{ secrets.API_KEY }}, etc.
VARIABLE_PATTERN = re.compile(r"\$\{\{\s*(.*?)\s*\}\}")


def _resolve_dot_path(context: dict[str, Any], path: str) -> str:
    """Resolve dot-notation path like 'steps.build.outputs.version'."""
    parts = path.strip().split(".")
    current: Any = context
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return f"${{{{ {path} }}}}"  # unresolved
        if current is None:
            return ""
    return str(current)


def expand_variables(
    text: str,
    *,
    env: dict[str, str] | None = None,
    matrix: dict[str, str] | None = None,
    secrets: dict[str, str] | None = None,
    inputs: dict[str, Any] | None = None,
    steps: dict[str, dict[str, Any]] | None = None,
) -> str:
    """Expand all ${{ }} variable expressions in text.

    Supported namespaces:
    - ${{ env.KEY }}
    - ${{ matrix.KEY }}
    - ${{ secrets.KEY }}
    - ${{ inputs.KEY }}
    - ${{ steps.STEP_ID.outputs.KEY }}
    """
    context = {
        "env": env or {},
        "matrix": matrix or {},
        "secrets": secrets or {},
        "inputs": inputs or {},
        "steps": steps or {},
    }

    def _replace(match: re.Match) -> str:
        expr = match.group(1).strip()
        return _resolve_dot_path(context, expr)

    return VARIABLE_PATTERN.sub(_replace, text)


def mask_secrets(text: str, secrets: dict[str, str] | None = None) -> str:
    """Replace secret values with *** in text for safe logging."""
    if not secrets:
        return text
    result = text
    for value in secrets.values():
        if value and len(value) > 0:
            result = result.replace(value, "***")
    return result


def parse_step_outputs(stdout: str) -> dict[str, str]:
    """Parse ::set-output name=KEY::VALUE patterns from step stdout."""
    outputs: dict[str, str] = {}
    for line in stdout.splitlines():
        line = line.strip()
        if line.startswith("::set-output name="):
            # Format: ::set-output name=KEY::VALUE
            rest = line[len("::set-output name="):]
            if "::" in rest:
                key, value = rest.split("::", 1)
                outputs[key.strip()] = value.strip()
    return outputs
