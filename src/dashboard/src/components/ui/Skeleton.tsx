import { cn } from '../../lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gray-200 dark:bg-gray-700',
        className
      )}
    />
  )
}

// Stat card skeleton for dashboard
export function SkeletonStatCard({ className }: SkeletonProps) {
  return (
    <div className={cn('bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4', className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-12" />
        </div>
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
    </div>
  )
}
