import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { UnifiedUsageRecord } from '../../stores/externalUsage'

type ProviderKey = 'codex_cli' | 'openai' | 'github_copilot' | 'google_gemini' | 'anthropic'

interface DailyPoint {
  date: string
  codex_cli: number
  openai: number
  github_copilot: number
  google_gemini: number
  anthropic: number
}

const PROVIDER_COLORS: Record<string, string> = {
  codex_cli: '#a855f7',
  openai: '#10a37f',
  github_copilot: '#6e7681',
  google_gemini: '#4285f4',
  anthropic: '#d97706',
}

const PROVIDER_LABELS: Record<string, string> = {
  codex_cli: 'Codex CLI',
  openai: 'OpenAI',
  github_copilot: 'GitHub Copilot',
  google_gemini: 'Google Gemini',
  anthropic: 'Anthropic',
}

const ALL_PROVIDERS: ProviderKey[] = ['codex_cli', 'anthropic', 'openai', 'github_copilot', 'google_gemini']

const PROVIDER_SET = new Set<string>(ALL_PROVIDERS)

function buildDailyTrend(records: UnifiedUsageRecord[]): DailyPoint[] {
  const map = new Map<string, DailyPoint>()

  for (const rec of records) {
    const dateKey = new Date(rec.timestamp).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    })

    if (!map.has(dateKey)) {
      map.set(dateKey, {
        date: dateKey,
        openai: 0,
        github_copilot: 0,
        google_gemini: 0,
        anthropic: 0,
        codex_cli: 0,
      })
    }

    const point = map.get(dateKey)!
    if (PROVIDER_SET.has(rec.provider)) {
      const key = rec.provider as ProviderKey
      point[key] = point[key] + rec.total_tokens
    }
  }

  // Sort chronologically using the earliest timestamp seen for each date bucket
  const timestampForDate = new Map<string, number>()
  for (const rec of records) {
    const dateKey = new Date(rec.timestamp).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    })
    const ts = new Date(rec.timestamp).getTime()
    const existing = timestampForDate.get(dateKey)
    if (existing === undefined || ts < existing) {
      timestampForDate.set(dateKey, ts)
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const ta = timestampForDate.get(a.date) ?? 0
    const tb = timestampForDate.get(b.date) ?? 0
    return ta - tb
  })
}

function formatTokenAxis(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toString()
}

interface Props {
  records: UnifiedUsageRecord[]
}

export default function DailyCostTrend({ records }: Props) {
  const data = useMemo(() => buildDailyTrend(records), [records])

  // Only render Area for providers that have at least one non-zero value
  const activeProviders = useMemo(
    () => ALL_PROVIDERS.filter(p => data.some(d => d[p] > 0)),
    [data],
  )

  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Daily Usage Trend
        </h2>
        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
          데이터 없음
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
        Daily Usage Trend
      </h2>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <defs>
            {ALL_PROVIDERS.map(p => (
              <linearGradient key={p} id={`grad-${p}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PROVIDER_COLORS[p]} stopOpacity={0.25} />
                <stop offset="95%" stopColor={PROVIDER_COLORS[p]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatTokenAxis}
            width={60}
          />
          <Tooltip
            formatter={(value, name) => [
              formatTokenAxis(Number(value)),
              PROVIDER_LABELS[String(name)] ?? String(name),
            ]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
            }}
          />
          <Legend
            formatter={(value: string) => PROVIDER_LABELS[value] ?? value}
            wrapperStyle={{ fontSize: 12 }}
          />
          {activeProviders.map(p => (
            <Area
              key={p}
              type="monotone"
              dataKey={p}
              stackId="stack"
              stroke={PROVIDER_COLORS[p]}
              fill={`url(#grad-${p})`}
              strokeWidth={2}
              name={p}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
