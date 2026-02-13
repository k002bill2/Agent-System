/**
 * MetricsChart - SVG-based metrics visualization component.
 *
 * Renders line charts for success rate and bar charts for cost trends
 * using native SVG elements (no external chart library).
 */

import { useCallback, useMemo } from 'react'
import { cn } from '../../lib/utils'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface MetricBucket {
  timestamp: string
  success_rate: number
  avg_duration_ms: number
  total_cost: number
  task_count: number
}

type ChartMode = 'success_rate' | 'cost'

interface MetricsChartProps {
  buckets: MetricBucket[]
  mode: ChartMode
  selectedPeriod: '1h' | '6h' | '24h'
  onPeriodChange: (period: '1h' | '6h' | '24h') => void
  className?: string
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const CHART_WIDTH = 600
const CHART_HEIGHT = 200
const PADDING = { top: 20, right: 20, bottom: 30, left: 50 }
const PLOT_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right
const PLOT_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom

const PERIODS: Array<{ value: '1h' | '6h' | '24h'; label: string }> = [
  { value: '1h', label: '1H' },
  { value: '6h', label: '6H' },
  { value: '24h', label: '24H' },
]

// ─────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────

function formatTimestamp(ts: string, period: string): string {
  const date = new Date(ts)
  if (period === '24h') {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false })
  }
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatValue(value: number, mode: ChartMode): string {
  if (mode === 'success_rate') {
    return `${(value * 100).toFixed(1)}%`
  }
  return `$${value.toFixed(2)}`
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function MetricsChart({
  buckets,
  mode,
  selectedPeriod,
  onPeriodChange,
  className,
}: MetricsChartProps) {
  // Compute chart data based on mode
  const values = useMemo(() => {
    if (mode === 'success_rate') {
      return buckets.map((b) => b.success_rate)
    }
    return buckets.map((b) => b.total_cost)
  }, [buckets, mode])

  const minValue = useMemo(() => {
    if (values.length === 0) return 0
    if (mode === 'success_rate') return 0
    return Math.min(...values) * 0.9
  }, [values, mode])

  const maxValue = useMemo(() => {
    if (values.length === 0) return 1
    if (mode === 'success_rate') return 1
    const max = Math.max(...values)
    return max === 0 ? 1 : max * 1.1
  }, [values, mode])

  const range = maxValue - minValue || 1

  // Map data points to SVG coordinates
  const scaleX = useCallback(
    (index: number): number => {
      if (values.length <= 1) return PADDING.left + PLOT_WIDTH / 2
      return PADDING.left + (index / (values.length - 1)) * PLOT_WIDTH
    },
    [values.length],
  )

  const scaleY = useCallback(
    (value: number): number => {
      const normalized = (value - minValue) / range
      return PADDING.top + PLOT_HEIGHT - normalized * PLOT_HEIGHT
    },
    [minValue, range],
  )

  // Generate Y-axis labels
  const yLabels = useMemo(() => {
    const count = 5
    const labels: Array<{ value: number; y: number; label: string }> = []
    for (let i = 0; i < count; i++) {
      const value = minValue + (range * i) / (count - 1)
      labels.push({
        value,
        y: scaleY(value),
        label: formatValue(value, mode),
      })
    }
    return labels
  }, [minValue, range, scaleY, mode])

  // Generate X-axis labels (show ~5 labels)
  const xLabels = useMemo(() => {
    if (buckets.length === 0) return []
    const step = Math.max(1, Math.floor(buckets.length / 5))
    const labels: Array<{ index: number; x: number; label: string }> = []
    for (let i = 0; i < buckets.length; i += step) {
      labels.push({
        index: i,
        x: scaleX(i),
        label: formatTimestamp(buckets[i].timestamp, selectedPeriod),
      })
    }
    return labels
  }, [buckets, scaleX, selectedPeriod])

  // Render empty state
  if (buckets.length === 0) {
    return (
      <div className={cn('rounded-lg border border-gray-200 dark:border-gray-700 p-4', className)}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {mode === 'success_rate' ? 'Success Rate' : 'Cost Trend'}
          </h3>
          <PeriodSelector selected={selectedPeriod} onChange={onPeriodChange} />
        </div>
        <div className="flex items-center justify-center h-48 text-sm text-gray-400">
          No data available
        </div>
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-gray-200 dark:border-gray-700 p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {mode === 'success_rate' ? 'Success Rate' : 'Cost Trend'}
        </h3>
        <PeriodSelector selected={selectedPeriod} onChange={onPeriodChange} />
      </div>

      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={`${mode === 'success_rate' ? 'Success rate' : 'Cost trend'} chart`}
      >
        {/* Grid lines */}
        {yLabels.map((label, i) => (
          <line
            key={`grid-${i}`}
            x1={PADDING.left}
            y1={label.y}
            x2={PADDING.left + PLOT_WIDTH}
            y2={label.y}
            stroke="currentColor"
            strokeOpacity={0.1}
            strokeDasharray="4 2"
          />
        ))}

        {/* Y-axis labels */}
        {yLabels.map((label, i) => (
          <text
            key={`y-label-${i}`}
            x={PADDING.left - 8}
            y={label.y + 4}
            textAnchor="end"
            className="text-[10px] fill-gray-400"
          >
            {label.label}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((label, i) => (
          <text
            key={`x-label-${i}`}
            x={label.x}
            y={CHART_HEIGHT - 5}
            textAnchor="middle"
            className="text-[10px] fill-gray-400"
          >
            {label.label}
          </text>
        ))}

        {/* Chart content based on mode */}
        {mode === 'success_rate' ? (
          <SuccessRateLine values={values} scaleX={scaleX} scaleY={scaleY} />
        ) : (
          <CostBars
            values={values}
            scaleX={scaleX}
            scaleY={scaleY}
            baselineY={scaleY(minValue)}
            barCount={values.length}
          />
        )}

        {/* Axes */}
        <line
          x1={PADDING.left}
          y1={PADDING.top}
          x2={PADDING.left}
          y2={PADDING.top + PLOT_HEIGHT}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        <line
          x1={PADDING.left}
          y1={PADDING.top + PLOT_HEIGHT}
          x2={PADDING.left + PLOT_WIDTH}
          y2={PADDING.top + PLOT_HEIGHT}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

interface LineProps {
  values: number[]
  scaleX: (index: number) => number
  scaleY: (value: number) => number
}

function SuccessRateLine({ values, scaleX, scaleY }: LineProps) {
  const pathData = useMemo(() => {
    if (values.length === 0) return ''
    const points = values.map((v, i) => `${scaleX(i)},${scaleY(v)}`)
    return `M ${points.join(' L ')}`
  }, [values, scaleX, scaleY])

  const areaPath = useMemo(() => {
    if (values.length === 0) return ''
    const points = values.map((v, i) => `${scaleX(i)},${scaleY(v)}`)
    const baseline = PADDING.top + PLOT_HEIGHT
    return `M ${scaleX(0)},${baseline} L ${points.join(' L ')} L ${scaleX(values.length - 1)},${baseline} Z`
  }, [values, scaleX, scaleY])

  return (
    <g>
      {/* Gradient area fill */}
      <defs>
        <linearGradient id="successGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#successGradient)" />
      <path
        d={pathData}
        fill="none"
        stroke="#22c55e"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Data points */}
      {values.map((v, i) => (
        <circle
          key={`dot-${i}`}
          cx={scaleX(i)}
          cy={scaleY(v)}
          r={3}
          fill="#22c55e"
          stroke="white"
          strokeWidth={1.5}
        />
      ))}
    </g>
  )
}

interface BarsProps {
  values: number[]
  scaleX: (index: number) => number
  scaleY: (value: number) => number
  baselineY: number
  barCount: number
}

function CostBars({ values, scaleX, scaleY, baselineY, barCount }: BarsProps) {
  const barWidth = useMemo(() => {
    if (barCount <= 1) return 20
    const spacing = PLOT_WIDTH / barCount
    return Math.min(spacing * 0.7, 20)
  }, [barCount])

  return (
    <g>
      {values.map((v, i) => {
        const x = scaleX(i) - barWidth / 2
        const y = scaleY(v)
        const height = baselineY - y

        return (
          <rect
            key={`bar-${i}`}
            x={x}
            y={y}
            width={barWidth}
            height={Math.max(0, height)}
            rx={2}
            fill="#3b82f6"
            fillOpacity={0.7}
          />
        )
      })}
    </g>
  )
}

interface PeriodSelectorProps {
  selected: '1h' | '6h' | '24h'
  onChange: (period: '1h' | '6h' | '24h') => void
}

function PeriodSelector({ selected, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex gap-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={cn(
            'px-2 py-0.5 text-xs rounded transition-colors',
            selected === p.value
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
