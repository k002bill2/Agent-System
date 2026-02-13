import { useMemo } from 'react'
import type { WorkflowJob } from '../../types/workflow'

interface ExecutionTimelineProps {
  jobs: WorkflowJob[]
}

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-green-400',
  failure: 'bg-red-400',
  running: 'bg-blue-400 animate-pulse',
  skipped: 'bg-gray-300 dark:bg-gray-600',
  queued: 'bg-yellow-400',
  cancelled: 'bg-gray-400',
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s % 60)}s`
}

export function ExecutionTimeline({ jobs }: ExecutionTimelineProps) {
  const { bars, totalDuration } = useMemo(() => {
    if (!jobs.length) return { bars: [], totalDuration: 0 }

    // Calculate relative positions
    const earliest = jobs.reduce((min, j) => {
      const t = j.started_at ? new Date(j.started_at).getTime() : Infinity
      return Math.min(min, t)
    }, Infinity)

    if (!isFinite(earliest)) return { bars: [], totalDuration: 0 }

    const barsData = jobs.map(j => {
      const start = j.started_at ? new Date(j.started_at).getTime() - earliest : 0
      const duration = (j.duration_seconds || 0) * 1000
      return {
        id: j.id,
        name: j.name,
        status: j.status,
        start,
        duration,
        end: start + duration,
      }
    })

    const maxEnd = Math.max(...barsData.map(b => b.end), 1)

    return { bars: barsData, totalDuration: maxEnd }
  }, [jobs])

  if (bars.length === 0) {
    return (
      <div className="text-center py-4 text-gray-400 text-sm">
        No execution data
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-gray-500">Execution Timeline</h4>
        <span className="text-xs text-gray-400">{formatMs(totalDuration)}</span>
      </div>

      {bars.map(bar => {
        const leftPct = totalDuration > 0 ? (bar.start / totalDuration) * 100 : 0
        const widthPct = totalDuration > 0 ? Math.max((bar.duration / totalDuration) * 100, 1) : 100
        const color = STATUS_COLORS[bar.status] || STATUS_COLORS.queued

        return (
          <div key={bar.id} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-24 truncate text-right flex-shrink-0" title={bar.name}>
              {bar.name}
            </span>
            <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded relative overflow-hidden">
              <div
                className={`absolute top-0.5 bottom-0.5 rounded ${color}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                title={`${bar.name}: ${formatMs(bar.duration)}`}
              />
            </div>
            <span className="text-xs text-gray-400 w-14 flex-shrink-0">
              {formatMs(bar.duration)}
            </span>
          </div>
        )
      })}

      {/* Time axis */}
      <div className="flex items-center gap-2 mt-1">
        <span className="w-24 flex-shrink-0" />
        <div className="flex-1 flex justify-between text-[10px] text-gray-400">
          <span>0s</span>
          <span>{formatMs(totalDuration / 2)}</span>
          <span>{formatMs(totalDuration)}</span>
        </div>
        <span className="w-14 flex-shrink-0" />
      </div>
    </div>
  )
}
