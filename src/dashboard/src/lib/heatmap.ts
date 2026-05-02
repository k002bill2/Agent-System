export const HEATMAP_MIN_VISIBLE_ALPHA = 0.35

export function computeHeatmapAlpha(value: number, maxValue: number): number {
  if (value <= 0) return 0
  if (maxValue <= 0) return HEATMAP_MIN_VISIBLE_ALPHA
  const intensity = value / maxValue
  return Math.max(HEATMAP_MIN_VISIBLE_ALPHA, 0.2 + intensity * 0.8)
}
