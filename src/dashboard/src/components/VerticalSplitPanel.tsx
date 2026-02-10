import { useState, useRef, useCallback, useEffect, ReactNode } from 'react'
import { cn } from '../lib/utils'
import { GripHorizontal, Maximize2, Minimize2 } from 'lucide-react'

interface VerticalSplitPanelProps {
  topContent: ReactNode
  bottomContent: ReactNode
  storageKey?: string
  defaultTopHeight?: number // percentage (0-100)
  minTopHeight?: number // percentage
  maxTopHeight?: number // percentage
  className?: string
}

export function VerticalSplitPanel({
  topContent,
  bottomContent,
  storageKey = 'vertical-split-height',
  defaultTopHeight = 40,
  minTopHeight = 20,
  maxTopHeight = 80,
  className,
}: VerticalSplitPanelProps) {
  const [topHeight, setTopHeight] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    return saved ? parseFloat(saved) : defaultTopHeight
  })
  const [isResizing, setIsResizing] = useState(false)
  const [isBottomCollapsed, setIsBottomCollapsed] = useState(false)
  const [isTopCollapsed, setIsTopCollapsed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  const stopResizing = useCallback(() => {
    setIsResizing(false)
  }, [])

  const resize = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const newTopHeight = ((e.clientY - containerRect.top) / containerRect.height) * 100

      if (newTopHeight >= minTopHeight && newTopHeight <= maxTopHeight) {
        setTopHeight(newTopHeight)
        localStorage.setItem(storageKey, String(newTopHeight))
      }
    },
    [isResizing, minTopHeight, maxTopHeight, storageKey]
  )

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize)
      window.addEventListener('mouseup', stopResizing)
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'row-resize'
    }

    return () => {
      window.removeEventListener('mousemove', resize)
      window.removeEventListener('mouseup', stopResizing)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isResizing, resize, stopResizing])

  const toggleBottomCollapse = () => {
    setIsBottomCollapsed(!isBottomCollapsed)
    setIsTopCollapsed(false)
  }

  const toggleTopCollapse = () => {
    setIsTopCollapsed(!isTopCollapsed)
    setIsBottomCollapsed(false)
  }

  // Calculate actual heights based on collapse state
  const actualTopHeight = isBottomCollapsed ? 100 : isTopCollapsed ? 0 : topHeight
  const actualBottomHeight = isBottomCollapsed ? 0 : isTopCollapsed ? 100 : 100 - topHeight

  return (
    <div ref={containerRef} className={cn('flex flex-col h-full', className)}>
      {/* Top Panel */}
      <div
        className="overflow-hidden flex flex-col"
        style={{ height: `${actualTopHeight}%` }}
      >
        {/* Top Panel Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            기본 정보
          </span>
          <button
            onClick={toggleBottomCollapse}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title={isBottomCollapsed ? '하단 패널 펼치기' : '상단 패널 최대화'}
          >
            {isBottomCollapsed ? (
              <Minimize2 className="w-3.5 h-3.5 text-gray-500" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-gray-500" />
            )}
          </button>
        </div>
        {/* Top Panel Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {topContent}
        </div>
      </div>

      {/* Resize Handle */}
      {!isBottomCollapsed && !isTopCollapsed && (
        <div
          className={cn(
            'relative h-2 cursor-row-resize flex-shrink-0',
            'bg-gray-100 dark:bg-gray-800',
            'hover:bg-primary-100 dark:hover:bg-primary-900/30',
            'transition-colors duration-150',
            'border-y border-gray-200 dark:border-gray-700',
            isResizing && 'bg-primary-200 dark:bg-primary-800'
          )}
          onMouseDown={startResizing}
        >
          {/* Visual grip indicator */}
          <div className="absolute inset-0 flex items-center justify-center">
            <GripHorizontal className={cn(
              'w-4 h-4 text-gray-400',
              isResizing && 'text-primary-500'
            )} />
          </div>
        </div>
      )}

      {/* Bottom Panel */}
      <div
        className="overflow-hidden flex flex-col"
        style={{ height: `${actualBottomHeight}%` }}
      >
        {/* Bottom Panel Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            실행 결과
          </span>
          <button
            onClick={toggleTopCollapse}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title={isTopCollapsed ? '상단 패널 펼치기' : '하단 패널 최대화'}
          >
            {isTopCollapsed ? (
              <Minimize2 className="w-3.5 h-3.5 text-gray-500" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-gray-500" />
            )}
          </button>
        </div>
        {/* Bottom Panel Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {bottomContent}
        </div>
      </div>
    </div>
  )
}
