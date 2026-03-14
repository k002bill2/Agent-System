/**
 * Stop Hook - 세션 종료 시 에이전트 메트릭 집계
 * parallel-state.json과 세션 트레이스를 읽어 세션 요약 생성
 *
 * @hook-config
 * {"event": "Stop", "matcher": "", "command": "node .claude/hooks/stopEvent.js", "timeout": 5}
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const COORD = path.join(ROOT, '.claude', 'coordination');
const STATE_FILE = path.join(COORD, 'parallel-state.json');
const METRICS_FILE = path.join(COORD, 'session-metrics.json');
const TRACES = path.join(ROOT, '.temp', 'traces', 'sessions');

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }

function getAgentMetrics() {
  const s = readJson(STATE_FILE);
  if (!s) return { spawned: 0, completed: 0, failed: 0, avgDurationMs: 0 };
  const active = Array.isArray(s.activeAgents) ? s.activeAgents : [];
  const done = Array.isArray(s.completedAgents) ? s.completedAgents : [];
  const failed = done.filter(a => a.status === 'failed' || a.error).length;
  const durations = done
    .filter(a => a.startTime && a.endTime)
    .map(a => new Date(a.endTime) - new Date(a.startTime))
    .filter(d => d > 0);
  const avg = durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0;
  return { spawned: active.length + done.length, completed: done.length - failed, failed, avgDurationMs: avg };
}

function getTraceEventCount() {
  try {
    if (!fs.existsSync(TRACES)) return 0;
    const dirs = fs.readdirSync(TRACES).sort().reverse();
    if (!dirs.length) return 0;
    const evFile = path.join(TRACES, dirs[0], 'events.jsonl');
    if (!fs.existsSync(evFile)) return 0;
    return fs.readFileSync(evFile, 'utf8').split('\n').filter(Boolean).length;
  } catch { return 0; }
}

function main() {
  const metrics = getAgentMetrics();
  const traceEvents = getTraceEventCount();
  const entry = { timestamp: new Date().toISOString(), agents: metrics, traceEvents };

  if (!fs.existsSync(COORD)) fs.mkdirSync(COORD, { recursive: true });
  const existing = readJson(METRICS_FILE);
  const entries = Array.isArray(existing) ? existing : [];
  entries.push(entry);
  fs.writeFileSync(METRICS_FILE, JSON.stringify(entries.slice(-20), null, 2));

  const dur = metrics.avgDurationMs > 0 ? `${(metrics.avgDurationMs / 1000).toFixed(1)}s` : 'N/A';
  process.stdout.write(
    `[Session Metrics] Agents: ${metrics.spawned} spawned, ` +
    `${metrics.completed} completed, ${metrics.failed} failed | ` +
    `Avg duration: ${dur} | Trace events: ${traceEvents}`
  );
}

main();
