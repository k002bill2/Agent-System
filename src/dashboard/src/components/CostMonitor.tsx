import { useOrchestrationStore, TokenUsage } from '../stores/orchestration'

function formatCost(cost: number): string {
  if (cost < 0.001) {
    return `$${(cost * 1000).toFixed(4)}m`
  }
  return `$${cost.toFixed(4)}`
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`
  }
  return tokens.toString()
}

interface AgentUsageBarProps {
  name: string
  usage: TokenUsage
  maxTokens: number
}

function AgentUsageBar({ name, usage, maxTokens }: AgentUsageBarProps) {
  const percentage = maxTokens > 0 ? (usage.total_tokens / maxTokens) * 100 : 0

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600 dark:text-gray-400">{name}</span>
        <span className="text-gray-500 dark:text-gray-500">
          {formatTokens(usage.total_tokens)} tokens
        </span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-500">
        <span>In: {formatTokens(usage.total_input_tokens)}</span>
        <span>Out: {formatTokens(usage.total_output_tokens)}</span>
        <span>{formatCost(usage.total_cost_usd)}</span>
      </div>
    </div>
  )
}

export function CostMonitor() {
  const { tokenUsage, totalCost } = useOrchestrationStore()

  const agents = Object.entries(tokenUsage)
  const totalTokens = agents.reduce((sum, [, usage]) => sum + usage.total_tokens, 0)
  const maxTokens = Math.max(...agents.map(([, usage]) => usage.total_tokens), 1)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
        Token Usage & Cost
      </h3>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatTokens(totalTokens)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Total Tokens
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {formatCost(totalCost)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Total Cost
          </div>
        </div>
      </div>

      {/* Agent breakdown */}
      {agents.length > 0 ? (
        <div className="space-y-4">
          <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            By Agent
          </h4>
          {agents.map(([name, usage]) => (
            <AgentUsageBar
              key={name}
              name={name}
              usage={usage}
              maxTokens={maxTokens}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
          No token usage yet
        </div>
      )}
    </div>
  )
}

export function CostBadge() {
  const { totalCost, tokenUsage } = useOrchestrationStore()

  const totalTokens = Object.values(tokenUsage).reduce(
    (sum, usage) => sum + usage.total_tokens,
    0
  )

  if (totalTokens === 0) return null

  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-md text-xs">
      <span className="text-gray-600 dark:text-gray-400">
        {formatTokens(totalTokens)} tokens
      </span>
      <span className="text-gray-400 dark:text-gray-500">|</span>
      <span className="text-green-600 dark:text-green-400 font-medium">
        {formatCost(totalCost)}
      </span>
    </div>
  )
}
