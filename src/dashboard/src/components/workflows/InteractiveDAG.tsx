import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Clock, CheckCircle, XCircle, MinusCircle, Loader2 } from 'lucide-react'
import type { WorkflowJob } from '../../types/workflow'

interface InteractiveDAGProps {
  jobs: WorkflowJob[]
  definition?: Record<string, { needs?: string[]; steps: any[] }>
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bgColor: string }> = {
  success: { icon: CheckCircle, color: 'text-green-500', bgColor: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
  failure: { icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
  running: { icon: Loader2, color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
  skipped: { icon: MinusCircle, color: 'text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' },
  queued: { icon: Clock, color: 'text-yellow-500', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' },
  cancelled: { icon: XCircle, color: 'text-gray-500', bgColor: 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600' },
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '-'
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

interface JobNodeProps {
  job: WorkflowJob
}

function JobNode({ job }: JobNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued
  const StatusIcon = config.icon

  return (
    <div className={`border rounded-lg ${config.bgColor} transition-all`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-2.5 text-left"
      >
        <StatusIcon className={`w-4 h-4 ${config.color} ${job.status === 'running' ? 'animate-spin' : ''} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{job.name}</p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{job.runner}</span>
            {job.duration_seconds != null && (
              <>
                <span>·</span>
                <span>{formatDuration(job.duration_seconds)}</span>
              </>
            )}
            <span>·</span>
            <span>{job.steps.length} step{job.steps.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        {job.steps.length > 0 && (
          expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && job.steps.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-2.5 py-2 space-y-1">
          {job.steps.map((step) => {
            const stepConfig = STATUS_CONFIG[step.status] || STATUS_CONFIG.queued
            const StepIcon = stepConfig.icon
            return (
              <div key={step.id} className="flex items-center gap-2 text-xs py-0.5">
                <StepIcon className={`w-3 h-3 ${stepConfig.color} ${step.status === 'running' ? 'animate-spin' : ''}`} />
                <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{step.name}</span>
                {step.duration_ms != null && (
                  <span className="text-gray-400">{step.duration_ms}ms</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function InteractiveDAG({ jobs, definition: _definition }: InteractiveDAGProps) {
  // Group jobs by their dependency layers
  const layers = useMemo(() => {
    if (!jobs.length) return []

    // Build dependency info from job.needs
    const jobMap = new Map(jobs.map(j => [j.name, j]))
    const inDegree = new Map<string, number>()
    const dependents = new Map<string, string[]>()

    jobs.forEach(j => {
      inDegree.set(j.name, 0)
      dependents.set(j.name, [])
    })

    jobs.forEach(j => {
      j.needs.forEach(dep => {
        if (jobMap.has(dep)) {
          inDegree.set(j.name, (inDegree.get(j.name) || 0) + 1)
          dependents.get(dep)?.push(j.name)
        }
      })
    })

    const result: WorkflowJob[][] = []
    let queue = jobs.filter(j => (inDegree.get(j.name) || 0) === 0)

    while (queue.length > 0) {
      result.push(queue)
      const nextQueue: WorkflowJob[] = []
      queue.forEach(j => {
        dependents.get(j.name)?.forEach(dep => {
          const newDeg = (inDegree.get(dep) || 1) - 1
          inDegree.set(dep, newDeg)
          if (newDeg === 0) {
            const depJob = jobMap.get(dep)
            if (depJob) nextQueue.push(depJob)
          }
        })
      })
      queue = nextQueue
    }

    return result
  }, [jobs])

  if (jobs.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
        No jobs to display
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {layers.map((layer, layerIdx) => (
        <div key={layerIdx}>
          {layerIdx > 0 && (
            <div className="flex justify-center py-1">
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
            </div>
          )}
          <div className={`grid gap-2 ${layer.length > 1 ? `grid-cols-${Math.min(layer.length, 3)}` : 'grid-cols-1'}`}>
            {layer.map(job => (
              <JobNode key={job.id} job={job} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
