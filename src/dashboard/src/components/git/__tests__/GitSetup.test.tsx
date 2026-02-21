import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GitSetup } from '../GitSetup'
import type { GitStatus } from '../../../stores/git'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  GitBranch: (props: Record<string, unknown>) => <span data-testid="icon-GitBranch" {...props} />,
  FolderGit: (props: Record<string, unknown>) => <span data-testid="icon-FolderGit" {...props} />,
  Check: (props: Record<string, unknown>) => <span data-testid="icon-Check" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <span data-testid="icon-AlertCircle" {...props} />,
  Loader2: (props: Record<string, unknown>) => <span data-testid="icon-Loader2" {...props} />,
  Plus: (props: Record<string, unknown>) => <span data-testid="icon-Plus" {...props} />,
  Database: (props: Record<string, unknown>) => <span data-testid="icon-Database" {...props} />,
  Trash2: (props: Record<string, unknown>) => <span data-testid="icon-Trash2" {...props} />,
}))

// Mock the git store
const mockFetchRepositories = vi.fn()
const mockCreateRepository = vi.fn()
const mockDeleteRepository = vi.fn()

vi.mock('../../../stores/git', () => ({
  useGitStore: vi.fn(() => ({
    repositories: [],
    fetchRepositories: mockFetchRepositories,
    createRepository: mockCreateRepository,
    deleteRepository: mockDeleteRepository,
  })),
}))

describe('GitSetup', () => {
  const defaultProps = {
    projectId: 'proj-1',
    projectName: 'My Project',
    projectPath: '/home/user/my-project',
    gitStatus: null as GitStatus | null,
    isLoading: false,
    onUpdateGitPath: vi.fn().mockResolvedValue(true),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders setup heading', () => {
    render(<GitSetup {...defaultProps} />)
    expect(screen.getByText('Git 저장소 설정')).toBeInTheDocument()
  })

  it('displays project name in description', () => {
    render(<GitSetup {...defaultProps} />)
    expect(screen.getByText('My Project 프로젝트의 Git 저장소를 설정합니다')).toBeInTheDocument()
  })

  it('shows project path option', () => {
    render(<GitSetup {...defaultProps} />)
    expect(screen.getByText('프로젝트 경로 사용')).toBeInTheDocument()
    expect(screen.getByText('/home/user/my-project')).toBeInTheDocument()
  })

  it('shows registered repository option', () => {
    render(<GitSetup {...defaultProps} />)
    expect(screen.getByText('등록된 저장소에서 선택')).toBeInTheDocument()
  })

  it('shows custom path option', () => {
    render(<GitSetup {...defaultProps} />)
    expect(screen.getByText('다른 경로 지정')).toBeInTheDocument()
  })

  it('shows valid repo status badge when git is valid', () => {
    const gitStatus: GitStatus = {
      project_id: 'proj-1',
      git_enabled: true,
      git_path: '/home/user/my-project',
      effective_git_path: '/home/user/my-project',
      is_valid_repo: true,
      current_branch: 'main',
      error: null,
    }
    render(<GitSetup {...defaultProps} gitStatus={gitStatus} />)
    expect(screen.getByText('Git 저장소 연결됨')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('shows invalid repo status when git is not valid', () => {
    const gitStatus: GitStatus = {
      project_id: 'proj-1',
      git_enabled: true,
      git_path: null,
      effective_git_path: '/home/user/my-project',
      is_valid_repo: false,
      current_branch: null,
      error: null,
    }
    render(<GitSetup {...defaultProps} gitStatus={gitStatus} />)
    expect(screen.getByText('Git 저장소가 설정되지 않았습니다')).toBeInTheDocument()
  })

  it('does not show status badge when gitStatus is null', () => {
    render(<GitSetup {...defaultProps} gitStatus={null} />)
    expect(screen.queryByText('Git 저장소 연결됨')).not.toBeInTheDocument()
    expect(screen.queryByText('Git 저장소가 설정되지 않았습니다')).not.toBeInTheDocument()
  })

  it('shows save button', () => {
    render(<GitSetup {...defaultProps} />)
    expect(screen.getByText('저장')).toBeInTheDocument()
  })

  it('calls onUpdateGitPath with null when project path is selected', async () => {
    render(<GitSetup {...defaultProps} />)
    fireEvent.click(screen.getByText('저장'))
    await waitFor(() => {
      expect(defaultProps.onUpdateGitPath).toHaveBeenCalledWith(null)
    })
  })

  it('shows custom path input when custom option is selected', () => {
    render(<GitSetup {...defaultProps} />)
    // Click on the custom path radio
    const customLabel = screen.getByText('다른 경로 지정')
    fireEvent.click(customLabel)
    expect(screen.getByPlaceholderText('/path/to/git/repository')).toBeInTheDocument()
  })

  it('shows help text section', () => {
    render(<GitSetup {...defaultProps} />)
    expect(screen.getByText('도움말')).toBeInTheDocument()
  })

  it('fetches repositories on mount', () => {
    render(<GitSetup {...defaultProps} />)
    expect(mockFetchRepositories).toHaveBeenCalledTimes(1)
  })
})
