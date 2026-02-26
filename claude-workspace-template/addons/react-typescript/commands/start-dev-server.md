---
description: Start the React development server
---

# Start Dev Server

Start the React development server workflow.

## Configuration

| Setting | Default | Override |
|---------|---------|----------|
| Port | 5173 | Set `DEV_PORT` env var or modify vite.config.ts |
| Framework | Vite + React | - |
| Source dir | `src/` | Project-specific |

## Workflow

### 1. Check for Existing Processes

Check if the dev server is already running on the configured port.

```bash
lsof -i :${DEV_PORT:-5173} 2>/dev/null || echo "PORT_FREE"
```

- If the port is in use, notify the user and ask whether to restart.
- If the port is free, proceed to the next step.

### 2. Check Dependencies

Verify `node_modules` directory exists and is in sync with `package.json`.

```bash
ls node_modules/.package-lock.json 2>/dev/null || echo "NEED_INSTALL"
```

- If `NEED_INSTALL`, run `npm install`.
- If already installed, skip.

### 3. Type Check (Optional)

Run a quick type check to detect build errors early.

```bash
npx tsc --noEmit 2>&1 | tail -5
```

- If type errors exist, report to user and ask whether to continue.
- If no errors, proceed to next step.

### 4. Start Development Server

Launch the Vite development server.

```bash
npm run dev
```

- Run in background so the terminal is not blocked.
- Verify http://localhost:${DEV_PORT:-5173} is accessible after startup.

### 5. Verify Startup

Check that the server started successfully.

```bash
sleep 3 && curl -s -o /dev/null -w "%{http_code}" http://localhost:${DEV_PORT:-5173}/ 2>/dev/null || echo "NOT_READY"
```

## Service Info

| Item | Value |
|------|-------|
| URL | http://localhost:${DEV_PORT:-5173} |
| Framework | React + Vite |
| Styling | Tailwind CSS |
| Language | TypeScript |

## Useful Commands

```bash
# View logs
# (Vite outputs to stdout by default)

# Stop server
pkill -f "vite.*${DEV_PORT:-5173}"

# Lint
npm run lint

# Test
npm test
```

## Troubleshooting

- **Port conflict**: `lsof -i :${DEV_PORT:-5173}` then `kill -9 <PID>`
- **Module errors**: `rm -rf node_modules && npm install`
- **HMR instability**: Clear Vite cache `rm -rf node_modules/.vite`
