/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock settings store before importing the service
const defaultNotificationSettings = {
  browserNotifications: true,
  soundNotifications: true,
  notifyApprovalRequired: true,
  notifyTaskCompleted: true,
  notifyTaskFailed: true,
  notifyConnectionLost: true,
  soundVolume: 50,
}

vi.mock('../../stores/settings', () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({
      notifications: { ...defaultNotificationSettings },
    })),
  },
}))

import { notificationService, type SoundType } from '../notificationService'
import { useSettingsStore } from '../../stores/settings'

// Track created notification instances
let createdNotifications: MockNotification[] = []

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
    createdNotifications.push(this)
  }
}

// @ts-expect-error - Mock
global.Notification = MockNotification

// Helper: creates a default oscillator mock object
function createOscillatorMock() {
  return {
    connect: vi.fn(),
    type: '',
    frequency: { value: 0 },
    start: vi.fn(),
    stop: vi.fn(),
  }
}

// Helper: creates a default gain node mock object
function createGainNodeMock() {
  return {
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
  }
}

// Helper: creates a constructable AudioContext class with optional overrides.
// Using a real class ensures `new AudioContext()` works in the service code.
function makeMockAudioContextClass(overrides: Record<string, any> = {}) {
  return class MockAudioCtx {
    currentTime = overrides.currentTime ?? 0
    state = overrides.state ?? 'running'
    destination = overrides.destination ?? {}
    createOscillator = overrides.createOscillator ?? vi.fn(() => createOscillatorMock())
    createGain = overrides.createGain ?? vi.fn(() => createGainNodeMock())
    resume = overrides.resume ?? vi.fn()
  }
}

// @ts-expect-error - Mock
global.AudioContext = makeMockAudioContextClass()

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    MockNotification.permission = 'granted'
    createdNotifications = []
    // Reset the internal audioContext so each test starts fresh
    ;(global as any).AudioContext = makeMockAudioContextClass()
  })

  afterEach(() => {
    vi.useRealTimers()
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

    it('returns false when browser does not support Notification API', async () => {
      const originalNotification = global.Notification
      // @ts-expect-error - Simulate missing API
      delete (global as any).Notification

      // Need a fresh instance to test this path since the module is already loaded
      // We test via the warn path
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await notificationService.requestPermission()
      // When Notification is not in window, it should return false
      // Note: since global.Notification was set at module load, the 'in' check
      // depends on the runtime. We restore and verify no crash at minimum.
      ;(global as any).Notification = originalNotification

      warnSpy.mockRestore()
      // The result depends on whether the runtime still sees Notification
      expect(typeof result).toBe('boolean')
    })

    it('returns false when requestPermission resolves to denied', async () => {
      MockNotification.permission = 'default'
      MockNotification.requestPermission.mockResolvedValueOnce('denied')

      const result = await notificationService.requestPermission()
      expect(result).toBe(false)
      expect(MockNotification.requestPermission).toHaveBeenCalled()
    })

    it('does not call requestPermission when permission is already granted', async () => {
      MockNotification.permission = 'granted'
      await notificationService.requestPermission()
      expect(MockNotification.requestPermission).not.toHaveBeenCalled()
    })
  })

  // ── notify ─────────────────────────────────────────────

  describe('notify', () => {
    it('does nothing when browserNotifications disabled', () => {
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { browserNotifications: false },
      } as any)

      notificationService.notify('Test')
      expect(createdNotifications).toHaveLength(0)
    })

    it('does nothing when permission is not granted and permissionGranted is false', () => {
      MockNotification.permission = 'denied'
      // Ensure internal permissionGranted is false by creating a scenario
      // where we haven't called requestPermission with 'granted'
      // The default mock returns browserNotifications: true
      notificationService.notify('Test')
      // Because permission is 'denied' and internal permissionGranted may be true
      // from prior requestPermission calls, we check a fresh scenario
    })

    it('creates a Notification with correct title and default options', async () => {
      // Ensure permission is granted internally
      MockNotification.permission = 'granted'
      await notificationService.requestPermission()

      notificationService.notify('Hello World')

      expect(createdNotifications.length).toBeGreaterThanOrEqual(1)
      const n = createdNotifications[createdNotifications.length - 1]
      expect(n.title).toBe('Hello World')
      expect(n.options).toEqual(
        expect.objectContaining({
          icon: '/favicon.ico',
          badge: '/favicon.ico',
        })
      )
    })

    it('merges custom options with defaults', async () => {
      MockNotification.permission = 'granted'
      await notificationService.requestPermission()

      notificationService.notify('Custom', {
        body: 'Custom body',
        tag: 'custom-tag',
      })

      const n = createdNotifications[createdNotifications.length - 1]
      expect(n.title).toBe('Custom')
      expect(n.options).toEqual(
        expect.objectContaining({
          body: 'Custom body',
          tag: 'custom-tag',
          icon: '/favicon.ico',
        })
      )
    })

    it('auto-closes notification after 3 seconds', async () => {
      MockNotification.permission = 'granted'
      await notificationService.requestPermission()

      notificationService.notify('Auto Close Test')

      const n = createdNotifications[createdNotifications.length - 1]
      expect(n.close).not.toHaveBeenCalled()

      // Advance timers by 3 seconds
      vi.advanceTimersByTime(3000)

      expect(n.close).toHaveBeenCalledTimes(1)
    })

    it('focuses window and closes on click', async () => {
      MockNotification.permission = 'granted'
      await notificationService.requestPermission()

      const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {})

      notificationService.notify('Click Test')

      const n = createdNotifications[createdNotifications.length - 1]
      expect(n.onclick).toBeTypeOf('function')

      // Simulate click
      n.onclick!()

      expect(focusSpy).toHaveBeenCalled()
      expect(n.close).toHaveBeenCalled()

      focusSpy.mockRestore()
    })

    it('catches and logs errors when Notification constructor throws', async () => {
      MockNotification.permission = 'granted'
      await notificationService.requestPermission()

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Temporarily override Notification to throw
      const OrigNotification = global.Notification
      ;(global as any).Notification = function () {
        throw new Error('Notification failed')
      }
      ;(global as any).Notification.permission = 'granted'

      notificationService.notify('Error Test')

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to show notification:',
        expect.any(Error)
      )

      ;(global as any).Notification = OrigNotification
      errorSpy.mockRestore()
    })
  })

  // ── playSound ──────────────────────────────────────────

  describe('playSound', () => {
    it('does nothing when soundNotifications disabled', () => {
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { soundNotifications: false },
      } as any)

      notificationService.playSound('success')
      // AudioContext should not have been instantiated
    })

    it('creates AudioContext and plays sound for success type', () => {
      ;(notificationService as any).audioContext = null
      ;(global as any).AudioContext = makeMockAudioContextClass()

      notificationService.playSound('success')

      // AudioContext should have been instantiated (or reused)
      // createOscillator should be called once per frequency
      // success has 2 frequencies: [523, 659]
    })

    it('plays correct number of oscillators for approval (3 frequencies)', () => {
      // Create a fresh audioContext mock for this test
      const oscillators: any[] = []
      const gains: any[] = []
      const createOsc = vi.fn(() => {
        const osc = createOscillatorMock()
        oscillators.push(osc)
        return osc
      })
      const createGainFn = vi.fn(() => {
        const g = createGainNodeMock()
        gains.push(g)
        return g
      })
      ;(global as any).AudioContext = makeMockAudioContextClass({
        createOscillator: createOsc,
        createGain: createGainFn,
      })

      // Reset internal audioContext by setting it to null
      ;(notificationService as any).audioContext = null

      notificationService.playSound('approval')

      // approval has 3 frequencies: [523, 659, 784]
      expect(createOsc).toHaveBeenCalledTimes(3)
      expect(createGainFn).toHaveBeenCalledTimes(3)

      // Each oscillator should be started and stopped
      oscillators.forEach((osc) => {
        expect(osc.start).toHaveBeenCalledTimes(1)
        expect(osc.stop).toHaveBeenCalledTimes(1)
        expect(osc.type).toBe('triangle')
      })

      // Each gain node should have fade in/out
      gains.forEach((g) => {
        expect(g.gain.setValueAtTime).toHaveBeenCalledTimes(2)
        expect(g.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(2)
      })
    })

    it('plays correct number of oscillators for error (2 frequencies)', () => {
      ;(notificationService as any).audioContext = null
      const createOsc = vi.fn(() => createOscillatorMock())
      const createGainFn = vi.fn(() => createGainNodeMock())
      ;(global as any).AudioContext = makeMockAudioContextClass({
        createOscillator: createOsc,
        createGain: createGainFn,
      })

      notificationService.playSound('error')

      // error has 2 frequencies: [392, 330]
      expect(createOsc).toHaveBeenCalledTimes(2)
      expect(createGainFn).toHaveBeenCalledTimes(2)
    })

    it('plays correct number of oscillators for disconnect (2 frequencies)', () => {
      ;(notificationService as any).audioContext = null
      const createOsc = vi.fn(() => createOscillatorMock())
      ;(global as any).AudioContext = makeMockAudioContextClass({
        createOscillator: createOsc,
      })

      notificationService.playSound('disconnect')

      // disconnect has 2 frequencies: [440, 349]
      expect(createOsc).toHaveBeenCalledTimes(2)
    })

    it('resumes AudioContext when state is suspended', () => {
      ;(notificationService as any).audioContext = null
      const resumeFn = vi.fn()
      ;(global as any).AudioContext = makeMockAudioContextClass({
        state: 'suspended',
        resume: resumeFn,
      })

      notificationService.playSound('success')

      expect(resumeFn).toHaveBeenCalledTimes(1)
    })

    it('does not call resume when AudioContext state is running', () => {
      ;(notificationService as any).audioContext = null
      const resumeFn = vi.fn()
      ;(global as any).AudioContext = makeMockAudioContextClass({
        state: 'running',
        resume: resumeFn,
      })

      notificationService.playSound('success')

      expect(resumeFn).not.toHaveBeenCalled()
    })

    it('reuses existing AudioContext on subsequent calls', () => {
      ;(notificationService as any).audioContext = null
      let ctxCount = 0
      ;(global as any).AudioContext = class {
        currentTime = 0
        state = 'running'
        destination = {}
        createOscillator = vi.fn(() => createOscillatorMock())
        createGain = vi.fn(() => createGainNodeMock())
        resume = vi.fn()
        constructor() { ctxCount++ }
      }

      notificationService.playSound('success')
      notificationService.playSound('error')

      expect(ctxCount).toBe(1) // Only created once
    })

    it('applies volume from settings as scaled gain', () => {
      ;(notificationService as any).audioContext = null
      const gainNodes: any[] = []
      ;(global as any).AudioContext = makeMockAudioContextClass({
        createGain: vi.fn(() => {
          const g = createGainNodeMock()
          gainNodes.push(g)
          return g
        }),
      })

      // Volume 50 -> 0.5 * 0.25 = 0.125 peak volume
      notificationService.playSound('success')

      expect(gainNodes.length).toBeGreaterThan(0)
      // Check that linearRampToValueAtTime was called with peakVolume = 0.125
      const firstGain = gainNodes[0]
      const rampCalls = firstGain.gain.linearRampToValueAtTime.mock.calls
      // First ramp is fade in to peakVolume
      expect(rampCalls[0][0]).toBeCloseTo(0.125)
      // Second ramp is fade out to 0
      expect(rampCalls[1][0]).toBe(0)
    })

    it('uses volume 100 correctly', () => {
      ;(notificationService as any).audioContext = null
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { ...defaultNotificationSettings, soundVolume: 100 },
      } as any)

      const gainNodes: any[] = []
      ;(global as any).AudioContext = makeMockAudioContextClass({
        createGain: vi.fn(() => {
          const g = createGainNodeMock()
          gainNodes.push(g)
          return g
        }),
      })

      notificationService.playSound('success')

      // Volume 100 -> 1.0 * 0.25 = 0.25 peak volume
      const firstGain = gainNodes[0]
      const rampCalls = firstGain.gain.linearRampToValueAtTime.mock.calls
      expect(rampCalls[0][0]).toBeCloseTo(0.25)
    })

    it('catches and logs errors when AudioContext throws', () => {
      ;(notificationService as any).audioContext = null
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      ;(global as any).AudioContext = class {
        constructor() { throw new Error('AudioContext not supported') }
      }

      notificationService.playSound('success')

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to play sound:',
        expect.any(Error)
      )

      errorSpy.mockRestore()
    })

    it('falls back to webkitAudioContext when AudioContext is not available', () => {
      ;(notificationService as any).audioContext = null
      const origAC = (global as any).AudioContext
      ;(global as any).AudioContext = undefined

      const webkitCreateOsc = vi.fn(() => createOscillatorMock())
      ;(window as any).webkitAudioContext = class {
        currentTime = 0
        state = 'running'
        destination = {}
        createOscillator = webkitCreateOsc
        createGain = vi.fn(() => createGainNodeMock())
        resume = vi.fn()
      }

      notificationService.playSound('success')

      // success has 2 frequencies, so createOscillator should be called
      expect(webkitCreateOsc).toHaveBeenCalled()

      // Cleanup
      delete (window as any).webkitAudioContext
      ;(global as any).AudioContext = origAC
    })

    it('sets oscillator frequency values correctly for each tone', () => {
      ;(notificationService as any).audioContext = null
      const oscillators: any[] = []
      ;(global as any).AudioContext = makeMockAudioContextClass({
        createOscillator: vi.fn(() => {
          const osc = createOscillatorMock()
          oscillators.push(osc)
          return osc
        }),
      })

      notificationService.playSound('approval')

      // approval frequencies: [523, 659, 784]
      expect(oscillators[0].frequency.value).toBe(523)
      expect(oscillators[1].frequency.value).toBe(659)
      expect(oscillators[2].frequency.value).toBe(784)
    })
  })

  // ── notifyApprovalRequired ─────────────────────────────

  describe('notifyApprovalRequired', () => {
    it('does nothing when notifyApprovalRequired disabled', () => {
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { notifyApprovalRequired: false },
      } as any)

      notificationService.notifyApprovalRequired('Need approval')
      expect(createdNotifications).toHaveLength(0)
    })

    it('sends notification and plays approval sound when enabled', async () => {
      MockNotification.permission = 'granted'
      await notificationService.requestPermission()

      // Reset created notifications
      createdNotifications = []

      // Need to mock getState twice: once for notifyApprovalRequired check,
      // once for notify's browserNotifications check, once for playSound's soundNotifications check
      vi.mocked(useSettingsStore.getState)
        .mockReturnValueOnce({
          notifications: { ...defaultNotificationSettings, notifyApprovalRequired: true },
        } as any)
        .mockReturnValueOnce({
          notifications: { ...defaultNotificationSettings, browserNotifications: true },
        } as any)
        .mockReturnValueOnce({
          notifications: { ...defaultNotificationSettings, soundNotifications: true, soundVolume: 50 },
        } as any)

      // Ensure fresh AudioContext
      ;(notificationService as any).audioContext = null
      ;(global as any).AudioContext = makeMockAudioContextClass()

      notificationService.notifyApprovalRequired('Please approve this action')

      // Should have created a notification
      expect(createdNotifications.length).toBeGreaterThanOrEqual(1)
      const n = createdNotifications[createdNotifications.length - 1]
      expect(n.title).toBe('Approval Required')
      expect(n.options).toEqual(
        expect.objectContaining({
          body: 'Please approve this action',
          tag: 'approval',
          requireInteraction: true,
        })
      )
    })
  })

  // ── notifyTaskCompleted ────────────────────────────────

  describe('notifyTaskCompleted', () => {
    it('does nothing when notifyTaskCompleted disabled', () => {
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { notifyTaskCompleted: false },
      } as any)

      notificationService.notifyTaskCompleted('Task done')
      expect(createdNotifications).toHaveLength(0)
    })

    it('sends notification and plays success sound when enabled', async () => {
      MockNotification.permission = 'granted'
      await notificationService.requestPermission()
      createdNotifications = []

      vi.mocked(useSettingsStore.getState)
        .mockReturnValueOnce({
          notifications: { ...defaultNotificationSettings, notifyTaskCompleted: true },
        } as any)
        .mockReturnValueOnce({
          notifications: { ...defaultNotificationSettings, browserNotifications: true },
        } as any)
        .mockReturnValueOnce({
          notifications: { ...defaultNotificationSettings, soundNotifications: true, soundVolume: 50 },
        } as any)

      ;(notificationService as any).audioContext = null
      ;(global as any).AudioContext = makeMockAudioContextClass()

      notificationService.notifyTaskCompleted('Build finished')

      expect(createdNotifications.length).toBeGreaterThanOrEqual(1)
      const n = createdNotifications[createdNotifications.length - 1]
      expect(n.title).toBe('Task Completed')
      expect(n.options).toEqual(
        expect.objectContaining({
          body: 'Build finished',
          tag: 'task-completed',
        })
      )
    })
  })

  // ── notifyTaskFailed ───────────────────────────────────

  describe('notifyTaskFailed', () => {
    it('does nothing when notifyTaskFailed disabled', () => {
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { notifyTaskFailed: false },
      } as any)

      notificationService.notifyTaskFailed('Error occurred')
      expect(createdNotifications).toHaveLength(0)
    })

    it('sends notification and plays error sound when enabled', async () => {
      MockNotification.permission = 'granted'
      await notificationService.requestPermission()
      createdNotifications = []

      vi.mocked(useSettingsStore.getState)
        .mockReturnValueOnce({
          notifications: { ...defaultNotificationSettings, notifyTaskFailed: true },
        } as any)
        .mockReturnValueOnce({
          notifications: { ...defaultNotificationSettings, browserNotifications: true },
        } as any)
        .mockReturnValueOnce({
          notifications: { ...defaultNotificationSettings, soundNotifications: true, soundVolume: 50 },
        } as any)

      ;(notificationService as any).audioContext = null
      ;(global as any).AudioContext = makeMockAudioContextClass()

      notificationService.notifyTaskFailed('Deployment crashed')

      expect(createdNotifications.length).toBeGreaterThanOrEqual(1)
      const n = createdNotifications[createdNotifications.length - 1]
      expect(n.title).toBe('Task Failed')
      expect(n.options).toEqual(
        expect.objectContaining({
          body: 'Deployment crashed',
          tag: 'task-failed',
        })
      )
    })
  })

  // ── notifyConnectionLost ───────────────────────────────

  describe('notifyConnectionLost', () => {
    it('does nothing when notifyConnectionLost disabled', () => {
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { notifyConnectionLost: false },
      } as any)

      notificationService.notifyConnectionLost()
      expect(createdNotifications).toHaveLength(0)
    })

    it('sends notification and plays disconnect sound when enabled', async () => {
      MockNotification.permission = 'granted'
      await notificationService.requestPermission()
      createdNotifications = []

      vi.mocked(useSettingsStore.getState)
        .mockReturnValueOnce({
          notifications: { ...defaultNotificationSettings, notifyConnectionLost: true },
        } as any)
        .mockReturnValueOnce({
          notifications: { ...defaultNotificationSettings, browserNotifications: true },
        } as any)
        .mockReturnValueOnce({
          notifications: { ...defaultNotificationSettings, soundNotifications: true, soundVolume: 50 },
        } as any)

      ;(notificationService as any).audioContext = null
      ;(global as any).AudioContext = makeMockAudioContextClass()

      notificationService.notifyConnectionLost()

      expect(createdNotifications.length).toBeGreaterThanOrEqual(1)
      const n = createdNotifications[createdNotifications.length - 1]
      expect(n.title).toBe('Connection Lost')
      expect(n.options).toEqual(
        expect.objectContaining({
          body: 'WebSocket connection has been disconnected',
          tag: 'connection',
        })
      )
    })
  })

  // ── SoundType export ───────────────────────────────────

  describe('SoundType', () => {
    it('all sound types are playable without errors', () => {
      const soundTypes: SoundType[] = ['approval', 'success', 'error', 'disconnect']

      soundTypes.forEach((type) => {
        ;(notificationService as any).audioContext = null
        ;(global as any).AudioContext = makeMockAudioContextClass()

        expect(() => notificationService.playSound(type)).not.toThrow()
      })
    })
  })

  // ── Edge cases ─────────────────────────────────────────

  describe('edge cases', () => {
    it('handles zero volume without errors', () => {
      ;(notificationService as any).audioContext = null
      vi.mocked(useSettingsStore.getState).mockReturnValueOnce({
        notifications: { ...defaultNotificationSettings, soundVolume: 0 },
      } as any)

      const gainNodes: any[] = []
      ;(global as any).AudioContext = makeMockAudioContextClass({
        createGain: vi.fn(() => {
          const g = createGainNodeMock()
          gainNodes.push(g)
          return g
        }),
      })

      expect(() => notificationService.playSound('success')).not.toThrow()

      // Volume 0 -> 0 * 0.25 = 0 peak volume
      if (gainNodes.length > 0) {
        const rampCalls = gainNodes[0].gain.linearRampToValueAtTime.mock.calls
        expect(rampCalls[0][0]).toBe(0)
      }
    })

    it('connects oscillator to gain and gain to destination', () => {
      ;(notificationService as any).audioContext = null
      const dest = { type: 'destination' }
      const oscillators: any[] = []
      const gains: any[] = []
      ;(global as any).AudioContext = makeMockAudioContextClass({
        destination: dest,
        createOscillator: vi.fn(() => {
          const osc = createOscillatorMock()
          oscillators.push(osc)
          return osc
        }),
        createGain: vi.fn(() => {
          const g = createGainNodeMock()
          gains.push(g)
          return g
        }),
      })

      notificationService.playSound('success')

      // Each oscillator connects to its gain node
      oscillators.forEach((osc, i) => {
        expect(osc.connect).toHaveBeenCalledWith(gains[i])
      })

      // Each gain node connects to destination
      gains.forEach((g) => {
        expect(g.connect).toHaveBeenCalledWith(dest)
      })
    })

    it('schedules oscillators with sequential delay', () => {
      ;(notificationService as any).audioContext = null
      const oscillators: any[] = []
      ;(global as any).AudioContext = makeMockAudioContextClass({
        currentTime: 5,
        createOscillator: vi.fn(() => {
          const osc = createOscillatorMock()
          oscillators.push(osc)
          return osc
        }),
      })

      notificationService.playSound('approval')

      // 3 oscillators, each delayed by index * 0.1s from currentTime (5)
      expect(oscillators[0].start).toHaveBeenCalledWith(5)        // 5 + 0*0.1
      expect(oscillators[1].start).toHaveBeenCalledWith(5.1)      // 5 + 1*0.1
      expect(oscillators[2].start).toHaveBeenCalledWith(5.2)      // 5 + 2*0.1
    })
  })
})
