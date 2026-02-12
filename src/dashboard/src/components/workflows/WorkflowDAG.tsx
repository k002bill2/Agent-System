import type { WorkflowDefinition, WorkflowJobDef } from '../../types/workflow'
import { cn } from '../../lib/utils'
import { ArrowRight, Shield } from 'lucide-react'

interface Props {
  definition: WorkflowDefinition
  activeJobStatuses?: Record<string, string>
}

export function WorkflowDAG({ definition, activeJobStatuses }: Props) {
  const jobs = definition.jobs || {}
  const jobNames = Object.keys(jobs)

  if (jobNames.length === 0) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">No jobs defined</div>
  }

  // Build layers using topological sort
  const layers = buildLayers(jobs)

  return (
    <div className="flex items-center gap-4 overflow-x-auto py-2">
      {layers.map((layer, layerIdx) => (
        <div key={layerIdx} className="flex flex-col gap-2">
          {layer.map(jobName => {
            const job = jobs[jobName]
            const status = activeJobStatuses?.[jobName]
            return (
              <div
                key={jobName}
                className={cn(
                  'px-4 py-2.5 rounded-lg border-2 min-w-[140px] text-center transition-all',
                  status === 'success' && 'border-green-500 bg-green-50 dark:bg-green-900/20',
                  status === 'failure' && 'border-red-500 bg-red-50 dark:bg-red-900/20',
                  status === 'running' && 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 animate-pulse',
                  status === 'skipped' && 'border-gray-300 bg-gray-50 dark:bg-gray-800 opacity-50',
                  !status && 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800',
                )}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{jobName}</span>
                  {job.environment && (
                    <span title={`Environment: ${job.environment}`}>
                      <Shield className="w-3.5 h-3.5 text-yellow-500" />
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {job.steps?.length || 0} steps
                  {job.matrix && ' \u00B7 matrix'}
                </div>
              </div>
            )
          })}
          {layerIdx < layers.length - 1 && (
            <div className="flex items-center justify-center">
              <ArrowRight className="w-4 h-4 text-gray-400" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function buildLayers(jobs: Record<string, WorkflowJobDef>): string[][] {
  const inDegree: Record<string, number> = {}
  const dependents: Record<string, string[]> = {}

  for (const name of Object.keys(jobs)) {
    inDegree[name] = 0
    dependents[name] = []
  }

  for (const [name, job] of Object.entries(jobs)) {
    for (const dep of job.needs || []) {
      if (dep in inDegree) {
        inDegree[name]++
        dependents[dep].push(name)
      }
    }
  }

  const layers: string[][] = []
  let queue = Object.entries(inDegree).filter(([, d]) => d === 0).map(([n]) => n)

  while (queue.length > 0) {
    layers.push([...queue])
    const next: string[] = []
    for (const name of queue) {
      for (const dep of dependents[name]) {
        inDegree[dep]--
        if (inDegree[dep] === 0) {
          next.push(dep)
        }
      }
    }
    queue = next
  }

  return layers
}
