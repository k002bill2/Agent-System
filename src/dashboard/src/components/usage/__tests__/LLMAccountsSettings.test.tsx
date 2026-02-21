import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LLMAccountsSettings } from '../LLMAccountsSettings'

// Mock lucide-react
vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) => (
    <svg data-testid={`icon-${name}`} {...props} />
  )
  return {
    AlertCircle: icon('alert'),
    CheckCircle: icon('check'),
    Eye: icon('eye'),
    EyeOff: icon('eye-off'),
    Key: icon('key'),
    Loader2: icon('loader'),
    Plus: icon('plus'),
    Trash2: icon('trash'),
    XCircle: icon('x-circle'),
  }
})

// Mock the store
const mockFetchCredentials = vi.fn()
const mockRemoveCredential = vi.fn()
const mockAddCredential = vi.fn()
const mockVerifyCredential = vi.fn()

let mockStoreState = {
  credentials: [] as Array<{
    id: string
    provider: 'openai' | 'google_gemini' | 'anthropic'
    key_name: string
    api_key_masked: string
    is_active: boolean
    last_verified_at: string | null
    created_at: string
  }>,
  isLoading: false,
  error: null as string | null,
  fetchCredentials: mockFetchCredentials,
  removeCredential: mockRemoveCredential,
  addCredential: mockAddCredential,
  verifyCredential: mockVerifyCredential,
}

vi.mock('../../../stores/llmCredentials', () => ({
  useLLMCredentialStore: Object.assign(
    (selector?: (s: typeof mockStoreState) => unknown) =>
      selector ? selector(mockStoreState) : mockStoreState,
    {
      getState: () => mockStoreState,
    }
  ),
}))

describe('LLMAccountsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      credentials: [],
      isLoading: false,
      error: null,
      fetchCredentials: mockFetchCredentials,
      removeCredential: mockRemoveCredential,
      addCredential: mockAddCredential,
      verifyCredential: mockVerifyCredential,
    }
  })

  it('renders title', () => {
    render(<LLMAccountsSettings />)
    expect(screen.getByText('LLM API Keys')).toBeInTheDocument()
  })

  it('calls fetchCredentials on mount', () => {
    render(<LLMAccountsSettings />)
    expect(mockFetchCredentials).toHaveBeenCalled()
  })

  it('shows loading state', () => {
    mockStoreState.isLoading = true
    render(<LLMAccountsSettings />)
    expect(screen.getByText('Loading credentials...')).toBeInTheDocument()
  })

  it('shows error state', () => {
    mockStoreState.error = 'Failed to fetch'
    render(<LLMAccountsSettings />)
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument()
  })

  it('shows empty state when no credentials', () => {
    render(<LLMAccountsSettings />)
    expect(screen.getByText('No API keys registered')).toBeInTheDocument()
  })

  it('renders credential list', () => {
    mockStoreState.credentials = [
      {
        id: 'cred-1',
        provider: 'openai',
        key_name: 'production-key',
        api_key_masked: 'sk-...abc',
        is_active: true,
        last_verified_at: null,
        created_at: '2025-01-01T00:00:00Z',
      },
    ]

    render(<LLMAccountsSettings />)
    expect(screen.getByText('production-key')).toBeInTheDocument()
    expect(screen.getByText('sk-...abc')).toBeInTheDocument()
    expect(screen.getByText('OpenAI')).toBeInTheDocument()
  })

  it('renders Add Key button', () => {
    render(<LLMAccountsSettings />)
    expect(screen.getByText('Add Key')).toBeInTheDocument()
  })

  it('shows add form when Add Key is clicked', () => {
    render(<LLMAccountsSettings />)
    fireEvent.click(screen.getByText('Add Key'))
    expect(screen.getByText('Add API Key')).toBeInTheDocument()
    expect(screen.getByText('Provider')).toBeInTheDocument()
    expect(screen.getByText('Key Name')).toBeInTheDocument()
  })

  it('shows credential count badge', () => {
    mockStoreState.credentials = [
      {
        id: 'cred-1',
        provider: 'openai',
        key_name: 'key-1',
        api_key_masked: 'sk-...abc',
        is_active: true,
        last_verified_at: null,
        created_at: '2025-01-01T00:00:00Z',
      },
    ]

    render(<LLMAccountsSettings />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
