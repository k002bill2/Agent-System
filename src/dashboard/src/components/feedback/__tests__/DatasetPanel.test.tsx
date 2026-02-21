import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Database: (props: Record<string, unknown>) => <div data-testid="database" {...props} />,
  Download: (props: Record<string, unknown>) => <div data-testid="download" {...props} />,
  RefreshCw: (props: Record<string, unknown>) => <div data-testid="refresh" {...props} />,
  FileText: (props: Record<string, unknown>) => <div data-testid="file-text" {...props} />,
  Table: (props: Record<string, unknown>) => <div data-testid="table" {...props} />,
  CheckCircle: (props: Record<string, unknown>) => <div data-testid="check-circle" {...props} />,
  XCircle: (props: Record<string, unknown>) => <div data-testid="x-circle" {...props} />,
  Bot: (props: Record<string, unknown>) => <div data-testid="bot" {...props} />,
  BarChart3: (props: Record<string, unknown>) => <div data-testid="bar-chart" {...props} />,
}))

// Mock feedback store
const mockFetchDatasetStats = vi.fn()
const mockExportDataset = vi.fn()

vi.mock('../../../stores/feedback', () => ({
  useFeedbackStore: vi.fn(() => ({
    datasetStats: null,
    isLoading: false,
    fetchDatasetStats: mockFetchDatasetStats,
    exportDataset: mockExportDataset,
  })),
  DatasetExportOptions: {},
}))

import { useFeedbackStore } from '../../../stores/feedback'
import { DatasetPanel } from '../DatasetPanel'

const mockDatasetStats = {
  total_entries: 150,
  positive_entries: 120,
  negative_entries: 30,
  by_agent: { 'agent-1': 80, 'agent-2': 70 },
  by_feedback_type: { explicit_positive: 100, explicit_negative: 30, implicit: 20 },
  avg_input_length: 250,
  avg_output_length: 500,
  last_updated: '2024-01-15T10:30:00Z',
}

describe('DatasetPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useFeedbackStore).mockReturnValue({
      datasetStats: null,
      isLoading: false,
      fetchDatasetStats: mockFetchDatasetStats,
      exportDataset: mockExportDataset,
    } as unknown as ReturnType<typeof useFeedbackStore>)
  })

  it('calls fetchDatasetStats on mount', () => {
    render(<DatasetPanel />)
    expect(mockFetchDatasetStats).toHaveBeenCalled()
  })

  it('renders empty state when no dataset stats', () => {
    render(<DatasetPanel />)

    expect(screen.getByText('No dataset entries yet')).toBeInTheDocument()
    expect(screen.getByText('Process feedbacks to generate training data')).toBeInTheDocument()
  })

  it('renders stats cards when dataset stats are available', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      datasetStats: mockDatasetStats,
      isLoading: false,
      fetchDatasetStats: mockFetchDatasetStats,
      exportDataset: mockExportDataset,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<DatasetPanel />)

    expect(screen.getByText('Total Entries')).toBeInTheDocument()
    expect(screen.getByText('150')).toBeInTheDocument()
    expect(screen.getByText('Positive Samples')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
    expect(screen.getByText('Negative Samples')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('Avg Output Length')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
  })

  it('renders agent breakdown', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      datasetStats: mockDatasetStats,
      isLoading: false,
      fetchDatasetStats: mockFetchDatasetStats,
      exportDataset: mockExportDataset,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<DatasetPanel />)

    expect(screen.getByText('By Agent')).toBeInTheDocument()
    expect(screen.getByText('agent-1: 80')).toBeInTheDocument()
    expect(screen.getByText('agent-2: 70')).toBeInTheDocument()
  })

  it('renders feedback type breakdown', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      datasetStats: mockDatasetStats,
      isLoading: false,
      fetchDatasetStats: mockFetchDatasetStats,
      exportDataset: mockExportDataset,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<DatasetPanel />)

    expect(screen.getByText('By Feedback Type')).toBeInTheDocument()
    expect(screen.getByText('explicit_positive: 100')).toBeInTheDocument()
    expect(screen.getByText('explicit_negative: 30')).toBeInTheDocument()
    expect(screen.getByText('implicit: 20')).toBeInTheDocument()
  })

  it('renders export section with format selection', () => {
    render(<DatasetPanel />)

    expect(screen.getByText('Export Dataset')).toBeInTheDocument()
    expect(screen.getByText('Export Format')).toBeInTheDocument()
    expect(screen.getByText('JSONL')).toBeInTheDocument()
    expect(screen.getByText('CSV')).toBeInTheDocument()
  })

  it('renders export options checkboxes', () => {
    render(<DatasetPanel />)

    expect(screen.getByText('Include negative samples')).toBeInTheDocument()
    expect(screen.getByText('Include implicit feedbacks')).toBeInTheDocument()
  })

  it('shows JSONL format info by default', () => {
    render(<DatasetPanel />)

    expect(screen.getByText('JSONL Format:')).toBeInTheDocument()
  })

  it('switches to CSV format info when CSV is selected', () => {
    render(<DatasetPanel />)

    fireEvent.click(screen.getByText('CSV'))

    expect(screen.getByText('CSV Format:')).toBeInTheDocument()
  })

  it('disables export button when no dataset entries', () => {
    render(<DatasetPanel />)

    const exportButton = screen.getByText('Export Dataset (0 entries)')
    expect(exportButton).toBeDisabled()
  })

  it('enables export button when dataset entries exist', () => {
    vi.mocked(useFeedbackStore).mockReturnValue({
      datasetStats: mockDatasetStats,
      isLoading: false,
      fetchDatasetStats: mockFetchDatasetStats,
      exportDataset: mockExportDataset,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<DatasetPanel />)

    const exportButton = screen.getByText('Export Dataset (150 entries)')
    expect(exportButton).not.toBeDisabled()
  })

  it('calls exportDataset when export button is clicked', async () => {
    mockExportDataset.mockResolvedValue('{"data": "test"}')

    // Mock DOM methods for file download
    const mockCreateElement = vi.spyOn(document, 'createElement')
    const mockCreateObjectURL = vi.fn(() => 'blob:test')
    const mockRevokeObjectURL = vi.fn()
    global.URL.createObjectURL = mockCreateObjectURL
    global.URL.revokeObjectURL = mockRevokeObjectURL

    vi.mocked(useFeedbackStore).mockReturnValue({
      datasetStats: mockDatasetStats,
      isLoading: false,
      fetchDatasetStats: mockFetchDatasetStats,
      exportDataset: mockExportDataset,
    } as unknown as ReturnType<typeof useFeedbackStore>)

    render(<DatasetPanel />)

    fireEvent.click(screen.getByText('Export Dataset (150 entries)'))

    await waitFor(() => {
      expect(mockExportDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'jsonl',
          include_negative: true,
          include_implicit: true,
        })
      )
    })

    mockCreateElement.mockRestore()
  })

  it('renders Dataset Statistics heading', () => {
    render(<DatasetPanel />)

    expect(screen.getByText('Dataset Statistics')).toBeInTheDocument()
  })
})
