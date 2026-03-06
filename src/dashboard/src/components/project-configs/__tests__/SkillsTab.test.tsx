import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillsTab } from '../SkillsTab'

const mockOpenSkillModal = vi.fn()
const mockDeleteSkill = vi.fn()
const mockCopySkill = vi.fn()
const mockFetchSkillContent = vi.fn()

let mockStoreState: Record<string, unknown> = {}

vi.mock('../../../stores/projectConfigs', () => ({
  useProjectConfigsStore: () => mockStoreState,
}))

// Mock child modals
vi.mock('../SkillEditModal', () => ({
  SkillEditModal: () => null,
}))
vi.mock('../ConfirmDeleteModal', () => ({
  ConfirmDeleteModal: () => null,
}))
vi.mock('../CopyToProjectModal', () => ({
  CopyToProjectModal: () => null,
}))

const mockSkills = [
  {
    skill_id: 'web-skill',
    project_id: 'proj-1',
    name: 'Web Skill',
    description: 'Handles web development tasks',
    file_path: '/path/web-skill/SKILL.md',
    tools: ['Read', 'Write', 'Bash'],
    model: 'sonnet',
    version: null,
    author: null,
    has_references: true,
    has_scripts: false,
    has_assets: false,
    created_at: null,
    modified_at: null,
  },
  {
    skill_id: 'debug-skill',
    project_id: 'proj-1',
    name: 'Debug Skill',
    description: null,
    file_path: '/path/debug-skill/SKILL.md',
    tools: ['Read'],
    model: null,
    version: null,
    author: null,
    has_references: false,
    has_scripts: true,
    has_assets: false,
    created_at: null,
    modified_at: null,
  },
]

describe('SkillsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      selectedProject: {
        project: { project_id: 'proj-1' },
        skills: mockSkills,
      },
      isLoadingProject: false,
      fetchSkillContent: mockFetchSkillContent,
      skillContent: null,
      isLoadingContent: false,
      openSkillModal: mockOpenSkillModal,
      deleteSkill: mockDeleteSkill,
      deletingSkills: new Set(),
      copySkill: mockCopySkill,
      globalConfigs: null,
      fetchGlobalConfigs: vi.fn(),
    }
  })

  it('shows loading skeleton when loading', () => {
    mockStoreState.isLoadingProject = true
    const { container } = render(<SkillsTab />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows empty state when no selectedProject', () => {
    mockStoreState.selectedProject = null
    render(<SkillsTab />)
    expect(screen.getByText('Select a project to view skills')).toBeInTheDocument()
  })

  it('renders skills count in header', () => {
    render(<SkillsTab />)
    expect(screen.getByText('Skills (2)')).toBeInTheDocument()
  })

  it('renders skill names', () => {
    render(<SkillsTab />)
    expect(screen.getByText('Web Skill')).toBeInTheDocument()
    expect(screen.getByText('Debug Skill')).toBeInTheDocument()
  })

  it('renders skill description', () => {
    render(<SkillsTab />)
    expect(screen.getByText('Handles web development tasks')).toBeInTheDocument()
  })

  it('renders skill model badge', () => {
    render(<SkillsTab />)
    expect(screen.getByText('sonnet')).toBeInTheDocument()
  })

  it('renders skill tools count', () => {
    render(<SkillsTab />)
    expect(screen.getByText('3 tools')).toBeInTheDocument()
    expect(screen.getByText('1 tools')).toBeInTheDocument()
  })

  it('renders references indicator', () => {
    render(<SkillsTab />)
    expect(screen.getByText('references')).toBeInTheDocument()
  })

  it('renders scripts indicator', () => {
    render(<SkillsTab />)
    expect(screen.getByText('scripts')).toBeInTheDocument()
  })

  it('shows Create Skill button', () => {
    render(<SkillsTab />)
    expect(screen.getByText('Create Skill')).toBeInTheDocument()
  })

  it('calls openSkillModal on Create Skill click', () => {
    render(<SkillsTab />)
    fireEvent.click(screen.getByText('Create Skill'))
    expect(mockOpenSkillModal).toHaveBeenCalledWith('create')
  })

  it('shows empty state when no skills', () => {
    mockStoreState.selectedProject = {
      project: { project_id: 'proj-1' },
      skills: [],
    }
    render(<SkillsTab />)
    expect(screen.getByText('No skills found in this project')).toBeInTheDocument()
  })
})
