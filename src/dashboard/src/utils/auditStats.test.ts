import { describe, it, expect } from 'vitest'
import { computeTrendChange, computeActionBreakdown } from './auditStats'

describe('computeTrendChange', () => {
  it('returns null for fewer than 2 points', () => {
    expect(computeTrendChange([])).toBeNull()
    expect(computeTrendChange([{ date: '2026-05-20', count: 5 }])).toBeNull()
  })

  it('compares halves by per-day average, not raw sum (odd length)', () => {
    // 7 days split 3 + 4. A raw-sum comparison would report ~32% (biased by the
    // extra day in the second half); a per-day average correctly reports ~49%.
    const trend = [
      { date: '2026-05-14', count: 12 },
      { date: '2026-05-15', count: 4 },
      { date: '2026-05-16', count: 62 },
      { date: '2026-05-17', count: 8 },
      { date: '2026-05-18', count: 15 },
      { date: '2026-05-19', count: 21 },
      { date: '2026-05-20', count: 9 },
    ]
    // firstAvg = (12+4+62)/3 = 26, secondAvg = (8+15+21+9)/4 = 13.25
    // change = round((13.25 - 26) / 26 * 100) = -49
    expect(computeTrendChange(trend)).toEqual({ change: 49, direction: 'down' })
  })

  it('detects an upward trend', () => {
    const trend = [
      { date: '2026-05-18', count: 10 },
      { date: '2026-05-19', count: 10 },
      { date: '2026-05-20', count: 20 },
      { date: '2026-05-21', count: 20 },
    ]
    // firstAvg 10, secondAvg 20 → +100%
    expect(computeTrendChange(trend)).toEqual({ change: 100, direction: 'up' })
  })

  it('reports flat when both halves are zero', () => {
    const trend = [
      { date: '2026-05-20', count: 0 },
      { date: '2026-05-21', count: 0 },
    ]
    expect(computeTrendChange(trend)).toEqual({ change: 0, direction: 'flat' })
  })

  it('reports +100% when the first half has no activity', () => {
    const trend = [
      { date: '2026-05-20', count: 0 },
      { date: '2026-05-21', count: 7 },
    ]
    expect(computeTrendChange(trend)).toEqual({ change: 100, direction: 'up' })
  })
})

describe('computeActionBreakdown', () => {
  it('computes percentages against the grand total, not the visible top-N', () => {
    const data = { a: 50, b: 40, c: 30, d: 20, e: 10, f: 5, g: 3, h: 2 }
    // grand total = 160; top-6 are shown but 'a' must be 50/160 = 31%,
    // not 50/155 (the top-6 sum) = 32%.
    const result = computeActionBreakdown(data, 6)
    expect(result).toHaveLength(6)
    expect(result[0]).toMatchObject({ action: 'a', count: 50, pct: 31 })
  })

  it('sorts by count descending', () => {
    const result = computeActionBreakdown({ low: 1, high: 100, mid: 50 })
    expect(result.map((r) => r.action)).toEqual(['high', 'mid', 'low'])
  })

  it('scales barWidth relative to the largest item', () => {
    const result = computeActionBreakdown({ big: 200, small: 50 })
    expect(result[0].barWidth).toBe(100)
    expect(result[1].barWidth).toBe(25)
  })

  it('returns an empty array for empty data', () => {
    expect(computeActionBreakdown({})).toEqual([])
  })
})
