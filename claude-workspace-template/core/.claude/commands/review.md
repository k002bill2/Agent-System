---
description: Automated code review — analyze changed files from git diff
---

# Code Review

Automatically review changed code based on git diff.

## Steps

### 1. Collect Changes

```bash
# Staged changes
git diff --cached --name-only

# Unstaged changes
git diff --name-only

# Compare with base branch
git diff main...HEAD --name-only
```

### 2. Analyze Each File

For each changed file, review based on file type:

#### General Checks (all languages)
- [ ] No debug/console output left behind
- [ ] Proper error handling
- [ ] No hardcoded secrets or credentials
- [ ] Clear variable/function naming
- [ ] Appropriate comments for complex logic

#### TypeScript/JavaScript Files
- [ ] No `any` type usage (prefer explicit types)
- [ ] useEffect cleanup functions present
- [ ] Explicit return types on functions
- [ ] Proper async/await error handling

#### Python Files
- [ ] Type hints on function signatures
- [ ] Proper exception handling (no bare `except:`)
- [ ] No mutable default arguments
- [ ] Docstrings on public functions

#### Component/UI Files
- [ ] Props/interface types defined
- [ ] Memoization used appropriately
- [ ] Accessibility attributes present

#### Service/API Files
- [ ] API call error handling
- [ ] Input validation
- [ ] Proper async cleanup

### 3. Calculate Review Score

Score by category:
- **Type Safety**: 0-25 points
- **Error Handling**: 0-25 points
- **Code Quality**: 0-25 points
- **Performance**: 0-25 points

### 4. Generate Improvement Suggestions

Organize suggestions by priority.

## Output Format

```
---
CODE REVIEW REPORT
---

Overall Score: 85/100

Files Reviewed: 5

| Category        | Score | Status |
|-----------------|-------|--------|
| Type Safety     | 22/25 | PASS   |
| Error Handling  | 20/25 | PASS   |
| Code Quality    | 23/25 | PASS   |
| Performance     | 20/25 | PASS   |

Critical Issues (1):
- path/to/file.ts:45 - Missing cleanup in useEffect

Suggestions (3):
- path/to/component.tsx:12 - Consider memoization
- path/to/service.ts:78 - Add retry logic
- path/to/util.ts:23 - Remove console.log

Good Practices Found:
- Consistent typing
- Proper error boundaries
- Good separation of concerns

---
```

## Quick Fixes

If `claude-workspace.yaml` has `format` or `lint` commands, suggest running them:

```
To auto-fix style issues, run the lint/format commands from claude-workspace.yaml.
```
