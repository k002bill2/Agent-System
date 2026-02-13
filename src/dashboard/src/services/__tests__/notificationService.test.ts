/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock settings store before importing the service
vi.mock('../../stores/settings', () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({
      notifications: {
        browserNotifications: true,
        soundNotifications: true,
        notifyApprovalRequired: true,
        notifyTaskCompleted: true,
        notifyTaskFailed: true,
        notifyConnectionLost: true,
        soundVolume: 50,
      },
    })),
  },
}))

import { notificationService } from '../notificationService'
import { useSettingsStore } from '../../stores/settings'

// Mock Notification API
class MockNotification {
  static permission = 'granted'
  static requestPermission = vi.fn(() => Promise.resolve('granted' as NotificationPermission))

  title: string
  options: NotificationOptions
  close = vi.fn()
  onclick: (() => void) | null = null

  constructor(title: string, options?: NotificationOptions) {
    this.title = title
    this.options = options || {}
  }
}

// @ts-expect-error - Mock
global.Notification = MockNotification

// Mock AudioContext
const mockOscillator = {
  connect: vi.fn(),
  type: '',
  frequency: { value: 0 },
  start: vi.fn(),
  stop: vi.fn(),
}

const mockGainNode = {
  connect: vi.fn(),
  gain: {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  },
}

const mockAudioContext = {
  currentTime: 0,
  state: 'running',
  destination: {},
  createOscillator: vi.fn(() => ({ ...mockOscillator })),
  createGain: vi.fn(() => ({
    ...mockGainNode,
    gain: { ...mockGainNode.gain },
  })),
  resume: vi.fn(),
}

// @ts-expect-error - Mock
global.AudioContext = vi.fn(() => ({ ...mockAudioContext }))

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockNotification.permission = 'granted'
  })

  // ── requestPermission ──────────────────────────────────

  describe('requestPermission', () => {
    it('returns true when already granted', async () => {
      MockNotification.permission = 'granted'
      const result = await notificationService.requestPermission()
      expect(result).toBe(true)
    })

    it('requests permission when not denied', async () => {
      MockNotification.permission = 'default'
      MockNotification.requestPermission.mockResolvedValueOnce('granted')

      const result = await notificationService.requestPermission()
      expect(result).toBe(true)
      expect(MockNotification.requestPermission).toHaveBeenCalled()
    })

    it('returns false when denied', async () => {
      MockNotification.permission = 'denied'
      const result = await notificationService.requestPermission()
      expect(result).toBe(false)
    })
  })

  // ── notify ─────────────────────────────────────────────

  describe('notify', () => {
    it('does nothing when browserNotifications disabled', () => {
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { browserNotifications: false },
      } as any)

      notificationService.notify('Test')
      // No error thrown
    })
  })

  // ── notifyApprovalRequired ─────────────────────────────

  describe('notifyApprovalRequired', () => {
    it('does nothing when notifyApprovalRequired disabled', () => {
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { notifyApprovalRequired: false },
      } as any)

      notificationService.notifyApprovalRequired('Need approval')
      // No error thrown
    })
  })

  // ── notifyTaskCompleted ────────────────────────────────

  describe('notifyTaskCompleted', () => {
    it('does nothing when notifyTaskCompleted disabled', () => {
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { notifyTaskCompleted: false },
      } as any)

      notificationService.notifyTaskCompleted('Task done')
      // No error thrown
    })
  })

  // ── notifyTaskFailed ───────────────────────────────────

  describe('notifyTaskFailed', () => {
    it('does nothing when notifyTaskFailed disabled', () => {
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { notifyTaskFailed: false },
      } as any)

      notificationService.notifyTaskFailed('Error occurred')
      // No error thrown
    })
  })

  // ── notifyConnectionLost ───────────────────────────────

  describe('notifyConnectionLost', () => {
    it('does nothing when notifyConnectionLost disabled', () => {
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { notifyConnectionLost: false },
      } as any)

      notificationService.notifyConnectionLost()
      // No error thrown
    })
  })

  // ── playSound ──────────────────────────────────────────

  describe('playSound', () => {
    it('does nothing when soundNotifications disabled', () => {
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { soundNotifications: false },
      } as any)

      notificationService.playSound('success')
      // No error thrown
    })
  })
})
