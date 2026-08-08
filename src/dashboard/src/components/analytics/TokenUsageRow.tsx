/**
 * Token Usage 추이 · AOS LLM 모델별 토큰 2열 그리드 — AnalyticsPage 내부 전용.
 */

import { Users, Zap } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartCard } from './ChartCard'
import { CHART_COLORS } from './constants'
import type { ModelTokenBreakdown, MultiTrendData, TimeRange } from './types'
import { formatTokenCount, formatTrendData, renderAosModelSourceBadge, truncateModelLabel } from './utils'

interface TokenUsageRowProps {
  trends: MultiTrendData
  timeRange: TimeRange
  modelTokenBreakdown: ModelTokenBreakdown[]
}

export function TokenUsageRow({ trends, timeRange, modelTokenBreakdown }: TokenUsageRowProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      {/* Token Usage Trend */}
      <ChartCard title="Token Usage Trend" icon={Zap}>
        <ResponsiveContainer width="100%" height={250} debounce={80}>
          <AreaChart data={formatTrendData(trends.tokens, timeRange)}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12 }}
              className="text-gray-500"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              className="text-gray-500"
              tickFormatter={formatTokenCount}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--tooltip-bg, #fff)',
                borderColor: 'var(--tooltip-border, #e5e7eb)',
                borderRadius: '12px',
                padding: '8px 12px',
              }}
              formatter={(value) => [formatTokenCount(Number(value)), 'Tokens']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={CHART_COLORS[4]}
              fill={CHART_COLORS[4]}
              fillOpacity={0.3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* AOS LLM Model Token Breakdown */}
      <ChartCard
        title="AOS LLM Usage by Model"
        icon={Users}
        headerExtra={renderAosModelSourceBadge(modelTokenBreakdown)}
      >
        {modelTokenBreakdown.length > 0 ? (
          <div className="space-y-3">
            <ResponsiveContainer width="100%" height={210} debounce={80}>
              <BarChart
                data={modelTokenBreakdown}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 24, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12 }}
                  className="text-gray-500"
                  tickFormatter={formatTokenCount}
                />
                <YAxis
                  type="category"
                  dataKey="model"
                  width={120}
                  tick={{ fontSize: 11 }}
                  className="text-gray-500"
                  tickFormatter={(value) => truncateModelLabel(String(value))}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--tooltip-bg, #fff)',
                    borderColor: 'var(--tooltip-border, #e5e7eb)',
                    borderRadius: '12px',
                    padding: '8px 12px',
                  }}
                  formatter={(value) => [formatTokenCount(Number(value)), 'Tokens']}
                  labelFormatter={(label) => String(label)}
                />
                <Bar dataKey="tokens" radius={[0, 4, 4, 0]}>
                  {modelTokenBreakdown.map((entry) => (
                    <Cell key={`${entry.provider}:${entry.model}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 border-t border-gray-100 dark:border-gray-700 pt-3">
              {modelTokenBreakdown.slice(0, 6).map((entry) => (
                <div key={`${entry.provider}:${entry.model}`} className="min-w-0 flex items-center gap-2 text-xs">
                  <span
                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="truncate text-gray-900 dark:text-white" title={entry.model}>
                    {entry.model}
                  </span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {entry.providerLabel}
                  </span>
                  <span className="ml-auto text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {formatTokenCount(entry.tokens)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-[250px] flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <Zap className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No AOS LLM token data available</p>
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  )
}
