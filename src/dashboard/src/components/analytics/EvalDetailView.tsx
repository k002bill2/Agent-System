/**
 * 태스크 평가 상세 뷰 (분석 결과·실행 계획 펼침) — AnalyticsPage 내부 전용.
 */

import { ChevronRight, FileText, GitBranch, Users, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskAnalysisHistory } from '@/stores/agents'
import { effortColors, strategyIcons } from './constants'

export function EvalDetailView({ detail }: { detail: TaskAnalysisHistory }) {
  const analysis = detail.analysis

  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-4 mt-2">
      {/* Task Input */}
      <div className="flex items-start gap-2">
        <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">태스크 입력</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-3">
            {detail.task_input}
          </p>
        </div>
      </div>

      {/* Analysis Summary 4-grid */}
      {analysis && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Complexity</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {analysis.analysis?.complexity_score ?? detail.complexity_score ?? '-'}/10
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Effort Level</p>
              {(analysis.analysis?.effort_level || detail.effort_level) ? (
                <span className={cn('px-2 py-1 rounded-full text-xs font-medium', effortColors[analysis.analysis?.effort_level || detail.effort_level || ''])}>
                  {analysis.analysis?.effort_level || detail.effort_level}
                </span>
              ) : (
                <span className="text-sm text-gray-400">-</span>
              )}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Subtasks</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {analysis.subtask_count ?? detail.subtask_count ?? '-'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Strategy</p>
              <div className="flex items-center gap-1">
                {(() => {
                  const strategy = analysis.strategy || detail.strategy || ''
                  const StrategyIcon = strategyIcons[strategy] || GitBranch
                  return <StrategyIcon className="w-4 h-4 text-primary-500" />
                })()}
                <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                  {analysis.strategy || detail.strategy || '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Context Summary */}
          {analysis.analysis?.context_summary && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Context Summary</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {analysis.analysis.context_summary}
              </p>
            </div>
          )}

          {/* Key Requirements */}
          {analysis.analysis?.key_requirements && analysis.analysis.key_requirements.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Key Requirements</h4>
              <div className="flex flex-wrap gap-1.5">
                {analysis.analysis.key_requirements.map((req, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs rounded-full"
                  >
                    {req}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Execution Plan */}
          {analysis.execution_plan?.parallel_groups && analysis.execution_plan.parallel_groups.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Execution Plan</h4>
              <div className="space-y-2">
                {analysis.execution_plan.parallel_groups.map((group, groupIndex) => (
                  <div key={groupIndex}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        Step {groupIndex + 1}
                      </span>
                      {group.length > 1 && (
                        <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] rounded-full flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5" />
                          Parallel
                        </span>
                      )}
                    </div>
                    <div className={cn('grid gap-2', group.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1')}>
                      {group.map((taskId) => {
                        const subtask = analysis.execution_plan?.subtasks[taskId]
                        if (!subtask) return null
                        return (
                          <div
                            key={taskId}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5"
                          >
                            <div className="flex items-start justify-between mb-1">
                              <h5 className="text-xs font-medium text-gray-900 dark:text-white">
                                {subtask.title}
                              </h5>
                              <span className={cn('px-1.5 py-0.5 text-[10px] rounded-full flex-shrink-0 ml-2', effortColors[subtask.effort])}>
                                {subtask.effort}
                              </span>
                            </div>
                            {subtask.agent && (
                              <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                                <Users className="w-2.5 h-2.5" />
                                <span>{subtask.agent}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {groupIndex < analysis.execution_plan!.parallel_groups.length - 1 && (
                      <div className="flex justify-center my-1">
                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 rotate-90" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Fallback for no analysis data */}
      {!analysis && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          <p>분석 결과: {detail.success ? '성공' : '실패'}</p>
          {detail.error && <p className="text-red-500 mt-1">{detail.error}</p>}
          {detail.execution_time_ms > 0 && (
            <p className="mt-1">실행 시간: {detail.execution_time_ms}ms</p>
          )}
        </div>
      )}
    </div>
  )
}
