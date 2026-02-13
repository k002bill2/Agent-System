import { render, screen, fireEvent, within } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import {
  VirtualizedDataTable,
  type ColumnDef,
  type SortConfig,
  type FilterConfig,
} from './VirtualizedDataTable'

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

interface TestRow extends Record<string, unknown> {
  id: number
  name: string
  age: number
  city: string
}

const columns: ColumnDef<TestRow>[] = [
  { key: 'id', title: 'ID', width: 80, sortable: true, filterable: true, filterType: 'number' },
  { key: 'name', title: 'Name', width: 150, sortable: true, filterable: true, filterType: 'text' },
  { key: 'age', title: 'Age', width: 80, sortable: true, filterable: true, filterType: 'number' },
  {
    key: 'city',
    title: 'City',
    width: 150,
    sortable: true,
    filterable: true,
    filterType: 'select',
    filterOptions: ['Seoul', 'Busan', 'Tokyo'],
  },
]

function makeRows(count: number): TestRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `User ${i + 1}`,
    age: 20 + (i % 40),
    city: ['Seoul', 'Busan', 'Tokyo'][i % 3],
  }))
}

const smallData = makeRows(5)
const largeData = makeRows(200)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VirtualizedDataTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Basic rendering
  it('renders columns and data rows', () => {
    render(<VirtualizedDataTable data={smallData} columns={columns} />)

    const grid = screen.getByRole('grid')
    expect(grid).toBeInTheDocument()

    // Column headers
    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Age')).toBeInTheDocument()
    expect(screen.getByText('City')).toBeInTheDocument()

    // Data should be visible
    expect(screen.getByText('User 1')).toBeInTheDocument()
    expect(screen.getByText('User 5')).toBeInTheDocument()
  })

  // 2. Virtual scroll - only render visible rows
  it('only renders visible rows via virtual scrolling', () => {
    const rowHeight = 40
    const maxHeight = 200
    const headerHeight = 48

    render(
      <VirtualizedDataTable
        data={largeData}
        columns={columns}
        rowHeight={rowHeight}
        headerHeight={headerHeight}
        maxHeight={maxHeight}
      />,
    )

    // With 200 rows, maxHeight=200, headerHeight=48, bodyHeight=152
    // visible = ceil(152/40)+1 = 5
    // We should NOT render all 200 rows
    const rows = screen.getAllByRole('row')
    // Subtract 1 for header row
    const dataRows = rows.length - 1
    expect(dataRows).toBeLessThan(200)
    expect(dataRows).toBeLessThanOrEqual(6) // startIndex..endIndex visible range
  })

  // 3. translateY positioning for virtual scroll
  it('positions rows using translateY transform', () => {
    render(
      <VirtualizedDataTable
        data={largeData}
        columns={columns}
        rowHeight={40}
        maxHeight={200}
      />,
    )

    const rows = screen.getAllByRole('row')
    // Second row (first data row) should have transform
    const firstDataRow = rows[1]
    expect(firstDataRow.style.transform).toBe('translateY(0px)')
  })

  // 4. Single column sort
  it('sorts data by a column on click', () => {
    const onSort = vi.fn()
    render(<VirtualizedDataTable data={smallData} columns={columns} onSort={onSort} />)

    // Click the Name header
    fireEvent.click(screen.getByText('Name'))

    expect(onSort).toHaveBeenCalledWith([{ key: 'name', direction: 'asc' }])
  })

  // 5. Multi-column sort with Shift+click
  it('supports multi-column sort with Shift+click', () => {
    const onSort = vi.fn()
    render(<VirtualizedDataTable data={smallData} columns={columns} onSort={onSort} />)

    // Click Name to sort ascending
    fireEvent.click(screen.getByText('Name'))

    // Shift+click Age for secondary sort
    fireEvent.click(screen.getByText('Age'), { shiftKey: true })

    expect(onSort).toHaveBeenCalledTimes(2)
    const lastCall = onSort.mock.calls[1][0] as SortConfig[]
    expect(lastCall).toHaveLength(2)
    expect(lastCall[0].key).toBe('name')
    expect(lastCall[1].key).toBe('age')
  })

  // 6. aria-sort attribute on sortable headers
  it('applies aria-sort attribute to column headers', () => {
    render(<VirtualizedDataTable data={smallData} columns={columns} />)

    const columnHeaders = screen.getAllByRole('columnheader')
    // Initially all "none"
    // The first columnheader is the select-all checkbox header (no aria-sort)
    const nameHeader = columnHeaders[2] // 0=checkbox, 1=ID, 2=Name
    expect(nameHeader).toHaveAttribute('aria-sort', 'none')

    // Click to sort ascending
    fireEvent.click(within(nameHeader).getByText('Name'))
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')

    // Click again to sort descending
    fireEvent.click(within(nameHeader).getByText('Name'))
    expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
  })

  // 7. Column text filtering
  it('filters data by column text input', () => {
    const onFilter = vi.fn()
    render(<VirtualizedDataTable data={smallData} columns={columns} onFilter={onFilter} />)

    // Show filter row by clicking filter icon
    const filterButtons = screen.getAllByLabelText(/^Filter /)
    fireEvent.click(filterButtons[0])

    // Now find the filter input for Name
    const nameFilter = screen.getByPlaceholderText('Filter Name...')
    fireEvent.change(nameFilter, { target: { value: 'User 1' } })

    expect(onFilter).toHaveBeenCalled()
    const lastCall = onFilter.mock.calls[onFilter.mock.calls.length - 1][0] as FilterConfig[]
    expect(lastCall.some((f: FilterConfig) => f.key === 'name' && f.value === 'User 1')).toBe(true)
  })

  // 8. Column select filtering
  it('filters data by column select dropdown', () => {
    const onFilter = vi.fn()
    render(<VirtualizedDataTable data={smallData} columns={columns} onFilter={onFilter} />)

    // Show filter row
    const filterButtons = screen.getAllByLabelText(/^Filter /)
    fireEvent.click(filterButtons[0])

    // Find the City select filter (the <select> element, not the header button)
    const cityFilters = screen.getAllByLabelText('Filter City')
    const citySelect = cityFilters.find((el) => el.tagName === 'SELECT')!
    fireEvent.change(citySelect, { target: { value: 'Seoul' } })

    expect(onFilter).toHaveBeenCalled()
  })

  // 9. Checkbox row selection
  it('selects and deselects rows via checkbox', () => {
    const onRowSelect = vi.fn()
    render(<VirtualizedDataTable data={smallData} columns={columns} onRowSelect={onRowSelect} />)

    // Select first row
    const checkboxes = screen.getAllByRole('checkbox')
    const firstRowCheckbox = checkboxes[1] // index 0 is select-all
    fireEvent.click(firstRowCheckbox)

    expect(onRowSelect).toHaveBeenCalled()
    const selectedItems = onRowSelect.mock.calls[0][0] as TestRow[]
    expect(selectedItems.length).toBe(1)
  })

  // 10. Select all / deselect all
  it('toggles select all via header checkbox', () => {
    const onRowSelect = vi.fn()
    render(<VirtualizedDataTable data={smallData} columns={columns} onRowSelect={onRowSelect} />)

    const selectAllCheckbox = screen.getByLabelText('Select all rows')

    // Select all
    fireEvent.click(selectAllCheckbox)
    expect(onRowSelect).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 1 })]))

    // Deselect all
    fireEvent.click(selectAllCheckbox)
    const lastCall = onRowSelect.mock.calls[onRowSelect.mock.calls.length - 1][0] as TestRow[]
    expect(lastCall).toHaveLength(0)
  })

  // 11. Keyboard navigation - arrow keys
  it('supports ArrowDown/ArrowUp keyboard navigation', () => {
    render(<VirtualizedDataTable data={smallData} columns={columns} />)

    const grid = screen.getByRole('grid')
    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    fireEvent.keyDown(grid, { key: 'ArrowDown' })

    // Focused row should have ring class
    const rows = screen.getAllByRole('row')
    // After two ArrowDown, focusedRow is 1 (0-based)
    const focusedRow = rows.find((r) => r.className.includes('ring-2'))
    expect(focusedRow).toBeTruthy()
  })

  // 12. Keyboard navigation - Enter/Space to select
  it('toggles selection with Enter key', () => {
    const onRowSelect = vi.fn()
    render(<VirtualizedDataTable data={smallData} columns={columns} onRowSelect={onRowSelect} />)

    const grid = screen.getByRole('grid')
    // Move to first row
    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    // Select with Enter
    fireEvent.keyDown(grid, { key: 'Enter' })

    expect(onRowSelect).toHaveBeenCalled()
  })

  // 13. Keyboard navigation - Space to toggle
  it('toggles selection with Space key', () => {
    const onRowSelect = vi.fn()
    render(<VirtualizedDataTable data={smallData} columns={columns} onRowSelect={onRowSelect} />)

    const grid = screen.getByRole('grid')
    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    fireEvent.keyDown(grid, { key: ' ' })

    expect(onRowSelect).toHaveBeenCalled()
  })

  // 14. Keyboard navigation - Escape to deselect
  it('deselects all rows with Escape key', () => {
    const onRowSelect = vi.fn()
    render(<VirtualizedDataTable data={smallData} columns={columns} onRowSelect={onRowSelect} />)

    const grid = screen.getByRole('grid')
    // Select a row first
    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    fireEvent.keyDown(grid, { key: 'Enter' })

    // Escape to deselect
    fireEvent.keyDown(grid, { key: 'Escape' })
    const lastCall = onRowSelect.mock.calls[onRowSelect.mock.calls.length - 1][0] as TestRow[]
    expect(lastCall).toHaveLength(0)
  })

  // 15. Loading state
  it('renders loading spinner when isLoading is true', () => {
    render(<VirtualizedDataTable data={[]} columns={columns} isLoading={true} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.getByRole('grid')).toHaveAttribute('aria-busy', 'true')
  })

  // 16. Error state
  it('renders error message with retry button', () => {
    const errorMessage = 'Failed to load data'
    render(<VirtualizedDataTable data={[]} columns={columns} error={errorMessage} />)

    expect(screen.getByText(errorMessage)).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  // 17. Empty state
  it('renders empty message when data is empty', () => {
    render(<VirtualizedDataTable data={[]} columns={columns} emptyMessage="Nothing here" />)

    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  // 18. Default empty message
  it('renders default empty message', () => {
    render(<VirtualizedDataTable data={[]} columns={columns} />)

    expect(screen.getByText('No data available')).toBeInTheDocument()
  })

  // 19. Accessibility - grid role and ARIA attributes
  it('has correct ARIA roles and attributes', () => {
    render(<VirtualizedDataTable data={smallData} columns={columns} />)

    const grid = screen.getByRole('grid')
    expect(grid).toHaveAttribute('aria-rowcount', String(smallData.length + 1))
    expect(grid).toHaveAttribute('aria-colcount', String(columns.length + 1))

    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeGreaterThan(0)

    const columnHeaders = screen.getAllByRole('columnheader')
    expect(columnHeaders.length).toBe(columns.length + 1) // +1 for checkbox column

    const gridcells = screen.getAllByRole('gridcell')
    expect(gridcells.length).toBeGreaterThan(0)
  })

  // 20. Column resize handle exists
  it('renders resize handles for columns', () => {
    render(<VirtualizedDataTable data={smallData} columns={columns} />)

    const resizeHandles = screen.getAllByLabelText(/^Resize /)
    expect(resizeHandles.length).toBe(columns.length)
  })

  // 21. ArrowLeft/ArrowRight for cell navigation
  it('supports ArrowLeft/ArrowRight for cell navigation', () => {
    render(<VirtualizedDataTable data={smallData} columns={columns} />)

    const grid = screen.getByRole('grid')
    // Move to a row
    fireEvent.keyDown(grid, { key: 'ArrowDown' })
    // Move right
    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    fireEvent.keyDown(grid, { key: 'ArrowRight' })

    // The focused cell should have outline class
    const gridcells = screen.getAllByRole('gridcell')
    const focusedCell = gridcells.find((c) => c.className.includes('outline'))
    expect(focusedCell).toBeTruthy()
  })

  // 22. Custom render function
  it('supports custom column render function', () => {
    const customColumns: ColumnDef<TestRow>[] = [
      {
        key: 'name',
        title: 'Name',
        render: (value) => <strong data-testid="custom-render">{String(value)}</strong>,
      },
    ]

    render(<VirtualizedDataTable data={smallData} columns={customColumns} />)

    const customElements = screen.getAllByTestId('custom-render')
    expect(customElements.length).toBeGreaterThan(0)
    expect(customElements[0].tagName).toBe('STRONG')
  })

  // 23. Retry button resets filters and sorts
  it('retry button clears filters and sorts', () => {
    const onFilter = vi.fn()
    const onSort = vi.fn()

    const { rerender } = render(
      <VirtualizedDataTable
        data={[]}
        columns={columns}
        error="Something went wrong"
        onFilter={onFilter}
        onSort={onSort}
      />,
    )

    fireEvent.click(screen.getByText('Retry'))

    expect(onFilter).toHaveBeenCalledWith([])
    expect(onSort).toHaveBeenCalledWith([])

    // After retry the parent might re-render without error
    rerender(
      <VirtualizedDataTable data={smallData} columns={columns} onFilter={onFilter} onSort={onSort} />,
    )
    expect(screen.getByText('User 1')).toBeInTheDocument()
  })
})
