---
description: Run a Gemini CLI large-context codebase analysis
---

# Gemini Codebase Scan

Use Gemini's large context window to analyze your entire codebase or a subsection.

## Prerequisites

- **Gemini CLI** must be installed. See: https://github.com/google-gemini/gemini-cli
  - macOS: `npm install -g @anthropic-ai/gemini-cli` or `brew install gemini-cli`
  - Verify: `which gemini` or `gemini --version`

## Usage

```bash
/gemini-scan [scope] [analysis-type]
```

- **scope**: `backend` | `frontend` | `full` (default: full)
- **analysis-type**: `architecture` | `deps` | `dead-code` | `security` (default: architecture)

## Examples

```bash
/gemini-scan                        # Full architecture scan
/gemini-scan backend security       # Backend security audit
/gemini-scan frontend deps          # Frontend dependency analysis
/gemini-scan full dead-code         # Find dead code across codebase
```

## Execution

Parse arguments and run:

```bash
node .claude/hooks/gemini-bridge.js scan $ARGUMENTS
```

If no arguments are provided, defaults to `full architecture`.

## Analysis Types

| Type | Description |
|------|-------------|
| `architecture` | Component dependencies, layer separation, API contract consistency |
| `deps` | Circular imports, unused imports, heavy dependencies |
| `dead-code` | Unused exports, unreachable code |
| `security` | Auth/authz gaps, input validation, secrets exposure |

## Notes

- Large scans may take up to 180 seconds.
- Counts toward the daily API call limit (default: 900).
- Results are saved in `.claude/gemini-bridge/reviews/`.

Analyze the FINDINGS and RECOMMENDATIONS in the output. For `priority:high` items, provide specific remediation suggestions.
