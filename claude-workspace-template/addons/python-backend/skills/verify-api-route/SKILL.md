---
name: verify-api-route
description: Verifies that Python API routes follow project conventions for naming, error handling, authentication, and response models.
---

# API Route Convention Verification

## Purpose

1. Verify API route naming follows RESTful conventions
2. Verify all API handlers have proper error handling
3. Verify endpoints requiring auth have authentication dependencies applied
4. Verify response models are specified on route decorators

## When to Run

- After adding new API endpoints
- After modifying API router structure
- After changing authentication/authorization logic

## Related Files

Look for these patterns in your project (adjust paths as needed):

| Pattern | Purpose |
|---------|---------|
| `**/api/*.py` or `**/routes/*.py` | API router files |
| `**/deps.py` or `**/dependencies.py` | Dependency injection (auth, DB session) |
| `**/app.py` or `**/main.py` | Router registration |
| `**/models/*.py` or `**/schemas/*.py` | Pydantic response models |

## Workflow

### Step 1: Route Naming Convention Check

Extract endpoint paths from all API routers:

```bash
grep -rn "@router\.\(get\|post\|put\|delete\|patch\)" <api_directory>/*.py
```

**PASS criteria**:
- Paths use `kebab-case` or `snake_case`
- Plural resource names (e.g., `/items`, `/users`)
- RESTful pattern: `GET /resources`, `POST /resources`, `GET /resources/{id}`

**FAIL criteria**:
- camelCase paths (e.g., `/getUser`)
- Verb-based paths (e.g., `/deleteUser`) instead of using DELETE method

### Step 2: Error Handling Check

Verify API handler functions use try/except or HTTPException:

```bash
grep -rn "HTTPException\|raise\|try:" <api_directory>/*.py
```

Compare handler count vs error handling count per router file:

```bash
# Handler count
grep -c "@router\." <api_directory>/<file>.py

# Error handling count
grep -c "HTTPException\|raise.*Exception" <api_directory>/<file>.py
```

**PASS criteria**: All POST/PUT/DELETE handlers have error handling
**FAIL criteria**: Write handlers exist without error handling

### Step 3: Authentication Dependency Check

Verify endpoints requiring auth have `Depends(get_current_user)` or similar:

```bash
grep -rn "get_current_user\|require_auth\|Depends.*auth" <api_directory>/*.py
```

Detect handlers without auth (excluding public endpoints):

```bash
grep -B5 "@router\." <api_directory>/*.py | grep -v "auth.py\|health.py" | grep -v "Depends"
```

**PASS criteria**: All non-public handlers have auth dependency
**FAIL criteria**: Non-public handlers found without authentication

### Step 4: Response Model Check

Verify router decorators include `response_model` parameter:

```bash
grep -rn "@router\.\(get\|post\|put\|delete\|patch\)" <api_directory>/*.py | grep -v "response_model"
```

**PASS criteria**: GET/POST handlers have response_model specified
**FAIL criteria**: Handlers found without response_model

### Step 5: Router Registration Check

Verify all router files are registered via `include_router` in the app:

```bash
# List router files
ls <api_directory>/*.py | grep -v "__init__\|app\|deps\|main"

# List registered routers
grep "include_router" <app_file>
```

**PASS criteria**: All router files are registered in the app
**FAIL criteria**: Unregistered router files found

## Output Format

```markdown
## API Route Verification Results

| Check | Scope | Pass | Issues | Status |
|-------|-------|------|--------|--------|
| Naming conventions | N endpoints | X | Y | PASS/FAIL |
| Error handling | N handlers | X | Y | PASS/FAIL |
| Auth dependencies | N handlers | X | Y | PASS/FAIL |
| Response models | N handlers | X | Y | PASS/FAIL |
| Router registration | N files | X | Y | PASS/FAIL |
```

## Exceptions

1. **Public endpoints**: Auth/health endpoints do not require authentication
2. **Utility files**: `deps.py`, `__init__.py` are not router files
3. **WebSocket endpoints**: WebSocket may use a different auth pattern
4. **Internal endpoints**: Service-to-service endpoints may use a separate auth scheme
