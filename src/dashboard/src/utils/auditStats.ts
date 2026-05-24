/**
 * Audit statistics calculations.
 *
 * Pure functions extracted from AuditPage so the chart math can be unit-tested
 * independently of React rendering.
 */

export interface TrendPoint {
  date: string
  count: number
}

export type TrendDirection = 'up' | 'down' | 'flat'

export interface TrendChange {
  /** Absolute percentage change between the two halves of the series. */
  change: number
  direction: TrendDirection
}

/**
 * Compares the first half of a trend series against the second half.
 *
 * Uses per-day *averages* rather than raw sums: an odd-length series (e.g.
 * 7 days splits into 3 + 4) would otherwise bias the result toward the larger
 * half. Averaging makes the comparison length-agnostic.
 */
export function computeTrendChange(trend: readonly TrendPoint[]): TrendChange | null {
  if (trend.length < 2) return null

  const mid = Math.floor(trend.length / 2)
  const average = (points: readonly TrendPoint[]): number =>
    points.length === 0
      ? 0
      : points.reduce((sum, p) => sum + p.count, 0) / points.length

  const firstAvg = average(trend.slice(0, mid))
  const secondAvg = average(trend.slice(mid))

  if (firstAvg === 0 && secondAvg === 0) return { change: 0, direction: 'flat' }
  if (firstAvg === 0) return { change: 100, direction: 'up' }

  const change = Math.round(((secondAvg - firstAvg) / firstAvg) * 100)
  return {
    change: Math.abs(change),
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  }
}

export interface ActionBreakdownItem {
  action: string
  count: number
  /** Share of the grand total, 0–100, rounded. */
  pct: number
  /** Bar width relative to the largest item, 0–100. */
  barWidth: number
}

/**
 * Ranks action types by count for the breakdown chart.
 *
 * Percentages are computed against the grand total of *all* action types — not
 * just the displayed top-N — otherwise hiding the long tail would inflate every
 * visible row.
 */
export function computeActionBreakdown(
  data: Record<string, number>,
  limit = 6,
): ActionBreakdownItem[] {
  const ranked = Object.entries(data).sort((a, b) => b[1] - a[1])
  const grandTotal = ranked.reduce((sum, [, count]) => sum + count, 0)
  const maxVal = ranked[0]?.[1] ?? 1

  return ranked.slice(0, limit).map(([action, count]) => ({
    action,
    count,
    pct: grandTotal === 0 ? 0 : Math.round((count / grandTotal) * 100),
    barWidth: maxVal === 0 ? 0 : (count / maxVal) * 100,
  }))
}
