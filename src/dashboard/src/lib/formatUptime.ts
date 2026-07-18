/**
 * Format a backend uptime (in seconds) into a compact, human-readable string.
 *
 * Buckets (per plan spec):
 *   >= 1 day    -> "2d 3h"
 *   >= 1 hour   -> "3h 42m"
 *   >= 1 minute -> "42m"
 *   <  1 minute -> "45s"
 *   invalid     -> "—"
 */
export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return '—'
  }

  const totalSeconds = Math.floor(seconds)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60

  if (days >= 1) return `${days}d ${hours}h`
  if (hours >= 1) return `${hours}h ${minutes}m`
  if (minutes >= 1) return `${minutes}m`
  return `${secs}s`
}
