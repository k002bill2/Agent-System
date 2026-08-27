import { memo } from 'react'
import { ShieldAlert } from 'lucide-react'
import { cn } from '../../lib/utils'

interface SessionPermissionNoticeProps {
  /** 표면마다 여백·높이가 달라 바깥에서 조절한다. */
  className?: string
  /** 좁은 카드(대시보드 위젯, 선택기)에서는 아이콘과 설명을 줄인다. */
  compact?: boolean
}

/**
 * 세션 API 는 admin·manager 전용이라 일반 계정은 403 을 받는다.
 * 그 응답을 빈 목록으로 그리면 "세션이 없다" 와 구분되지 않으므로,
 * 권한 때문이라는 사실을 표면에 그대로 적는다.
 */
export const SessionPermissionNotice = memo(
  ({ className, compact = false }: SessionPermissionNoticeProps) => (
    <div
      role="status"
      aria-label="세션 조회 권한 없음"
      className={cn(
        'flex flex-col items-center justify-center text-center rounded-lg',
        'border border-dashed border-amber-300 dark:border-amber-700/60',
        'bg-amber-50 dark:bg-amber-900/20',
        compact ? 'py-4 px-3' : 'py-8 px-4',
        className,
      )}
    >
      <ShieldAlert
        className={cn(
          'text-amber-500 dark:text-amber-400',
          compact ? 'w-6 h-6 mb-1.5' : 'w-10 h-10 mb-2',
        )}
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        세션 조회 권한이 없습니다
      </p>
      {!compact && (
        <p className="text-xs mt-1 text-amber-800/80 dark:text-amber-300/80">
          세션 모니터링은 admin·manager 계정만 볼 수 있습니다. 데이터가 없는 것이 아니라
          접근이 거부된 상태입니다.
        </p>
      )}
    </div>
  ),
)

SessionPermissionNotice.displayName = 'SessionPermissionNotice'
