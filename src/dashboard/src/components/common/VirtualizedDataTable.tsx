/**
 * VirtualizedDataTable Component
 *
 * A high-performance data table with virtual scrolling, multi-column sorting,
 * column filtering, column resizing, checkbox selection, and keyboard navigation.
 */

import {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  memo,
  type ReactNode,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { cn } from '../../lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColumnDef<T extends Record<string, unknown>> {
  key: keyof T
  title: string
  width?: number
  minWidth?: number
  sortable?: boolean
  filterable?: boolean
  filterType?: 'text' | 'number' | 'select'
  filterOptions?: string[]
  render?: (value: T[keyof T], row: T) => ReactNode
}

export interface SortConfig {
  key: string
  direction: 'asc' | 'desc'
}

export interface FilterConfig {
  key: string
  value: string
  type: 'text' | 'number' | 'select'
}

export interface VirtualizedDataTableProps<T extends Record<string, unknown>> {
  data: T[]
  columns: ColumnDef<T>[]
  rowHeight?: number
  headerHeight?: number
  maxHeight?: number
  onRowSelect?: (selected: T[]) => void
  onSort?: (sort: SortConfig[]) => void
  onFilter?: (filters: FilterConfig[]) => void
  isLoading?: boolean
  error?: string
  emptyMessage?: string
}

// ---------------------------------------------------------------------------
// Row component (memoised)
// ---------------------------------------------------------------------------

interface RowProps<T extends Record<string, unknown>> {
  row: T
  rowIndex: number
  columns: ColumnDef<T>[]
  columnWidths: number[]
  isSelected: boolean
  isFocusedRow: boolean
  focusedCol: number
  rowHeight: number
  offsetTop: number
  onToggleSelect: (rowIndex: number) => void
  onCellClick: (rowIndex: number, colIndex: number) => void
}

function RowInner<T extends Record<string, unknown>>({
  row,
  rowIndex,
  columns,
  columnWidths,
  isSelected,
  isFocusedRow,
  focusedCol,
  rowHeight,
  offsetTop,
  onToggleSelect,
  onCellClick,
}: RowProps<T>) {
  return (
    <div
      role="row"
      aria-rowindex={rowIndex + 2}
      aria-selected={isSelected}
      className={cn(
        'flex items-center border-b border-gray-200 dark:border-gray-700 absolute w-full left-0',
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30'
          : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800',
        isFocusedRow && 'ring-2 ring-inset ring-blue-400',
      )}
      style={{
        height: rowHeight,
        transform: `translateY(${offsetTop}px)`,
      }}
    >
      {/* Checkbox cell */}
      <div
        role="gridcell"
        className="flex items-center justify-center shrink-0"
        style={{ width: 48, minWidth: 48 }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(rowIndex)}
          aria-label={`Select row ${rowIndex + 1}`}
          className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
        />
      </div>

      {/* Data cells */}
      {columns.map((col, colIndex) => {
        const value = row[col.key]
        const isFocusedCell = isFocusedRow && focusedCol === colIndex
        return (
          <div
            key={String(col.key)}
            role="gridcell"
            tabIndex={isFocusedCell ? 0 : -1}
            className={cn(
              'flex items-center px-3 truncate text-sm text-gray-700 dark:text-gray-300 shrink-0',
              isFocusedCell && 'outline outline-2 outline-blue-400 -outline-offset-2',
            )}
            style={{
              width: columnWidths[colIndex],
              minWidth: col.minWidth ?? 60,
              height: rowHeight,
            }}
            onClick={() => onCellClick(rowIndex, colIndex)}
          >
            {col.render ? col.render(value, row) : String(value ?? '')}
          </div>
        )
      })}
    </div>
  )
}

const MemoizedRow = memo(RowInner) as typeof RowInner

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function VirtualizedDataTableInner<T extends Record<string, unknown>>({
  data,
  columns,
  rowHeight = 40,
  headerHeight = 48,
  maxHeight = 600,
  onRowSelect,
  onSort,
  onFilter,
  isLoading = false,
  error,
  emptyMessage = 'No data available',
}: VirtualizedDataTableProps<T>) {
  // ---- state ----
  const [sorts, setSorts] = useState<SortConfig[]>([])
  const [filters, setFilters] = useState<FilterConfig[]>([])
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [scrollTop, setScrollTop] = useState(0)
  const [focusedRow, setFocusedRow] = useState(-1)
  const [focusedCol, setFocusedCol] = useState(0)
  const [columnWidths, setColumnWidths] = useState<number[]>(() =>
    columns.map((c) => c.width ?? 150),
  )
  const [showFilters, setShowFilters] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const resizingCol = useRef<number | null>(null)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)

  // Sync column widths when columns prop changes
  useEffect(() => {
    setColumnWidths(columns.map((c) => c.width ?? 150))
  }, [columns])

  // ---- filtering ----
  const filteredData = useMemo(() => {
    if (filters.length === 0) return data
    return data.filter((row) =>
      filters.every((f) => {
        const cellValue = String(row[f.key as keyof T] ?? '')
        if (f.value === '') return true
        if (f.type === 'number') {
          return cellValue.includes(f.value)
        }
        return cellValue.toLowerCase().includes(f.value.toLowerCase())
      }),
    )
  }, [data, filters])

  // ---- sorting ----
  const sortedData = useMemo(() => {
    if (sorts.length === 0) return filteredData
    const copy = [...filteredData]
    copy.sort((a, b) => {
      for (const s of sorts) {
        const aVal = a[s.key as keyof T]
        const bVal = b[s.key as keyof T]
        const aStr = String(aVal ?? '')
        const bStr = String(bVal ?? '')
        const cmp = aStr.localeCompare(bStr, undefined, { numeric: true })
        if (cmp !== 0) return s.direction === 'asc' ? cmp : -cmp
      }
      return 0
    })
    return copy
  }, [filteredData, sorts])

  const totalRows = sortedData.length

  // ---- virtual scroll math ----
  const filterRowHeight = showFilters ? 40 : 0
  const bodyHeight = maxHeight - headerHeight - filterRowHeight
  const visibleCount = Math.ceil(bodyHeight / rowHeight) + 1
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight))
  const endIndex = Math.min(totalRows, startIndex + visibleCount)
  const totalContentHeight = totalRows * rowHeight

  // ---- handlers ----
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop((e.target as HTMLDivElement).scrollTop)
  }, [])

  const handleSort = useCallback(
    (key: string, shiftKey: boolean) => {
      setSorts((prev) => {
        let next: SortConfig[]
        const existing = prev.find((s) => s.key === key)
        if (shiftKey) {
          if (existing) {
            if (existing.direction === 'asc') {
              next = prev.map((s) => (s.key === key ? { ...s, direction: 'desc' as const } : s))
            } else {
              next = prev.filter((s) => s.key !== key)
            }
          } else {
            next = [...prev, { key, direction: 'asc' }]
          }
        } else {
          if (existing && existing.direction === 'asc') {
            next = [{ key, direction: 'desc' }]
          } else if (existing && existing.direction === 'desc') {
            next = []
          } else {
            next = [{ key, direction: 'asc' }]
          }
        }
        onSort?.(next)
        return next
      })
    },
    [onSort],
  )

  const handleFilterChange = useCallback(
    (key: string, value: string, type: 'text' | 'number' | 'select') => {
      setFilters((prev) => {
        const without = prev.filter((f) => f.key !== key)
        const next = value === '' ? without : [...without, { key, value, type }]
        onFilter?.(next)
        return next
      })
    },
    [onFilter],
  )

  const toggleRowSelect = useCallback(
    (rowIndex: number) => {
      setSelectedIndices((prev) => {
        const next = new Set(prev)
        if (next.has(rowIndex)) {
          next.delete(rowIndex)
        } else {
          next.add(rowIndex)
        }
        onRowSelect?.(Array.from(next).map((i) => sortedData[i]))
        return next
      })
    },
    [sortedData, onRowSelect],
  )

  const toggleSelectAll = useCallback(() => {
    setSelectedIndices((prev) => {
      if (prev.size === totalRows) {
        onRowSelect?.([])
        return new Set()
      }
      const all = new Set(Array.from({ length: totalRows }, (_, i) => i))
      onRowSelect?.(sortedData)
      return all
    })
  }, [totalRows, sortedData, onRowSelect])

  const handleCellClick = useCallback((rowIndex: number, colIndex: number) => {
    setFocusedRow(rowIndex)
    setFocusedCol(colIndex)
  }, [])

  // ---- keyboard navigation ----
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (totalRows === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setFocusedRow((prev) => {
            const next = Math.min(prev + 1, totalRows - 1)
            // Scroll into view if needed
            const rowTop = next * rowHeight
            const viewBottom = scrollTop + bodyHeight
            if (rowTop + rowHeight > viewBottom) {
              containerRef.current?.querySelector('[data-scroll-body]')?.scrollTo({
                top: rowTop + rowHeight - bodyHeight,
              })
            }
            return next
          })
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedRow((prev) => {
            const next = Math.max(prev - 1, 0)
            const rowTop = next * rowHeight
            if (rowTop < scrollTop) {
              containerRef.current?.querySelector('[data-scroll-body]')?.scrollTo({
                top: rowTop,
              })
            }
            return next
          })
          break
        case 'ArrowRight':
          e.preventDefault()
          setFocusedCol((prev) => Math.min(prev + 1, columns.length - 1))
          break
        case 'ArrowLeft':
          e.preventDefault()
          setFocusedCol((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (focusedRow >= 0) {
            toggleRowSelect(focusedRow)
          }
          break
        case ' ':
          e.preventDefault()
          if (focusedRow >= 0) {
            toggleRowSelect(focusedRow)
          }
          break
        case 'Escape':
          e.preventDefault()
          setSelectedIndices(new Set())
          onRowSelect?.([])
          break
      }
    },
    [
      totalRows,
      rowHeight,
      bodyHeight,
      scrollTop,
      columns.length,
      focusedRow,
      toggleRowSelect,
      onRowSelect,
    ],
  )

  // ---- column resize ----
  const handleResizeStart = useCallback(
    (colIndex: number, e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      resizingCol.current = colIndex
      resizeStartX.current = e.clientX
      resizeStartWidth.current = columnWidths[colIndex]

      const handleMouseMove = (ev: globalThis.MouseEvent) => {
        if (resizingCol.current === null) return
        const diff = ev.clientX - resizeStartX.current
        const minW = columns[resizingCol.current].minWidth ?? 60
        const newWidth = Math.max(minW, resizeStartWidth.current + diff)
        setColumnWidths((prev) => {
          const copy = [...prev]
          copy[resizingCol.current!] = newWidth
          return copy
        })
      }

      const handleMouseUp = () => {
        resizingCol.current = null
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [columnWidths, columns],
  )

  // ---- sort direction for a column ----
  const getSortDirection = useCallback(
    (key: string): 'ascending' | 'descending' | 'none' => {
      const s = sorts.find((sort) => sort.key === key)
      if (!s) return 'none'
      return s.direction === 'asc' ? 'ascending' : 'descending'
    },
    [sorts],
  )

  const getSortIndicator = useCallback(
    (key: string): string => {
      const s = sorts.find((sort) => sort.key === key)
      if (!s) return ''
      const idx = sorts.indexOf(s)
      const arrow = s.direction === 'asc' ? '\u25B2' : '\u25BC'
      return sorts.length > 1 ? `${arrow}${idx + 1}` : arrow
    },
    [sorts],
  )

  // ---- retry handler ----
  const handleRetry = useCallback(() => {
    setFilters([])
    setSorts([])
    onFilter?.([])
    onSort?.([])
  }, [onFilter, onSort])

  // ---- render: loading state ----
  if (isLoading) {
    return (
      <div
        role="grid"
        aria-busy="true"
        className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
        style={{ maxHeight }}
      >
        <div className="flex items-center justify-center p-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  // ---- render: error state ----
  if (error) {
    return (
      <div
        role="grid"
        aria-busy="false"
        className="border border-red-200 dark:border-red-700 rounded-lg overflow-hidden"
        style={{ maxHeight }}
      >
        <div className="flex items-center justify-center p-12">
          <div className="flex flex-col items-center gap-3">
            <span className="text-red-500 dark:text-red-400 text-sm">{error}</span>
            <button
              onClick={handleRetry}
              className="px-3 py-1.5 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---- render: main table ----
  const isAllSelected = totalRows > 0 && selectedIndices.size === totalRows

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-rowcount={totalRows + 1}
      aria-colcount={columns.length + 1}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden focus:outline-none"
      style={{ maxHeight }}
    >
      {/* Header row */}
      <div
        role="row"
        aria-rowindex={1}
        className="flex items-center bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
        style={{ height: headerHeight }}
      >
        {/* Select-all checkbox header */}
        <div
          role="columnheader"
          className="flex items-center justify-center shrink-0"
          style={{ width: 48, minWidth: 48 }}
        >
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={toggleSelectAll}
            aria-label="Select all rows"
            className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
          />
        </div>

        {/* Column headers */}
        {columns.map((col, colIndex) => {
          const sortDir = getSortDirection(String(col.key))
          return (
            <div
              key={String(col.key)}
              role="columnheader"
              aria-sort={sortDir}
              className="relative flex items-center px-3 text-sm font-medium text-gray-600 dark:text-gray-300 shrink-0 select-none"
              style={{
                width: columnWidths[colIndex],
                minWidth: col.minWidth ?? 60,
                height: headerHeight,
              }}
            >
              <button
                className={cn(
                  'flex items-center gap-1 truncate',
                  col.sortable !== false && 'cursor-pointer hover:text-gray-900 dark:hover:text-white',
                )}
                onClick={(e) => {
                  if (col.sortable === false) return
                  handleSort(String(col.key), e.shiftKey)
                }}
                disabled={col.sortable === false}
                type="button"
              >
                <span className="truncate">{col.title}</span>
                {getSortIndicator(String(col.key)) && (
                  <span className="text-blue-500 text-xs ml-0.5">
                    {getSortIndicator(String(col.key))}
                  </span>
                )}
              </button>

              {col.filterable && (
                <button
                  onClick={() => setShowFilters((prev) => !prev)}
                  className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label={`Filter ${col.title}`}
                  type="button"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                </button>
              )}

              {/* Resize handle */}
              <div
                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400/50 transition-colors"
                onMouseDown={(e) => handleResizeStart(colIndex, e)}
                aria-label={`Resize ${col.title}`}
              />
            </div>
          )
        })}
      </div>

      {/* Filter row */}
      {showFilters && (
        <div
          role="row"
          className="flex items-center bg-gray-25 dark:bg-gray-850 border-b border-gray-200 dark:border-gray-700"
          style={{ height: 40 }}
        >
          <div style={{ width: 48, minWidth: 48 }} className="shrink-0" />
          {columns.map((col, colIndex) => (
            <div
              key={`filter-${String(col.key)}`}
              className="px-2 shrink-0"
              style={{
                width: columnWidths[colIndex],
                minWidth: col.minWidth ?? 60,
              }}
            >
              {col.filterable && col.filterType === 'select' ? (
                <select
                  value={filters.find((f) => f.key === String(col.key))?.value ?? ''}
                  onChange={(e) =>
                    handleFilterChange(String(col.key), e.target.value, 'select')
                  }
                  className="w-full h-7 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-1.5"
                  aria-label={`Filter ${col.title}`}
                >
                  <option value="">All</option>
                  {col.filterOptions?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : col.filterable ? (
                <input
                  type={col.filterType === 'number' ? 'number' : 'text'}
                  value={filters.find((f) => f.key === String(col.key))?.value ?? ''}
                  onChange={(e) =>
                    handleFilterChange(
                      String(col.key),
                      e.target.value,
                      col.filterType ?? 'text',
                    )
                  }
                  placeholder={`Filter ${col.title}...`}
                  className="w-full h-7 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-1.5"
                  aria-label={`Filter ${col.title}`}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Scrollable body */}
      {totalRows === 0 ? (
        <div className="flex items-center justify-center p-12 text-sm text-gray-500 dark:text-gray-400">
          {emptyMessage}
        </div>
      ) : (
        <div
          data-scroll-body
          onScroll={handleScroll}
          className="relative"
          style={{
            height: Math.min(bodyHeight, totalContentHeight),
            overflow: 'auto',
          }}
        >
          <div style={{ height: totalContentHeight, position: 'relative' }}>
            {Array.from({ length: endIndex - startIndex }, (_, i) => {
              const idx = startIndex + i
              const row = sortedData[idx]
              if (!row) return null
              return (
                <MemoizedRow
                  key={idx}
                  row={row}
                  rowIndex={idx}
                  columns={columns}
                  columnWidths={columnWidths}
                  isSelected={selectedIndices.has(idx)}
                  isFocusedRow={focusedRow === idx}
                  focusedCol={focusedCol}
                  rowHeight={rowHeight}
                  offsetTop={idx * rowHeight}
                  onToggleSelect={toggleRowSelect}
                  onCellClick={handleCellClick}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export const VirtualizedDataTable = memo(VirtualizedDataTableInner) as typeof VirtualizedDataTableInner
