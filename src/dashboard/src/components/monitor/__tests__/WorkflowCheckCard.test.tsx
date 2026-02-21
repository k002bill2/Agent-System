import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkflowCheckCard } from '../WorkflowCheckCard'
import type { WorkflowCheck } from '../../../types/monitoring'

// Mock lucide-react icons with explicit named exports
vi.mock('lucide-react', () => ({
  CheckCircle2: (props: Record<string, unknown>) => <svg data-testid="icon-check-circle" {...props} />,
  XCircle: (props: Record<string, unknown>) => <svg data-testid="icon-x-circle" {...props} />,
  Loader2: (props: Record<string, unknown>) => <svg data-testid="icon-loader" {...props} />,
  Clock: (props: Record<string, unknown>) => <svg data-testid="icon-clock" {...props} />,
  Play: (props: Record<string, unknown>) => <svg data-testid="icon-play" {...props} />,
  Workflow: (props: Record<string, unknown>) => <svg data-testid="icon-workflow" {...props} />,
}))

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function makeWorkflow(overrides: Partial<WorkflowCheck> = {}): WorkflowCheck {
  return {
    id: 'wf-1',
    name: 'Deploy Pipeline',
    description: 'Run deployment pipeline',
    status: 'idle',
    lastRunAt: null,
    lastRunDuration: null,
    ...overrides,
  }
}

const defaultProps = {
  workflow: makeWorkflow(),
  isRunning: false,
  onRun: vi.fn(),
  onClick: vi.fn(),
  isSelected: false,
}

describe('WorkflowCheckCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── Name rendering ──────────────────────────────────────

  it('renders workflow name', () => {
    render(<WorkflowCheckCard {...defaultProps} />)
    expect(screen.getByText('Deploy Pipeline')).toBeInTheDocument()
  })

  it('renders workflow name with title attribute for truncation', () => {
    render(<WorkflowCheckCard {...defaultProps} />)
    const nameElement = screen.getByText('Deploy Pipeline')
    expect(nameElement).toHaveAttribute('title', 'Deploy Pipeline')
  })

  // ─── Status: idle ────────────────────────────────────────

  it('shows "Not run" text for idle status', () => {
    render(<WorkflowCheckCard {...defaultProps} workflow={makeWorkflow({ status: 'idle' })} />)
    expect(screen.getByText('Not run')).toBeInTheDocument()
  })

  it('shows clock icon for idle status', () => {
    render(<WorkflowCheckCard {...defaultProps} workflow={makeWorkflow({ status: 'idle' })} />)
    expect(screen.getByTestId('icon-clock')).toBeInTheDocument()
  })

  // ─── Status: success ─────────────────────────────────────

  it('shows "Completed" text for success status', () => {
    render(<WorkflowCheckCard {...defaultProps} workflow={makeWorkflow({ status: 'success' })} />)
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('shows check circle icon for success status', () => {
    render(<WorkflowCheckCard {...defaultProps} workflow={makeWorkflow({ status: 'success' })} />)
    expect(screen.getByTestId('icon-check-circle')).toBeInTheDocument()
  })

  // ─── Status: failure ─────────────────────────────────────

  it('shows "Failed" text for failure status', () => {
    render(<WorkflowCheckCard {...defaultProps} workflow={makeWorkflow({ status: 'failure' })} />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('shows x-circle icon for failure status', () => {
    render(<WorkflowCheckCard {...defaultProps} workflow={makeWorkflow({ status: 'failure' })} />)
    expect(screen.getByTestId('icon-x-circle')).toBeInTheDocument()
  })

  // ─── Running state ───────────────────────────────────────

  it('shows "Running..." text when isRunning is true', () => {
    render(<WorkflowCheckCard {...defaultProps} isRunning={true} />)
    expect(screen.getByText('Running...')).toBeInTheDocument()
  })

  it('shows loader icon when isRunning is true', () => {
    render(<WorkflowCheckCard {...defaultProps} isRunning={true} />)
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument()
  })

  it('overrides status icon with loader when isRunning and status is success', () => {
    render(
      <WorkflowCheckCard
        {...defaultProps}
        workflow={makeWorkflow({ status: 'success' })}
        isRunning={true}
      />
    )
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument()
    expect(screen.queryByTestId('icon-check-circle')).not.toBeInTheDocument()
  })

  // ─── Duration formatting ─────────────────────────────────

  it('does not display duration when lastRunDuration is null', () => {
    render(<WorkflowCheckCard {...defaultProps} workflow={makeWorkflow({ lastRunDuration: null })} />)
    expect(screen.queryByText(/ms$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^\d+\.\d+s$/)).not.toBeInTheDocument()
  })

  it('displays duration in milliseconds when less than 1 second', () => {
    render(
      <WorkflowCheckCard
        {...defaultProps}
        workflow={makeWorkflow({ lastRunDuration: 0.5 })}
      />
    )
    expect(screen.getByText('500ms')).toBeInTheDocument()
  })

  it('displays duration in seconds when >= 1 second', () => {
    render(
      <WorkflowCheckCard
        {...defaultProps}
        workflow={makeWorkflow({ lastRunDuration: 3.5 })}
      />
    )
    expect(screen.getByText('3.5s')).toBeInTheDocument()
  })

  it('displays duration of exactly 1 second', () => {
    render(
      <WorkflowCheckCard
        {...defaultProps}
        workflow={makeWorkflow({ lastRunDuration: 1.0 })}
      />
    )
    expect(screen.getByText('1.0s')).toBeInTheDocument()
  })

  // ─── onClick ─────────────────────────────────────────────

  it('calls onClick when card is clicked', () => {
    const onClick = vi.fn()
    render(<WorkflowCheckCard {...defaultProps} onClick={onClick} />)
    fireEvent.click(screen.getByText('Deploy Pipeline').closest('div[class]')!)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  // ─── onRun button ────────────────────────────────────────

  it('calls onRun when play button is clicked', () => {
    const onRun = vi.fn()
    render(<WorkflowCheckCard {...defaultProps} onRun={onRun} />)
    const button = screen.getByTitle('Run Deploy Pipeline')
    fireEvent.click(button)
    expect(onRun).toHaveBeenCalledTimes(1)
  })

  it('does not propagate click to onClick when run button is clicked', () => {
    const onRun = vi.fn()
    const onClick = vi.fn()
    render(<WorkflowCheckCard {...defaultProps} onRun={onRun} onClick={onClick} />)
    const button = screen.getByTitle('Run Deploy Pipeline')
    fireEvent.click(button)
    expect(onRun).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('disables run button when isRunning is true', () => {
    render(<WorkflowCheckCard {...defaultProps} isRunning={true} />)
    const button = screen.getByTitle('Run Deploy Pipeline')
    expect(button).toBeDisabled()
  })

  it('enables run button when isRunning is false', () => {
    render(<WorkflowCheckCard {...defaultProps} isRunning={false} />)
    const button = screen.getByTitle('Run Deploy Pipeline')
    expect(button).not.toBeDisabled()
  })

  // ─── isSelected ───────────────────────────────────────────

  it('applies ring class when isSelected is true', () => {
    const { container } = render(
      <WorkflowCheckCard {...defaultProps} isSelected={true} />
    )
    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('ring-2')
  })

  it('does not apply ring class when isSelected is false', () => {
    const { container } = render(
      <WorkflowCheckCard {...defaultProps} isSelected={false} />
    )
    const card = container.firstChild as HTMLElement
    expect(card.className).not.toContain('ring-2')
  })

  // ─── Workflow icon ────────────────────────────────────────

  it('renders workflow icon', () => {
    render(<WorkflowCheckCard {...defaultProps} />)
    expect(screen.getByTestId('icon-workflow')).toBeInTheDocument()
  })

  // ─── Different workflow names ─────────────────────────────

  it('renders custom workflow name', () => {
    render(
      <WorkflowCheckCard
        {...defaultProps}
        workflow={makeWorkflow({ name: 'Lint Check' })}
      />
    )
    expect(screen.getByText('Lint Check')).toBeInTheDocument()
    expect(screen.getByTitle('Run Lint Check')).toBeInTheDocument()
  })
})
