---
description: Run a Gemini CLI cross-review of current code changes
---

# Gemini Cross-Review

Use the Gemini CLI to get a second-opinion review of your current code changes.

## Prerequisites

- **Gemini CLI** must be installed. See: https://github.com/google-gemini/gemini-cli
  - macOS: `npm install -g @anthropic-ai/gemini-cli` or `brew install gemini-cli`
  - Verify: `which gemini` or `gemini --version`

## Usage

```bash
/gemini-review              # Review all uncommitted changes
/gemini-review src/app.ts   # Review specific file(s)
```

## Execution

Run the following command:

```bash
node .claude/hooks/gemini-bridge.js review $ARGUMENTS
```

## Result Interpretation

- **VERDICT: approve** -- No cross-file issues found
- **VERDICT: needs-attention** -- Review the issue list and address as needed

## Notes

- Gemini operates in read-only mode. It does not modify any files.
- Results are saved as JSON in `.claude/gemini-bridge/reviews/`.
- There is a daily API call limit (default: 900 calls).
- Issues with `severity:critical` should always be reviewed.

Analyze the output and, if there are critical or warning issues, review the referenced files and suggest remediation.
