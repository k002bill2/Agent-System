import { Skeleton } from '../ui/Skeleton'

export function ClaudeSessionsSkeleton() {
  return (
    <div className="flex h-full">
      {/* Left panel - Session list */}
      <div className="w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-5 w-20 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          </div>
        </div>

        {/* Session cards */}
        <div className="flex-1 overflow-hidden p-3 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="p-4 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-2">
                <Skeleton className="h-4 w-32" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
              <Skeleton className="h-3 w-24 mb-3" />
              <div className="flex gap-3">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-3 w-16 mt-2" />
            </div>
          ))}
        </div>
      </div>

      {/* Right panel - Details */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex justify-around p-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="text-center">
              <Skeleton className="h-6 w-12 mx-auto mb-1" />
              <Skeleton className="h-3 w-16 mx-auto" />
            </div>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 p-3">
          <Skeleton className="h-4 w-24 mb-3" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-3 p-3">
                <Skeleton className="h-4 w-4 rounded-full flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex gap-2 mb-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4 mt-1" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
