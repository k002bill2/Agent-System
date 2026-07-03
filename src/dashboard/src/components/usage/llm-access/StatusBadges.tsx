import { Activity, CheckCircle, ShieldCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

export function StatusBadges({ apiRequests }: { apiRequests: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-medium">
        <CheckCircle className="w-3.5 h-3.5" />
        CLI subscription
      </span>
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium">
        <ShieldCheck className="w-3.5 h-3.5" />
        Internal ledger
      </span>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium',
          apiRequests > 0
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
        )}
      >
        <Activity className="w-3.5 h-3.5" />
        {apiRequests > 0 ? `${apiRequests} API fallback` : 'No API fallback'}
      </span>
    </div>
  )
}
