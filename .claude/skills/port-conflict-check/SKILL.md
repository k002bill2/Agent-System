---
name: port-conflict-check
description: >
  Scan registered projects for Docker port conflicts before starting services.
  Use when: (1) starting dev services, (2) adding new projects to registry,
  (3) modifying docker-compose port mappings, (4) user asks about port conflicts,
  (5) debugging "address already in use" errors, (6) before running docker compose up.
  Detects when multiple projects claim the same host port (e.g., 5173, 8000).
allowed-tools: Read, Grep, Glob, Bash
---

# Port Conflict Check

Detect and resolve host port conflicts across registered AOS projects.

## Quick Check

Run the bundled script to scan all registered projects:

```bash
python3 .claude/skills/port-conflict-check/scripts/check_port_conflicts.py --from-api http://localhost:8000
```

Or specify paths manually:

```bash
python3 .claude/skills/port-conflict-check/scripts/check_port_conflicts.py \
  ~/Work/Agent-System ~/Work/youtube-maker ~/Work/ppt-maker
```

## API Check

Query the AOS backend for cross-project port conflicts:

```
GET /api/health/services/conflicts
```

Returns a map of conflicting ports with the projects and services using each.

## Resolution Strategies

When conflicts are found:

1. **Env var override** in `.env`:
   ```
   DASHBOARD_PORT=5174
   ```

2. **docker-compose.override.yml**:
   ```yaml
   services:
     web:
       ports:
         - "5174:3000"
   ```

3. **Run one at a time** — if projects don't need simultaneous execution, no action needed.

## Integration

The Project Registry page's Service Status Bar shows per-project services.
Select different projects to compare their port usage.
