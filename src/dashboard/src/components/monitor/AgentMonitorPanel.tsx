/**
 * AgentMonitorPanel - Real-time agent monitoring panel.
 *
 * Displays a live status list of all monitored agents with connection
 * status indicator, SSE auto-reconnect, and drill-down to individual
 * agent metrics via MetricsChart.
 */

import { useEffect, useCallback, useMemo } from 'react'
import { useAgentMonitorStore } from '../../stores/agentMonitor'
import { MetricsChart } from './MetricsChart'
import { cn } from '../../lib/utils'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type AgentStatusValue = 'idle' | 'running' | 'error' | 'offline'
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

interface AgentInfo {
  agent_id: string
  name: string
  status: AgentStatusValue
  last_active: string
  total_tasks: number
  successful_tasks: number
  total_cost: number
  avg_duration_ms: number
}

// ─────────────────────────────────────────────────────────────
// Status Helpers
// ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<AgentStatusValue, string> = {
  idle: 'bg-gray-400',
  running: 'bg-green-500',
  error: 'bg-red-500',
  offline: 'bg-gray-300 dark:bg-gray-600',
}

const STATUS_LABELS: Record<AgentStatusValue, string> = {
  idle: 'Idle',
  running: 'Running',
  error: 'Error',
  offline: 'Offline',
}

const CONNECTION_STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; colorClass: string; pulse: boolean }
> = {
  disconnected: { label: 'Disconnected', colorClass: 'bg-gray-400', pulse: false },
  connecting: { label: 'Connecting...', colorClass: 'bg-yellow-400', pulse: true },
  connected: { label: 'Connected', colorClass: 'bg-green-500', pulse: false },
  reconnecting: { label: 'Reconnecting...', colorClass: 'bg-yellow-400', pulse: true },
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function AgentMonitorPanel() {
  const {
    connectionStatus,
    agents,
    selectedAgentId,
    agentMetrics,
    selectedPeriod,
    metricsSummary,
    isLoadingMetrics,
    isLoadingSummary,
    error,
    connect,
    disconnect,
    selectAgent,
    setSelectedPeriod,
    fetchMetrics,
    fetchSummary,
  } = useAgentMonitorStore()

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect()
    fetchSummary()

    return () => {
      disconnect()
    }
  }, [connect, disconnect, fetchSummary])

  // Fetch metrics when selected agent or period changes
  useEffect(() => {
    if (selectedAgentId) {
      fetchMetrics(selectedAgentId, selectedPeriod)
    }
  }, [selectedAgentId, selectedPeriod, fetchMetrics])

  // Agent list sorted by status (running first, then idle, error, offline)
  const sortedAgents = useMemo((): AgentInfo[] => {
    const statusOrder: Record<string, number> = {
      running: 0,
      idle: 1,
      error: 2,
      offline: 3,
    }
    const agentList = Object.values(agents) as AgentInfo[]
    return agentList.sort(
      (a: AgentInfo, b: AgentInfo) =>
        (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4),
    )
  }, [agents])

  const handleAgentClick = useCallback(
    (agentId: string) => {
      selectAgent(selectedAgentId === agentId ? null : agentId)
    },
    [selectAgent, selectedAgentId],
  )

  const handlePeriodChange = useCallback(
    (period: '1h' | '6h' | '24h') => {
      setSelectedPeriod(period)
    },
    [setSelectedPeriod],
  )

  const connConfig = CONNECTION_STATUS_CONFIG[connectionStatus as ConnectionStatus]

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Connection Status Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'w-2.5 h-2.5 rounded-full',
              connConfig.colorClass,
              connConfig.pulse && 'animate-pulse',
            )}
            data-testid="connection-indicator"
          />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {connConfig.label}
          </span>
        </div>
        <button
          onClick={() => (connectionStatus === 'connected' ? disconnect() : connect())}
          className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
          data-testid="connection-toggle"
        >
          {connectionStatus === 'connected' ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          className="px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300"
          role="alert"
          data-testid="error-banner"
        >
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {metricsSummary && !isLoadingSummary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2" data-testid="summary-cards">
          <SummaryCard label="Total Agents" value={String(metricsSummary.total_agents)} />
          <SummaryCard label="Active" value={String(metricsSummary.active_agents)} />
          <SummaryCard
            label="Success Rate"
            value={`${(metricsSummary.avg_success_rate * 100).toFixed(1)}%`}
          />
          <SummaryCard label="Cost (24h)" value={`$${metricsSummary.total_cost_24h.toFixed(2)}`} />
          <SummaryCard label="Tasks (24h)" value={String(metricsSummary.tasks_completed_24h)} />
        </div>
      )}

      {/* Agent List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Agents ({sortedAgents.length})
          </h3>
        </div>

        {sortedAgents.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-gray-400" data-testid="empty-state">
            {connectionStatus === 'connected'
              ? 'No agents registered'
              : 'Connect to see agents'}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700" data-testid="agent-list">
            {sortedAgents.map((agent: AgentInfo) => (
              <AgentRow
                key={agent.agent_id}
                agent={agent}
                isSelected={selectedAgentId === agent.agent_id}
                onClick={() => handleAgentClick(agent.agent_id)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Drill-down: Metrics Chart */}
      {selectedAgentId && (
        <div className="flex flex-col gap-3" data-testid="metrics-drilldown">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Metrics: {(agents as Record<string, AgentInfo>)[selectedAgentId]?.name ?? selectedAgentId}
          </h4>

          {isLoadingMetrics ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">
              Loading metrics...
            </div>
          ) : agentMetrics ? (
            <div className="flex flex-col gap-3">
              <MetricsChart
                buckets={agentMetrics.buckets}
                mode="success_rate"
                selectedPeriod={selectedPeriod}
                onPeriodChange={handlePeriodChange}
              />
              <MetricsChart
                buckets={agentMetrics.buckets}
                mode="cost"
                selectedPeriod={selectedPeriod}
                onPeriodChange={handlePeriodChange}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

interface AgentRowProps {
  agent: AgentInfo
  isSelected: boolean
  onClick: () => void
}

function AgentRow({ agent, isSelected, onClick }: AgentRowProps) {
  const successRate =
    agent.total_tasks > 0
      ? ((agent.successful_tasks / agent.total_tasks) * 100).toFixed(0)
      : '0'

  return (
    <li
      className={cn(
        'px-3 py-2 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50',
        isSelected && 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-l-primary-500',
      )}
      onClick={onClick}
      data-testid={`agent-row-${agent.agent_id}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick()
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn('w-2 h-2 rounded-full', STATUS_COLORS[agent.status])}
          />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {agent.name}
          </span>
          <span className="text-xs text-gray-400">
            {STATUS_LABELS[agent.status]}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>{successRate}% success</span>
          <span>{agent.total_tasks} tasks</span>
          <span>${agent.total_cost.toFixed(2)}</span>
        </div>
      </div>
    </li>
  )
}

interface SummaryCardProps {
  label: string
  value: string
}

function SummaryCard({ label, value }: SummaryCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}
