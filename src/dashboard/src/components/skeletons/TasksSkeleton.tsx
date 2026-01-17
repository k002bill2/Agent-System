import { Skeleton } from '../ui/Skeleton'

export function TasksSkeleton() {
  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Panel - Task List */}
      <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Filter Bar */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Skeleton className="w-4 h-4" />
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-16 rounded-md" />
              ))}
            </div>
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <TaskItemSkeleton key={i} level={i % 3} />
          ))}
        </div>
      </div>

      {/* Right Panel - Task Detail */}
      <div className="w-1/2 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {/* Title */}
          <Skeleton className="h-6 w-3/4 mb-4" />

          <div className="space-y-4">
            {/* Status */}
            <div>
              <Skeleton className="h-4 w-12 mb-1" />
              <div className="flex items-center gap-2">
                <Skeleton className="w-4 h-4 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>

            {/* Description */}
            <div>
              <Skeleton className="h-4 w-20 mb-1" />
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-4/5 mb-1" />
              <Skeleton className="h-4 w-2/3" />
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Skeleton className="h-4 w-14 mb-1" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div>
                <Skeleton className="h-4 w-14 mb-1" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>

            {/* Result */}
            <div>
              <Skeleton className="h-4 w-12 mb-1" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TaskItemSkeleton({ level = 0 }: { level?: number }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{ paddingLeft: `${level * 16 + 12}px` }}
    >
      <Skeleton className="w-5 h-5 rounded" />
      <Skeleton className="w-4 h-4 rounded-full" />
      <Skeleton className="h-4 flex-1" />
    </div>
  )
}
