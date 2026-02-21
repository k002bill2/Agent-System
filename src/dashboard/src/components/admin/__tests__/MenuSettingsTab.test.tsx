import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MenuSettingsTab } from '../MenuSettingsTab'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Save: (props: Record<string, unknown>) => <span data-testid="icon-save" {...props} />,
  Check: (props: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  GripVertical: (props: Record<string, unknown>) => <span data-testid="icon-grip" {...props} />,
}))

// Mock the menuVisibility store
vi.mock('../../../stores/menuVisibility', () => ({
  useMenuVisibilityStore: {
    setState: vi.fn(),
  },
}))

const mockFetchMenuVisibilityData = vi.fn()
const mockSaveMenuVisibility = vi.fn()

vi.mock('../api', () => ({
  fetchMenuVisibilityData: (...args: unknown[]) => mockFetchMenuVisibilityData(...args),
  saveMenuVisibility: (...args: unknown[]) => mockSaveMenuVisibility(...args),
}))

const mockVisibilityData = {
  visibility: {
    dashboard: { user: true, manager: true, admin: true },
    projects: { user: true, manager: true, admin: true },
    tasks: { user: false, manager: true, admin: true },
  },
  menu_order: ['dashboard', 'projects', 'tasks'],
}

describe('MenuSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state initially', () => {
    mockFetchMenuVisibilityData.mockReturnValue(new Promise(() => {}))
    render(<MenuSettingsTab />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders menu settings after loading', async () => {
    mockFetchMenuVisibilityData.mockResolvedValue(mockVisibilityData)
    render(<MenuSettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('\uBA54\uB274 \uB178\uCD9C \uC124\uC815')).toBeInTheDocument() // 메뉴 노출 설정
    })
  })

  it('renders the save button', async () => {
    mockFetchMenuVisibilityData.mockResolvedValue(mockVisibilityData)
    render(<MenuSettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('\uC800\uC7A5')).toBeInTheDocument() // 저장
    })
  })

  it('renders error state on failure', async () => {
    mockFetchMenuVisibilityData.mockRejectedValue(new Error('Load failed'))
    render(<MenuSettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Load failed')).toBeInTheDocument()
    })
  })

  it('renders role column headers', async () => {
    mockFetchMenuVisibilityData.mockResolvedValue(mockVisibilityData)
    render(<MenuSettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('\uC77C\uBC18')).toBeInTheDocument() // 일반
      expect(screen.getByText('\uAD00\uB9AC\uC790')).toBeInTheDocument() // 관리자
      expect(screen.getByText('\uCD5C\uACE0\uAD00\uB9AC\uC790')).toBeInTheDocument() // 최고관리자
    })
  })

  it('renders menu names from MENU_LABELS', async () => {
    mockFetchMenuVisibilityData.mockResolvedValue(mockVisibilityData)
    render(<MenuSettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Projects')).toBeInTheDocument()
      expect(screen.getByText('Tasks')).toBeInTheDocument()
    })
  })

  it('renders checkboxes for each menu-role combination', async () => {
    mockFetchMenuVisibilityData.mockResolvedValue(mockVisibilityData)
    render(<MenuSettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    // 3 menus x 3 roles = 9 checkboxes
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBe(9)
  })

  it('disables admin role checkboxes', async () => {
    mockFetchMenuVisibilityData.mockResolvedValue(mockVisibilityData)
    render(<MenuSettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    const checkboxes = screen.getAllByRole('checkbox')
    // Every 3rd checkbox is the admin column (index 2, 5, 8)
    expect(checkboxes[2]).toBeDisabled()
    expect(checkboxes[5]).toBeDisabled()
    expect(checkboxes[8]).toBeDisabled()
  })

  it('shows unsaved changes indicator after toggling a checkbox', async () => {
    mockFetchMenuVisibilityData.mockResolvedValue(mockVisibilityData)
    render(<MenuSettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    // Click a non-admin checkbox to toggle
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // user role for dashboard

    expect(screen.getByText('\uC800\uC7A5\uB418\uC9C0 \uC54A\uC740 \uBCC0\uACBD\uC0AC\uD56D')).toBeInTheDocument() // 저장되지 않은 변경사항
  })

  it('calls saveMenuVisibility on save button click', async () => {
    mockFetchMenuVisibilityData.mockResolvedValue(mockVisibilityData)
    mockSaveMenuVisibility.mockResolvedValue(mockVisibilityData)

    render(<MenuSettingsTab />)

    await waitFor(() => {
      expect(screen.getByText('\uC800\uC7A5')).toBeInTheDocument() // 저장
    })

    fireEvent.click(screen.getByText('\uC800\uC7A5'))

    await waitFor(() => {
      expect(mockSaveMenuVisibility).toHaveBeenCalledTimes(1)
    })
  })
})
