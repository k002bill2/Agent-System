import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MCPToolCaller } from '../MCPToolCaller'
import type { MCPServer, MCPToolSelection } from '../../../stores/mcp'

// ─────────────────────────────────────────────────────────────
// Mock setup: dynamic store overrides per test
// ─────────────────────────────────────────────────────────────
const mockCallTool = vi.fn()
const mockClearToolResult = vi.fn()
const mockAddToolToSelection = vi.fn()
const mockRemoveToolFromSelection = vi.fn()
const mockUpdateToolArguments = vi.fn()
const mockClearSelectedTools = vi.fn()
const mockCallToolsBatch = vi.fn()
const mockClearBatchResult = vi.fn()

let storeOverrides: Record<string, unknown> = {}

vi.mock('../../../stores/mcp', () => ({
  useMCPStore: () => ({
    lastToolResult: null,
    isCallingTool: false,
    callTool: mockCallTool,
    clearToolResult: mockClearToolResult,
    selectedTools: [],
    lastBatchResult: null,
    isCallingBatch: false,
    addToolToSelection: mockAddToolToSelection,
    removeToolFromSelection: mockRemoveToolFromSelection,
    updateToolArguments: mockUpdateToolArguments,
    clearSelectedTools: mockClearSelectedTools,
    callToolsBatch: mockCallToolsBatch,
    clearBatchResult: mockClearBatchResult,
    ...storeOverrides,
  }),
}))

// Mock lucide-react
vi.mock('lucide-react', () => {
  const icon = (name: string) => {
    const Comp = (props: Record<string, unknown>) => (
      <svg data-testid={`icon-${name}`} {...props} />
    )
    Comp.displayName = `Icon-${name}`
    return Comp
  }
  return {
    Wrench: icon('wrench'),
    Play: icon('play'),
    Clock: icon('clock'),
    CheckCircle: icon('check'),
    AlertCircle: icon('alert'),
    ChevronDown: icon('chevron-down'),
    X: icon('x'),
    Plus: icon('plus'),
    Layers: icon('layers'),
    Trash2: icon('trash'),
  }
})

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const makeServer = (overrides?: Partial<MCPServer>): MCPServer => ({
  id: 'srv-1',
  name: 'Test Server',
  type: 'filesystem',
  description: 'A test MCP server',
  status: 'running',
  tool_count: 2,
  tools: [
    { name: 'read_file', description: 'Read a file', input_schema: {} },
    { name: 'write_file', description: 'Write a file', input_schema: {} },
  ],
  ...overrides,
})

const makeServer2 = (): MCPServer => ({
  id: 'srv-2',
  name: 'GitHub Server',
  type: 'github',
  description: 'GitHub MCP server',
  status: 'running',
  tool_count: 1,
  tools: [
    { name: 'create_issue', description: 'Create a GitHub issue', input_schema: {} },
  ],
})

/** Select a server and optionally a tool */
function selectServerAndTool(toolName?: string) {
  const selects = screen.getAllByRole('combobox')
  fireEvent.change(selects[0], { target: { value: 'srv-1' } })
  if (toolName) {
    fireEvent.change(selects[1], { target: { value: toolName } })
  }
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────
describe('MCPToolCaller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeOverrides = {}
  })

  // ───────────────── Rendering states ─────────────────
  describe('rendering states', () => {
    it('renders title and wrench icon', () => {
      render(<MCPToolCaller servers={[]} />)
      expect(screen.getByText('Tool Caller')).toBeInTheDocument()
      // There are two wrench icons: one in the header, one in the empty state
      const wrenchIcons = screen.getAllByTestId('icon-wrench')
      expect(wrenchIcons.length).toBeGreaterThanOrEqual(1)
    })

    it('shows empty state when no servers at all', () => {
      render(<MCPToolCaller servers={[]} />)
      expect(screen.getByText('No running servers')).toBeInTheDocument()
      expect(screen.getByText('Start a server to call its tools')).toBeInTheDocument()
    })

    it('shows empty state when servers exist but none are running', () => {
      render(<MCPToolCaller servers={[makeServer({ status: 'stopped' })]} />)
      expect(screen.getByText('No running servers')).toBeInTheDocument()
    })

    it('shows empty state for error-status servers', () => {
      render(<MCPToolCaller servers={[makeServer({ status: 'error' })]} />)
      expect(screen.getByText('No running servers')).toBeInTheDocument()
    })

    it('shows empty state for starting-status servers', () => {
      render(<MCPToolCaller servers={[makeServer({ status: 'starting' })]} />)
      expect(screen.getByText('No running servers')).toBeInTheDocument()
    })

    it('renders server select when running servers exist', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('Server')).toBeInTheDocument()
      expect(screen.getByText('Select a server...')).toBeInTheDocument()
    })

    it('shows server option with tool count', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('Test Server (2 tools)')).toBeInTheDocument()
    })

    it('renders multiple running servers as options', () => {
      render(<MCPToolCaller servers={[makeServer(), makeServer2()]} />)
      expect(screen.getByText('Test Server (2 tools)')).toBeInTheDocument()
      expect(screen.getByText('GitHub Server (1 tools)')).toBeInTheDocument()
    })

    it('filters out non-running servers from options', () => {
      render(
        <MCPToolCaller
          servers={[makeServer(), makeServer({ id: 'srv-stopped', name: 'Stopped', status: 'stopped' })]}
        />
      )
      expect(screen.getByText('Test Server (2 tools)')).toBeInTheDocument()
      expect(screen.queryByText(/Stopped/)).not.toBeInTheDocument()
    })

    it('renders mode toggle buttons', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('Single')).toBeInTheDocument()
      expect(screen.getByText('Batch')).toBeInTheDocument()
    })

    it('shows arguments textarea label', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('Arguments (JSON)')).toBeInTheDocument()
    })

    it('shows Tool label', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('Tool')).toBeInTheDocument()
    })

    it('shows server with zero tools', () => {
      render(<MCPToolCaller servers={[makeServer({ tools: [], tool_count: 0 })]} />)
      expect(screen.getByText('Test Server (0 tools)')).toBeInTheDocument()
    })
  })

  // ───────────────── Tool selection ─────────────────
  describe('tool selection', () => {
    it('shows tool options after selecting a server', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      selectServerAndTool()
      expect(screen.getByText('read_file')).toBeInTheDocument()
      expect(screen.getByText('write_file')).toBeInTheDocument()
    })

    it('shows tool description after selecting a tool', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      selectServerAndTool('read_file')
      expect(screen.getByText('Read a file')).toBeInTheDocument()
    })

    it('clears tool selection when changing server', () => {
      render(<MCPToolCaller servers={[makeServer(), makeServer2()]} />)
      selectServerAndTool('read_file')
      expect(screen.getByText('Read a file')).toBeInTheDocument()

      // Switch server
      const selects = screen.getAllByRole('combobox')
      fireEvent.change(selects[0], { target: { value: 'srv-2' } })
      // Tool description should disappear since tool selection is reset
      expect(screen.queryByText('Read a file')).not.toBeInTheDocument()
    })

    it('calls clearToolResult when changing server', () => {
      render(<MCPToolCaller servers={[makeServer(), makeServer2()]} />)
      const selects = screen.getAllByRole('combobox')
      fireEvent.change(selects[0], { target: { value: 'srv-1' } })
      expect(mockClearToolResult).toHaveBeenCalled()
    })

    it('calls clearToolResult when changing tool', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      selectServerAndTool()
      mockClearToolResult.mockClear()
      const selects = screen.getAllByRole('combobox')
      fireEvent.change(selects[1], { target: { value: 'read_file' } })
      expect(mockClearToolResult).toHaveBeenCalled()
    })

    it('tool select is disabled when no server selected', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      const selects = screen.getAllByRole('combobox')
      expect(selects[1]).toBeDisabled()
    })

    it('tool select is enabled after server is selected', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      const selects = screen.getAllByRole('combobox')
      fireEvent.change(selects[0], { target: { value: 'srv-1' } })
      expect(selects[1]).not.toBeDisabled()
    })

    it('tool select is disabled when server has no tools', () => {
      render(<MCPToolCaller servers={[makeServer({ tools: [] })]} />)
      const selects = screen.getAllByRole('combobox')
      fireEvent.change(selects[0], { target: { value: 'srv-1' } })
      expect(selects[1]).toBeDisabled()
    })
  })

  // ───────────────── Parameter input ─────────────────
  describe('parameter input', () => {
    it('renders textarea with default value {}', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      const textarea = screen.getByPlaceholderText('{"key": "value"}')
      expect(textarea).toHaveValue('{}')
    })

    it('allows typing custom JSON arguments', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      const textarea = screen.getByPlaceholderText('{"key": "value"}')
      fireEvent.change(textarea, { target: { value: '{"path": "/tmp/file.txt"}' } })
      expect(textarea).toHaveValue('{"path": "/tmp/file.txt"}')
    })

    it('resets args input when selecting a new tool', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      const textarea = screen.getByPlaceholderText('{"key": "value"}')
      fireEvent.change(textarea, { target: { value: '{"custom": true}' } })
      expect(textarea).toHaveValue('{"custom": true}')

      selectServerAndTool('read_file')
      expect(textarea).toHaveValue('{}')
    })

    it('resets args input when selecting a new server', () => {
      render(<MCPToolCaller servers={[makeServer(), makeServer2()]} />)
      const textarea = screen.getByPlaceholderText('{"key": "value"}')
      fireEvent.change(textarea, { target: { value: '{"custom": true}' } })

      const selects = screen.getAllByRole('combobox')
      fireEvent.change(selects[0], { target: { value: 'srv-2' } })
      expect(textarea).toHaveValue('{}')
    })
  })

  // ───────────────── JSON validation ─────────────────
  describe('JSON validation', () => {
    it('shows error for invalid JSON when calling tool', async () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      selectServerAndTool('read_file')

      const textarea = screen.getByPlaceholderText('{"key": "value"}')
      fireEvent.change(textarea, { target: { value: 'not valid json' } })

      fireEvent.click(screen.getByText('Call Tool'))
      expect(screen.getByText('Invalid JSON format')).toBeInTheDocument()
      expect(mockCallTool).not.toHaveBeenCalled()
    })

    it('shows error when args is an array instead of object', async () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      selectServerAndTool('read_file')

      const textarea = screen.getByPlaceholderText('{"key": "value"}')
      fireEvent.change(textarea, { target: { value: '[1, 2, 3]' } })

      fireEvent.click(screen.getByText('Call Tool'))
      expect(screen.getByText('Arguments must be a JSON object')).toBeInTheDocument()
      expect(mockCallTool).not.toHaveBeenCalled()
    })

    it('shows error when args is a string instead of object', async () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      selectServerAndTool('read_file')

      const textarea = screen.getByPlaceholderText('{"key": "value"}')
      fireEvent.change(textarea, { target: { value: '"just a string"' } })

      fireEvent.click(screen.getByText('Call Tool'))
      expect(screen.getByText('Arguments must be a JSON object')).toBeInTheDocument()
    })

    it('clears error when user types new input', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      selectServerAndTool('read_file')

      const textarea = screen.getByPlaceholderText('{"key": "value"}')
      fireEvent.change(textarea, { target: { value: 'invalid' } })
      fireEvent.click(screen.getByText('Call Tool'))
      expect(screen.getByText('Invalid JSON format')).toBeInTheDocument()

      fireEvent.change(textarea, { target: { value: '{}' } })
      expect(screen.queryByText('Invalid JSON format')).not.toBeInTheDocument()
    })
  })

  // ───────────────── Single mode: execute button & API call ─────────────────
  describe('single mode execution', () => {
    it('shows Call Tool button in single mode', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('Call Tool')).toBeInTheDocument()
    })

    it('Call Tool button is disabled when no server/tool selected', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      const btn = screen.getByText('Call Tool').closest('button')!
      expect(btn).toBeDisabled()
    })

    it('Call Tool button is enabled when server and tool are selected', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      selectServerAndTool('read_file')
      const btn = screen.getByText('Call Tool').closest('button')!
      expect(btn).not.toBeDisabled()
    })

    it('does not call callTool when no server selected', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Call Tool'))
      expect(mockCallTool).not.toHaveBeenCalled()
    })

    it('calls callTool with correct arguments', async () => {
      mockCallTool.mockResolvedValue({ success: true, result: 'ok', execution_time_ms: 50 })
      render(<MCPToolCaller servers={[makeServer()]} />)
      selectServerAndTool('read_file')

      const textarea = screen.getByPlaceholderText('{"key": "value"}')
      fireEvent.change(textarea, { target: { value: '{"path": "/tmp/test.txt"}' } })

      fireEvent.click(screen.getByText('Call Tool'))

      await waitFor(() => {
        expect(mockCallTool).toHaveBeenCalledWith(
          'srv-1',
          'read_file',
          { path: '/tmp/test.txt' }
        )
      })
    })

    it('calls callTool with empty object when default args used', async () => {
      mockCallTool.mockResolvedValue({ success: true, result: null, execution_time_ms: 10 })
      render(<MCPToolCaller servers={[makeServer()]} />)
      selectServerAndTool('read_file')

      fireEvent.click(screen.getByText('Call Tool'))

      await waitFor(() => {
        expect(mockCallTool).toHaveBeenCalledWith('srv-1', 'read_file', {})
      })
    })
  })

  // ───────────────── Loading states ─────────────────
  describe('loading states', () => {
    it('shows Calling... text when isCallingTool is true', () => {
      storeOverrides = { isCallingTool: true }
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('Calling...')).toBeInTheDocument()
      expect(screen.getByTestId('icon-clock')).toBeInTheDocument()
    })

    it('disables Call Tool button when isCallingTool is true', () => {
      storeOverrides = { isCallingTool: true }
      render(<MCPToolCaller servers={[makeServer()]} />)
      const btn = screen.getByText('Calling...').closest('button')!
      expect(btn).toBeDisabled()
    })

    it('shows batch calling text when isCallingBatch is true', () => {
      const tools: MCPToolSelection[] = [
        { serverId: 'srv-1', serverName: 'Test Server', toolName: 'read_file', toolDescription: '', arguments: {} },
        { serverId: 'srv-1', serverName: 'Test Server', toolName: 'write_file', toolDescription: '', arguments: {} },
      ]
      storeOverrides = { selectedTools: tools, isCallingBatch: true }
      render(<MCPToolCaller servers={[makeServer()]} />)

      // Switch to batch mode
      fireEvent.click(screen.getByText('Batch'))
      expect(screen.getByText('Calling 2 tools...')).toBeInTheDocument()
    })

    it('disables batch call button when isCallingBatch is true', () => {
      const tools: MCPToolSelection[] = [
        { serverId: 'srv-1', serverName: 'Test Server', toolName: 'read_file', toolDescription: '', arguments: {} },
      ]
      storeOverrides = { selectedTools: tools, isCallingBatch: true }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      const btn = screen.getByText('Calling 1 tools...').closest('button')!
      expect(btn).toBeDisabled()
    })
  })

  // ───────────────── Single mode: result display ─────────────────
  describe('single result display', () => {
    it('shows success result', () => {
      storeOverrides = {
        lastToolResult: {
          success: true,
          result: { message: 'File read successfully' },
          execution_time_ms: 42,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('Success')).toBeInTheDocument()
      expect(screen.getByText('(42ms)')).toBeInTheDocument()
      expect(screen.getByTestId('icon-check')).toBeInTheDocument()
    })

    it('displays result as formatted JSON', () => {
      storeOverrides = {
        lastToolResult: {
          success: true,
          result: { key: 'value' },
          execution_time_ms: 10,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      const pre = screen.getByText(/"key": "value"/)
      expect(pre).toBeInTheDocument()
    })

    it('shows error result', () => {
      storeOverrides = {
        lastToolResult: {
          success: false,
          error: 'Server connection refused',
          execution_time_ms: 100,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('Error')).toBeInTheDocument()
      expect(screen.getByText('(100ms)')).toBeInTheDocument()
      expect(screen.getByText('Server connection refused')).toBeInTheDocument()
      expect(screen.getByTestId('icon-alert')).toBeInTheDocument()
    })

    it('shows "Unknown error" when error field is empty', () => {
      storeOverrides = {
        lastToolResult: {
          success: false,
          execution_time_ms: 5,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('Unknown error')).toBeInTheDocument()
    })

    it('calls clearToolResult when close button is clicked', () => {
      storeOverrides = {
        lastToolResult: {
          success: true,
          result: 'data',
          execution_time_ms: 20,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      // The close button is inside the result display - it has an X icon
      const closeButtons = screen.getAllByTestId('icon-x')
      // The last X icon should be in the result display
      fireEvent.click(closeButtons[closeButtons.length - 1].closest('button')!)
      expect(mockClearToolResult).toHaveBeenCalled()
    })

    it('does not show result in batch mode', () => {
      storeOverrides = {
        lastToolResult: {
          success: true,
          result: 'should not appear',
          execution_time_ms: 10,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      // Switch to batch mode
      fireEvent.click(screen.getByText('Batch'))
      expect(screen.queryByText('Success')).not.toBeInTheDocument()
    })

    it('handles non-serializable result gracefully', () => {
      storeOverrides = {
        lastToolResult: {
          success: true,
          result: 'plain string result',
          execution_time_ms: 5,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('"plain string result"')).toBeInTheDocument()
    })
  })

  // ───────────────── Batch mode ─────────────────
  describe('batch mode', () => {
    it('shows Add to Batch button in batch mode', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))
      expect(screen.getByText('Add to Batch')).toBeInTheDocument()
    })

    it('Add to Batch button is disabled when no server/tool selected', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))
      const btn = screen.getByText('Add to Batch').closest('button')!
      expect(btn).toBeDisabled()
    })

    it('calls addToolToSelection with correct data', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))
      selectServerAndTool('read_file')

      const textarea = screen.getByPlaceholderText('{"key": "value"}')
      fireEvent.change(textarea, { target: { value: '{"path": "/test"}' } })

      fireEvent.click(screen.getByText('Add to Batch'))

      expect(mockAddToolToSelection).toHaveBeenCalledWith({
        serverId: 'srv-1',
        serverName: 'Test Server',
        toolName: 'read_file',
        toolDescription: 'Read a file',
        arguments: { path: '/test' },
      })
    })

    it('resets tool selection after adding to batch', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))
      selectServerAndTool('read_file')

      fireEvent.click(screen.getByText('Add to Batch'))

      // Tool should be deselected (description should disappear)
      expect(screen.queryByText('Read a file')).not.toBeInTheDocument()
      // Args should be reset
      const textarea = screen.getByPlaceholderText('{"key": "value"}')
      expect(textarea).toHaveValue('{}')
    })

    it('does not add to batch when JSON is invalid', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))
      selectServerAndTool('read_file')

      const textarea = screen.getByPlaceholderText('{"key": "value"}')
      fireEvent.change(textarea, { target: { value: '{invalid}' } })

      fireEvent.click(screen.getByText('Add to Batch'))
      expect(mockAddToolToSelection).not.toHaveBeenCalled()
      expect(screen.getByText('Invalid JSON format')).toBeInTheDocument()
    })

    it('does not add when no server selected', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))
      fireEvent.click(screen.getByText('Add to Batch'))
      expect(mockAddToolToSelection).not.toHaveBeenCalled()
    })

    it('shows selected tools chips', () => {
      const tools: MCPToolSelection[] = [
        { serverId: 'srv-1', serverName: 'Test Server', toolName: 'read_file', toolDescription: 'Read a file', arguments: {} },
        { serverId: 'srv-1', serverName: 'Test Server', toolName: 'write_file', toolDescription: 'Write a file', arguments: { content: 'hi' } },
      ]
      storeOverrides = { selectedTools: tools }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      expect(screen.getByText('Selected:')).toBeInTheDocument()
      expect(screen.getAllByText('Test Server').length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('read_file')).toBeInTheDocument()
      expect(screen.getByText('write_file')).toBeInTheDocument()
    })

    it('calls removeToolFromSelection when chip X is clicked', () => {
      const tools: MCPToolSelection[] = [
        { serverId: 'srv-1', serverName: 'Test Server', toolName: 'read_file', toolDescription: '', arguments: {} },
      ]
      storeOverrides = { selectedTools: tools }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      // Find the X button inside the chip (not the result close button)
      const chipContainer = screen.getByText('read_file').closest('div')!
      const removeBtn = chipContainer.querySelector('button')!
      fireEvent.click(removeBtn)

      expect(mockRemoveToolFromSelection).toHaveBeenCalledWith('srv-1', 'read_file')
    })

    it('shows batch call button with tool count', () => {
      const tools: MCPToolSelection[] = [
        { serverId: 'srv-1', serverName: 'Test Server', toolName: 'read_file', toolDescription: '', arguments: {} },
        { serverId: 'srv-1', serverName: 'Test Server', toolName: 'write_file', toolDescription: '', arguments: {} },
      ]
      storeOverrides = { selectedTools: tools }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      expect(screen.getByText('Call 2 Tools')).toBeInTheDocument()
    })

    it('calls callToolsBatch when batch call button is clicked', async () => {
      const tools: MCPToolSelection[] = [
        { serverId: 'srv-1', serverName: 'Test Server', toolName: 'read_file', toolDescription: '', arguments: {} },
      ]
      storeOverrides = { selectedTools: tools }
      mockCallToolsBatch.mockResolvedValue(null)
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      fireEvent.click(screen.getByText('Call 1 Tools'))

      await waitFor(() => {
        expect(mockCallToolsBatch).toHaveBeenCalledWith(3) // default maxConcurrent
      })
    })

    it('does not call callToolsBatch when selectedTools is empty', () => {
      storeOverrides = { selectedTools: [] }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))
      // No batch call button should be visible when no tools selected
      expect(screen.queryByText(/Call \d+ Tools/)).not.toBeInTheDocument()
    })

    it('shows max concurrent selector', () => {
      const tools: MCPToolSelection[] = [
        { serverId: 'srv-1', serverName: 'Test Server', toolName: 'read_file', toolDescription: '', arguments: {} },
      ]
      storeOverrides = { selectedTools: tools }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      expect(screen.getByText('Max Concurrent:')).toBeInTheDocument()
    })

    it('allows changing max concurrent value', async () => {
      const tools: MCPToolSelection[] = [
        { serverId: 'srv-1', serverName: 'Test Server', toolName: 'read_file', toolDescription: '', arguments: {} },
      ]
      storeOverrides = { selectedTools: tools }
      mockCallToolsBatch.mockResolvedValue(null)
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      // Find the max concurrent select (it's the 3rd combobox: server, tool, maxConcurrent)
      const selects = screen.getAllByRole('combobox')
      const concurrentSelect = selects[selects.length - 1]
      fireEvent.change(concurrentSelect, { target: { value: '5' } })

      fireEvent.click(screen.getByText('Call 1 Tools'))

      await waitFor(() => {
        expect(mockCallToolsBatch).toHaveBeenCalledWith(5)
      })
    })

    it('calls clearSelectedTools when trash button is clicked', () => {
      const tools: MCPToolSelection[] = [
        { serverId: 'srv-1', serverName: 'Test Server', toolName: 'read_file', toolDescription: '', arguments: {} },
      ]
      storeOverrides = { selectedTools: tools }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      const trashBtn = screen.getByTestId('icon-trash').closest('button')!
      fireEvent.click(trashBtn)
      expect(mockClearSelectedTools).toHaveBeenCalled()
    })
  })

  // ───────────────── Batch result display ─────────────────
  describe('batch result display', () => {
    const batchTools: MCPToolSelection[] = [
      { serverId: 'srv-1', serverName: 'Test Server', toolName: 'read_file', toolDescription: '', arguments: {} },
      { serverId: 'srv-1', serverName: 'Test Server', toolName: 'write_file', toolDescription: '', arguments: {} },
    ]

    it('shows batch result summary with success count', () => {
      storeOverrides = {
        selectedTools: batchTools,
        lastBatchResult: {
          results: [
            { success: true, content: ['data1'], execution_time_ms: 10 },
            { success: true, content: ['data2'], execution_time_ms: 20 },
          ],
          total_execution_time_ms: 30,
          success_count: 2,
          failure_count: 0,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      expect(screen.getByText('Batch Result')).toBeInTheDocument()
      expect(screen.getByText('2 success')).toBeInTheDocument()
      expect(screen.getByText('30ms total')).toBeInTheDocument()
    })

    it('shows failure count when there are failures', () => {
      storeOverrides = {
        selectedTools: batchTools,
        lastBatchResult: {
          results: [
            { success: true, content: ['ok'], execution_time_ms: 10 },
            { success: false, error: 'Permission denied', execution_time_ms: 5 },
          ],
          total_execution_time_ms: 15,
          success_count: 1,
          failure_count: 1,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      expect(screen.getByText('1 success')).toBeInTheDocument()
      expect(screen.getByText('1 failed')).toBeInTheDocument()
    })

    it('does not show failure badge when failure_count is 0', () => {
      storeOverrides = {
        selectedTools: batchTools,
        lastBatchResult: {
          results: [
            { success: true, content: [], execution_time_ms: 10 },
          ],
          total_execution_time_ms: 10,
          success_count: 1,
          failure_count: 0,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      expect(screen.queryByText(/failed/)).not.toBeInTheDocument()
    })

    it('shows individual result rows with server/tool names', () => {
      storeOverrides = {
        selectedTools: batchTools,
        lastBatchResult: {
          results: [
            { success: true, content: ['result1'], execution_time_ms: 15 },
            { success: false, error: 'timeout', execution_time_ms: 3000 },
          ],
          total_execution_time_ms: 3015,
          success_count: 1,
          failure_count: 1,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      expect(screen.getByText('Test Server/read_file')).toBeInTheDocument()
      expect(screen.getByText('Test Server/write_file')).toBeInTheDocument()
      expect(screen.getByText('15ms')).toBeInTheDocument()
      expect(screen.getByText('3000ms')).toBeInTheDocument()
    })

    it('expands individual result on click', () => {
      storeOverrides = {
        selectedTools: batchTools,
        lastBatchResult: {
          results: [
            { success: true, content: [{ data: 'file contents' }], execution_time_ms: 10 },
            { success: true, content: ['ok'], execution_time_ms: 5 },
          ],
          total_execution_time_ms: 15,
          success_count: 2,
          failure_count: 0,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      // Click first result row to expand it
      fireEvent.click(screen.getByText('Test Server/read_file'))

      // Should show the content as JSON
      expect(screen.getByText(/"data": "file contents"/)).toBeInTheDocument()
    })

    it('collapses expanded result on second click', () => {
      storeOverrides = {
        selectedTools: [batchTools[0]],
        lastBatchResult: {
          results: [
            { success: true, content: [{ data: 'expanded data' }], execution_time_ms: 10 },
          ],
          total_execution_time_ms: 10,
          success_count: 1,
          failure_count: 0,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      // Expand
      fireEvent.click(screen.getByText('Test Server/read_file'))
      expect(screen.getByText(/"data": "expanded data"/)).toBeInTheDocument()

      // Collapse
      fireEvent.click(screen.getByText('Test Server/read_file'))
      expect(screen.queryByText(/"data": "expanded data"/)).not.toBeInTheDocument()
    })

    it('shows error text for failed individual result', () => {
      storeOverrides = {
        selectedTools: [batchTools[0]],
        lastBatchResult: {
          results: [
            { success: false, error: 'Connection refused', execution_time_ms: 100 },
          ],
          total_execution_time_ms: 100,
          success_count: 0,
          failure_count: 1,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      // Expand to see the error
      fireEvent.click(screen.getByText('Test Server/read_file'))
      expect(screen.getByText('Connection refused')).toBeInTheDocument()
    })

    it('shows "Unknown error" for failed result with no error message', () => {
      storeOverrides = {
        selectedTools: [batchTools[0]],
        lastBatchResult: {
          results: [
            { success: false, execution_time_ms: 50 },
          ],
          total_execution_time_ms: 50,
          success_count: 0,
          failure_count: 1,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      fireEvent.click(screen.getByText('Test Server/read_file'))
      expect(screen.getByText('Unknown error')).toBeInTheDocument()
    })

    it('shows Unknown/Unknown when tool index exceeds tools array', () => {
      storeOverrides = {
        selectedTools: [], // empty tools, but result has entries
        lastBatchResult: {
          results: [
            { success: true, content: ['data'], execution_time_ms: 10 },
          ],
          total_execution_time_ms: 10,
          success_count: 1,
          failure_count: 0,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      expect(screen.getByText('Unknown/Unknown')).toBeInTheDocument()
    })

    it('calls clearBatchResult when close button is clicked', () => {
      storeOverrides = {
        selectedTools: batchTools,
        lastBatchResult: {
          results: [
            { success: true, content: [], execution_time_ms: 10 },
          ],
          total_execution_time_ms: 10,
          success_count: 1,
          failure_count: 0,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      // The close button is next to "Batch Result" text, it contains an X icon.
      // Find all X icons and click the one in the batch result area.
      const _xIcons = screen.getAllByTestId('icon-x')
      // The batch result close button's X icon - find the one whose parent button
      // is inside the batch result summary header
      const batchResultEl = screen.getByText('Batch Result').closest('.rounded-lg')!
      const closeBtnInBatch = batchResultEl.querySelector('button')!
      fireEvent.click(closeBtnInBatch)
      expect(mockClearBatchResult).toHaveBeenCalled()
    })

    it('does not show batch result in single mode', () => {
      storeOverrides = {
        selectedTools: batchTools,
        lastBatchResult: {
          results: [{ success: true, content: [], execution_time_ms: 10 }],
          total_execution_time_ms: 10,
          success_count: 1,
          failure_count: 0,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      // Stay in single mode (default)
      expect(screen.queryByText('Batch Result')).not.toBeInTheDocument()
    })
  })

  // ───────────────── Mode switching ─────────────────
  describe('mode switching', () => {
    it('defaults to single mode', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('Call Tool')).toBeInTheDocument()
      expect(screen.queryByText('Add to Batch')).not.toBeInTheDocument()
    })

    it('switches to batch mode when Batch button is clicked', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))
      expect(screen.queryByText('Call Tool')).not.toBeInTheDocument()
      expect(screen.getByText('Add to Batch')).toBeInTheDocument()
    })

    it('switches back to single mode when Single button is clicked', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))
      expect(screen.getByText('Add to Batch')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Single'))
      expect(screen.getByText('Call Tool')).toBeInTheDocument()
      expect(screen.queryByText('Add to Batch')).not.toBeInTheDocument()
    })

    it('clears both results when switching modes', () => {
      render(<MCPToolCaller servers={[makeServer()]} />)

      fireEvent.click(screen.getByText('Batch'))
      expect(mockClearToolResult).toHaveBeenCalled()
      expect(mockClearBatchResult).toHaveBeenCalled()

      mockClearToolResult.mockClear()
      mockClearBatchResult.mockClear()

      fireEvent.click(screen.getByText('Single'))
      expect(mockClearToolResult).toHaveBeenCalled()
      expect(mockClearBatchResult).toHaveBeenCalled()
    })
  })

  // ───────────────── Edge cases ─────────────────
  describe('edge cases', () => {
    it('handles server with undefined tools array gracefully', () => {
      const server = makeServer({ tools: undefined as unknown as MCPServer['tools'] })
      render(<MCPToolCaller servers={[server]} />)
      const selects = screen.getAllByRole('combobox')
      fireEvent.change(selects[0], { target: { value: 'srv-1' } })
      // Should not crash
      expect(screen.getByText('Tool')).toBeInTheDocument()
    })

    it('falls back to serverId when server name is empty', () => {
      // The component uses: selectedServer?.name || selectedServerId
      // Empty string is falsy, so it falls back to serverId
      render(<MCPToolCaller servers={[makeServer({ name: '' })]} />)
      fireEvent.click(screen.getByText('Batch'))

      const selects = screen.getAllByRole('combobox')
      fireEvent.change(selects[0], { target: { value: 'srv-1' } })
      fireEvent.change(selects[1], { target: { value: 'read_file' } })
      fireEvent.click(screen.getByText('Add to Batch'))

      expect(mockAddToolToSelection).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName: 'srv-1', // falls back to serverId
        })
      )
    })

    it('handles concurrent value of 1', async () => {
      const tools: MCPToolSelection[] = [
        { serverId: 'srv-1', serverName: 'Test Server', toolName: 'read_file', toolDescription: '', arguments: {} },
      ]
      storeOverrides = { selectedTools: tools }
      mockCallToolsBatch.mockResolvedValue(null)
      render(<MCPToolCaller servers={[makeServer()]} />)
      fireEvent.click(screen.getByText('Batch'))

      const selects = screen.getAllByRole('combobox')
      const concurrentSelect = selects[selects.length - 1]
      fireEvent.change(concurrentSelect, { target: { value: '1' } })

      fireEvent.click(screen.getByText('Call 1 Tools'))

      await waitFor(() => {
        expect(mockCallToolsBatch).toHaveBeenCalledWith(1)
      })
    })

    it('renders correctly with deeply nested result objects', () => {
      storeOverrides = {
        lastToolResult: {
          success: true,
          result: { level1: { level2: { level3: 'deep value' } } },
          execution_time_ms: 7,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText(/deep value/)).toBeInTheDocument()
    })

    it('handles numeric result values', () => {
      storeOverrides = {
        lastToolResult: {
          success: true,
          result: 42,
          execution_time_ms: 3,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('42')).toBeInTheDocument()
    })

    it('handles null result value', () => {
      storeOverrides = {
        lastToolResult: {
          success: true,
          result: null,
          execution_time_ms: 1,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('null')).toBeInTheDocument()
    })

    it('handles boolean result value', () => {
      storeOverrides = {
        lastToolResult: {
          success: true,
          result: true,
          execution_time_ms: 1,
        },
      }
      render(<MCPToolCaller servers={[makeServer()]} />)
      expect(screen.getByText('true')).toBeInTheDocument()
    })
  })
})
