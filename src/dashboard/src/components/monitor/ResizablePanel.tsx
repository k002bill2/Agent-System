import { useState, useRef, useCallback, useEffect, ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface ResizablePanelProps {
  children: ReactNode
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  className?: string
}

const STORAGE_KEY = 'resizable-panel-width'

export function ResizablePanel({
  children,
  defaultWidth = 525,
  minWidth = 280,
  maxWidth = 1200, // Increased from 800px
  className,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? parseInt(saved, 10) : defaultWidth
  })
  const [isResizing, setIsResizing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  const stopResizing = useCallback(() => {
    setIsResizing(false)
  }, [])

  const resize = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return

      const panelRect = panelRef.current.getBoundingClientRect()
      // Calculate new width from right edge (panel is on the right)
      const newWidth = panelRect.right - e.clientX

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth)
        localStorage.setItem(STORAGE_KEY, String(newWidth))
      }
    },
    [isResizing, minWidth, maxWidth]
  )

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize)
      window.addEventListener('mouseup', stopResizing)
      // Prevent text selection while resizing
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
    }

    return () => {
      window.removeEventListener('mousemove', resize)
      window.removeEventListener('mouseup', stopResizing)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isResizing, resize, stopResizing])

  return (
    <div
      ref={panelRef}
      className={cn('relative flex', className)}
      style={{ width: `${width}px` }}
    >
      {/* Resize Handle */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10',
          'hover:bg-primary-400 dark:hover:bg-primary-600',
          'transition-colors duration-150',
          isResizing && 'bg-primary-500'
        )}
        onMouseDown={startResizing}
      >
        {/* Visual indicator on hover/drag */}
        <div
          className={cn(
            'absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2',
            'w-3 h-8 rounded-full',
            'bg-gray-300 dark:bg-gray-600',
            'opacity-0 hover:opacity-100',
            'transition-opacity duration-150',
            'flex items-center justify-center',
            isResizing && 'opacity-100 bg-primary-500'
          )}
        >
          <div className="flex flex-col gap-0.5">
            <div className="w-0.5 h-0.5 rounded-full bg-white" />
            <div className="w-0.5 h-0.5 rounded-full bg-white" />
            <div className="w-0.5 h-0.5 rounded-full bg-white" />
          </div>
        </div>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-hidden border-l border-gray-200 dark:border-gray-700">
        {children}
      </div>
    </div>
  )
}
