import { Skeleton } from '../ui/Skeleton'

export function ActivitySkeleton() {
  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <Skeleton className="h-5 w-28" />
        <div className="flex items-center gap-2">
          <Skeleton className="w-4 h-4 rounded" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <MessageSkeleton key={i} type={i % 3} />
        ))}
      </div>

      {/* Status Bar */}
      <div className="h-10 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-4" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-4" />
        </div>
      </div>
    </div>
  )
}

function MessageSkeleton({ type = 0 }: { type?: number }) {
  const bgColors = [
    'bg-gray-50 dark:bg-gray-700/50',
    'bg-amber-50 dark:bg-amber-900/20',
    'bg-green-50 dark:bg-green-900/20',
  ]

  return (
    <div className={`p-3 rounded-lg ${bgColors[type]}`}>
      <div className="flex items-start gap-3">
        <Skeleton className="w-7 h-7 rounded-lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  )
}
