/**
 * Task Analyzer Page
 *
 * 태스크 분석 및 피드백 UI를 표시합니다.
 */

import { useEffect, useState, useMemo } from 'react'
import { useOrchestrationStore, Project } from '../stores/orchestration'
import { useNavigationStore } from '../stores/navigation'
import { cn } from '../lib/utils'
import { ProjectFilter } from '../components/ProjectFilter'
import { TaskAnalyzer } from '../components/TaskAnalyzer'
import { FeedbackHistoryPanel, DatasetPanel } from '../components/feedback'
import { useFeedbackStore } from '../stores/feedback'
import {
  Sparkles,
  MessageSquare,
} from 'lucide-react'

type TabType = 'analyzer' | 'feedback'

export function AgentsPage() {
  const { projectFilter } = useNavigationStore()

  // Feedback store (for count)
  const { feedbacks, fetchFeedbacks } = useFeedbackStore()

  // Local state
  const [activeTab, setActiveTab] = useState<TabType>('analyzer')

  // Fetch feedbacks on mount
  useEffect(() => {
    fetchFeedbacks()
  }, [fetchFeedbacks])

  // Get selected project info from orchestration store
  const { projects } = useOrchestrationStore()
  const selectedProject = useMemo(() =>
    projects.find(p => p.id === projectFilter),
    [projects, projectFilter]
  )

  const pendingFeedbackCount = feedbacks.filter((f) => f.status === 'pending').length

  const tabs = [
    { id: 'analyzer' as const, label: 'Task Analyzer', icon: Sparkles },
    { id: 'feedback' as const, label: 'Feedback', icon: MessageSquare, count: pendingFeedbackCount || undefined },
  ]

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Task Analyzer</h2>
        <div className="flex items-center gap-3">
          <ProjectFilter />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'analyzer' && (
        <TaskAnalyzer
          projectFilter={projectFilter}
          selectedProject={selectedProject}
        />
      )}

      {activeTab === 'feedback' && (
        <div className="space-y-6">
          <FeedbackTabContent
            projectFilter={projectFilter}
            selectedProject={selectedProject}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Feedback Tab Content (with sub-tabs)
// ============================================================================

interface FeedbackTabContentProps {
  projectFilter: string | null
  selectedProject: Project | undefined
}

function FeedbackTabContent({ projectFilter, selectedProject }: FeedbackTabContentProps) {
  const [subTab, setSubTab] = useState<'history' | 'dataset'>('history')

  const subTabs = [
    { id: 'history' as const, label: 'Feedback History' },
    { id: 'dataset' as const, label: 'Dataset' },
  ]

  return (
    <div className="space-y-4">
      {/* Project Filter Info */}
      {projectFilter && selectedProject && (
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
          <p className="text-sm text-primary-700 dark:text-primary-300">
            프로젝트 "{selectedProject.name}"의 피드백을 표시합니다.
          </p>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-2">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              subTab === tab.id
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === 'history' && <FeedbackHistoryPanel />}
      {subTab === 'dataset' && <DatasetPanel />}
    </div>
  )
}
