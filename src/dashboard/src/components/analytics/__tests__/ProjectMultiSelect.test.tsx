import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Check: (props: Record<string, unknown>) => <span data-testid="icon-check" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <span data-testid="icon-chevron" {...props} />,
  X: (props: Record<string, unknown>) => <span data-testid="icon-x" {...props} />,
}))

import { ProjectMultiSelect, type Project } from '../ProjectMultiSelect'

const mockProjects: Project[] = [
  { id: 'proj-1', name: 'Project Alpha' },
  { id: 'proj-2', name: 'Project Beta' },
  { id: 'proj-3', name: 'Project Gamma' },
  { id: 'proj-4', name: 'Project Delta' },
  { id: 'proj-5', name: 'Project Epsilon' },
  { id: 'proj-6', name: 'Project Zeta' },
]

describe('ProjectMultiSelect', () => {
  const onChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders placeholder when no projects selected', () => {
    render(
      <ProjectMultiSelect
        projects={mockProjects}
        selectedIds={[]}
        onChange={onChange}
      />
    )
    expect(screen.getByText(/프로젝트 선택/)).toBeInTheDocument()
  })

  it('renders custom placeholder', () => {
    render(
      <ProjectMultiSelect
        projects={mockProjects}
        selectedIds={[]}
        onChange={onChange}
        placeholder="Select projects..."
      />
    )
    expect(screen.getByText('Select projects...')).toBeInTheDocument()
  })

  it('renders selected project names as tags', () => {
    render(
      <ProjectMultiSelect
        projects={mockProjects}
        selectedIds={['proj-1', 'proj-2']}
        onChange={onChange}
      />
    )
    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
  })

  it('opens dropdown when trigger button is clicked', () => {
    render(
      <ProjectMultiSelect
        projects={mockProjects}
        selectedIds={[]}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByText(/프로젝트 선택/))
    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
    expect(screen.getByText('Project Gamma')).toBeInTheDocument()
  })

  it('calls onChange when project is toggled on', () => {
    render(
      <ProjectMultiSelect
        projects={mockProjects}
        selectedIds={[]}
        onChange={onChange}
      />
    )
    // Open dropdown
    fireEvent.click(screen.getByText(/프로젝트 선택/))
    // Click on project
    fireEvent.click(screen.getByText('Project Alpha'))
    expect(onChange).toHaveBeenCalledWith(['proj-1'])
  })

  it('calls onChange when project is toggled off', () => {
    render(
      <ProjectMultiSelect
        projects={mockProjects}
        selectedIds={['proj-1', 'proj-2']}
        onChange={onChange}
      />
    )
    // Open dropdown
    fireEvent.click(screen.getByText('Project Alpha'))
    // Click on already-selected project in dropdown
    const dropdownItems = screen.getAllByText('Project Alpha')
    // The first one is the tag, find the one in dropdown
    fireEvent.click(dropdownItems[dropdownItems.length - 1])
    expect(onChange).toHaveBeenCalledWith(['proj-2'])
  })

  it('removes project when X button on tag is clicked', () => {
    render(
      <ProjectMultiSelect
        projects={mockProjects}
        selectedIds={['proj-1', 'proj-2']}
        onChange={onChange}
      />
    )
    // Click the X button on the first tag
    const removeButtons = screen.getAllByTestId('icon-x')
    fireEvent.click(removeButtons[0])
    expect(onChange).toHaveBeenCalledWith(['proj-2'])
  })

  it('enforces max selections', () => {
    render(
      <ProjectMultiSelect
        projects={mockProjects}
        selectedIds={['proj-1', 'proj-2', 'proj-3']}
        onChange={onChange}
        maxSelections={3}
      />
    )
    // Open dropdown
    fireEvent.click(screen.getByText('Project Alpha'))
    // Should show max selection notice
    expect(screen.getByText(/최대 3개 프로젝트까지 선택 가능합니다/)).toBeInTheDocument()
  })

  it('disables unselected items at max selection', () => {
    render(
      <ProjectMultiSelect
        projects={mockProjects}
        selectedIds={['proj-1', 'proj-2', 'proj-3']}
        onChange={onChange}
        maxSelections={3}
      />
    )
    // Open dropdown
    fireEvent.click(screen.getByText('Project Alpha'))
    // Try clicking a non-selected project
    fireEvent.click(screen.getByText('Project Delta'))
    // onChange should NOT be called for adding new
    expect(onChange).not.toHaveBeenCalledWith(expect.arrayContaining(['proj-4']))
  })

  it('shows empty state when no projects available', () => {
    render(
      <ProjectMultiSelect
        projects={[]}
        selectedIds={[]}
        onChange={onChange}
      />
    )
    // Open dropdown
    fireEvent.click(screen.getByText(/프로젝트 선택/))
    expect(screen.getByText('프로젝트가 없습니다')).toBeInTheDocument()
  })

  it('shows check icon for selected items in dropdown', () => {
    render(
      <ProjectMultiSelect
        projects={mockProjects}
        selectedIds={['proj-1']}
        onChange={onChange}
      />
    )
    // Open dropdown
    fireEvent.click(screen.getByText('Project Alpha'))
    expect(screen.getByTestId('icon-check')).toBeInTheDocument()
  })

  it('accepts className prop', () => {
    const { container } = render(
      <ProjectMultiSelect
        projects={mockProjects}
        selectedIds={[]}
        onChange={onChange}
        className="custom-class"
      />
    )
    expect(container.querySelector('.custom-class')).toBeInTheDocument()
  })

  it('renders color indicators for selected items', () => {
    render(
      <ProjectMultiSelect
        projects={mockProjects}
        selectedIds={['proj-1', 'proj-2']}
        onChange={onChange}
      />
    )
    // Color dots should be rendered as small circles within the tags
    const colorDots = document.querySelectorAll('.rounded-full.w-2.h-2')
    expect(colorDots.length).toBeGreaterThanOrEqual(2)
  })
})
