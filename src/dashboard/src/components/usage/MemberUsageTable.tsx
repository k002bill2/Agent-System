import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Search } from 'lucide-react'
import type { UnifiedUsageRecord } from '../../stores/externalUsage'

interface MemberSummary {
  key: string
  userId: string | null
  userEmail: string | null
  byProvider: Record<string, {
    cost: number
    tokens: number
    requests: number
    suggestions: number
    acceptances: number
  }>
  totalCost: number
  totalTokens: number
}

function aggregateByMember(records: UnifiedUsageRecord[]): MemberSummary[] {
  const map = new Map<string, MemberSummary>()

  for (const rec of records) {
    const key = rec.user_id ?? rec.user_email ?? 'unknown'
    if (!map.has(key)) {
      map.set(key, {
        key,
        userId: rec.user_id,
        userEmail: rec.user_email,
        byProvider: {},
        totalCost: 0,
        totalTokens: 0,
      })
    }
    const member = map.get(key)!
    const provider = rec.provider

    if (!member.byProvider[provider]) {
      member.byProvider[provider] = {
        cost: 0,
        tokens: 0,
        requests: 0,
        suggestions: 0,
        acceptances: 0,
      }
    }

    const p = member.byProvider[provider]
    p.cost += rec.cost_usd
    p.tokens += rec.total_tokens
    p.requests += rec.request_count
    p.suggestions += rec.code_suggestions ?? 0
    p.acceptances += rec.code_acceptances ?? 0

    member.totalCost += rec.cost_usd
    member.totalTokens += rec.total_tokens
  }

  return Array.from(map.values())
}

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

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  github_copilot: 'GitHub Copilot',
  google_gemini: 'Google Gemini',
  anthropic: 'Anthropic',
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  github_copilot: '#6e7681',
  google_gemini: '#4285f4',
  anthropic: '#d97706',
}

const ALL_PROVIDERS = ['openai', 'github_copilot', 'google_gemini', 'anthropic']

interface Props {
  records: UnifiedUsageRecord[]
  isLoading: boolean
}

export default function MemberUsageTable({ records, isLoading }: Props) {
  const [search, setSearch] = useState('')
  const [sortAsc, setSortAsc] = useState(false)

  const members = useMemo(() => aggregateByMember(records), [records])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return members
      .filter(m => {
        if (!q) return true
        return (
          (m.userId?.toLowerCase().includes(q) ?? false) ||
          (m.userEmail?.toLowerCase().includes(q) ?? false) ||
          m.key.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => sortAsc ? a.totalCost - b.totalCost : b.totalCost - a.totalCost)
  }, [members, search, sortAsc])

  // Determine which providers have any data
  const activeProviders = useMemo(() => {
    const active = new Set<string>()
    for (const m of members) {
      for (const p of Object.keys(m.byProvider)) {
        active.add(p)
      }
    }
    return ALL_PROVIDERS.filter(p => active.has(p))
  }, [members])

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 flex items-center justify-center">
        <span className="text-gray-400 text-sm">Loading member data...</span>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 shrink-0">
          Usage by Member
        </h2>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email or user ID..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-8 text-center text-gray-400 text-sm">
          {search ? 'No members match your search.' : 'No usage data available.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Member
                </th>
                {activeProviders.map(p => (
                  <th
                    key={p}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                    style={{ color: PROVIDER_COLORS[p] ?? '#888' }}
                  >
                    {PROVIDER_LABELS[p] ?? p}
                  </th>
                ))}
                <th
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap"
                  onClick={() => setSortAsc(v => !v)}
                >
                  <span className="flex items-center gap-1">
                    Total Cost
                    {sortAsc ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filtered.map(member => (
                <tr key={member.key} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  {/* Member identity */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white text-xs truncate max-w-[160px]">
                      {member.userEmail ?? member.userId ?? 'Unknown'}
                    </div>
                    {member.userEmail && member.userId && (
                      <div className="text-gray-400 text-xs truncate max-w-[160px]">
                        {member.userId}
                      </div>
                    )}
                  </td>

                  {/* Per-provider cells */}
                  {activeProviders.map(p => {
                    const pd = member.byProvider[p]
                    if (!pd) {
                      return (
                        <td key={p} className="px-4 py-3 text-gray-300 dark:text-gray-600">
                          &mdash;
                        </td>
                      )
                    }
                    if (p === 'github_copilot') {
                      const rate = pd.suggestions > 0
                        ? ((pd.acceptances / pd.suggestions) * 100).toFixed(1)
                        : '0.0'
                      return (
                        <td key={p} className="px-4 py-3 text-gray-600 dark:text-gray-300">
                          <div className="text-xs">{pd.suggestions.toLocaleString()} suggestions</div>
                          <div className="text-xs text-gray-400">{rate}% acceptance</div>
                        </td>
                      )
                    }
                    return (
                      <td key={p} className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        <div className="text-xs font-medium">{formatCost(pd.cost)}</div>
                        <div className="text-xs text-gray-400">{formatTokens(pd.tokens)} tokens</div>
                      </td>
                    )
                  })}

                  {/* Total cost */}
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 font-semibold text-gray-900 dark:text-white text-xs">
                      {member.totalCost > 50 && (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      )}
                      {formatCost(member.totalCost)}
                    </span>
                    <div className="text-xs text-gray-400">{formatTokens(member.totalTokens)} tokens</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
