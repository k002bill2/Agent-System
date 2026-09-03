import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBootstrap } from '../bootstrap'
import { apiClient } from '../apiClient'

vi.mock('../apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

const mockedGet = vi.mocked(apiClient.get)

const payload = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    avatar_url: null,
    oauth_provider: 'email' as const,
    is_admin: false,
    role: 'user' as const,
  },
  projects: [],
  models: [],
  menu: null,
}

describe('fetchBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('coalesces concurrent startup requests', async () => {
    let resolveRequest: ((value: typeof payload) => void) | undefined
    mockedGet.mockReturnValueOnce(
      new Promise<typeof payload>((resolve) => {
        resolveRequest = resolve
      }),
    )

    const first = fetchBootstrap()
    const second = fetchBootstrap()

    expect(first).toBe(second)
    expect(mockedGet).toHaveBeenCalledTimes(1)

    resolveRequest?.(payload)
    await expect(first).resolves.toEqual(payload)
  })

  it('does not share an in-flight request across auth sessions', async () => {
    let resolveFirst: ((value: typeof payload) => void) | undefined
    mockedGet
      .mockReturnValueOnce(
        new Promise<typeof payload>((resolve) => {
          resolveFirst = resolve
        }),
      )
      .mockResolvedValueOnce(payload)

    const first = fetchBootstrap('session-a')
    const second = fetchBootstrap('session-b')

    expect(first).not.toBe(second)
    expect(mockedGet).toHaveBeenCalledTimes(2)

    resolveFirst?.(payload)
    await expect(first).resolves.toEqual(payload)
    await expect(second).resolves.toEqual(payload)
  })

  it('allows a later request after the previous one settles', async () => {
    mockedGet.mockResolvedValueOnce(payload).mockResolvedValueOnce(payload)

    await expect(fetchBootstrap()).resolves.toEqual(payload)
    await expect(fetchBootstrap()).resolves.toEqual(payload)

    expect(mockedGet).toHaveBeenCalledTimes(2)
  })
})
