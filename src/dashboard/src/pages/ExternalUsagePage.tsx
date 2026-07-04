import { useEffect, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  CheckCircle,
  GitCompareArrows,
  Hash,
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
import { useExternalUsageStore } from '../stores/externalUsage'
import MemberUsageTable from '../components/usage/MemberUsageTable'
import DailyCostTrend from '../components/usage/DailyCostTrend'
import { AdminKeyManager } from '../components/usage/AdminKeyManager'

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

const DEFAULT_PROVIDER_KEYS = [
  'codex_cli',
  'claude_cli',
  'openai',
  'anthropic',
  'google_gemini',
  'github_copilot',
]

const PERIOD_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return tokens.toString()
}

function totalTokens(inputTokens = 0, outputTokens = 0): number {
  return inputTokens + outputTokens
}

function formatSignedTokens(tokens: number): string {
  if (tokens === 0) return '0'
  const sign = tokens > 0 ? '+' : '-'
  return `${sign}${formatTokens(Math.abs(tokens))}`
}

function formatSignedCost(cost: number): string {
  if (cost === 0) return '$0.00'
  const sign = cost > 0 ? '+' : '-'
  return `${sign}${formatCost(Math.abs(cost))}`
}

function reconciliationStatusLabel(status: string): string {
  switch (status) {
    case 'compared':
      return 'Compared'
    case 'ledger_only':
      return 'Ledger only'
    case 'provider_only':
      return 'Provider only'
    case 'provider_billing_disabled':
      return 'Billing disabled'
    default:
      return 'Not collected'
  }
}

export function ExternalUsagePage() {
  const { summary, providers, isLoading, error, fetchSummary, fetchProviders, syncProvider } =
    useExternalUsageStore()
  const [selectedPeriod, setSelectedPeriod] = useState(30)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    const endTime = new Date().toISOString()
    const startTime = new Date(Date.now() - selectedPeriod * 86_400_000).toISOString()
    fetchSummary(startTime, endTime)
    fetchProviders()
  }, [selectedPeriod, fetchSummary, fetchProviders])

  const handleSync = async () => {
    setIsSyncing(true)
    await syncProvider()
    setIsSyncing(false)
  }

  const providerKeys = Array.from(
    new Set([
      ...DEFAULT_PROVIDER_KEYS,
      ...providers.map(provider => provider.provider),
      ...(summary?.providers ?? []).map(provider => provider.provider),
    ]),
  )

  // Pie chart data
  const pieData = (summary?.providers ?? [])
    .filter(p => p.total_cost_usd > 0)
    .map(p => ({
      name: PROVIDER_LABELS[p.provider] ?? p.provider,
      value: p.total_cost_usd,
      color: PROVIDER_COLORS[p.provider] ?? '#888',
    }))

  // Model breakdown bar chart data
  const modelData: Array<{ model: string; [key: string]: string | number }> = []
  const modelMap: Record<string, Record<string, number>> = {}
  for (const p of summary?.providers ?? []) {
    for (const [model, cost] of Object.entries(p.model_breakdown)) {
      if (!modelMap[model]) modelMap[model] = {}
      modelMap[model][p.provider] = cost
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

  const summaryTotalTokens = (summary?.providers ?? []).reduce(
    (total, provider) => total + totalTokens(provider.total_input_tokens, provider.total_output_tokens),
    0,
  )
  const reconciliation = summary?.reconciliation
  const configuredReconciliationKeys = providers.filter(provider => provider.enabled).length
  const comparisonRows = reconciliation?.comparisons.slice(0, 8) ?? []

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-7 h-7" />
            LLM Usage
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Internal CLI subscription usage and API fallback tracking
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
            disabled={isSyncing || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded-md transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Total tokens + provider cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {/* Total */}
        <div className="md:col-span-1 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
            <Hash className="w-4 h-4" />
            Total Tokens
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {isLoading ? '...' : formatTokens(summaryTotalTokens)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Estimated cost {formatCost(summary?.total_cost_usd ?? 0)} · Last {selectedPeriod} days
          </div>
        </div>

        {/* Per-provider cards */}
        {providerKeys.map(pkey => {
          const pData = summary?.providers.find(p => p.provider === pkey)
          const pConf = providers.find(p => p.provider === pkey)
          const isTracked = Boolean(pData?.total_requests)
          const providerTokens = pData ? totalTokens(pData.total_input_tokens, pData.total_output_tokens) : 0
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
                  {PROVIDER_LABELS[pkey] ?? pkey}
                </span>
                {isTracked || pConf?.enabled ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
                )}
              </div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {isLoading ? '...' : formatTokens(providerTokens)}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {pData ? `Estimated cost ${formatCost(pData.total_cost_usd)}` : pConf?.enabled ? 'No data' : 'Not tracked'}
              </div>
            </div>
          )
        })}
      </div>

      {/* Internal ledger vs optional provider billing reconciliation */}
      {reconciliation && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <GitCompareArrows className="w-4 h-4" />
                Usage Reconciliation
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Primary usage totals come from the internal ledger.
              </p>
            </div>
            <span className="inline-flex items-center rounded-md border border-gray-200 dark:border-gray-700 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              {reconciliation.provider_billing_enabled ? 'Provider billing enabled' : 'Provider billing disabled'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b border-gray-200 dark:border-gray-700">
            <div className="p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400">Primary source</div>
              <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                Internal CLI ledger
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400">Ledger tokens</div>
              <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {formatTokens(reconciliation.internal_total_tokens)}
              </div>
              <div className="text-xs text-gray-400">
                {reconciliation.internal_total_requests.toLocaleString()} requests
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400">Provider billing tokens</div>
              <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {formatTokens(reconciliation.provider_billing_total_tokens)}
              </div>
              <div className="text-xs text-gray-400">
                {reconciliation.provider_billing_record_count.toLocaleString()} records
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400">Configured keys</div>
              <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {configuredReconciliationKeys}
              </div>
              <div className="text-xs text-gray-400">
                Optional provider billing
              </div>
            </div>
          </div>

          {comparisonRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    {['Provider', 'Ledger Tokens', 'Billing Tokens', 'Token Delta', 'Cost Delta', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {comparisonRows.map(row => (
                    <tr key={row.provider} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {PROVIDER_LABELS[row.provider] ?? row.provider}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {formatTokens(row.internal_total_tokens)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {formatTokens(row.provider_billing_total_tokens)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {formatSignedTokens(row.delta_tokens)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {formatSignedCost(row.delta_cost_usd)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {reconciliationStatusLabel(row.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
              No reconciliation comparison rows for this period.
            </div>
          )}
        </div>
      )}

      {/* Daily estimated cost trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DailyCostTrend records={summary?.records ?? []} />
      </div>

      {/* Member Usage Table */}
      <MemberUsageTable
        records={summary?.records ?? []}
        isLoading={isLoading}
      />

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Estimated cost by Provider - Pie */}
        <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Estimated Cost by Provider
          </h2>
          {pieData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              No estimated cost data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220} debounce={80}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${formatCost(value)}`}
                  labelLine={false}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCost(Number(v ?? 0))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Estimated model cost breakdown - Bar */}
        <div className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Estimated Cost by Model
          </h2>
          {modelData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              No model breakdown available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220} debounce={80}>
              <BarChart data={modelData.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                <YAxis type="category" dataKey="model" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v) => formatCost(Number(v ?? 0))} />
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
                {['Provider', 'Input Tokens', 'Output Tokens', 'Estimated Cost', 'Requests', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {providerKeys.map(pkey => {
                const pData = summary?.providers.find(p => p.provider === pkey)
                const pConf = providers.find(p => p.provider === pkey)
                const isTracked = Boolean(pData?.total_requests)
                return (
                  <tr key={pkey} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <span
                        className="font-medium"
                        style={{ color: PROVIDER_COLORS[pkey] }}
                      >
                        {PROVIDER_LABELS[pkey] ?? pkey}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {pData ? formatTokens(pData.total_input_tokens) : '\u2014'}
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
                      {isTracked ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Tracked
                        </span>
                      ) : pConf?.enabled ? (
                        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Configured
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                          <Settings className="w-3.5 h-3.5" />
                          Not tracked
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

      {/* Optional provider billing reconciliation key management */}
      <AdminKeyManager />
    </div>
  )
}
