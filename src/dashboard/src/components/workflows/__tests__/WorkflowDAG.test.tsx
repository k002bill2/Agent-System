import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkflowDAG } from '../WorkflowDAG'
import type { WorkflowDefinition } from '../../../types/workflow'

const mockDefinition: WorkflowDefinition = {
  name: 'CI Pipeline',
  jobs: {
    lint: {
      steps: [{ name: 'Run linter', run: 'echo lint' }],
    },
    test: {
      needs: ['lint'],
      steps: [
        { name: 'Run tests', run: 'echo test' },
        { name: 'Coverage', run: 'echo coverage' },
      ],
    },
    build: {
      needs: ['test'],
      steps: [{ name: 'Build', run: 'echo build' }],
      environment: 'production',
    },
  },
}

describe('WorkflowDAG', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when no jobs defined', () => {
    const emptyDef: WorkflowDefinition = { name: 'Empty', jobs: {} }
    render(<WorkflowDAG definition={emptyDef} />)
    expect(screen.getByText('No jobs defined')).toBeInTheDocument()
  })

  it('renders job names', () => {
    render(<WorkflowDAG definition={mockDefinition} />)
    expect(screen.getByText('lint')).toBeInTheDocument()
    expect(screen.getByText('test')).toBeInTheDocument()
    expect(screen.getByText('build')).toBeInTheDocument()
  })

  it('shows step counts for each job', () => {
    render(<WorkflowDAG definition={mockDefinition} />)
    // lint has 1 step, build has 1 step -> two "1 steps" elements
    expect(screen.getAllByText('1 steps')).toHaveLength(2)
    // test has 2 steps
    expect(screen.getByText('2 steps')).toBeInTheDocument()
  })

  it('renders with active job statuses', () => {
    const statuses = { lint: 'success', test: 'running', build: 'queued' }
    const { container } = render(
      <WorkflowDAG definition={mockDefinition} activeJobStatuses={statuses} />
    )
    // Success should have green border
    expect(container.querySelector('.border-green-500')).toBeInTheDocument()
    // Running should have blue border with pulse
    expect(container.querySelector('.border-blue-500')).toBeInTheDocument()
  })

  it('shows environment indicator for jobs with environment', () => {
    render(<WorkflowDAG definition={mockDefinition} />)
    // The build job has environment: 'production', which shows a Shield icon with a title
    const shieldContainer = screen.getByTitle('Environment: production')
    expect(shieldContainer).toBeInTheDocument()
  })

  it('renders matrix indicator when job has matrix', () => {
    const defWithMatrix: WorkflowDefinition = {
      name: 'Matrix',
      jobs: {
        test: {
          steps: [{ name: 'Test', run: 'echo test' }],
          matrix: { python: ['3.9', '3.10'] },
        },
      },
    }
    render(<WorkflowDAG definition={defWithMatrix} />)
    expect(screen.getByText(/matrix/)).toBeInTheDocument()
  })
})
