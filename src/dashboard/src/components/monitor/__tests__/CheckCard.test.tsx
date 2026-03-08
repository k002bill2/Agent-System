import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CheckCard } from '../CheckCard'

// Mock lucide-react icons with explicit named exports
vi.mock('lucide-react', () => ({
  CheckCircle2: (props: Record<string, unknown>) => <svg data-testid="icon-check-circle" {...props} />,
  XCircle: (props: Record<string, unknown>) => <svg data-testid="icon-x-circle" {...props} />,
  Loader2: (props: Record<string, unknown>) => <svg data-testid="icon-loader" {...props} />,
  Clock: (props: Record<string, unknown>) => <svg data-testid="icon-clock" {...props} />,
  Play: (props: Record<string, unknown>) => <svg data-testid="icon-play" {...props} />,
}))

const defaultProps = {
  checkType: 'test' as const,
  label: 'Test',
  status: 'idle' as const,
  exitCode: null,
  durationMs: null,
  isRunning: false,
  onRun: vi.fn(),
  onClick: vi.fn(),
  isSelected: false,
}

describe('CheckCard', () => {
  it('renders check type label', () => {
    render(<CheckCard {...defaultProps} />)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })

  it('shows "Not run" for idle status', () => {
    render(<CheckCard {...defaultProps} status="idle" />)
    expect(screen.getByText('Not run')).toBeInTheDocument()
  })

  it('shows "Pass" for success status', () => {
    render(<CheckCard {...defaultProps} status="success" />)
    expect(screen.getByText('Pass')).toBeInTheDocument()
  })

  it('shows "Failed (1)" for failure status with exit code', () => {
    render(<CheckCard {...defaultProps} status="failure" exitCode={1} />)
    expect(screen.getByText('Failed (1)')).toBeInTheDocument()
  })

  it('shows "Running..." when isRunning is true', () => {
    render(<CheckCard {...defaultProps} isRunning={true} />)
    expect(screen.getByText('Running...')).toBeInTheDocument()
  })

  it('displays duration in ms when less than 1000', () => {
    render(<CheckCard {...defaultProps} durationMs={500} />)
    expect(screen.getByText('500ms')).toBeInTheDocument()
  })

  it('displays duration in seconds when >= 1000', () => {
    render(<CheckCard {...defaultProps} durationMs={3500} />)
    expect(screen.getByText('3.5s')).toBeInTheDocument()
  })

  it('does not display duration when null', () => {
    render(<CheckCard {...defaultProps} durationMs={null} />)
    expect(screen.queryByText(/ms|s$/)).not.toBeInTheDocument()
  })

  it('calls onClick when card is clicked', () => {
    const onClick = vi.fn()
    render(<CheckCard {...defaultProps} onClick={onClick} />)
    fireEvent.click(screen.getByText('Test').closest('div')!.parentElement!.parentElement!)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('calls onRun when play button is clicked (without propagation)', () => {
    const onRun = vi.fn()
    const onClick = vi.fn()
    render(<CheckCard {...defaultProps} onRun={onRun} onClick={onClick} />)
    const button = screen.getByTitle('Run Test')
    fireEvent.click(button)
    expect(onRun).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('disables run button when isRunning', () => {
    render(<CheckCard {...defaultProps} isRunning={true} />)
    const button = screen.getByTitle('Run Test')
    expect(button).toBeDisabled()
  })

  it('renders different check types', () => {
    const { rerender } = render(<CheckCard {...defaultProps} checkType="lint" label="Lint" />)
    expect(screen.getByText('Lint')).toBeInTheDocument()

    rerender(<CheckCard {...defaultProps} checkType="typecheck" label="TypeCheck" />)
    expect(screen.getByText('TypeCheck')).toBeInTheDocument()

    rerender(<CheckCard {...defaultProps} checkType="build" label="Build" />)
    expect(screen.getByText('Build')).toBeInTheDocument()
  })
})
