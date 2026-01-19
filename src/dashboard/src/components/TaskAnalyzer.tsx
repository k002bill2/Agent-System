/**
 * Task Analyzer Component
 *
 * Lead Orchestrator를 사용한 태스크 분석 UI
 */

import { useState } from 'react'
import { cn } from '../lib/utils'
import { useAgentsStore } from '../stores/agents'
import {
  Sparkles,
  Loader2,
  ChevronRight,
  GitBranch,
  Users,
  Zap,
  AlertCircle,
  Clock,
  ArrowRight,
} from 'lucide-react'

// 노력 수준 색상
const effortColors: Record<string, string> = {
  quick: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  thorough: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

// 전략 아이콘
const strategyIcons: Record<string, typeof GitBranch> = {
  sequential: ArrowRight,
  parallel: Zap,
  mixed: GitBranch,
}

export function TaskAnalyzer() {
  const { analyzeTask, lastAnalysis, isLoading, error, clearError } = useAgentsStore()
  const [taskInput, setTaskInput] = useState('')

  const handleAnalyze = async () => {
    if (!taskInput.trim()) return
    await analyzeTask(taskInput.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAnalyze()
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          Task Analyzer
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Analyze complex tasks and see how Lead Orchestrator would decompose them
        </p>
      </div>

      {/* Input */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <textarea
          value={taskInput}
          onChange={(e) => setTaskInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter a task to analyze... (e.g., 'Implement user authentication with Firebase')"
          className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          rows={3}
        />
        <div className="flex justify-end mt-3">
          <button
            onClick={handleAnalyze}
            disabled={isLoading || !taskInput.trim()}
            className={cn(
              'px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors',
              isLoading || !taskInput.trim()
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-primary-500 hover:bg-primary-600 text-white'
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Analyze Task
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
            <button
              onClick={clearError}
              className="ml-auto text-red-500 hover:text-red-600 text-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {lastAnalysis && lastAnalysis.success && lastAnalysis.analysis && (
        <div className="p-4 space-y-4">
          {/* Analysis Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Complexity</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {lastAnalysis.analysis.analysis.complexity_score}/10
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Effort Level</p>
              <span className={cn('px-2 py-1 rounded-full text-xs font-medium', effortColors[lastAnalysis.analysis.analysis.effort_level])}>
                {lastAnalysis.analysis.analysis.effort_level}
              </span>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Subtasks</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {lastAnalysis.analysis.subtask_count}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Strategy</p>
              <div className="flex items-center gap-1">
                {(() => {
                  const StrategyIcon = strategyIcons[lastAnalysis.analysis.strategy] || GitBranch
                  return <StrategyIcon className="w-4 h-4 text-primary-500" />
                })()}
                <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                  {lastAnalysis.analysis.strategy}
                </span>
              </div>
            </div>
          </div>

          {/* Context Summary */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Context Summary
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {lastAnalysis.analysis.analysis.context_summary}
            </p>
          </div>

          {/* Key Requirements */}
          {lastAnalysis.analysis.analysis.key_requirements.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Key Requirements
              </h4>
              <div className="flex flex-wrap gap-2">
                {lastAnalysis.analysis.analysis.key_requirements.map((req, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs rounded-full"
                  >
                    {req}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Execution Plan */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Execution Plan
            </h4>

            {/* Parallel Groups */}
            {lastAnalysis.analysis.execution_plan.parallel_groups.length > 0 && (
              <div className="space-y-3">
                {lastAnalysis.analysis.execution_plan.parallel_groups.map((group, groupIndex) => (
                  <div key={groupIndex} className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Step {groupIndex + 1}
                      </span>
                      {group.length > 1 && (
                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs rounded-full flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          Parallel
                        </span>
                      )}
                    </div>
                    <div className={cn('grid gap-2', group.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1')}>
                      {group.map((taskId) => {
                        const subtask = lastAnalysis.analysis?.execution_plan.subtasks[taskId]
                        if (!subtask) return null

                        return (
                          <div
                            key={taskId}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <h5 className="text-sm font-medium text-gray-900 dark:text-white">
                                {subtask.title}
                              </h5>
                              <span className={cn('px-2 py-0.5 text-xs rounded-full', effortColors[subtask.effort])}>
                                {subtask.effort}
                              </span>
                            </div>
                            {subtask.agent && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                                <Users className="w-3 h-3" />
                                <span>{subtask.agent}</span>
                              </div>
                            )}
                            {subtask.dependencies.length > 0 && (
                              <div className="mt-2 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                                <GitBranch className="w-3 h-3" />
                                <span>Depends on: {subtask.dependencies.join(', ')}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {groupIndex < lastAnalysis.analysis!.execution_plan.parallel_groups.length - 1 && (
                      <div className="flex justify-center my-2">
                        <ChevronRight className="w-5 h-5 text-gray-300 dark:text-gray-600 rotate-90" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Execution Time */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>Analysis completed in {lastAnalysis.execution_time_ms}ms</span>
            </div>
            {lastAnalysis.analysis.analysis.requires_decomposition && (
              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-4 h-4" />
                <span>Task requires decomposition</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!lastAnalysis && !isLoading && (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Enter a task above to see how it would be analyzed and decomposed</p>
        </div>
      )}
    </div>
  )
}
