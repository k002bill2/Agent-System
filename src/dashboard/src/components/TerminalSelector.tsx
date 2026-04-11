/**
 * TerminalSelector Component
 *
 * Task Analyzer에서 실행 터미널을 선택하는 세그먼트 토글.
 * Warp / Tmux 중 선택 가능하며, 선택은 localStorage에 영속.
 */

import { memo } from 'react'
import { cn } from '../lib/utils'
import { useSettingsStore, type TerminalType } from '../stores/settings'
import { Terminal, SquareTerminal } from 'lucide-react'

interface TerminalOption {
  type: TerminalType
  label: string
  description: string
}

const TERMINAL_OPTIONS: TerminalOption[] = [
  { type: 'warp', label: 'Warp', description: 'Warp 터미널에서 실행' },
  { type: 'tmux', label: 'tmux', description: 'tmux 세션에서 실행' },
]

const ICONS: Record<string, typeof Terminal> = {
  warp: Terminal,
  tmux: SquareTerminal,
}

/** 터미널 타입 선택 세그먼트 토글. */
const TerminalSelector = memo(function TerminalSelector() {
  const terminalType = useSettingsStore((s) => s.preferredTerminal)
  const setTerminalType = useSettingsStore((s) => s.setPreferredTerminal)

  return (
    <div
      role="radiogroup"
      aria-label="Terminal type selector"
      className="flex items-center rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 p-0.5"
    >
      {TERMINAL_OPTIONS.map((opt) => {
        const Icon = ICONS[opt.type]
        const isActive = terminalType === opt.type

        return (
          <button
            key={opt.type}
            role="radio"
            aria-checked={isActive}
            aria-label={`${opt.label} 터미널 사용`}
            title={opt.description}
            onClick={() => setTerminalType(opt.type)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors',
              isActive
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            <Icon className="w-3 h-3" />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
})

TerminalSelector.displayName = 'TerminalSelector'

export { TerminalSelector }
