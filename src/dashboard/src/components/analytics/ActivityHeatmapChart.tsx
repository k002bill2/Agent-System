/**
 * 요일×시간 활동 히트맵 — AnalyticsPage 내부 전용.
 */

import { computeHeatmapAlpha } from '@/lib/heatmap'
import { DAY_LABELS } from './constants'
import type { ActivityHeatmap } from './types'

export function ActivityHeatmapChart({ data }: { data: ActivityHeatmap }) {
  const cellHeight = 16
  const isDark = document.documentElement.classList.contains('dark')
  const emptyColor = isDark ? '#171f2a' : '#e5e7eb'

  return (
    <div className="w-full overflow-hidden">
      <div className="flex gap-1 w-full">
        {/* Hour labels */}
        <div className="flex flex-col gap-[2px] text-[10px] text-gray-500 pr-1 flex-shrink-0 w-8">
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={i}
              style={{ height: cellHeight }}
              className="flex items-center justify-end leading-none"
            >
              {i % 6 === 0 ? `${i}:00` : ''}
            </div>
          ))}
        </div>

        {/* Heatmap grid */}
        {Array.from({ length: 7 }, (_, day) => (
          <div key={day} className="flex flex-col gap-[2px] flex-1 min-w-0">
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = data.cells.find((c) => c.day === day && c.hour === hour)
              const value = cell?.value || 0
              const alpha = computeHeatmapAlpha(value, data.max_value)

              return (
                <div
                  key={hour}
                  style={{
                    height: cellHeight,
                    backgroundColor: alpha === 0
                      ? emptyColor
                      : `rgba(59, 130, 246, ${alpha})`,
                  }}
                  className="w-full rounded-sm cursor-pointer hover:ring-2 hover:ring-blue-400"
                  title={`${DAY_LABELS[day]} ${hour}:00 - ${value} sessions`}
                />
              )
            })}
            <div className="text-[10px] text-gray-500 text-center mt-1 truncate">
              {DAY_LABELS[day]}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
          <div
            key={i}
            style={{
              width: 12,
              height: 12,
              backgroundColor: intensity === 0
                ? emptyColor
                : `rgba(59, 130, 246, ${0.2 + intensity * 0.8})`,
            }}
            className="rounded-sm"
          />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
