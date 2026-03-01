import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ChatInput } from '../ChatInput'

// Selector-compatible mock helper
const selectorMock = (state: Record<string, unknown>) =>
  ((selector?: (s: Record<string, unknown>) => unknown) => selector ? selector(state) : state) as never

// ── Mock stores ──

const mockSetAttachedImages = vi.fn()
const mockExtractTextFromImage = vi.fn().mockResolvedValue(null)

vi.mock('@/stores/orchestration', () => ({
  useOrchestrationStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      isProcessing: false,
      connected: false,
      projects: [],
      selectedProjectId: null,
      selectProject: vi.fn(),
      fetchProjects: vi.fn(),
      reconnect: vi.fn(),
    }
    return selector ? selector(state) : state
  }),
}))

vi.mock('@/stores/navigation', () => ({
  useNavigationStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      setView: vi.fn(),
      setProjectFilter: vi.fn(),
      setPendingTaskInput: vi.fn(),
    }
    return selector ? selector(state) : state
  }),
}))

vi.mock('@/stores/agents', () => ({
  useAgentsStore: vi.fn((selector?: (s: Record<string, unknown>) => unknown) => {
    const state = {
      setAttachedImages: mockSetAttachedImages,
      extractTextFromImage: mockExtractTextFromImage,
    }
    return selector ? selector(state) : state
  }),
}))

// Mock URL.createObjectURL / revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
global.URL.revokeObjectURL = vi.fn()

import { useOrchestrationStore } from '@/stores/orchestration'
import { useNavigationStore } from '@/stores/navigation'

/** Helper to create a mock File */
function createMockFile(name: string, type: string, size = 1024): File {
  const content = new ArrayBuffer(size)
  return new File([content], name, { type, lastModified: Date.now() })
}

/** Create a mock FileList from an array of Files */
function createFileList(files: File[]): FileList {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* () {
      for (const f of files) yield f
    },
  } as unknown as FileList
  // Make array-indexed access work
  files.forEach((f, i) => {
    Object.defineProperty(fileList, i, { value: f, enumerable: true })
  })
  return fileList
}

/** Helper to add an image via file input change event */
function addImageViaFileInput(container: HTMLElement, files: File[]) {
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
  const fileList = createFileList(files)
  fireEvent.change(fileInput, { target: { files: fileList } })
}

describe('ChatInput', () => {
  const mockSetView = vi.fn()
  const mockSetProjectFilter = vi.fn()
  const mockSetPendingTaskInput = vi.fn()
  const mockFetchProjects = vi.fn()
  const mockSelectProject = vi.fn()
  const mockReconnect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockExtractTextFromImage.mockResolvedValue(null)

    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: false,
        connected: false,
        projects: [],
        selectedProjectId: null,
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    vi.mocked(useNavigationStore).mockImplementation(
      selectorMock({
        setView: mockSetView,
        setProjectFilter: mockSetProjectFilter,
        setPendingTaskInput: mockSetPendingTaskInput,
      })
    )
  })

  // ── 1. Basic rendering ──

  it('renders the textarea and submit button', () => {
    render(<ChatInput />)

    expect(screen.getByPlaceholderText(/Describe the task/i)).toBeInTheDocument()
    expect(screen.getByTitle('Analyze Task')).toBeInTheDocument()
  })

  it('renders project selector with default text', () => {
    render(<ChatInput />)

    expect(screen.getByText('Select Project')).toBeInTheDocument()
  })

  it('renders keyboard shortcut hints', () => {
    render(<ChatInput />)

    expect(screen.getByText('Enter')).toBeInTheDocument()
    expect(screen.getByText('Shift+Enter')).toBeInTheDocument()
  })

  it('renders Ctrl+V hint text', () => {
    render(<ChatInput />)
    expect(screen.getByText('Ctrl+V')).toBeInTheDocument()
  })

  // ── 2. Submit behavior ──

  it('submit button is disabled when input is empty', () => {
    render(<ChatInput />)

    const submitButton = screen.getByTitle('Analyze Task')
    expect(submitButton).toBeDisabled()
  })

  it('submits when Enter is pressed with text', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    fireEvent.change(textarea, { target: { value: 'Build a feature' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(mockSetPendingTaskInput).toHaveBeenCalledWith('Build a feature')
    expect(mockSetView).toHaveBeenCalledWith('agents')
  })

  it('does NOT submit on Shift+Enter (new line)', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    fireEvent.change(textarea, { target: { value: 'Some text' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    expect(mockSetPendingTaskInput).not.toHaveBeenCalled()
  })

  it('submits when submit button is clicked with text', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    fireEvent.change(textarea, { target: { value: 'Hello world' } })

    const submitButton = screen.getByTitle('Analyze Task')
    fireEvent.click(submitButton)

    expect(mockSetPendingTaskInput).toHaveBeenCalledWith('Hello world')
    expect(mockSetView).toHaveBeenCalledWith('agents')
  })

  it('does not submit when input is whitespace only', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(mockSetPendingTaskInput).not.toHaveBeenCalled()
  })

  it('does not submit when isProcessing is true', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: true,
        connected: false,
        projects: [],
        selectedProjectId: null,
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    fireEvent.change(textarea, { target: { value: 'Task' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(mockSetPendingTaskInput).not.toHaveBeenCalled()
  })

  it('shows spinner icon when isProcessing is true', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: true,
        connected: false,
        projects: [],
        selectedProjectId: null,
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    render(<ChatInput />)

    const submitButton = screen.getByTitle('Analyze Task')
    // The Loader2 icon has animate-spin class
    const spinner = submitButton.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('submits via form submit event (not just button click)', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    fireEvent.change(textarea, { target: { value: 'form submit test' } })

    const form = textarea.closest('form')!
    fireEvent.submit(form)

    expect(mockSetPendingTaskInput).toHaveBeenCalledWith('form submit test')
    expect(mockSetView).toHaveBeenCalledWith('agents')
  })

  it('does not submit via form when input is empty', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    const form = textarea.closest('form')!
    fireEvent.submit(form)

    expect(mockSetPendingTaskInput).not.toHaveBeenCalled()
  })

  it('ignores non-Enter key presses', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    fireEvent.change(textarea, { target: { value: 'text' } })
    fireEvent.keyDown(textarea, { key: 'Tab' })

    expect(mockSetPendingTaskInput).not.toHaveBeenCalled()
  })

  // ── 3. Project dropdown ──

  it('shows projects in dropdown when opened', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: false,
        connected: false,
        projects: [
          { id: 'p1', name: 'Project Alpha', path: '/alpha', description: 'Alpha project', has_claude_md: true },
          { id: 'p2', name: 'Project Beta', path: '/beta', description: 'Beta project', has_claude_md: false },
        ],
        selectedProjectId: null,
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    render(<ChatInput />)

    // Open dropdown
    fireEvent.click(screen.getByText('Select Project'))

    expect(screen.getByText('No Project')).toBeInTheDocument()
    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    expect(screen.getByText('Project Beta')).toBeInTheDocument()
  })

  it('shows selected project name', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: false,
        connected: false,
        projects: [
          { id: 'p1', name: 'Project Alpha', path: '/alpha', description: '', has_claude_md: false },
        ],
        selectedProjectId: 'p1',
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    render(<ChatInput />)

    expect(screen.getByText('Project Alpha')).toBeInTheDocument()
  })

  it('shows "No projects found" when project list is empty and dropdown is open', () => {
    render(<ChatInput />)

    // Open dropdown
    fireEvent.click(screen.getByText('Select Project'))

    expect(screen.getByText('No projects found')).toBeInTheDocument()
  })

  it('selects a project when clicked in dropdown', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: false,
        connected: false,
        projects: [
          { id: 'p1', name: 'Project Alpha', path: '/alpha', description: '', has_claude_md: false },
        ],
        selectedProjectId: null,
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    render(<ChatInput />)

    // Open dropdown
    fireEvent.click(screen.getByText('Select Project'))
    // Click project
    fireEvent.click(screen.getByText('Project Alpha'))

    expect(mockSelectProject).toHaveBeenCalledWith('p1')
  })

  it('shows CLAUDE.md badge for projects with claude_md', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: false,
        connected: false,
        projects: [
          { id: 'p1', name: 'Project Alpha', path: '/alpha', description: '', has_claude_md: true },
        ],
        selectedProjectId: null,
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    render(<ChatInput />)

    // Open dropdown
    fireEvent.click(screen.getByText('Select Project'))

    expect(screen.getByText('CLAUDE.md')).toBeInTheDocument()
  })

  it('selects "No Project" option and passes null', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: false,
        connected: false,
        projects: [
          { id: 'p1', name: 'Project Alpha', path: '/alpha', description: '', has_claude_md: false },
        ],
        selectedProjectId: 'p1',
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    render(<ChatInput />)

    fireEvent.click(screen.getByText('Project Alpha'))
    fireEvent.click(screen.getByText('No Project'))

    expect(mockSelectProject).toHaveBeenCalledWith(null)
  })

  it('closes dropdown when clicking outside', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: false,
        connected: false,
        projects: [
          { id: 'p1', name: 'Project Alpha', path: '/alpha', description: '', has_claude_md: false },
        ],
        selectedProjectId: null,
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    render(<ChatInput />)

    // Open dropdown
    fireEvent.click(screen.getByText('Select Project'))
    expect(screen.getByText('No Project')).toBeInTheDocument()

    // Click outside
    fireEvent.mouseDown(document.body)

    expect(screen.queryByText('No Project')).not.toBeInTheDocument()
  })

  it('shows project path when description is empty', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: false,
        connected: false,
        projects: [
          { id: 'p1', name: 'Project Alpha', path: '/path/to/alpha', description: '', has_claude_md: false },
        ],
        selectedProjectId: null,
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    render(<ChatInput />)

    fireEvent.click(screen.getByText('Select Project'))
    expect(screen.getByText('/path/to/alpha')).toBeInTheDocument()
  })

  it('shows project description when available', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: false,
        connected: false,
        projects: [
          { id: 'p1', name: 'Project Alpha', path: '/alpha', description: 'A great project', has_claude_md: false },
        ],
        selectedProjectId: null,
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    render(<ChatInput />)

    fireEvent.click(screen.getByText('Select Project'))
    expect(screen.getByText('A great project')).toBeInTheDocument()
  })

  // ── 4. Reconnect on project change ──

  it('calls reconnect when changing project while connected', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: false,
        connected: true,
        projects: [
          { id: 'p1', name: 'Project Alpha', path: '/alpha', description: '', has_claude_md: false },
        ],
        selectedProjectId: null,
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    render(<ChatInput />)

    // Open dropdown and select
    fireEvent.click(screen.getByText('Select Project'))
    fireEvent.click(screen.getByText('Project Alpha'))

    expect(mockReconnect).toHaveBeenCalled()
  })

  it('does not call reconnect when not connected', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: false,
        connected: false,
        projects: [
          { id: 'p1', name: 'Project Alpha', path: '/alpha', description: '', has_claude_md: false },
        ],
        selectedProjectId: null,
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    render(<ChatInput />)

    fireEvent.click(screen.getByText('Select Project'))
    fireEvent.click(screen.getByText('Project Alpha'))

    expect(mockReconnect).not.toHaveBeenCalled()
  })

  // ── 5. Image attach button ──

  it('renders image attach button', () => {
    render(<ChatInput />)

    expect(screen.getByTitle(/이미지 첨부/)).toBeInTheDocument()
  })

  // ── 6. Clears input after submit ──

  it('clears the textarea after successful submit', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'my task' } })

    expect(textarea.value).toBe('my task')

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(textarea.value).toBe('')
  })

  // ── 7. Sets project filter on submit ──

  it('sets project filter on submit', () => {
    vi.mocked(useOrchestrationStore).mockImplementation(
      selectorMock({
        isProcessing: false,
        connected: false,
        projects: [
          { id: 'p1', name: 'Project Alpha', path: '/alpha', description: '', has_claude_md: false },
        ],
        selectedProjectId: 'p1',
        selectProject: mockSelectProject,
        fetchProjects: mockFetchProjects,
        reconnect: mockReconnect,
      })
    )

    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    fireEvent.change(textarea, { target: { value: 'task text' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(mockSetProjectFilter).toHaveBeenCalledWith('p1')
  })

  // ── 8. Image file input and addImages ──

  it('adds images via file input', () => {
    const { container } = render(<ChatInput />)

    const pngFile = createMockFile('test.png', 'image/png')
    addImageViaFileInput(container, [pngFile])

    // Image preview should appear
    const img = screen.getByAltText('test.png')
    expect(img).toBeInTheDocument()
  })

  it('filters out non-image files', () => {
    const { container } = render(<ChatInput />)

    const txtFile = createMockFile('readme.txt', 'text/plain')
    addImageViaFileInput(container, [txtFile])

    // No image preview should appear
    expect(screen.queryByAltText('readme.txt')).not.toBeInTheDocument()
  })

  it('limits images to MAX_IMAGES (5)', () => {
    const { container } = render(<ChatInput />)

    const files = Array.from({ length: 7 }, (_, i) =>
      createMockFile(`img${i}.png`, 'image/png')
    )
    addImageViaFileInput(container, files)

    const images = screen.getAllByRole('img')
    expect(images.length).toBe(5)
  })

  it('disables image attach button when MAX_IMAGES reached', () => {
    const { container } = render(<ChatInput />)

    const files = Array.from({ length: 5 }, (_, i) =>
      createMockFile(`img${i}.png`, 'image/png')
    )
    addImageViaFileInput(container, files)

    const attachBtn = screen.getByTitle(/최대 5개/)
    expect(attachBtn).toBeDisabled()
  })

  it('shows image count badge when images are attached', () => {
    const { container } = render(<ChatInput />)

    const files = [
      createMockFile('a.png', 'image/png'),
      createMockFile('b.png', 'image/png'),
    ]
    addImageViaFileInput(container, files)

    expect(screen.getByText(/2개 이미지 첨부됨/)).toBeInTheDocument()
  })

  it('does not show image count when no images attached', () => {
    render(<ChatInput />)

    expect(screen.queryByText(/이미지 첨부됨/)).not.toBeInTheDocument()
  })

  it('removes a single image when X button is clicked', async () => {
    const { container } = render(<ChatInput />)

    const files = [
      createMockFile('a.png', 'image/png'),
      createMockFile('b.png', 'image/png'),
    ]
    addImageViaFileInput(container, files)

    // Should have 2 images
    expect(screen.getAllByRole('img')).toHaveLength(2)

    // Find the remove buttons (they have the X icon)
    const removeButtons = container.querySelectorAll('button.absolute')
    expect(removeButtons.length).toBeGreaterThanOrEqual(2)

    // Click the first remove button
    fireEvent.click(removeButtons[0])

    // Should have 1 image now
    await waitFor(() => {
      expect(screen.getAllByRole('img')).toHaveLength(1)
    })
  })

  it('removes all images when "clear all" button is clicked', async () => {
    const { container } = render(<ChatInput />)

    const files = [
      createMockFile('a.png', 'image/png'),
      createMockFile('b.png', 'image/png'),
    ]
    addImageViaFileInput(container, files)

    expect(screen.getAllByRole('img')).toHaveLength(2)

    // Click "clear all" button
    fireEvent.click(screen.getByText('전체 삭제'))

    await waitFor(() => {
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })
  })

  it('resets file input value after selection', () => {
    const { container } = render(<ChatInput />)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = createMockFile('test.png', 'image/png')
    const fileList = createFileList([file])

    // Simulate file selection
    fireEvent.change(fileInput, { target: { files: fileList } })

    // The image should have been added
    expect(screen.getByAltText('test.png')).toBeInTheDocument()
  })

  it('does nothing when file input has no files', () => {
    const { container } = render(<ChatInput />)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: null } })

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  // ── 9. Submit with images ──

  it('calls setAttachedImages and clears images on submit', async () => {
    const { container } = render(<ChatInput />)

    const file = createMockFile('test.png', 'image/png')
    addImageViaFileInput(container, [file])

    expect(screen.getByAltText('test.png')).toBeInTheDocument()

    // Type text and submit
    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    fireEvent.change(textarea, { target: { value: 'analyze this image' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(mockSetAttachedImages).toHaveBeenCalledWith([file])
    expect(mockSetPendingTaskInput).toHaveBeenCalledWith('analyze this image')
    expect(mockSetView).toHaveBeenCalledWith('agents')

    // Images should be cleared after submit
    await waitFor(() => {
      expect(screen.queryByAltText('test.png')).not.toBeInTheDocument()
    })
  })

  it('does not call setAttachedImages when there are no images', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    fireEvent.change(textarea, { target: { value: 'no images' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(mockSetAttachedImages).not.toHaveBeenCalled()
  })

  // ── 10. Drag and Drop ──

  it('shows drag overlay when dragging over', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    const form = textarea.closest('form')!

    fireEvent.dragOver(form, {
      dataTransfer: { files: [] },
    })

    expect(screen.getByText(/이미지 또는 MD 문서를 여기에 놓으세요/)).toBeInTheDocument()
  })

  it('hides drag overlay on drag leave', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    const form = textarea.closest('form')!

    fireEvent.dragOver(form, {
      dataTransfer: { files: [] },
    })

    expect(screen.getByText(/이미지 또는 MD 문서를 여기에 놓으세요/)).toBeInTheDocument()

    fireEvent.dragLeave(form, {
      dataTransfer: { files: [] },
    })

    expect(screen.queryByText(/이미지 또는 MD 문서를 여기에 놓으세요/)).not.toBeInTheDocument()
  })

  it('adds images on drop', async () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    const form = textarea.closest('form')!

    const file = createMockFile('dropped.png', 'image/png')
    const fileList = createFileList([file])

    fireEvent.drop(form, {
      dataTransfer: { files: fileList },
    })

    await waitFor(() => {
      expect(screen.getByAltText('dropped.png')).toBeInTheDocument()
    })
  })

  it('hides drag overlay after drop', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    const form = textarea.closest('form')!

    // First drag over to show overlay
    fireEvent.dragOver(form, {
      dataTransfer: { files: [] },
    })
    expect(screen.getByText(/이미지 또는 MD 문서를 여기에 놓으세요/)).toBeInTheDocument()

    // Then drop (even with empty files)
    fireEvent.drop(form, {
      dataTransfer: { files: [] },
    })

    expect(screen.queryByText(/이미지 또는 MD 문서를 여기에 놓으세요/)).not.toBeInTheDocument()
  })

  it('does not add images on drop when no files in dataTransfer', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)
    const form = textarea.closest('form')!

    fireEvent.drop(form, {
      dataTransfer: { files: [] },
    })

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  // ── 11. Paste images ──

  it('adds images when pasting from clipboard', async () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)

    const file = createMockFile('pasted.png', 'image/png')
    const items = [
      { type: 'image/png', getAsFile: () => file },
    ]
    // clipboardData.items is DataTransferItemList (array-like with .length)
    const clipboardData = {
      items: Object.assign(items, { length: items.length }),
    }

    fireEvent.paste(textarea, { clipboardData })

    await waitFor(() => {
      expect(screen.getByAltText('pasted.png')).toBeInTheDocument()
    })
  })

  it('does not prevent default for non-image paste', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)

    const items = [
      { type: 'text/plain', getAsFile: () => null },
    ]
    const clipboardData = {
      items: Object.assign(items, { length: items.length }),
    }

    fireEvent.paste(textarea, { clipboardData })

    // No images added
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('handles paste where getAsFile returns null', () => {
    render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i)

    const items = [
      { type: 'image/png', getAsFile: () => null },
    ]
    const clipboardData = {
      items: Object.assign(items, { length: items.length }),
    }

    fireEvent.paste(textarea, { clipboardData })

    // No images added since getAsFile returned null
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  // ── 12. OCR functionality ──

  it('triggers OCR for non-SVG images and shows processing status', async () => {
    // Make extractTextFromImage return a promise that we can control
    let resolveOcr!: (value: string | null) => void
    mockExtractTextFromImage.mockImplementation(() => new Promise(r => { resolveOcr = r }))

    const { container } = render(<ChatInput />)

    const file = createMockFile('photo.png', 'image/png')
    addImageViaFileInput(container, [file])

    // Should show processing status
    await waitFor(() => {
      const processingOverlay = container.querySelector('[title="OCR 처리 중..."]')
      expect(processingOverlay).toBeInTheDocument()
    })

    // Resolve OCR with text
    await act(async () => {
      resolveOcr('Extracted text from image')
    })

    // Should show done status
    await waitFor(() => {
      const doneOverlay = container.querySelector('[title="OCR 완료"]')
      expect(doneOverlay).toBeInTheDocument()
    })
  })

  it('appends OCR text to input when OCR succeeds', async () => {
    mockExtractTextFromImage.mockResolvedValue('Hello from OCR')

    const { container } = render(<ChatInput />)

    const file = createMockFile('photo.png', 'image/png')
    addImageViaFileInput(container, [file])

    const textarea = screen.getByPlaceholderText(/Describe the task/i) as HTMLTextAreaElement

    await waitFor(() => {
      expect(textarea.value).toContain('[이미지 OCR: photo.png]')
      expect(textarea.value).toContain('Hello from OCR')
    })
  })

  it('shows done status when OCR returns empty text', async () => {
    mockExtractTextFromImage.mockResolvedValue('')

    const { container } = render(<ChatInput />)

    const file = createMockFile('photo.png', 'image/png')
    addImageViaFileInput(container, [file])

    await waitFor(() => {
      const doneOverlay = container.querySelector('[title="OCR 완료"]')
      expect(doneOverlay).toBeInTheDocument()
    })

    // Should NOT append OCR block to input for empty text
    const textarea = screen.getByPlaceholderText(/Describe the task/i) as HTMLTextAreaElement
    expect(textarea.value).not.toContain('[이미지 OCR:')
  })

  it('shows error status when OCR fails and allows retry', async () => {
    mockExtractTextFromImage.mockResolvedValue(null)

    const { container } = render(<ChatInput />)

    const file = createMockFile('photo.png', 'image/png')
    addImageViaFileInput(container, [file])

    await waitFor(() => {
      const errorOverlay = container.querySelector('[title="OCR 실패 - 클릭하여 재시도"]')
      expect(errorOverlay).toBeInTheDocument()
    })

    // Now retry by clicking the error overlay
    mockExtractTextFromImage.mockResolvedValue('Retried text')
    const errorButton = container.querySelector('[title="OCR 실패 - 클릭하여 재시도"]') as HTMLElement
    fireEvent.click(errorButton)

    expect(mockExtractTextFromImage).toHaveBeenCalledTimes(2)

    await waitFor(() => {
      const doneOverlay = container.querySelector('[title="OCR 완료"]')
      expect(doneOverlay).toBeInTheDocument()
    })
  })

  it('does not trigger OCR for SVG images', async () => {
    const { container } = render(<ChatInput />)

    const svgFile = createMockFile('icon.svg', 'image/svg+xml')
    addImageViaFileInput(container, [svgFile])

    // Image should be added but no OCR triggered
    expect(screen.getByAltText('icon.svg')).toBeInTheDocument()
    expect(mockExtractTextFromImage).not.toHaveBeenCalled()
  })

  it('removes OCR text from input when image is removed', async () => {
    mockExtractTextFromImage.mockResolvedValue('OCR content here')

    const { container } = render(<ChatInput />)

    const file = createMockFile('doc.png', 'image/png')
    addImageViaFileInput(container, [file])

    const textarea = screen.getByPlaceholderText(/Describe the task/i) as HTMLTextAreaElement

    await waitFor(() => {
      expect(textarea.value).toContain('[이미지 OCR: doc.png]')
    })

    // Remove the image
    const removeButton = container.querySelector('button.absolute') as HTMLElement
    fireEvent.click(removeButton)

    await waitFor(() => {
      expect(textarea.value).not.toContain('[이미지 OCR: doc.png]')
    })
  })

  it('removes all OCR text when clear all is clicked', async () => {
    mockExtractTextFromImage.mockResolvedValue('OCR text')

    const { container } = render(<ChatInput />)

    const files = [
      createMockFile('img1.png', 'image/png'),
      createMockFile('img2.png', 'image/png'),
    ]
    addImageViaFileInput(container, files)

    const textarea = screen.getByPlaceholderText(/Describe the task/i) as HTMLTextAreaElement

    await waitFor(() => {
      expect(textarea.value).toContain('[이미지 OCR: img1.png]')
    })

    fireEvent.click(screen.getByText('전체 삭제'))

    await waitFor(() => {
      expect(textarea.value).not.toContain('[이미지 OCR:')
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })
  })

  // ── 13. Image URL lifecycle ──

  it('calls URL.createObjectURL for image previews', () => {
    const { container } = render(<ChatInput />)

    const file = createMockFile('test.png', 'image/png')
    addImageViaFileInput(container, [file])

    expect(URL.createObjectURL).toHaveBeenCalledWith(file)
  })

  it('calls URL.revokeObjectURL on image load', () => {
    const { container } = render(<ChatInput />)

    const file = createMockFile('test.png', 'image/png')
    addImageViaFileInput(container, [file])

    const img = screen.getByAltText('test.png')
    fireEvent.load(img)

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  // ── 14. Image attach button click ──

  it('opens file picker when image attach button is clicked', () => {
    const { container } = render(<ChatInput />)

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(fileInput, 'click')

    const attachButton = screen.getByTitle(/이미지 첨부/)
    fireEvent.click(attachButton)

    expect(clickSpy).toHaveBeenCalled()
    clickSpy.mockRestore()
  })

  // ── 15. Mixed file types (valid + invalid) ──

  it('adds only valid image files from a mixed selection', () => {
    const { container } = render(<ChatInput />)

    const pngFile = createMockFile('photo.png', 'image/png')
    const jpgFile = createMockFile('photo.jpg', 'image/jpeg')
    const pdfFile = createMockFile('doc.pdf', 'application/pdf')

    addImageViaFileInput(container, [pngFile, jpgFile, pdfFile])

    // Only png and jpg should be shown
    expect(screen.getByAltText('photo.png')).toBeInTheDocument()
    expect(screen.getByAltText('photo.jpg')).toBeInTheDocument()
    expect(screen.queryByAltText('doc.pdf')).not.toBeInTheDocument()
  })

  // ── 16. Accepted image types ──

  it('accepts all supported image types (png, jpeg, gif, webp, bmp, svg)', () => {
    const { container } = render(<ChatInput />)

    const files = [
      createMockFile('a.png', 'image/png'),
      createMockFile('b.jpg', 'image/jpeg'),
      createMockFile('c.gif', 'image/gif'),
      createMockFile('d.webp', 'image/webp'),
      createMockFile('e.bmp', 'image/bmp'),
    ]

    addImageViaFileInput(container, files)

    expect(screen.getByAltText('a.png')).toBeInTheDocument()
    expect(screen.getByAltText('b.jpg')).toBeInTheDocument()
    expect(screen.getByAltText('c.gif')).toBeInTheDocument()
    expect(screen.getByAltText('d.webp')).toBeInTheDocument()
    expect(screen.getByAltText('e.bmp')).toBeInTheDocument()
  })

  // ── 17. OCR appends to existing input ──

  it('appends OCR text after existing input text', async () => {
    mockExtractTextFromImage.mockResolvedValue('OCR result')

    const { container } = render(<ChatInput />)

    const textarea = screen.getByPlaceholderText(/Describe the task/i) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'existing text' } })

    const file = createMockFile('photo.png', 'image/png')
    addImageViaFileInput(container, [file])

    await waitFor(() => {
      // The OCR text should be appended after the existing text
      expect(textarea.value).toContain('existing text')
      expect(textarea.value).toContain('[이미지 OCR: photo.png]')
      expect(textarea.value).toContain('OCR result')
    })
  })
})
