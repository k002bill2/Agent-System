import { describe, it, expect } from 'vitest'
import { computeHeatmapAlpha, HEATMAP_MIN_VISIBLE_ALPHA } from '../heatmap'

describe('computeHeatmapAlpha', () => {
  it('returns 0 for value=0 so cell renders the empty color', () => {
    expect(computeHeatmapAlpha(0, 10)).toBe(0)
  })

  it('returns the visibility floor when max_value is 0 but value is positive', () => {
    expect(computeHeatmapAlpha(1, 0)).toBe(HEATMAP_MIN_VISIBLE_ALPHA)
  })

  it('returns at least the visibility floor for value=1 against a large max', () => {
    const alpha = computeHeatmapAlpha(1, 22)
    expect(alpha).toBeGreaterThanOrEqual(HEATMAP_MIN_VISIBLE_ALPHA)
  })

  it('returns 1.0 when value equals max', () => {
    expect(computeHeatmapAlpha(10, 10)).toBeCloseTo(1.0, 5)
  })

  it('scales linearly above the floor', () => {
    expect(computeHeatmapAlpha(5, 10)).toBeCloseTo(0.6, 5)
  })

  it('treats negative values as empty', () => {
    expect(computeHeatmapAlpha(-1, 10)).toBe(0)
  })
})
