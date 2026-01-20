/**
 * DatasetPanel Component
 *
 * 데이터셋 통계 및 내보내기 기능을 제공합니다.
 */

import { useEffect, useState } from 'react'
import {
  Database,
  Download,
  RefreshCw,
  FileText,
  Table,
  CheckCircle,
  XCircle,
  Bot,
  BarChart3,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useFeedbackStore, DatasetExportOptions } from '../../stores/feedback'

interface DatasetPanelProps {
  className?: string
}

export function DatasetPanel({ className }: DatasetPanelProps) {
  const { datasetStats, isLoading, fetchDatasetStats, exportDataset } = useFeedbackStore()

  const [exportOptions, setExportOptions] = useState<DatasetExportOptions>({
    format: 'jsonl',
    include_negative: true,
    include_implicit: true,
  })
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    fetchDatasetStats()
  }, [fetchDatasetStats])

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const content = await exportDataset(exportOptions)
      if (content) {
        // 파일 다운로드
        const blob = new Blob([content], {
          type: exportOptions.format === 'jsonl' ? 'application/jsonl' : 'text/csv',
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `dataset_${new Date().toISOString().slice(0, 10)}.${exportOptions.format}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Stats Overview */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <Database className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Dataset Statistics</h3>
          </div>
          <button
            onClick={() => fetchDatasetStats()}
            disabled={isLoading}
            className={cn(
              'p-2 rounded-lg border border-gray-200 dark:border-gray-700',
              'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
              'disabled:opacity-50'
            )}
          >
            <RefreshCw className={cn('w-4 h-4 text-gray-600 dark:text-gray-400', isLoading && 'animate-spin')} />
          </button>
        </div>

        {datasetStats ? (
          <div className="space-y-6">
            {/* Main Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Total Entries"
                value={datasetStats.total_entries}
                icon={<BarChart3 className="w-5 h-5 text-gray-500" />}
              />
              <StatCard
                label="Positive Samples"
                value={datasetStats.positive_entries}
                icon={<CheckCircle className="w-5 h-5 text-green-500" />}
                color="green"
              />
              <StatCard
                label="Negative Samples"
                value={datasetStats.negative_entries}
                icon={<XCircle className="w-5 h-5 text-red-500" />}
                color="red"
              />
              <StatCard
                label="Avg Output Length"
                value={Math.round(datasetStats.avg_output_length)}
                icon={<FileText className="w-5 h-5 text-blue-500" />}
                color="blue"
              />
            </div>

            {/* By Agent */}
            {Object.keys(datasetStats.by_agent).length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  By Agent
                </h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(datasetStats.by_agent).map(([agent, count]) => (
                    <span
                      key={agent}
                      className="px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg text-sm"
                    >
                      {agent}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* By Feedback Type */}
            {Object.keys(datasetStats.by_feedback_type).length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">By Feedback Type</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(datasetStats.by_feedback_type).map(([type, count]) => (
                    <span
                      key={type}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm',
                        type === 'explicit_positive'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : type === 'explicit_negative'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                      )}
                    >
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Last Updated */}
            {datasetStats.last_updated && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Last updated: {new Date(datasetStats.last_updated).toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No dataset entries yet</p>
            <p className="text-sm mt-1">Process feedbacks to generate training data</p>
          </div>
        )}
      </div>

      {/* Export Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Export Dataset</h3>
        </div>

        <div className="space-y-4">
          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Export Format
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setExportOptions({ ...exportOptions, format: 'jsonl' })}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors',
                  exportOptions.format === 'jsonl'
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                )}
              >
                <FileText className="w-4 h-4" />
                JSONL
              </button>
              <button
                onClick={() => setExportOptions({ ...exportOptions, format: 'csv' })}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors',
                  exportOptions.format === 'csv'
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                )}
              >
                <Table className="w-4 h-4" />
                CSV
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOptions.include_negative}
                onChange={(e) =>
                  setExportOptions({ ...exportOptions, include_negative: e.target.checked })
                }
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Include negative samples</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOptions.include_implicit}
                onChange={(e) =>
                  setExportOptions({ ...exportOptions, include_implicit: e.target.checked })
                }
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Include implicit feedbacks</span>
            </label>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={isExporting || !datasetStats?.total_entries}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium',
              'bg-primary-500 text-white hover:bg-primary-600',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export Dataset ({datasetStats?.total_entries || 0} entries)
              </>
            )}
          </button>

          {/* Format Info */}
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {exportOptions.format === 'jsonl' ? (
                <>
                  <strong>JSONL Format:</strong> OpenAI Fine-tuning 호환 형식. 각 줄은 messages 배열을 포함한 JSON 객체입니다.
                </>
              ) : (
                <>
                  <strong>CSV Format:</strong> 스프레드시트 분석용. system_prompt, user_input, assistant_output 컬럼을 포함합니다.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Sub Components
// ============================================================================

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  color?: 'green' | 'yellow' | 'red' | 'blue'
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  const colorClasses = {
    green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  }

  return (
    <div
      className={cn(
        'p-4 rounded-lg border',
        color ? colorClasses[color] : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'
      )}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        </div>
      </div>
    </div>
  )
}

export default DatasetPanel
