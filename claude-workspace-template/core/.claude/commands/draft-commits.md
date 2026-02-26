---
description: Analyze git changes and draft Conventional Commits messages
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*)
argument-hint: [--staged | --all]
---

# Draft Commits — Git Change Analysis

Analyze git changes and generate commit message drafts in Conventional Commits format.

## Steps

### 1. Collect Changes

```bash
# Overall status
git status --porcelain

# Staged changes detail
git diff --cached --stat

# Unstaged changes detail
git diff --stat

# Recent commit style reference
git log --oneline -5
```

### 2. File Grouping Rules

Group changed files by directory pattern. Determine the grouping dynamically based on the project structure:

**Common patterns:**

| Path Pattern | Group Name | Default Type |
|-------------|------------|-------------|
| `.claude/hooks/` | Claude Hooks | chore(hooks) |
| `.claude/skills/` | Claude Skills | docs(skills) |
| `.claude/commands/` | Claude Commands | docs(commands) |
| `.claude/agents/` | Claude Agents | docs(agents) |
| `.claude/*.json` | Claude Config | chore(config) |
| `tests/` or `__tests__/` | Tests | test |
| `docs/` | Documentation | docs |
| `infra/` or `.github/` | Infrastructure | chore(infra) |

For source files, infer the scope from the directory structure. For example:
- `src/api/` -> `feat(api)`
- `src/components/` -> `feat(components)`
- `src/services/` -> `feat(services)`

Read `claude-workspace.yaml` `paths` section if available to better understand the project layout.

### 3. Determine Commit Type

Analyze the nature of changes to select the appropriate type:

- **feat**: New feature (new files, feature extensions)
- **fix**: Bug fix (error handling, logic corrections)
- **refactor**: Restructuring (code reorganization, performance improvements)
- **docs**: Documentation changes (README, comments, guides)
- **test**: Test additions/modifications
- **chore**: Config, build, dependency changes
- **style**: Code style changes (formatting, semicolons, etc.)

### 4. Output Format

```
---
COMMIT DRAFT SUMMARY
---

Overview
| Total: N files | Staged: N | Unstaged: N | New: N |

---
[Group Name] (N files)
---

  Suggested Commit:
  | type(scope): concise change description |

  Files:
  +-- file1.ext    [M] +N -M
  +-- file2.ext    [A] +N
  +-- file3.ext    [D]

[Repeat per group...]

---
QUICK ACTIONS
---

  Single commit:
  | type: overall change summary (for committing everything at once) |

  Group commits:
  | Commit each group separately for cleaner history |

---
Legend: [M] Modified  [A] Added  [D] Deleted  [R] Renamed
```

## Options

- `--staged`: Analyze only staged changes
- `--all`: Analyze all staged + unstaged changes (default)

## Commit Message Guidelines

1. **Subject line**
   - 50 characters or fewer
   - Lowercase first letter
   - No period at end
   - Imperative mood (add, fix, update)

2. **Scope selection**
   - Affected area (api, ui, hooks, config, etc.)
   - Optional but recommended

3. **Examples**
   ```
   feat(api): add user invitation endpoint
   fix(hooks): resolve infinite loop in useAuth
   docs(commands): add draft-commits slash command
   chore(config): update linting rules
   ```

## Related Commands

- `/review` — Code review of changes
- `/verify-app` — Pre-commit verification
- `/check-health` — Full project health check

$ARGUMENTS
