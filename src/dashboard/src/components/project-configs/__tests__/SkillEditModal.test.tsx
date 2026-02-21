import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillEditModal } from '../SkillEditModal'

const mockCloseSkillModal = vi.fn()
const mockCreateSkill = vi.fn()
const mockUpdateSkill = vi.fn()
const mockClearError = vi.fn()

let mockStoreState: Record<string, unknown> = {}

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => mockStoreState,
}))

describe('SkillEditModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      skillModalMode: null,
      editingSkill: null,
      selectedProject: {
        project: { project_id: 'proj-1' },
      },
      skillContent: null,
      isLoadingContent: false,
      savingSkill: false,
      error: null,
      closeSkillModal: mockCloseSkillModal,
      createSkill: mockCreateSkill,
      updateSkill: mockUpdateSkill,
      clearError: mockClearError,
    }
  })

  it('returns null when skillModalMode is null', () => {
    const { container } = render(<SkillEditModal />)
    expect(container.firstChild).toBeNull()
  })

  it('renders create modal with correct title', () => {
    mockStoreState.skillModalMode = 'create'
    render(<SkillEditModal />)
    expect(screen.getByRole('heading', { name: 'Create Skill' })).toBeInTheDocument()
  })

  it('renders edit modal with skill name', () => {
    mockStoreState.skillModalMode = 'edit'
    mockStoreState.editingSkill = {
      skill_id: 'web-skill',
      project_id: 'proj-1',
      name: 'Web Skill',
      description: 'A web skill',
      file_path: '/path',
      tools: ['Read', 'Write'],
      model: 'sonnet',
      version: null,
      author: null,
      has_references: false,
      has_scripts: false,
      has_assets: false,
      created_at: null,
      modified_at: null,
    }
    render(<SkillEditModal />)
    expect(screen.getByText('Edit Skill: Web Skill')).toBeInTheDocument()
  })

  it('shows Skill ID input in create mode', () => {
    mockStoreState.skillModalMode = 'create'
    render(<SkillEditModal />)
    expect(screen.getByText('Skill ID *')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('my-skill')).toBeInTheDocument()
  })

  it('does not show Skill ID input in edit mode', () => {
    mockStoreState.skillModalMode = 'edit'
    mockStoreState.editingSkill = {
      skill_id: 'web-skill',
      project_id: 'proj-1',
      name: 'Web Skill',
      description: null,
      file_path: '/path',
      tools: [],
      model: null,
      version: null,
      author: null,
      has_references: false,
      has_scripts: false,
      has_assets: false,
      created_at: null,
      modified_at: null,
    }
    render(<SkillEditModal />)
    expect(screen.queryByText('Skill ID *')).not.toBeInTheDocument()
  })

  it('shows loading state when content is loading', () => {
    mockStoreState.skillModalMode = 'edit'
    mockStoreState.editingSkill = {
      skill_id: 'web-skill',
      project_id: 'proj-1',
      name: 'Web Skill',
      description: null,
      file_path: '/path',
      tools: [],
      model: null,
      version: null,
      author: null,
      has_references: false,
      has_scripts: false,
      has_assets: false,
      created_at: null,
      modified_at: null,
    }
    mockStoreState.isLoadingContent = true
    render(<SkillEditModal />)
    expect(screen.getByText('Loading content...')).toBeInTheDocument()
  })

  it('shows error message when error exists', () => {
    mockStoreState.skillModalMode = 'create'
    mockStoreState.error = 'Failed to create skill'
    render(<SkillEditModal />)
    expect(screen.getByText('Failed to create skill')).toBeInTheDocument()
  })

  it('calls closeSkillModal when Cancel clicked', () => {
    mockStoreState.skillModalMode = 'create'
    render(<SkillEditModal />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(mockCloseSkillModal).toHaveBeenCalledTimes(1)
  })

  it('toggles preview mode', () => {
    mockStoreState.skillModalMode = 'create'
    render(<SkillEditModal />)
    expect(screen.getByText('Preview')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Preview'))
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('shows correct submit button text for create/edit modes', () => {
    mockStoreState.skillModalMode = 'create'
    const { rerender } = render(<SkillEditModal />)
    expect(screen.getByRole('button', { name: /Create Skill/i })).toBeInTheDocument()

    mockStoreState.skillModalMode = 'edit'
    mockStoreState.editingSkill = {
      skill_id: 'web-skill',
      project_id: 'proj-1',
      name: 'Web Skill',
      description: null,
      file_path: '/path',
      tools: [],
      model: null,
      version: null,
      author: null,
      has_references: false,
      has_scripts: false,
      has_assets: false,
      created_at: null,
      modified_at: null,
    }
    rerender(<SkillEditModal />)
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument()
  })

  it('disables submit button when saving', () => {
    mockStoreState.skillModalMode = 'create'
    mockStoreState.savingSkill = true
    render(<SkillEditModal />)
    const buttons = screen.getAllByRole('button')
    const submitButton = buttons.find(b => b.getAttribute('type') === 'submit')
    expect(submitButton).toBeDisabled()
  })

  it('shows SKILL.md Content textarea in create mode', () => {
    mockStoreState.skillModalMode = 'create'
    render(<SkillEditModal />)
    expect(screen.getByText('SKILL.md Content *')).toBeInTheDocument()
  })
})
