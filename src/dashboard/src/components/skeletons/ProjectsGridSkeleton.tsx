import { Skeleton } from '../ui/Skeleton'

export function ProjectsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <ProjectCardSkeleton key={i} />
      ))}
    </div>
  )
}

function ProjectCardSkeleton() {
  return (
    <div className="relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      {/* Menu Button placeholder */}
      <div className="absolute top-3 right-3">
        <Skeleton className="w-6 h-6 rounded" />
      </div>

      {/* Project Icon */}
      <Skeleton className="w-10 h-10 rounded-lg mb-3" />

      {/* Project Name */}
      <Skeleton className="h-5 w-3/4 mb-1" />

      {/* Project ID */}
      <Skeleton className="h-3 w-32 mb-2" />

      {/* Description */}
      <Skeleton className="h-4 w-full mb-1" />
      <Skeleton className="h-4 w-2/3 mb-3" />

      {/* Path */}
      <div className="flex items-center gap-1 mb-3">
        <Skeleton className="w-3 h-3" />
        <Skeleton className="h-3 flex-1" />
      </div>

      {/* Status Badges */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  )
}
