import { useSettingsStore } from '../stores/settings'

export type SoundType = 'approval' | 'success' | 'error' | 'disconnect'

// 사운드 주파수 설정 (Hz)
const SOUND_CONFIG: Record<SoundType, { frequencies: number[]; duration: number }> = {
  approval: { frequencies: [523, 659, 784], duration: 150 },  // C5, E5, G5 (긴급)
  success: { frequencies: [523, 659], duration: 120 },         // C5, E5 (완료)
  error: { frequencies: [392, 330], duration: 200 },           // G4, E4 (에러)
  disconnect: { frequencies: [440, 349], duration: 180 },      // A4, F4 (경고)
}

class NotificationService {
  private audioContext: AudioContext | null = null
  private permissionGranted = false

  // 브라우저 알림 권한 요청
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications')
      return false
    }

    if (Notification.permission === 'granted') {
      this.permissionGranted = true
      return true
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission()
      this.permissionGranted = permission === 'granted'
      return this.permissionGranted
    }

    return false
  }

  // 브라우저 알림 전송
  notify(title: string, options?: NotificationOptions): void {
    const settings = useSettingsStore.getState().notifications

    if (!settings.browserNotifications) return
    if (!this.permissionGranted && Notification.permission !== 'granted') return

    try {
      const notification = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options,
      })

      // 3초 후 자동 닫기
      setTimeout(() => notification.close(), 3000)

      // 클릭 시 창 포커스
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    } catch (error) {
      console.error('Failed to show notification:', error)
    }
  }

  // 사운드 재생 (Web Audio API)
  playSound(type: SoundType): void {
    const settings = useSettingsStore.getState().notifications

    if (!settings.soundNotifications) return

    try {
      // AudioContext 초기화 (사용자 인터랙션 후 필요)
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      }

      // suspended 상태면 resume
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume()
      }

      const config = SOUND_CONFIG[type]
      const volume = settings.soundVolume / 100
      const fadeTime = 0.015 // 15ms fade in/out to prevent clicks

      config.frequencies.forEach((freq, index) => {
        const oscillator = this.audioContext!.createOscillator()
        const gainNode = this.audioContext!.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(this.audioContext!.destination)

        // triangle 웨이브가 sine보다 더 부드러운 소리
        oscillator.type = 'triangle'
        oscillator.frequency.value = freq

        // 시퀀스 재생 (각 음을 약간씩 지연)
        const startTime = this.audioContext!.currentTime + (index * 0.1)
        const duration = config.duration / 1000
        const peakVolume = volume * 0.25

        // Fade in: 0에서 시작하여 부드럽게 올림 (클릭 방지)
        gainNode.gain.setValueAtTime(0, startTime)
        gainNode.gain.linearRampToValueAtTime(peakVolume, startTime + fadeTime)

        // Sustain 후 Fade out
        gainNode.gain.setValueAtTime(peakVolume, startTime + duration - fadeTime)
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration)

        oscillator.start(startTime)
        oscillator.stop(startTime + duration + 0.01)
      })
    } catch (error) {
      console.error('Failed to play sound:', error)
    }
  }

  // 승인 요청 알림
  notifyApprovalRequired(description: string): void {
    const settings = useSettingsStore.getState().notifications
    if (!settings.notifyApprovalRequired) return

    this.notify('Approval Required', {
      body: description,
      tag: 'approval',
      requireInteraction: true,
    })
    this.playSound('approval')
  }

  // 태스크 완료 알림
  notifyTaskCompleted(title: string): void {
    const settings = useSettingsStore.getState().notifications
    if (!settings.notifyTaskCompleted) return

    this.notify('Task Completed', {
      body: title,
      tag: 'task-completed',
    })
    this.playSound('success')
  }

  // 태스크 실패 알림
  notifyTaskFailed(reason: string): void {
    const settings = useSettingsStore.getState().notifications
    if (!settings.notifyTaskFailed) return

    this.notify('Task Failed', {
      body: reason,
      tag: 'task-failed',
    })
    this.playSound('error')
  }

  // 연결 해제 알림
  notifyConnectionLost(): void {
    const settings = useSettingsStore.getState().notifications
    if (!settings.notifyConnectionLost) return

    this.notify('Connection Lost', {
      body: 'WebSocket connection has been disconnected',
      tag: 'connection',
    })
    this.playSound('disconnect')
  }
}

// 싱글톤 인스턴스
export const notificationService = new NotificationService()
