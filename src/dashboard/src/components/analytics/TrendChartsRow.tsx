/**
 * Task Volume · Success Rate 추이 2열 그리드 — AnalyticsPage 내부 전용.
 */

import { BarChart3, TrendingUp } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartCard } from './ChartCard'
import { CHART_COLORS } from './constants'
import type { MultiTrendData, TimeRange } from './types'
import { formatTrendData } from './utils'

interface TrendChartsRowProps {
  trends: MultiTrendData
  timeRange: TimeRange
}

export function TrendChartsRow({ trends, timeRange }: TrendChartsRowProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      {/* Task Trend */}
      <ChartCard title="Task Volume" icon={BarChart3}>
        <ResponsiveContainer width="100%" height={250} debounce={80}>
          <LineChart data={formatTrendData(trends.tasks, timeRange)}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12 }}
              className="text-gray-500"
            />
            <YAxis tick={{ fontSize: 12 }} className="text-gray-500" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--tooltip-bg, #fff)',
                borderColor: 'var(--tooltip-border, #e5e7eb)',
                borderRadius: '12px',
                padding: '8px 12px',
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={CHART_COLORS[0]}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Success Rate Trend */}
      <ChartCard title="Success Rate Trend" icon={TrendingUp}>
        <ResponsiveContainer width="100%" height={250} debounce={80}>
          <LineChart data={formatTrendData(trends.success_rate, timeRange)}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12 }}
              className="text-gray-500"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
              className="text-gray-500"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--tooltip-bg, #fff)',
                borderColor: 'var(--tooltip-border, #e5e7eb)',
                borderRadius: '12px',
                padding: '8px 12px',
              }}
              formatter={(value) => [
                value != null ? `${Number(value).toFixed(1)}%` : 'No data',
                'Success Rate',
              ]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={CHART_COLORS[1]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
