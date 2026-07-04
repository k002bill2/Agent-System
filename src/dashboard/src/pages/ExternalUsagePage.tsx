import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  CheckCircle,
  DollarSign,
  RefreshCw,
  Settings,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useExternalUsageStore, type ExternalUsageSummaryResponse, type UnifiedUsageRecord } from '../stores/externalUsage'
import MemberUsageTable from '../components/usage/MemberUsageTable'
import DailyCostTrend from '../components/usage/DailyCostTrend'
import { AdminKeyManager } from '../components/usage/AdminKeyManager'
import { apiClient } from '../services/apiClient'

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

const PROVIDER_ORDER = ['codex_cli', 'anthropic', 'openai', 'github_copilot', 'google_gemini'] as const

const PERIOD_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

interface ClaudeUsageSnapshot {
  weeklyModelTokens?: Array<{ date: string; tokensByModel: Record<string, number> }>
  weeklyTotalTokens?: number
}

interface CodexUsageBreakdown {
  name: string
  tokens: number
  threads: number
}

interface CodexCliUsageSnapshot {
  available: boolean
  weeklyTokens?: number
  weeklyThreads?: number
  byModel?: CodexUsageBreakdown[]
  updatedAt?: string
}

interface LocalUsageState {
  claude: ClaudeUsageSnapshot | null
  codex: CodexCliUsageSnapshot | null
  isLoading: boolean
  error: string | null
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return tokens.toString()
}

function getPeriodStart(selectedPeriod: number): Date {
  return new Date(Date.now() - selectedPeriod * 86_400_000)
}

function makeUsageRecord(
  provider: string,
  timestamp: string,
  totalTokens: number,
  model: string | null,
  requestCount: number,
): UnifiedUsageRecord {
  return {
    id: `${provider}-${model ?? 'unknown'}-${timestamp}`,
    provider,
    timestamp,
    bucket_width: '1d',
    input_tokens: totalTokens,
    output_tokens: 0,
    total_tokens: totalTokens,
    cost_usd: 0,
    request_count: requestCount,
    model,
    user_id: 'local-cli',
    user_email: 'local-cli@aos',
    project_id: null,
    code_suggestions: null,
    code_acceptances: null,
    acceptance_rate: null,
    collected_at: new Date().toISOString(),
  }
}

function buildLocalUsageRecords(
  usage: Pick<LocalUsageState, 'claude' | 'codex'>,
  selectedPeriod: number,
): UnifiedUsageRecord[] {
  const records: UnifiedUsageRecord[] = []
  const periodStart = getPeriodStart(selectedPeriod).getTime()

  for (const day of usage.claude?.weeklyModelTokens ?? []) {
    const timestamp = new Date(`${day.date}T00:00:00.000Z`).toISOString()
    if (new Date(timestamp).getTime() < periodStart) continue

    for (const [model, tokens] of Object.entries(day.tokensByModel)) {
      if (tokens <= 0) continue
      records.push(makeUsageRecord('anthropic', timestamp, tokens, model, 1))
    }
  }

  const codexTimestamp = usage.codex?.updatedAt ?? new Date().toISOString()
  if (usage.codex?.available) {
    const weeklyTokens = usage.codex.weeklyTokens ?? 0
    if (weeklyTokens > 0) {
      records.push(
        makeUsageRecord(
          'codex_cli',
          codexTimestamp,
          weeklyTokens,
          'Codex CLI weekly',
          usage.codex.weeklyThreads ?? 1,
        ),
      )
    } else {
      for (const model of usage.codex.byModel ?? []) {
        if (model.tokens <= 0) continue
        records.push(makeUsageRecord('codex_cli', codexTimestamp, model.tokens, model.name, model.threads))
      }
    }
  }

  return records
}

function buildSummaryFromRecords(
  records: UnifiedUsageRecord[],
  selectedPeriod: number,
): ExternalUsageSummaryResponse {
  const periodStart = getPeriodStart(selectedPeriod).toISOString()
  const periodEnd = new Date().toISOString()
  const summaries = new Map<string, ExternalUsageSummaryResponse['providers'][number]>()

  for (const rec of records) {
    if (!summaries.has(rec.provider)) {
      summaries.set(rec.provider, {
        provider: rec.provider,
        period_start: periodStart,
        period_end: periodEnd,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_usd: 0,
        total_requests: 0,
        model_breakdown: {},
        member_breakdown: {},
      })
    }

    const summary = summaries.get(rec.provider)!
    summary.total_input_tokens += rec.input_tokens
    summary.total_output_tokens += rec.output_tokens
    summary.total_cost_usd += rec.cost_usd
    summary.total_requests += rec.request_count
    if (rec.model) {
      summary.model_breakdown[rec.model] = (summary.model_breakdown[rec.model] ?? 0) + rec.total_tokens
    }
    const memberKey = rec.user_id ?? rec.user_email ?? 'unknown'
    summary.member_breakdown[memberKey] = (summary.member_breakdown[memberKey] ?? 0) + rec.total_tokens
  }

  return {
    providers: Array.from(summaries.values()).sort((a, b) => {
      const aIndex = PROVIDER_ORDER.indexOf(a.provider as (typeof PROVIDER_ORDER)[number])
      const bIndex = PROVIDER_ORDER.indexOf(b.provider as (typeof PROVIDER_ORDER)[number])
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex)
    }),
    total_cost_usd: records.reduce((total, rec) => total + rec.cost_usd, 0),
    records,
    period_start: periodStart,
    period_end: periodEnd,
  }
}

export function ExternalUsagePage() {
  const { summary, providers, isLoading, error, fetchSummary, fetchProviders, syncProvider } =
    useExternalUsageStore()
  const [selectedPeriod, setSelectedPeriod] = useState(30)
  const [isSyncing, setIsSyncing] = useState(false)
  const [localUsage, setLocalUsage] = useState<LocalUsageState>({
    claude: null,
    codex: null,
    isLoading: true,
    error: null,
  })

  const fetchLocalUsage = useCallback(async () => {
    setLocalUsage(prev => (
      prev.isLoading && prev.error === null ? prev : { ...prev, isLoading: true, error: null }
    ))
    try {
      const [claude, codex] = await Promise.all([
        apiClient.get<ClaudeUsageSnapshot>('/api/usage').catch(() => null),
        apiClient.get<CodexCliUsageSnapshot>('/api/usage/codex-cli').catch(() => null),
      ])
      setLocalUsage({ claude, codex, isLoading: false, error: null })
    } catch (err) {
      setLocalUsage(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load local CLI usage',
      }))
    }
  }, [])

  useEffect(() => {
    const endTime = new Date().toISOString()
    const startTime = new Date(Date.now() - selectedPeriod * 86_400_000).toISOString()
    fetchSummary(startTime, endTime)
    fetchProviders()
    fetchLocalUsage()
  }, [selectedPeriod, fetchSummary, fetchProviders, fetchLocalUsage])

  const handleSync = async () => {
    setIsSyncing(true)
    await Promise.all([syncProvider(), fetchLocalUsage()])
    setIsSyncing(false)
  }

  const localRecords = useMemo(
    () => buildLocalUsageRecords(localUsage, selectedPeriod),
    [localUsage, selectedPeriod],
  )

  const localSummary = useMemo(
    () => buildSummaryFromRecords(localRecords, selectedPeriod),
    [localRecords, selectedPeriod],
  )

  const displaySummary = localRecords.length > 0 ? localSummary : summary
  const displayRecords = displaySummary?.records ?? []
  const displayProviders = displaySummary?.providers ?? []
  const displayTotalTokens = displayProviders.reduce((total, p) => (
    total + p.total_input_tokens + p.total_output_tokens
  ), 0)
  const displayCost = displaySummary?.total_cost_usd ?? 0
  const pageIsLoading = isLoading || localUsage.isLoading
  const pageError = localUsage.error ?? error
  const hasLocalCliUsage = localRecords.length > 0

  // Pie chart data
  const pieData = displayProviders
    .map(p => ({
      name: PROVIDER_LABELS[p.provider] ?? p.provider,
      value: p.total_input_tokens + p.total_output_tokens,
      color: PROVIDER_COLORS[p.provider] ?? '#888',
    }))
    .filter(p => p.value > 0)
    .map(p => ({
      ...p,
      label: `${p.name}: ${formatTokens(p.value)}`,
    }))

  // Model breakdown bar chart data
  const modelData: Array<{ model: string; [key: string]: string | number }> = []
  const modelMap: Record<string, Record<string, number>> = {}
  for (const p of displayProviders) {
    for (const [model, tokens] of Object.entries(p.model_breakdown)) {
      if (!modelMap[model]) modelMap[model] = {}
      modelMap[model][p.provider] = tokens
    }
  }
  for (const [model, providerCosts] of Object.entries(modelMap)) {
    modelData.push({ model, ...providerCosts })
  }
  modelData.sort((a, b) => {
    const sumA = Object.entries(a)
      .filter(([k]) => k !== 'model')
      .reduce((s, [, v]) => s + (v as number), 0)
    const sumB = Object.entries(b)
      .filter(([k]) => k !== 'model')
      .reduce((s, [, v]) => s + (v as number), 0)
    return sumB - sumA
  })

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-7 h-7" />
            External LLM Usage
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Monitor AOS local CLI usage first; deployment API billing keys remain available below
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(Number(e.target.value))}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            {PERIOD_OPTIONS.map(o => (
              <option key={o.days} value={o.days}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={handleSync}
            disabled={isSyncing || pageIsLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {pageError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {pageError}
        </div>
      )}

      {/* Total cost + provider cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Total */}
        <div className="md:col-span-1 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            Total Tokens
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {pageIsLoading ? '...' : formatTokens(displayTotalTokens)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {hasLocalCliUsage ? 'Local CLI observed usage' : `Last ${selectedPeriod} days`}
          </div>
          <div className="text-xs text-green-600 dark:text-green-400 mt-1">
            Actual billing: {formatCost(displayCost)} (subscription/free)
          </div>
        </div>

        {/* Per-provider cards */}
        {PROVIDER_ORDER.map(pkey => {
          const pData = displayProviders.find(p => p.provider === pkey)
          const pConf = providers.find(p => p.provider === pkey)
          const totalTokens = (pData?.total_input_tokens ?? 0) + (pData?.total_output_tokens ?? 0)
          const isLocalProvider = pkey === 'codex_cli' || pkey === 'anthropic'
          return (
            <div
              key={pkey}
              className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: PROVIDER_COLORS[pkey] }}
                >
                  {PROVIDER_LABELS[pkey]}
                </span>
                {pConf?.enabled || (isLocalProvider && totalTokens > 0) ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
                )}
              </div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {pageIsLoading ? '...' : formatTokens(totalTokens)}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {pData ? `${formatCost(pData.total_cost_usd)} actual cost` : pConf?.enabled ? 'No data' : 'Not configured'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Daily Cost Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DailyCostTrend records={displayRecords} />
      </div>

      {/* Member Usage Table */}
      <MemberUsageTable
        records={displayRecords}
        isLoading={pageIsLoading}
      />

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cost by Provider - Pie */}
        <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Usage by Provider
          </h2>
          {pieData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              No usage data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${String(name ?? '')}: ${formatTokens(Number(value ?? 0))}`}
                  labelLine={false}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatTokens(Number(v ?? 0))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Model Cost Breakdown - Bar */}
        <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Usage by Model
          </h2>
          {modelData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              No model breakdown available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={modelData.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => formatTokens(Number(v ?? 0))} />
                <YAxis type="category" dataKey="model" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v) => formatTokens(Number(v ?? 0))} />
                {Object.keys(PROVIDER_COLORS).map(p => (
                  <Bar key={p} dataKey={p} stackId="a" fill={PROVIDER_COLORS[p]} name={PROVIDER_LABELS[p]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Provider details table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Provider Details
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                {['Provider', 'Total Tokens', 'Output Tokens', 'Cost', 'Requests', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {PROVIDER_ORDER.map(pkey => {
                const pData = displayProviders.find(p => p.provider === pkey)
                const pConf = providers.find(p => p.provider === pkey)
                const totalTokens = (pData?.total_input_tokens ?? 0) + (pData?.total_output_tokens ?? 0)
                const isLocalProvider = pkey === 'codex_cli' || pkey === 'anthropic'
                return (
                  <tr key={pkey} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <span
                        className="font-medium"
                        style={{ color: PROVIDER_COLORS[pkey] }}
                      >
                        {PROVIDER_LABELS[pkey]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {pData ? formatTokens(totalTokens) : '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {pData ? formatTokens(pData.total_output_tokens) : '\u2014'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {pData ? formatCost(pData.total_cost_usd) : '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {pData ? pData.total_requests.toLocaleString() : '\u2014'}
                    </td>
                    <td className="px-4 py-3">
                      {isLocalProvider && totalTokens > 0 ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Local CLI
                        </span>
                      ) : pConf?.enabled ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Configured
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                          <Settings className="w-3.5 h-3.5" />
                          Not configured
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin/manager usage key management (replaces the read-only env guide) */}
      <AdminKeyManager />
    </div>
  )
}
