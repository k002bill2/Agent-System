import { useState } from 'react'
import { Clock } from 'lucide-react'
import { AuditLogTable } from '../components/audit/AuditLogTable'
import { useOrchestrationStore } from '../stores/orchestration'

export function AuditPage() {
  const { sessionId } = useOrchestrationStore()
  const [filterBySession, setFilterBySession] = useState(false)

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Audit Trail
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Track all system actions and changes
          </p>
        </div>

        {/* Filter toggle */}
        {sessionId && (
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={filterBySession}
              onChange={(e) => setFilterBySession(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Show only current session
          </label>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Total Actions"
          value="-"
          description="All recorded actions"
          icon={Clock}
        />
        <SummaryCard
          title="Tool Executions"
          value="-"
          description="Commands and tools"
          icon={Clock}
        />
        <SummaryCard
          title="Approvals"
          value="-"
          description="HITL decisions"
          icon={Clock}
        />
        <SummaryCard
          title="Errors"
          value="-"
          description="Failed operations"
          icon={Clock}
        />
      </div>

      {/* Audit Log Table */}
      <AuditLogTable
        sessionId={filterBySession ? sessionId || undefined : undefined}
        className="shadow-sm"
      />
    </div>
  )
}

interface SummaryCardProps {
  title: string
  value: string | number
  description: string
  icon: typeof Clock
}

function SummaryCard({ title, value, description, icon: Icon }: SummaryCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{description}</p>
        </div>
        <Icon className="w-8 h-8 text-gray-300 dark:text-gray-600" />
      </div>
    </div>
  )
}

export default AuditPage
