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
import { isCostMeasured } from '../../lib/usageCoverage'

interface DailyPoint {
  date: string
  [provider: string]: string | number
}

const PROVIDER_COLORS: Record<string, string> = {
  codex_cli: '#7c3aed',
  claude_cli: '#d97706',
  internal_cli: '#059669',
  internal_api: '#64748b',
  openai: '#10a37f',
  github_copilot: '#6e7681',
  google: '#4285f4',
  google_gemini: '#4285f4',
  anthropic: '#d97706',
  ollama: '#16a34a',
}

const PROVIDER_LABELS: Record<string, string> = {
  codex_cli: 'Codex CLI',
  claude_cli: 'Claude CLI',
  internal_cli: 'Internal CLI',
  internal_api: 'Internal API',
  openai: 'OpenAI',
  github_copilot: 'GitHub Copilot',
  google: 'Google',
  google_gemini: 'Google Gemini',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
}

const PROVIDER_ORDER = [
  'codex_cli',
  'claude_cli',
  'internal_cli',
  'internal_api',
  'openai',
  'anthropic',
  'google',
  'google_gemini',
  'github_copilot',
  'ollama',
]

function sortProviders(providers: Iterable<string>): string[] {
  return Array.from(providers).sort((a, b) => {
    const ai = PROVIDER_ORDER.indexOf(a)
    const bi = PROVIDER_ORDER.indexOf(b)
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi)
    }
    return a.localeCompare(b)
  })
}

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
      })
    }

    const point = map.get(dateKey)!
    point[rec.provider] = Number(point[rec.provider] ?? 0) + rec.cost_usd
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

function formatCostAxis(value: number): string {
  if (value === 0) return '$0.00'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

interface Props {
  records: UnifiedUsageRecord[]
}

export default function DailyCostTrend({ records }: Props) {
  const data = useMemo(() => buildDailyTrend(records), [records])

  // 비용이 실제로 측정된 값이 있는 provider 만 면적을 그린다.
  // 측정된 0 은 비용 차트에 그릴 것이 없으므로 빠져도 사실과 어긋나지 않는다.
  // 반면 "모름"을 0 으로 그리면 "0 달러였다"는 거짓 주장이 되므로, 모름은 면적이 아니라
  // 아래 `unmeasuredProviders` 마커로 표면화한다 (감사 §2).
  const activeProviders = useMemo(
    () => sortProviders(new Set(records.map(record => record.provider)))
      .filter(p => data.some(d => Number(d[p] ?? 0) > 0)),
    [data, records],
  )

  // 비용이 측정되지 않은 provider — 값이 0 이라 면적이 그려지지 않으므로 텍스트로 표시한다.
  const unmeasuredProviders = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of records) {
      if (isCostMeasured(record.cost_state)) continue
      counts.set(record.provider, (counts.get(record.provider) ?? 0) + 1)
    }
    return sortProviders(counts.keys()).map(provider => ({
      provider,
      count: counts.get(provider) ?? 0,
    }))
  }, [records])

  // timestamp 가 실제 발생 시각이 아닌 provider 가 섞여 있는지 (감사 §5).
  const hasSessionDateBasis = useMemo(
    () => records.some(record => record.date_basis === 'session_last_activity'),
    [records],
  )

  if (data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Daily Estimated Cost Trend
        </h2>
        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
          데이터 없음
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
      <h2
        className={`text-sm font-semibold text-gray-700 dark:text-gray-300 ${hasSessionDateBasis ? '' : 'mb-4'}`}
      >
        Daily Estimated Cost Trend
      </h2>
      {hasSessionDateBasis && (
        <p
          className="mt-1 mb-4 text-xs text-gray-500 dark:text-gray-400"
          aria-label="일별 차트의 날짜 기준 안내"
        >
          Claude 스냅샷은 세션 누계를 마지막 활동일에 배치합니다 (실제 발생일별 분포 아님)
        </p>
      )}
      <ResponsiveContainer width="100%" height={260} debounce={80}>
        <AreaChart data={data} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <defs>
            {activeProviders.map(p => (
              <linearGradient key={p} id={`grad-${p}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={PROVIDER_COLORS[p] ?? '#888'} stopOpacity={0.25} />
                <stop offset="95%" stopColor={PROVIDER_COLORS[p] ?? '#888'} stopOpacity={0.02} />
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
            tickFormatter={formatCostAxis}
            width={60}
          />
          <Tooltip
            formatter={(value, name) => [
              formatCostAxis(Number(value)),
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
              stroke={PROVIDER_COLORS[p] ?? '#888'}
              fill={`url(#grad-${p})`}
              strokeWidth={2}
              name={p}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      {unmeasuredProviders.length > 0 && (
        <div
          className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3 text-xs text-gray-500 dark:text-gray-400"
          aria-label="비용이 측정되지 않아 추세선에 그려지지 않은 프로바이더"
        >
          <ul className="space-y-0.5">
            {unmeasuredProviders.map(item => (
              <li key={item.provider} className="text-amber-600 dark:text-amber-400">
                비용 미측정: {PROVIDER_LABELS[item.provider] ?? item.provider} ({item.count.toLocaleString()}건)
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
