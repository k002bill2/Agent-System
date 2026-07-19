/**
 * Format a duration given in milliseconds into a compact string.
 *
 * Shared by the monitor cards (CheckCard, WorkflowCheckCard). The output
 * contract intentionally matches their previous local implementations:
 *   < 1000 ms  -> "500ms"  (rounded to whole ms)
 *   >= 1000 ms -> "3.5s"   (seconds with one decimal, no minute cap)
 *   null       -> null     (caller hides the field)
 *
 * Note: this is deliberately NOT the same contract as formatUptime (uptime
 * badges) or the workflow tables (which cap at minutes as "m Ns"). Do not
 * fold those in here — their rendered strings differ.
 */
export function formatDurationMs(ms: number | null): string | null {
  if (ms === null) return null
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
