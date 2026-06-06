import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { TranscriptEntry } from '../../../types/claudeSession'

// Mock lucide-react icons used by TranscriptViewer
vi.mock('lucide-react', () => {
  const Icon = (props: Record<string, unknown>) => <span {...props} />
  return {
    ChevronDown: Icon,
    ChevronRight: Icon,
    ChevronLeft: Icon,
    User: Icon,
    Bot: Icon,
    Wrench: Icon,
    CheckCircle: Icon,
    Search: Icon,
    Filter: Icon,
    Loader2: Icon,
    Brain: Icon,
  }
})

// A string longer than the 500-char preview limit, with an end marker that
// only appears once the string is fully expanded.
const END_MARKER = 'END_OF_LONG_STRING_MARKER'
const LONG_STRING = 'x'.repeat(540) + END_MARKER

const longEntry: TranscriptEntry = {
  sessionId: 'sess-1',
  slug: 'demo',
  version: '1.0.0',
  gitBranch: 'main',
  cwd: '/demo',
  type: 'assistant',
  message: { content: LONG_STRING },
  timestamp: '2026-06-06T10:00:00Z',
}

let storeState: Record<string, unknown>

vi.mock('../../../stores/claudeSessions', () => ({
  useClaudeSessionsStore: vi.fn(() => storeState),
}))

import { TranscriptViewer } from '../TranscriptViewer'

describe('TranscriptViewer — JsonString expand toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = {
      selectedSessionId: 'sess-1',
      transcriptEntries: [longEntry],
      transcriptTotalCount: 1,
      transcriptHasMore: false,
      isLoadingTranscript: false,
      fetchTranscript: vi.fn(),
      clearTranscript: vi.fn(),
    }
  })

  it('previews a long string and hides the tail until expanded', () => {
    render(<TranscriptViewer />)
    // Expand the transcript entry to reveal the JSON tree
    fireEvent.click(screen.getByText('assistant'))

    // The 500-char preview must NOT contain the end marker yet
    expect(screen.queryByText(new RegExp(END_MARKER))).not.toBeInTheDocument()
    // A "더 보기" affordance must be present (reports the full length)
    expect(
      screen.getByRole('button', { name: /전체 문자열 보기/ })
    ).toBeInTheDocument()
  })

  it('reveals the full string when "더 보기" is clicked', () => {
    render(<TranscriptViewer />)
    fireEvent.click(screen.getByText('assistant'))

    fireEvent.click(screen.getByRole('button', { name: /전체 문자열 보기/ }))

    // Full content (including the tail marker) is now rendered
    expect(screen.getByText(new RegExp(END_MARKER))).toBeInTheDocument()
    // Toggle now collapses
    expect(screen.getByRole('button', { name: '문자열 접기' })).toBeInTheDocument()
  })

  it('does not truncate short strings (no toggle)', () => {
    storeState.transcriptEntries = [
      { ...longEntry, message: { content: 'short content' } },
    ]
    render(<TranscriptViewer />)
    fireEvent.click(screen.getByText('assistant'))

    expect(screen.queryByRole('button', { name: /전체 문자열 보기/ })).not.toBeInTheDocument()
  })
})
