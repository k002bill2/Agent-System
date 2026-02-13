import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { Pagination } from './Pagination'

describe('Pagination', () => {
  const defaultProps = {
    currentPage: 1,
    totalPages: 10,
    onPageChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders page numbers', () => {
    render(<Pagination {...defaultProps} />)

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('highlights current page', () => {
    render(<Pagination {...defaultProps} currentPage={3} />)

    const currentButton = screen.getByLabelText('Page 3')
    expect(currentButton).toHaveAttribute('aria-current', 'page')
  })

  it('disables previous button on first page', () => {
    render(<Pagination {...defaultProps} currentPage={1} />)

    const prevButton = screen.getByLabelText('Previous page')
    expect(prevButton).toBeDisabled()
  })

  it('disables next button on last page', () => {
    render(<Pagination {...defaultProps} currentPage={10} />)

    const nextButton = screen.getByLabelText('Next page')
    expect(nextButton).toBeDisabled()
  })

  it('calls onPageChange when clicking a page number', () => {
    const onPageChange = vi.fn()
    render(<Pagination {...defaultProps} onPageChange={onPageChange} currentPage={1} />)

    fireEvent.click(screen.getByLabelText('Page 2'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('calls onPageChange when clicking next', () => {
    const onPageChange = vi.fn()
    render(<Pagination {...defaultProps} onPageChange={onPageChange} currentPage={3} />)

    fireEvent.click(screen.getByLabelText('Next page'))
    expect(onPageChange).toHaveBeenCalledWith(4)
  })

  it('calls onPageChange when clicking previous', () => {
    const onPageChange = vi.fn()
    render(<Pagination {...defaultProps} onPageChange={onPageChange} currentPage={3} />)

    fireEvent.click(screen.getByLabelText('Previous page'))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('does not call onPageChange for current page', () => {
    const onPageChange = vi.fn()
    render(<Pagination {...defaultProps} onPageChange={onPageChange} currentPage={3} />)

    fireEvent.click(screen.getByLabelText('Page 3'))
    expect(onPageChange).not.toHaveBeenCalled()
  })

  it('renders nothing when totalPages is 1', () => {
    const { container } = render(<Pagination {...defaultProps} totalPages={1} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when totalPages is 0', () => {
    const { container } = render(<Pagination {...defaultProps} totalPages={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows ellipsis when many pages', () => {
    render(<Pagination {...defaultProps} currentPage={5} totalPages={20} />)

    const ellipses = screen.getAllByText('...')
    expect(ellipses.length).toBeGreaterThanOrEqual(1)
  })

  it('navigates to first page', () => {
    const onPageChange = vi.fn()
    render(<Pagination {...defaultProps} onPageChange={onPageChange} currentPage={5} />)

    fireEvent.click(screen.getByLabelText('First page'))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('navigates to last page', () => {
    const onPageChange = vi.fn()
    render(<Pagination {...defaultProps} onPageChange={onPageChange} currentPage={5} />)

    fireEvent.click(screen.getByLabelText('Last page'))
    expect(onPageChange).toHaveBeenCalledWith(10)
  })

  it('has proper aria-label for navigation', () => {
    render(<Pagination {...defaultProps} />)

    expect(screen.getByRole('navigation')).toHaveAttribute('aria-label', 'Pagination')
  })

  it('accepts custom className', () => {
    const { container } = render(<Pagination {...defaultProps} className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })
})
