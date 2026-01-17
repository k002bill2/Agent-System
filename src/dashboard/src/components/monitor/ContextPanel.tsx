import { useEffect } from 'react'
import { cn } from '../../lib/utils'
import {
  FileText,
  FolderOpen,
  Activity,
  RefreshCw,
  Clock,
  Hash,
  Users,
  Target,
} from 'lucide-react'
import { useMonitoringStore } from '../../stores/monitoring'

interface ContextPanelProps {
  projectId: string
}

export function ContextPanel({ projectId }: ContextPanelProps) {
  const {
    projectContext,
    isLoadingContext,
    activeContextTab,
    fetchProjectContext,
    setActiveContextTab,
  } = useMonitoringStore()

  useEffect(() => {
    if (projectId) {
      fetchProjectContext(projectId)
    }
  }, [projectId, fetchProjectContext])

  const tabs = [
    { id: 'claude-md' as const, label: 'CLAUDE.md', icon: FileText },
    { id: 'dev-docs' as const, label: 'Dev Docs', icon: FolderOpen },
    { id: 'session' as const, label: 'Session', icon: Activity },
  ]

  const renderContent = () => {
    if (isLoadingContext) {
      return (
        <div className="flex items-center justify-center h-full">
          <RefreshCw className="w-6 h-6 text-primary-500 animate-spin" />
        </div>
      )
    }

    if (!projectContext) {
      return (
        <div className="text-center text-gray-500 py-8">
          No context available
        </div>
      )
    }

    switch (activeContextTab) {
      case 'claude-md':
        return <ClaudeMdView content={projectContext.claude_md} />
      case 'dev-docs':
        return <DevDocsView docs={projectContext.dev_docs} />
      case 'session':
        return <SessionView sessionInfo={projectContext.session_info} />
      default:
        return null
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-full">
      {/* Header with tabs */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Project Context
        </h2>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveContextTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  activeContextTab === tab.id
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchProjectContext(projectId)}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Refresh context"
          >
            <RefreshCw
              className={cn('w-4 h-4 text-gray-500', isLoadingContext && 'animate-spin')}
            />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">{renderContent()}</div>
    </div>
  )
}

// CLAUDE.md View
function ClaudeMdView({ content }: { content: string | null }) {
  if (!content) {
    return (
      <div className="text-center text-gray-500 py-8">
        <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p>No CLAUDE.md found in this project</p>
      </div>
    )
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-auto text-xs whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  )
}

// Dev Docs View
interface DevDoc {
  name: string
  path: string
  content: string
  modified_at: string
}

function DevDocsView({ docs }: { docs: DevDoc[] }) {
  if (!docs || docs.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        <FolderOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p>No dev docs found in dev/active folder</p>
        <p className="text-xs mt-2">
          Use /save-and-compact to save context here
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {docs.map((doc) => (
        <div
          key={doc.path}
          className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
        >
          <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-sm">{doc.name}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              {new Date(doc.modified_at).toLocaleString()}
            </div>
          </div>
          <pre className="p-4 text-xs overflow-auto max-h-64 whitespace-pre-wrap bg-white dark:bg-gray-800">
            {doc.content}
          </pre>
        </div>
      ))}
    </div>
  )
}

// Session View
interface SessionInfo {
  session_id: string
  tasks_count: number
  agents_count: number
  iteration_count: number
  current_task_id: string | null
}

function SessionView({ sessionInfo }: { sessionInfo: SessionInfo | null }) {
  if (!sessionInfo) {
    return (
      <div className="text-center text-gray-500 py-8">
        <Activity className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p>No active session for this project</p>
        <p className="text-xs mt-2">
          Start a task in Dashboard to create a session
        </p>
      </div>
    )
  }

  const stats = [
    {
      label: 'Session ID',
      value: sessionInfo.session_id.slice(0, 8) + '...',
      icon: Hash,
      fullValue: sessionInfo.session_id,
    },
    {
      label: 'Tasks',
      value: sessionInfo.tasks_count.toString(),
      icon: Target,
    },
    {
      label: 'Agents',
      value: sessionInfo.agents_count.toString(),
      icon: Users,
    },
    {
      label: 'Iterations',
      value: sessionInfo.iteration_count.toString(),
      icon: RefreshCw,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4"
            title={stat.fullValue}
          >
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <stat.icon className="w-4 h-4" />
              <span className="text-xs">{stat.label}</span>
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {sessionInfo.current_task_id && (
        <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4">
          <div className="flex items-center gap-2 text-primary-700 dark:text-primary-400 mb-1">
            <Activity className="w-4 h-4" />
            <span className="text-xs font-medium">Current Task</span>
          </div>
          <span className="text-sm text-gray-900 dark:text-white font-mono">
            {sessionInfo.current_task_id}
          </span>
        </div>
      )}
    </div>
  )
}
