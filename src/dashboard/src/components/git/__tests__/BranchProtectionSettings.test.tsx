import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BranchProtectionSettings } from '../BranchProtectionSettings'
import type { BranchProtectionRule } from '../../../stores/git'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Shield: (props: Record<string, unknown>) => <span data-testid="icon-Shield" {...props} />,
  Plus: (props: Record<string, unknown>) => <span data-testid="icon-Plus" {...props} />,
  Trash2: (props: Record<string, unknown>) => <span data-testid="icon-Trash2" {...props} />,
  Edit2: (props: Record<string, unknown>) => <span data-testid="icon-Edit2" {...props} />,
  Check: (props: Record<string, unknown>) => <span data-testid="icon-Check" {...props} />,
  Rocket: (props: Record<string, unknown>) => <span data-testid="icon-Rocket" {...props} />,
}))

function makeRule(overrides: Partial<BranchProtectionRule> = {}): BranchProtectionRule {
  return {
    id: 'rule-1',
    project_id: 'proj-1',
    branch_pattern: 'main',
    require_approvals: 1,
    require_no_conflicts: true,
    allowed_merge_roles: ['owner', 'admin'],
    allow_force_push: false,
    allow_deletion: false,
    auto_deploy: false,
    deploy_workflow: null,
    enabled: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('BranchProtectionSettings', () => {
  const defaultProps = {
    rules: [makeRule()],
    isLoading: false,
    onCreateRule: vi.fn().mockResolvedValue(true),
    onUpdateRule: vi.fn().mockResolvedValue(true),
    onDeleteRule: vi.fn().mockResolvedValue(true),
    onRefresh: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the heading with rule count', () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    expect(screen.getByText('Branch Protection Rules')).toBeInTheDocument()
    expect(screen.getByText('(1)')).toBeInTheDocument()
  })

  it('displays branch pattern for each rule', () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('shows empty state when no rules exist', () => {
    render(<BranchProtectionSettings {...defaultProps} rules={[]} />)
    expect(screen.getByText('No branch protection rules configured')).toBeInTheDocument()
    expect(screen.getByText('Default protection applies to main and master branches')).toBeInTheDocument()
  })

  it('shows "Disabled" badge for disabled rules', () => {
    const disabledRule = makeRule({ enabled: false })
    render(<BranchProtectionSettings {...defaultProps} rules={[disabledRule]} />)
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('shows "Auto-deploy" badge when auto_deploy is true', () => {
    const deployRule = makeRule({ auto_deploy: true, deploy_workflow: 'deploy.yml' })
    render(<BranchProtectionSettings {...defaultProps} rules={[deployRule]} />)
    expect(screen.getByText('Auto-deploy')).toBeInTheDocument()
  })

  it('shows approval count info', () => {
    const rule = makeRule({ require_approvals: 2 })
    render(<BranchProtectionSettings {...defaultProps} rules={[rule]} />)
    expect(screen.getByText('2 approvals required')).toBeInTheDocument()
  })

  it('shows "No conflicts required" info', () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    expect(screen.getByText('No conflicts required')).toBeInTheDocument()
  })

  it('shows allowed merge roles', () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    expect(screen.getByText('Roles: owner, admin')).toBeInTheDocument()
  })

  it('calls onRefresh when Refresh button is clicked', () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    fireEvent.click(screen.getByText('Refresh'))
    expect(defaultProps.onRefresh).toHaveBeenCalledTimes(1)
  })

  it('opens create form when "Add Rule" is clicked', () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    fireEvent.click(screen.getByText('Add Rule'))
    expect(screen.getByText('Branch Pattern *')).toBeInTheDocument()
    expect(screen.getByText('Required Approvals')).toBeInTheDocument()
  })

  it('hides Add Rule button when create form is open', () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    fireEvent.click(screen.getByText('Add Rule'))
    expect(screen.queryByText('Add Rule')).not.toBeInTheDocument()
  })

  it('closes create form when Cancel is clicked', () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    fireEvent.click(screen.getByText('Add Rule'))
    expect(screen.getByText('Branch Pattern *')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Branch Pattern *')).not.toBeInTheDocument()
  })

  it('disables Create button when branch pattern is empty', () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    fireEvent.click(screen.getByText('Add Rule'))
    const createBtn = screen.getByText('Create')
    expect(createBtn).toBeDisabled()
  })

  it('calls onCreateRule on form submit with branch pattern', async () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    fireEvent.click(screen.getByText('Add Rule'))

    const input = screen.getByPlaceholderText('main, release/*, feature/*')
    fireEvent.change(input, { target: { value: 'release/*' } })
    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => {
      expect(defaultProps.onCreateRule).toHaveBeenCalledTimes(1)
      expect(defaultProps.onCreateRule).toHaveBeenCalledWith(
        expect.objectContaining({ branch_pattern: 'release/*' })
      )
    })
  })

  it('opens edit form when Edit button is clicked', () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    const editBtn = screen.getByTitle('Edit')
    fireEvent.click(editBtn)
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('calls onUpdateRule when save is clicked in edit mode', async () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Edit'))

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(defaultProps.onUpdateRule).toHaveBeenCalledWith(
        'rule-1',
        expect.objectContaining({ branch_pattern: 'main' })
      )
    })
  })

  it('cancels edit form when Cancel is clicked', () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Edit'))
    expect(screen.getByText('Save')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Save')).not.toBeInTheDocument()
  })

  it('calls onDeleteRule when Delete is confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<BranchProtectionSettings {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Delete'))

    await waitFor(() => {
      expect(defaultProps.onDeleteRule).toHaveBeenCalledWith('rule-1')
    })

    vi.restoreAllMocks()
  })

  it('does not call onDeleteRule when Delete is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<BranchProtectionSettings {...defaultProps} />)
    fireEvent.click(screen.getByTitle('Delete'))
    expect(defaultProps.onDeleteRule).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('displays multiple rules', () => {
    const rules = [
      makeRule({ id: 'r1', branch_pattern: 'main' }),
      makeRule({ id: 'r2', branch_pattern: 'release/*' }),
    ]
    render(<BranchProtectionSettings {...defaultProps} rules={rules} />)
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('release/*')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
  })

  it('shows role toggle buttons in create form', () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    fireEvent.click(screen.getByText('Add Rule'))
    expect(screen.getByText('owner')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('manager')).toBeInTheDocument()
    expect(screen.getByText('member')).toBeInTheDocument()
    expect(screen.getByText('viewer')).toBeInTheDocument()
  })

  it('shows auto-deploy section in create form', () => {
    render(<BranchProtectionSettings {...defaultProps} />)
    fireEvent.click(screen.getByText('Add Rule'))
    expect(screen.getByText('Auto-Deploy')).toBeInTheDocument()
    expect(screen.getByText('Enable auto-deploy on merge')).toBeInTheDocument()
  })
})
