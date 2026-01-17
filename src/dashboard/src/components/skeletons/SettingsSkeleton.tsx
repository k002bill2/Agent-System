import { Skeleton } from '../ui/Skeleton'

export function SettingsSkeleton() {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <Skeleton className="h-7 w-24 mb-6" />

      <div className="max-w-2xl space-y-6">
        {/* Section 1 */}
        <SettingsSectionSkeleton items={3} />

        {/* Section 2 */}
        <SettingsSectionSkeleton items={2} />

        {/* Section 3 */}
        <SettingsSectionSkeleton items={4} />
      </div>
    </div>
  )
}

function SettingsSectionSkeleton({ items = 3 }: { items?: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <Skeleton className="h-5 w-32 mb-4" />
      <div className="space-y-4">
        {Array.from({ length: items }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <div>
              <Skeleton className="h-4 w-28 mb-1" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
