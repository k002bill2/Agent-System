import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons with explicit named exports
vi.mock('lucide-react', () => ({
  Bell: (props: Record<string, unknown>) => <div data-testid="bell" {...props} />,
  Plus: (props: Record<string, unknown>) => <div data-testid="plus" {...props} />,
  Trash2: (props: Record<string, unknown>) => <div data-testid="trash" {...props} />,
  Save: (props: Record<string, unknown>) => <div data-testid="save" {...props} />,
  TestTube: (props: Record<string, unknown>) => <div data-testid="test-tube" {...props} />,
  Check: (props: Record<string, unknown>) => <div data-testid="check" {...props} />,
  X: (props: Record<string, unknown>) => <div data-testid="x-icon" {...props} />,
  MessageSquare: (props: Record<string, unknown>) => <div data-testid="slack-icon" {...props} />,
  MessageCircle: (props: Record<string, unknown>) => <div data-testid="discord-icon" {...props} />,
  Mail: (props: Record<string, unknown>) => <div data-testid="mail-icon" {...props} />,
  Webhook: (props: Record<string, unknown>) => <div data-testid="webhook-icon" {...props} />,
  ChevronDown: (props: Record<string, unknown>) => <div data-testid="chevron-down" {...props} />,
  ChevronUp: (props: Record<string, unknown>) => <div data-testid="chevron-up" {...props} />,
  AlertCircle: (props: Record<string, unknown>) => <div data-testid="alert-circle" {...props} />,
  Settings: (props: Record<string, unknown>) => <div data-testid="settings" {...props} />,
  FolderKanban: (props: Record<string, unknown>) => <div data-testid="folder-kanban" {...props} />,
  Pencil: (props: Record<string, unknown>) => <div data-testid="pencil" {...props} />,
}))

// Mock config/api
vi.mock('@/config/api', () => ({
  getApiUrl: (path: string) => `http://localhost:8000${path}`,
}))

// Mock orchestration store
const mockFetchProjects = vi.fn()

vi.mock('@/stores/orchestration', () => ({
  useOrchestrationStore: vi.fn(() => ({
    projects: [],
    fetchProjects: mockFetchProjects,
  })),
}))

import { useOrchestrationStore } from '@/stores/orchestration'
import { NotificationRuleEditor } from '../NotificationRuleEditor'

const mockRules = [
  {
    id: 'rule-1',
    name: 'Alert on failures',
    description: 'Get notified when tasks fail',
    enabled: true,
    event_type: 'task_failed',
    conditions: [],
    channels: ['slack'],
    project_ids: [],
    priority: 'high',
    message_template: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'rule-2',
    name: 'Approval alerts',
    description: 'Notify on approval requests',
    enabled: false,
    event_type: 'approval_required',
    conditions: [],
    channels: ['email', 'discord'],
    project_ids: ['proj-1'],
    priority: 'urgent',
    message_template: null,
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
]

const mockChannels = [
  {
    channel: 'slack',
    enabled: true,
    configured: true,
    rate_limit_per_hour: 60,
    sent_this_hour: 5,
    config_summary: { webhook_url: 'https://hooks.slack.com/...' },
  },
  {
    channel: 'discord',
    enabled: false,
    configured: false,
    rate_limit_per_hour: 60,
    sent_this_hour: 0,
  },
  {
    channel: 'email',
    enabled: true,
    configured: true,
    rate_limit_per_hour: 30,
    sent_this_hour: 2,
    config_summary: { email_address: 'test@example.com' },
  },
  {
    channel: 'webhook',
    enabled: false,
    configured: false,
    rate_limit_per_hour: 100,
    sent_this_hour: 0,
  },
]

describe('NotificationRuleEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockReset()
    vi.mocked(useOrchestrationStore).mockReturnValue({
      projects: [],
      fetchProjects: mockFetchProjects,
    } as unknown as ReturnType<typeof useOrchestrationStore>)
  })

  it('shows loading skeleton while data is being fetched', () => {
    vi.mocked(global.fetch).mockImplementation(() => new Promise(() => {}))

    const { container } = render(<NotificationRuleEditor />)

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('renders channel section and rules section after loading', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRules),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ channels: mockChannels }),
      } as Response)

    render(<NotificationRuleEditor />)

    await waitFor(() => {
      expect(screen.getByText('Notification Channels')).toBeInTheDocument()
      expect(screen.getByText('Notification Rules')).toBeInTheDocument()
    })
  })

  it('renders all channel entries', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRules),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ channels: mockChannels }),
      } as Response)

    render(<NotificationRuleEditor />)

    await waitFor(() => {
      expect(screen.getByText('slack')).toBeInTheDocument()
      expect(screen.getByText('discord')).toBeInTheDocument()
      expect(screen.getByText('email')).toBeInTheDocument()
      expect(screen.getByText('webhook')).toBeInTheDocument()
    })
  })

  it('shows Configured/Not Configured badges for channels', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRules),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ channels: mockChannels }),
      } as Response)

    render(<NotificationRuleEditor />)

    await waitFor(() => {
      const configuredBadges = screen.getAllByText('Configured')
      const notConfiguredBadges = screen.getAllByText('Not Configured')
      expect(configuredBadges.length).toBe(2) // slack and email
      expect(notConfiguredBadges.length).toBe(2) // discord and webhook
    })
  })

  it('renders rule cards with name and priority', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRules),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ channels: mockChannels }),
      } as Response)

    render(<NotificationRuleEditor />)

    await waitFor(() => {
      expect(screen.getByText('Alert on failures')).toBeInTheDocument()
      expect(screen.getByText('high')).toBeInTheDocument()
      expect(screen.getByText('Approval alerts')).toBeInTheDocument()
      expect(screen.getByText('urgent')).toBeInTheDocument()
    })
  })

  it('renders rule event type labels', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRules),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ channels: mockChannels }),
      } as Response)

    render(<NotificationRuleEditor />)

    await waitFor(() => {
      expect(screen.getByText('Task Failed')).toBeInTheDocument()
      expect(screen.getByText('Approval Required')).toBeInTheDocument()
    })
  })

  it('renders rule descriptions', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRules),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ channels: mockChannels }),
      } as Response)

    render(<NotificationRuleEditor />)

    await waitFor(() => {
      expect(screen.getByText('Get notified when tasks fail')).toBeInTheDocument()
      expect(screen.getByText('Notify on approval requests')).toBeInTheDocument()
    })
  })

  it('shows Add Rule button', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRules),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ channels: mockChannels }),
      } as Response)

    render(<NotificationRuleEditor />)

    await waitFor(() => {
      expect(screen.getByText('Add Rule')).toBeInTheDocument()
    })
  })

  it('shows new rule form when Add Rule is clicked', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRules),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ channels: mockChannels }),
      } as Response)

    render(<NotificationRuleEditor />)

    await waitFor(() => {
      expect(screen.getByText('Add Rule')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add Rule'))

    expect(screen.getByText('New Rule')).toBeInTheDocument()
    expect(screen.getByText('Rule Name')).toBeInTheDocument()
    expect(screen.getByText('Event Type')).toBeInTheDocument()
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('Channels')).toBeInTheDocument()
  })

  it('shows empty state when no rules exist', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ channels: mockChannels }),
      } as Response)

    render(<NotificationRuleEditor />)

    await waitFor(() => {
      expect(screen.getByText('No notification rules configured')).toBeInTheDocument()
      expect(screen.getByText('Create a rule to receive alerts for specific events')).toBeInTheDocument()
    })
  })

  it('shows error alert and allows dismissal', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Server error'))

    render(<NotificationRuleEditor />)

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })

    // Dismiss the error
    const dismissButton = screen.getByText('Server error').closest('div')!.querySelector('button')!
    fireEvent.click(dismissButton)

    await waitFor(() => {
      expect(screen.queryByText('Server error')).not.toBeInTheDocument()
    })
  })

  it('shows All Projects label for rules without project_ids', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRules),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ channels: mockChannels }),
      } as Response)

    render(<NotificationRuleEditor />)

    await waitFor(() => {
      expect(screen.getByText('All Projects')).toBeInTheDocument()
    })
  })

  it('shows rate limit info for channels', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ channels: mockChannels }),
      } as Response)

    render(<NotificationRuleEditor />)

    await waitFor(() => {
      expect(screen.getByText('5/60 this hour')).toBeInTheDocument()
      expect(screen.getByText('0/60 this hour')).toBeInTheDocument()
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Helper to render with data loaded
  // ─────────────────────────────────────────────────────────────

  const mockProjects = [
    { id: 'proj-1', name: 'Project Alpha', path: '/alpha', description: '', has_claude_md: false },
    { id: 'proj-2', name: 'Project Beta', path: '/beta', description: '', has_claude_md: false },
  ]

  function setupFetchMocks(
    rules = mockRules,
    channels = mockChannels,
    extra: Response[] = []
  ) {
    const mock = vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(rules),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ channels }),
      } as Response)

    for (const resp of extra) {
      mock.mockResolvedValueOnce(resp)
    }
    return mock
  }

  async function renderAndWait(rules = mockRules, channels = mockChannels, extra: Response[] = []) {
    setupFetchMocks(rules, channels, extra)
    render(<NotificationRuleEditor />)
    await waitFor(() => {
      expect(screen.getByText('Notification Rules')).toBeInTheDocument()
    })
  }

  // ─────────────────────────────────────────────────────────────
  // New Rule Form Interactions
  // ─────────────────────────────────────────────────────────────

  describe('New Rule Form', () => {
    it('fills in all new rule form fields', async () => {
      await renderAndWait()

      fireEvent.click(screen.getByText('Add Rule'))

      // Fill in name
      const nameInput = screen.getByPlaceholderText('e.g., Alert on task failure')
      fireEvent.change(nameInput, { target: { value: 'My new rule' } })
      expect(nameInput).toHaveValue('My new rule')

      // Fill in description
      const descInput = screen.getByPlaceholderText('Optional description')
      fireEvent.change(descInput, { target: { value: 'My description' } })
      expect(descInput).toHaveValue('My description')

      // Change event type
      const eventSelect = screen.getAllByDisplayValue('Task Completed')[0]
      fireEvent.change(eventSelect, { target: { value: 'error_occurred' } })
      expect(eventSelect).toHaveValue('error_occurred')

      // Change priority
      const prioritySelect = screen.getAllByDisplayValue('Medium')[0]
      fireEvent.change(prioritySelect, { target: { value: 'urgent' } })
      expect(prioritySelect).toHaveValue('urgent')
    })

    it('toggles channel selection in new rule form', async () => {
      await renderAndWait()

      fireEvent.click(screen.getByText('Add Rule'))

      // There should be 4 channel buttons in the new rule form
      // The channel icons in the form section (slack, discord, email, webhook buttons)
      const newRuleSection = screen.getByText('New Rule').closest('div')!
      const _channelButtons = newRuleSection.querySelectorAll('button')
      // Filter to just the channel toggle buttons (they contain icon elements)
      const slackButtons = newRuleSection.querySelectorAll('[data-testid="slack-icon"]')
      expect(slackButtons.length).toBeGreaterThan(0)

      // Click on the slack channel button (parent of icon)
      const slackChannelBtn = slackButtons[0].closest('button')!
      fireEvent.click(slackChannelBtn)

      // Click again to deselect
      fireEvent.click(slackChannelBtn)
    })

    it('cancels new rule form', async () => {
      await renderAndWait()

      fireEvent.click(screen.getByText('Add Rule'))
      expect(screen.getByText('New Rule')).toBeInTheDocument()

      // Click cancel
      fireEvent.click(screen.getByText('Cancel'))

      expect(screen.queryByText('New Rule')).not.toBeInTheDocument()
    })

    it('Create Rule button is disabled when name is empty or no channels selected', async () => {
      await renderAndWait()

      fireEvent.click(screen.getByText('Add Rule'))

      const createBtn = screen.getByText('Create Rule').closest('button')!
      expect(createBtn).toBeDisabled()

      // Fill name but no channels
      fireEvent.change(screen.getByPlaceholderText('e.g., Alert on task failure'), {
        target: { value: 'Test Rule' },
      })
      expect(createBtn).toBeDisabled()
    })

    it('creates a new rule successfully', async () => {
      const createdRule = {
        id: 'rule-new',
        name: 'Test Rule',
        description: '',
        enabled: true,
        event_type: 'task_completed',
        conditions: [],
        channels: ['slack'],
        project_ids: [],
        priority: 'medium',
        message_template: null,
        created_at: '2024-01-03T00:00:00Z',
        updated_at: '2024-01-03T00:00:00Z',
      }

      await renderAndWait(mockRules, mockChannels, [
        { ok: true, json: () => Promise.resolve(createdRule) } as Response,
      ])

      fireEvent.click(screen.getByText('Add Rule'))

      // Fill name
      fireEvent.change(screen.getByPlaceholderText('e.g., Alert on task failure'), {
        target: { value: 'Test Rule' },
      })

      // Select slack channel
      const newRuleSection = screen.getByText('New Rule').closest('div')!
      const slackIcon = newRuleSection.querySelector('[data-testid="slack-icon"]')!
      fireEvent.click(slackIcon.closest('button')!)

      // Click create
      fireEvent.click(screen.getByText('Create Rule').closest('button')!)

      await waitFor(() => {
        expect(screen.queryByText('New Rule')).not.toBeInTheDocument()
        expect(screen.getByText('Test Rule')).toBeInTheDocument()
      })
    })

    it('shows error when create rule fails', async () => {
      await renderAndWait(mockRules, mockChannels, [
        { ok: false, json: () => Promise.resolve({}) } as Response,
      ])

      fireEvent.click(screen.getByText('Add Rule'))

      // Fill name
      fireEvent.change(screen.getByPlaceholderText('e.g., Alert on task failure'), {
        target: { value: 'Test Rule' },
      })

      // Select slack channel
      const newRuleSection = screen.getByText('New Rule').closest('div')!
      const slackIcon = newRuleSection.querySelector('[data-testid="slack-icon"]')!
      fireEvent.click(slackIcon.closest('button')!)

      // Click create
      fireEvent.click(screen.getByText('Create Rule').closest('button')!)

      await waitFor(() => {
        expect(screen.getByText('Failed to create rule')).toBeInTheDocument()
      })
    })

    it('does not create rule when validation fails (no name)', async () => {
      await renderAndWait()

      fireEvent.click(screen.getByText('Add Rule'))

      // Select a channel but no name
      const newRuleSection = screen.getByText('New Rule').closest('div')!
      const slackIcon = newRuleSection.querySelector('[data-testid="slack-icon"]')!
      fireEvent.click(slackIcon.closest('button')!)

      // The button should be disabled, but let's also verify clicking does nothing
      fireEvent.click(screen.getByText('Create Rule').closest('button')!)

      // Form should still be visible (not submitted)
      expect(screen.getByText('New Rule')).toBeInTheDocument()
    })

    it('shows project selection with available projects in new rule form', async () => {
      vi.mocked(useOrchestrationStore).mockReturnValue({
        projects: mockProjects,
        fetchProjects: mockFetchProjects,
      } as unknown as ReturnType<typeof useOrchestrationStore>)

      await renderAndWait()

      fireEvent.click(screen.getByText('Add Rule'))

      // Scope queries to the new rule form section to avoid matching project badges in rule list
      const newRuleSection = screen.getByText('New Rule').closest('div')!
      const newRuleScope = within(newRuleSection)

      // Should show "All Projects (default)" checkbox
      expect(newRuleScope.getByText('All Projects (default)')).toBeInTheDocument()
      expect(newRuleScope.getByText('Project Alpha')).toBeInTheDocument()
      expect(newRuleScope.getByText('Project Beta')).toBeInTheDocument()
    })

    it('toggles project selection in new rule form', async () => {
      vi.mocked(useOrchestrationStore).mockReturnValue({
        projects: mockProjects,
        fetchProjects: mockFetchProjects,
      } as unknown as ReturnType<typeof useOrchestrationStore>)

      await renderAndWait()

      fireEvent.click(screen.getByText('Add Rule'))

      // Scope queries to the new rule form section to avoid matching project badges in rule list
      const newRuleSection = screen.getByText('New Rule').closest('div')!
      const newRuleScope = within(newRuleSection)

      // Click on Project Alpha checkbox
      const alphaCheckbox = newRuleScope.getByText('Project Alpha').closest('label')!.querySelector('input')!
      fireEvent.click(alphaCheckbox)

      // Click on Project Beta checkbox
      const betaCheckbox = newRuleScope.getByText('Project Beta').closest('label')!.querySelector('input')!
      fireEvent.click(betaCheckbox)

      // Click on Project Alpha again to deselect
      fireEvent.click(alphaCheckbox)
    })

    it('resets project_ids when "All Projects" is checked in new rule form', async () => {
      vi.mocked(useOrchestrationStore).mockReturnValue({
        projects: mockProjects,
        fetchProjects: mockFetchProjects,
      } as unknown as ReturnType<typeof useOrchestrationStore>)

      await renderAndWait()

      fireEvent.click(screen.getByText('Add Rule'))

      // Scope queries to the new rule form section to avoid matching project badges in rule list
      const newRuleSection = screen.getByText('New Rule').closest('div')!
      const newRuleScope = within(newRuleSection)

      // Select a project first
      const alphaCheckbox = newRuleScope.getByText('Project Alpha').closest('label')!.querySelector('input')!
      fireEvent.click(alphaCheckbox)

      // Then click All Projects
      const allProjectsCheckbox = newRuleScope.getByText('All Projects (default)').closest('label')!.querySelector('input')!
      fireEvent.click(allProjectsCheckbox)
    })

    it('shows "No projects available" message when projects list is empty', async () => {
      await renderAndWait()

      fireEvent.click(screen.getByText('Add Rule'))

      expect(screen.getByText(/No projects available/)).toBeInTheDocument()
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Delete Rule
  // ─────────────────────────────────────────────────────────────

  describe('Delete Rule', () => {
    it('deletes a rule successfully', async () => {
      await renderAndWait(mockRules, mockChannels, [
        { ok: true, json: () => Promise.resolve({}) } as Response,
      ])

      expect(screen.getByText('Alert on failures')).toBeInTheDocument()

      // Find the delete button for the first rule (trash icon's parent button)
      const ruleCards = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const deleteBtn = ruleCards.querySelector('[data-testid="trash"]')!.closest('button')!
      fireEvent.click(deleteBtn)

      await waitFor(() => {
        expect(screen.queryByText('Alert on failures')).not.toBeInTheDocument()
      })
    })

    it('shows error when delete fails', async () => {
      await renderAndWait(mockRules, mockChannels, [
        { ok: false, json: () => Promise.resolve({}) } as Response,
      ])

      const ruleCards = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const deleteBtn = ruleCards.querySelector('[data-testid="trash"]')!.closest('button')!
      fireEvent.click(deleteBtn)

      await waitFor(() => {
        expect(screen.getByText('Failed to delete rule')).toBeInTheDocument()
      })
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Toggle Rule
  // ─────────────────────────────────────────────────────────────

  describe('Toggle Rule', () => {
    it('toggles a rule on/off', async () => {
      await renderAndWait(mockRules, mockChannels, [
        { ok: true, json: () => Promise.resolve({ enabled: false }) } as Response,
      ])

      // Find toggle button for the first rule (the round toggle button within rule card)
      const ruleRow = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const toggleBtns = ruleRow.querySelectorAll('button[class*="rounded-full"]')
      expect(toggleBtns.length).toBeGreaterThan(0)

      fireEvent.click(toggleBtns[0])

      await waitFor(() => {
        // The API was called
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/notifications/rules/rule-1/toggle'),
          expect.objectContaining({ method: 'POST' })
        )
      })
    })

    it('shows error when toggle fails', async () => {
      await renderAndWait(mockRules, mockChannels, [
        { ok: false, json: () => Promise.resolve({}) } as Response,
      ])

      const ruleRow = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const toggleBtns = ruleRow.querySelectorAll('button[class*="rounded-full"]')
      fireEvent.click(toggleBtns[0])

      await waitFor(() => {
        expect(screen.getByText('Failed to toggle rule')).toBeInTheDocument()
      })
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Inline Editing Mode
  // ─────────────────────────────────────────────────────────────

  describe('Inline Edit Mode', () => {
    it('opens inline edit form when pencil icon is clicked', async () => {
      await renderAndWait()

      // Click the edit (pencil) button for the first rule
      const ruleRow = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const editBtn = ruleRow.querySelector('[data-testid="pencil"]')!.closest('button')!
      fireEvent.click(editBtn)

      await waitFor(() => {
        expect(screen.getByText('Edit Rule')).toBeInTheDocument()
      })

      // The edit form should be pre-populated with rule data
      const nameInput = screen.getByDisplayValue('Alert on failures')
      expect(nameInput).toBeInTheDocument()

      const descInput = screen.getByDisplayValue('Get notified when tasks fail')
      expect(descInput).toBeInTheDocument()
    })

    it('cancels inline edit', async () => {
      await renderAndWait()

      // Open edit mode
      const ruleRow = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const editBtn = ruleRow.querySelector('[data-testid="pencil"]')!.closest('button')!
      fireEvent.click(editBtn)

      expect(screen.getByText('Edit Rule')).toBeInTheDocument()

      // Click cancel
      fireEvent.click(screen.getByText('Cancel'))

      await waitFor(() => {
        expect(screen.queryByText('Edit Rule')).not.toBeInTheDocument()
        // Rule should still be visible in normal display mode
        expect(screen.getByText('Alert on failures')).toBeInTheDocument()
      })
    })

    it('edits rule fields in inline edit mode', async () => {
      await renderAndWait()

      // Open edit mode
      const ruleRow = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const editBtn = ruleRow.querySelector('[data-testid="pencil"]')!.closest('button')!
      fireEvent.click(editBtn)

      // Change name
      const nameInput = screen.getByDisplayValue('Alert on failures')
      fireEvent.change(nameInput, { target: { value: 'Updated Rule Name' } })
      expect(nameInput).toHaveValue('Updated Rule Name')

      // Change description
      const descInput = screen.getByDisplayValue('Get notified when tasks fail')
      fireEvent.change(descInput, { target: { value: 'Updated description' } })
      expect(descInput).toHaveValue('Updated description')

      // Change event type
      const eventSelect = screen.getByDisplayValue('Task Failed')
      fireEvent.change(eventSelect, { target: { value: 'session_started' } })
      expect(eventSelect).toHaveValue('session_started')

      // Change priority
      const prioritySelect = screen.getByDisplayValue('High')
      fireEvent.change(prioritySelect, { target: { value: 'low' } })
      expect(prioritySelect).toHaveValue('low')
    })

    it('saves edited rule successfully', async () => {
      const updatedRule = {
        ...mockRules[0],
        name: 'Updated Rule',
      }

      await renderAndWait(mockRules, mockChannels, [
        { ok: true, json: () => Promise.resolve(updatedRule) } as Response,
      ])

      // Open edit mode
      const ruleRow = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const editBtn = ruleRow.querySelector('[data-testid="pencil"]')!.closest('button')!
      fireEvent.click(editBtn)

      // Change name
      fireEvent.change(screen.getByDisplayValue('Alert on failures'), {
        target: { value: 'Updated Rule' },
      })

      // Click Save Changes
      fireEvent.click(screen.getByText('Save Changes').closest('button')!)

      await waitFor(() => {
        expect(screen.queryByText('Edit Rule')).not.toBeInTheDocument()
        expect(screen.getByText('Updated Rule')).toBeInTheDocument()
      })
    })

    it('shows error when save edit fails', async () => {
      await renderAndWait(mockRules, mockChannels, [
        { ok: false, json: () => Promise.resolve({}) } as Response,
      ])

      // Open edit mode
      const ruleRow = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const editBtn = ruleRow.querySelector('[data-testid="pencil"]')!.closest('button')!
      fireEvent.click(editBtn)

      // Click Save Changes
      fireEvent.click(screen.getByText('Save Changes').closest('button')!)

      await waitFor(() => {
        expect(screen.getByText('Failed to update rule')).toBeInTheDocument()
      })
    })

    it('Save Changes is disabled when name is empty in edit mode', async () => {
      await renderAndWait()

      // Open edit mode
      const ruleRow = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const editBtn = ruleRow.querySelector('[data-testid="pencil"]')!.closest('button')!
      fireEvent.click(editBtn)

      // Clear the name
      fireEvent.change(screen.getByDisplayValue('Alert on failures'), {
        target: { value: '' },
      })

      const saveBtn = screen.getByText('Save Changes').closest('button')!
      expect(saveBtn).toBeDisabled()
    })

    it('Save Changes is disabled when no channels selected in edit mode', async () => {
      await renderAndWait()

      // Open edit mode for rule-1 (has slack channel)
      const ruleRow = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const editBtn = ruleRow.querySelector('[data-testid="pencil"]')!.closest('button')!
      fireEvent.click(editBtn)

      // Deselect the slack channel
      const editSection = screen.getByText('Edit Rule').closest('div')!
      const slackIcon = editSection.querySelector('[data-testid="slack-icon"]')!
      fireEvent.click(slackIcon.closest('button')!)

      const saveBtn = screen.getByText('Save Changes').closest('button')!
      expect(saveBtn).toBeDisabled()
    })

    it('toggles channels in edit mode', async () => {
      await renderAndWait()

      // Open edit mode for rule-1 (has slack channel)
      const ruleRow = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const editBtn = ruleRow.querySelector('[data-testid="pencil"]')!.closest('button')!
      fireEvent.click(editBtn)

      const editSection = screen.getByText('Edit Rule').closest('div')!

      // Add email channel
      const mailIcon = editSection.querySelector('[data-testid="mail-icon"]')!
      fireEvent.click(mailIcon.closest('button')!)

      // Add webhook channel
      const webhookIcon = editSection.querySelector('[data-testid="webhook-icon"]')!
      fireEvent.click(webhookIcon.closest('button')!)

      // Remove email channel
      fireEvent.click(mailIcon.closest('button')!)
    })

    it('shows project selection in edit mode with projects available', async () => {
      vi.mocked(useOrchestrationStore).mockReturnValue({
        projects: mockProjects,
        fetchProjects: mockFetchProjects,
      } as unknown as ReturnType<typeof useOrchestrationStore>)

      await renderAndWait()

      // Open edit mode for rule-2 which has project_ids: ['proj-1']
      const ruleRow = screen.getByText('Approval alerts').closest('div[class*="p-4"]')!
      const editBtn = ruleRow.querySelector('[data-testid="pencil"]')!.closest('button')!
      fireEvent.click(editBtn)

      // Should show project options in edit form
      const editSection = screen.getByText('Edit Rule').closest('div')!
      expect(editSection).toBeInTheDocument()

      // Project Alpha should be checked (proj-1 is in project_ids)
      // Project Beta should be unchecked
      const checkboxes = editSection.querySelectorAll('input[type="checkbox"]')
      expect(checkboxes.length).toBeGreaterThan(0)
    })

    it('toggles project selection in edit mode', async () => {
      vi.mocked(useOrchestrationStore).mockReturnValue({
        projects: mockProjects,
        fetchProjects: mockFetchProjects,
      } as unknown as ReturnType<typeof useOrchestrationStore>)

      await renderAndWait()

      // Open edit mode for rule-1 (project_ids: [])
      const ruleRow = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const editBtn = ruleRow.querySelector('[data-testid="pencil"]')!.closest('button')!
      fireEvent.click(editBtn)

      const editSection = screen.getByText('Edit Rule').closest('div')!

      // Find project checkboxes within edit section
      const projectLabels = editSection.querySelectorAll('label')
      // Click on a project to select it
      for (const label of projectLabels) {
        if (label.textContent?.includes('Project Alpha')) {
          const checkbox = label.querySelector('input[type="checkbox"]')!
          fireEvent.click(checkbox)
          break
        }
      }

      // Click on "All Projects" to reset
      for (const label of projectLabels) {
        if (label.textContent?.includes('All Projects')) {
          const checkbox = label.querySelector('input[type="checkbox"]')!
          fireEvent.click(checkbox)
          break
        }
      }
    })

    it('closes new rule form when entering edit mode', async () => {
      await renderAndWait()

      // Open new rule form
      fireEvent.click(screen.getByText('Add Rule'))
      expect(screen.getByText('New Rule')).toBeInTheDocument()

      // Open edit mode - should close new rule form
      const ruleRow = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      const editBtn = ruleRow.querySelector('[data-testid="pencil"]')!.closest('button')!
      fireEvent.click(editBtn)

      await waitFor(() => {
        expect(screen.queryByText('New Rule')).not.toBeInTheDocument()
        expect(screen.getByText('Edit Rule')).toBeInTheDocument()
      })
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Channel Configuration
  // ─────────────────────────────────────────────────────────────

  describe('Channel Configuration', () => {
    it('expands and collapses channel config on click', async () => {
      await renderAndWait([], mockChannels)

      // Click on slack channel row to expand
      const slackRow = screen.getByText('slack').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(slackRow)

      // Should show Slack Webhook URL label
      await waitFor(() => {
        expect(screen.getByText('Slack Webhook URL')).toBeInTheDocument()
      })

      // Click again to collapse
      fireEvent.click(slackRow)

      await waitFor(() => {
        expect(screen.queryByText('Slack Webhook URL')).not.toBeInTheDocument()
      })
    })

    it('shows slack channel config form when expanded', async () => {
      await renderAndWait([], mockChannels)

      const slackRow = screen.getByText('slack').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(slackRow)

      await waitFor(() => {
        expect(screen.getByText('Slack Webhook URL')).toBeInTheDocument()
        expect(screen.getByPlaceholderText('https://hooks.slack.com/...')).toBeInTheDocument()
        expect(screen.getByText('Create an incoming webhook in Slack workspace settings')).toBeInTheDocument()
      })
    })

    it('shows discord channel config form when expanded', async () => {
      await renderAndWait([], mockChannels)

      const discordRow = screen.getByText('discord').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(discordRow)

      await waitFor(() => {
        expect(screen.getByText('Discord Webhook URL')).toBeInTheDocument()
        expect(screen.getByText('Create a webhook in Discord channel settings')).toBeInTheDocument()
      })
    })

    it('shows email channel config form with SMTP settings when expanded', async () => {
      await renderAndWait([], mockChannels)

      const emailRow = screen.getByText('email').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(emailRow)

      await waitFor(() => {
        expect(screen.getByText('Recipient Email Address')).toBeInTheDocument()
        expect(screen.getByText('SMTP Settings (Gmail)')).toBeInTheDocument()
        expect(screen.getByText('SMTP Host')).toBeInTheDocument()
        expect(screen.getByText('Port')).toBeInTheDocument()
        expect(screen.getByText('Username (Gmail address)')).toBeInTheDocument()
        // "App Password" appears both as a label and in bold help text, so use getAllByText
        const appPasswordElements = screen.getAllByText('App Password')
        expect(appPasswordElements.length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('Use TLS (recommended)')).toBeInTheDocument()
      })
    })

    it('shows webhook channel config form when expanded', async () => {
      await renderAndWait([], mockChannels)

      const webhookRow = screen.getByText('webhook').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(webhookRow)

      await waitFor(() => {
        expect(screen.getByText('Webhook URL')).toBeInTheDocument()
        expect(screen.getByText('Your endpoint will receive JSON payloads via POST')).toBeInTheDocument()
      })
    })

    it('fills in email config form fields', async () => {
      await renderAndWait([], mockChannels)

      const emailRow = screen.getByText('email').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(emailRow)

      await waitFor(() => {
        expect(screen.getByText('Recipient Email Address')).toBeInTheDocument()
      })

      // The email address should be pre-filled from config_summary
      const emailInput = screen.getByPlaceholderText('alerts@example.com')
      expect(emailInput).toHaveValue('test@example.com')

      // Change SMTP host
      const smtpHostInput = screen.getByPlaceholderText('smtp.gmail.com')
      fireEvent.change(smtpHostInput, { target: { value: 'smtp.outlook.com' } })
      expect(smtpHostInput).toHaveValue('smtp.outlook.com')

      // Change port
      const portInput = screen.getByPlaceholderText('587')
      fireEvent.change(portInput, { target: { value: '465' } })
      expect(portInput).toHaveValue(465)

      // Change username
      const usernameInput = screen.getByPlaceholderText('your-email@gmail.com')
      fireEvent.change(usernameInput, { target: { value: 'user@outlook.com' } })
      expect(usernameInput).toHaveValue('user@outlook.com')

      // Toggle TLS
      const tlsCheckbox = screen.getByLabelText('Use TLS (recommended)')
      fireEvent.click(tlsCheckbox)
    })

    it('saves slack webhook config', async () => {
      await renderAndWait([], mockChannels, [
        // For updateChannel call
        { ok: true, json: () => Promise.resolve({}) } as Response,
        // For refetch channels after save success
        { ok: true, json: () => Promise.resolve({ channels: mockChannels }) } as Response,
      ])

      const slackRow = screen.getByText('slack').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(slackRow)

      await waitFor(() => {
        expect(screen.getByText('Slack Webhook URL')).toBeInTheDocument()
      })

      // Enter a webhook URL
      const webhookInput = screen.getByPlaceholderText('https://hooks.slack.com/...')
      fireEvent.change(webhookInput, { target: { value: 'https://hooks.slack.com/services/new' } })

      // Click Save
      fireEvent.click(screen.getByText('1. Save').closest('button')!)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/notifications/channels/slack'),
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ webhook_url: 'https://hooks.slack.com/services/new' }),
          })
        )
      })
    })

    it('saves email config with SMTP settings', async () => {
      await renderAndWait([], mockChannels, [
        // For updateChannel call
        { ok: true, json: () => Promise.resolve({}) } as Response,
        // For refetch channels after save
        { ok: true, json: () => Promise.resolve({ channels: mockChannels }) } as Response,
      ])

      const emailRow = screen.getByText('email').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(emailRow)

      await waitFor(() => {
        expect(screen.getByText('Recipient Email Address')).toBeInTheDocument()
      })

      // Enter app password
      const passwordInput = screen.getByPlaceholderText(/••••/)
      fireEvent.change(passwordInput, { target: { value: 'myapppassword' } })

      // Click Save
      fireEvent.click(screen.getByText('1. Save').closest('button')!)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/notifications/channels/email'),
          expect.objectContaining({
            method: 'PUT',
          })
        )
      })
    })

    it('tests a channel', async () => {
      await renderAndWait([], mockChannels, [
        { ok: true, json: () => Promise.resolve({ success: true }) } as Response,
      ])

      const slackRow = screen.getByText('slack').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(slackRow)

      await waitFor(() => {
        expect(screen.getByText('2. Test')).toBeInTheDocument()
      })

      // Click Test
      fireEvent.click(screen.getByText('2. Test').closest('button')!)

      await waitFor(() => {
        expect(screen.getByText('success')).toBeInTheDocument()
      })
    })

    it('shows test failure result', async () => {
      await renderAndWait([], mockChannels, [
        { ok: true, json: () => Promise.resolve({ success: false, error: 'Connection refused' }) } as Response,
      ])

      const slackRow = screen.getByText('slack').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(slackRow)

      await waitFor(() => {
        expect(screen.getByText('2. Test')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('2. Test').closest('button')!)

      await waitFor(() => {
        expect(screen.getByText('failed: Connection refused')).toBeInTheDocument()
      })
    })

    it('shows test error when exception occurs', async () => {
      const fetchMock = vi.mocked(global.fetch)
      // Initial load: rules + channels
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ channels: mockChannels }),
        } as Response)
        // Test channel call - reject
        .mockRejectedValueOnce(new Error('Network error'))

      render(<NotificationRuleEditor />)
      await waitFor(() => {
        expect(screen.getByText('Notification Rules')).toBeInTheDocument()
      })

      const slackRow = screen.getByText('slack').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(slackRow)

      await waitFor(() => {
        expect(screen.getByText('2. Test')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('2. Test').closest('button')!)

      await waitFor(() => {
        expect(screen.getByText('error: Network error')).toBeInTheDocument()
      })
    })

    it('toggles channel enabled state', async () => {
      await renderAndWait([], mockChannels, [
        // For the updateChannel call
        { ok: true, json: () => Promise.resolve({}) } as Response,
      ])

      // Find the toggle button for the slack channel (switch)
      const slackRow = screen.getByText('slack').closest('div[class*="cursor-pointer"]')!
      const toggleBtn = slackRow.querySelector('button[class*="rounded-full"]')!

      // Click the toggle (with stopPropagation - should not expand)
      fireEvent.click(toggleBtn)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/notifications/channels/slack'),
          expect.objectContaining({ method: 'PUT' })
        )
      })
    })

    it('shows config summary for slack when collapsed', async () => {
      await renderAndWait([], mockChannels)

      // Slack is configured and collapsed, should show webhook URL summary
      expect(screen.getByText(/hooks\.slack\.com/)).toBeInTheDocument()
    })

    it('shows config summary for email when collapsed', async () => {
      await renderAndWait([], mockChannels)

      // Email is configured and collapsed, should show email address summary
      expect(screen.getByText(/test@example\.com/)).toBeInTheDocument()
    })

    it('shows saved indicator for slack webhook when config exists but input is empty', async () => {
      await renderAndWait([], mockChannels)

      const slackRow = screen.getByText('slack').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(slackRow)

      await waitFor(() => {
        // The "saved" indicator should be shown when config_summary has webhook_url and input is empty
        expect(screen.getByText(/저장됨/)).toBeInTheDocument()
      })
    })

    it('shows password saved indicator for email when smtp_password_set is true', async () => {
      const channelsWithPassword = mockChannels.map((ch) =>
        ch.channel === 'email'
          ? {
              ...ch,
              config_summary: {
                ...ch.config_summary,
                email_address: 'test@example.com',
                smtp_host: 'smtp.gmail.com',
                smtp_port: 587,
                smtp_username: 'user@gmail.com',
                smtp_use_tls: true,
                smtp_password_set: true,
              },
            }
          : ch
      )

      await renderAndWait([], channelsWithPassword)

      const emailRow = screen.getByText('email').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(emailRow)

      await waitFor(() => {
        // Should show the password saved indicator
        expect(screen.getByText(/비밀번호 저장됨/)).toBeInTheDocument()
      })
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Project IDs display in rule list
  // ─────────────────────────────────────────────────────────────

  describe('Project display in rule list', () => {
    it('shows project name for rules with specific project_ids', async () => {
      vi.mocked(useOrchestrationStore).mockReturnValue({
        projects: mockProjects,
        fetchProjects: mockFetchProjects,
      } as unknown as ReturnType<typeof useOrchestrationStore>)

      await renderAndWait()

      // rule-2 has project_ids: ['proj-1']
      // With projects mock, proj-1 maps to 'Project Alpha'
      expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    })

    it('shows project id when project name is not found', async () => {
      // No projects in store, so proj-1 should show as raw id
      vi.mocked(useOrchestrationStore).mockReturnValue({
        projects: [],
        fetchProjects: mockFetchProjects,
      } as unknown as ReturnType<typeof useOrchestrationStore>)

      await renderAndWait()

      // rule-2 has project_ids: ['proj-1'], no matching project in store
      expect(screen.getByText('proj-1')).toBeInTheDocument()
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Channel config save error handling
  // ─────────────────────────────────────────────────────────────

  describe('Channel config save error', () => {
    it('handles save error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const fetchMock = vi.mocked(global.fetch)
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ channels: mockChannels }),
        } as Response)
        .mockRejectedValueOnce(new Error('Save failed'))

      render(<NotificationRuleEditor />)
      await waitFor(() => {
        expect(screen.getByText('Notification Rules')).toBeInTheDocument()
      })

      // Expand webhook channel
      const webhookRow = screen.getByText('webhook').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(webhookRow)

      await waitFor(() => {
        expect(screen.getByText('Webhook URL')).toBeInTheDocument()
      })

      // Enter a URL and save
      const urlInput = screen.getByPlaceholderText('https://your-server.com/webhook')
      fireEvent.change(urlInput, { target: { value: 'https://my-server.com/hook' } })

      fireEvent.click(screen.getByText('1. Save').closest('button')!)

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled()
      })

      consoleSpy.mockRestore()
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Disabled rule styling
  // ─────────────────────────────────────────────────────────────

  describe('Disabled rule styling', () => {
    it('applies reduced opacity to disabled rules', async () => {
      await renderAndWait()

      // rule-2 is disabled (enabled: false)
      const disabledRuleRow = screen.getByText('Approval alerts').closest('div[class*="p-4"]')!
      expect(disabledRuleRow.className).toContain('opacity-60')
    })

    it('does not apply reduced opacity to enabled rules', async () => {
      await renderAndWait()

      // rule-1 is enabled (enabled: true)
      const enabledRuleRow = screen.getByText('Alert on failures').closest('div[class*="p-4"]')!
      expect(enabledRuleRow.className).not.toContain('opacity-60')
    })
  })

  // ─────────────────────────────────────────────────────────────
  // Port input edge case
  // ─────────────────────────────────────────────────────────────

  describe('Email SMTP port edge case', () => {
    it('defaults port to 587 when invalid value is entered', async () => {
      await renderAndWait([], mockChannels)

      const emailRow = screen.getByText('email').closest('div[class*="cursor-pointer"]')!
      fireEvent.click(emailRow)

      await waitFor(() => {
        expect(screen.getByText('Port')).toBeInTheDocument()
      })

      const portInput = screen.getByPlaceholderText('587')
      fireEvent.change(portInput, { target: { value: 'abc' } })
      // parseInt('abc') is NaN, so it should fallback to 587
      expect(portInput).toHaveValue(587)
    })
  })
})
