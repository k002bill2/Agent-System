import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Mock icons (render as inert svg so text assertions are clean) ──
vi.mock('lucide-react', () => {
  const icon = (props: Record<string, unknown>) => <svg {...props} />
  return {
    AlertCircle: icon,
    Check: icon,
    CheckCircle: icon,
    Eye: icon,
    EyeOff: icon,
    KeyRound: icon,
    Loader2: icon,
    Lock: icon,
    Pencil: icon,
    Plus: icon,
    ShieldCheck: icon,
    Trash2: icon,
    X: icon,
    XCircle: icon,
  }
})

// ── Mock auth store (selector-aware) ──
let mockAuthState: { user: Record<string, unknown> | null }
vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof mockAuthState) => unknown) =>
    selector ? selector(mockAuthState) : mockAuthState
  ),
}))

// ── Mock deployment usage keys store (selector + getState) ──
const mockFetchKeys = vi.fn()
const mockUpsertKey = vi.fn()
const mockVerifyKey = vi.fn()
const mockRemoveKey = vi.fn()

interface MockKeyState {
  keys: Array<Record<string, unknown>>
  isLoading: boolean
  error: string | null
  fetchKeys: typeof mockFetchKeys
  upsertKey: typeof mockUpsertKey
  verifyKey: typeof mockVerifyKey
  removeKey: typeof mockRemoveKey
}

let mockKeyState: MockKeyState

vi.mock('@/stores/deploymentUsageKeys', () => ({
  useDeploymentUsageKeyStore: Object.assign(
    (selector?: (s: MockKeyState) => unknown) =>
      selector ? selector(mockKeyState) : mockKeyState,
    { getState: () => mockKeyState }
  ),
}))

import { AdminKeyManager } from '../AdminKeyManager'

const openaiDbKey = {
  provider: 'openai',
  has_db_key: true,
  is_active: true,
  source: 'db',
  api_key_masked: 'sk-****1234',
  label: 'org-admin',
  last_verified_at: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

function baseKeyState(overrides: Partial<MockKeyState> = {}): MockKeyState {
  return {
    keys: [],
    isLoading: false,
    error: null,
    fetchKeys: mockFetchKeys,
    upsertKey: mockUpsertKey,
    verifyKey: mockVerifyKey,
    removeKey: mockRemoveKey,
    ...overrides,
  }
}

describe('AdminKeyManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState = { user: { role: 'admin', is_admin: false } }
    mockKeyState = baseKeyState()
  })

  describe('role gating', () => {
    it('shows a read-only notice and does not fetch for non-managers', () => {
      mockAuthState = { user: { role: 'user', is_admin: false } }
      render(<AdminKeyManager />)

      expect(
        screen.getByText('관리자 또는 매니저만 usage admin 키를 설정할 수 있습니다.')
      ).toBeInTheDocument()
      expect(mockFetchKeys).not.toHaveBeenCalled()
    })

    it('fetches keys for managers', () => {
      mockAuthState = { user: { role: 'manager', is_admin: false } }
      render(<AdminKeyManager />)
      expect(mockFetchKeys).toHaveBeenCalled()
    })

    it('fetches keys when is_admin is true even without a role', () => {
      mockAuthState = { user: { is_admin: true } }
      render(<AdminKeyManager />)
      expect(mockFetchKeys).toHaveBeenCalled()
    })
  })

  describe('provider rendering', () => {
    it('renders all three usage-capable providers', () => {
      render(<AdminKeyManager />)
      expect(screen.getByText('OpenAI')).toBeInTheDocument()
      expect(screen.getByText('Anthropic')).toBeInTheDocument()
      expect(screen.getByText('GitHub Copilot')).toBeInTheDocument()
    })

    it('shows masked key and active badge for a DB-sourced key', () => {
      mockKeyState = baseKeyState({ keys: [openaiDbKey] })
      render(<AdminKeyManager />)

      expect(screen.getByText('sk-****1234')).toBeInTheDocument()
      expect(screen.getByText('활성')).toBeInTheDocument()
      expect(screen.getByLabelText('OpenAI 키 수정')).toBeInTheDocument()
      expect(screen.getByLabelText('OpenAI 키 삭제')).toBeInTheDocument()
    })

    it('shows env fallback indicator with the env var name', () => {
      mockKeyState = baseKeyState({
        keys: [
          {
            ...openaiDbKey,
            provider: 'anthropic',
            has_db_key: false,
            is_active: false,
            source: 'env',
            api_key_masked: null,
            label: null,
          },
        ],
      })
      render(<AdminKeyManager />)

      expect(
        screen.getByText('환경변수 사용 중 (EXTERNAL_ANTHROPIC_ADMIN_KEY)')
      ).toBeInTheDocument()
      // No DB key → "설정" affordance, no delete button
      expect(screen.getByLabelText('Anthropic 키 설정')).toBeInTheDocument()
      expect(screen.queryByLabelText('Anthropic 키 삭제')).not.toBeInTheDocument()
    })
  })

  describe('verify', () => {
    it('renders "사용 가능" when usage_capable is true', async () => {
      mockKeyState = baseKeyState({ keys: [openaiDbKey] })
      mockVerifyKey.mockResolvedValueOnce({
        provider: 'openai',
        is_valid: true,
        usage_capable: true,
        status_code: 200,
        error_message: null,
        latency_ms: 90,
      })

      render(<AdminKeyManager />)
      fireEvent.click(screen.getByLabelText('OpenAI 키 검증'))

      expect(mockVerifyKey).toHaveBeenCalledWith('openai')
      await waitFor(() => expect(screen.getByText('사용 가능')).toBeInTheDocument())
    })

    it('renders the "권한 없음" message when valid but not usage-capable', async () => {
      mockKeyState = baseKeyState({ keys: [openaiDbKey] })
      mockVerifyKey.mockResolvedValueOnce({
        provider: 'openai',
        is_valid: true,
        usage_capable: false,
        status_code: 403,
        error_message: null,
        latency_ms: 50,
      })

      render(<AdminKeyManager />)
      fireEvent.click(screen.getByLabelText('OpenAI 키 검증'))

      await waitFor(() =>
        expect(screen.getByText('키는 유효하나 usage 권한 없음')).toBeInTheDocument()
      )
    })

    it('renders the error message when the key is invalid', async () => {
      mockKeyState = baseKeyState({ keys: [openaiDbKey] })
      mockVerifyKey.mockResolvedValueOnce({
        provider: 'openai',
        is_valid: false,
        usage_capable: false,
        status_code: 401,
        error_message: 'invalid api key',
        latency_ms: null,
      })

      render(<AdminKeyManager />)
      fireEvent.click(screen.getByLabelText('OpenAI 키 검증'))

      await waitFor(() => expect(screen.getByText('invalid api key')).toBeInTheDocument())
    })
  })

  describe('upsert form', () => {
    it('submits a snake_case payload including is_active', async () => {
      mockUpsertKey.mockResolvedValueOnce({ ...openaiDbKey })
      render(<AdminKeyManager />)

      fireEvent.click(screen.getByLabelText('OpenAI 키 설정'))

      fireEvent.change(screen.getByLabelText('OpenAI API key'), {
        target: { value: 'sk-supersecret-001' },
      })
      fireEvent.change(screen.getByLabelText('OpenAI key label'), {
        target: { value: 'rotated-key' },
      })
      fireEvent.click(screen.getByLabelText('키 저장'))

      await waitFor(() =>
        expect(mockUpsertKey).toHaveBeenCalledWith('openai', {
          api_key: 'sk-supersecret-001',
          label: 'rotated-key',
          is_active: true,
        })
      )
    })

    it('rejects an api key shorter than the contract minimum', async () => {
      render(<AdminKeyManager />)
      fireEvent.click(screen.getByLabelText('OpenAI 키 설정'))

      fireEvent.change(screen.getByLabelText('OpenAI API key'), {
        target: { value: 'short' },
      })
      fireEvent.click(screen.getByLabelText('키 저장'))

      expect(screen.getByText('API 키는 10~1024자여야 합니다')).toBeInTheDocument()
      expect(mockUpsertKey).not.toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('calls removeKey for the provider', async () => {
      mockKeyState = baseKeyState({ keys: [openaiDbKey] })
      mockRemoveKey.mockResolvedValueOnce(true)

      render(<AdminKeyManager />)
      fireEvent.click(screen.getByLabelText('OpenAI 키 삭제'))

      await waitFor(() => expect(mockRemoveKey).toHaveBeenCalledWith('openai'))
    })
  })
})
