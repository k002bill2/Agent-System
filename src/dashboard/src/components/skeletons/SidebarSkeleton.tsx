import { Skeleton } from '../ui/Skeleton'

export function SidebarSkeleton() {
  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="h-5 w-24" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* Navigation items */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="w-5 h-5 rounded" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}

        {/* Projects Section */}
        <div className="pt-4">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2">
              <Skeleton className="w-4 h-4 rounded" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="w-4 h-4" />
          </div>
          <div className="mt-1 space-y-1 ml-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <Skeleton className="w-4 h-4 rounded" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </div>
      </nav>

      {/* Settings */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 px-3 py-2">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </aside>
  )
}
