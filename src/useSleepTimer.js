import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import {
  addNativeSleepTimerListener,
  isNativeModeEnabled,
  isNativeModeSupported,
  nativeModeCancelSleepTimer,
  nativeModeGetSleepTimerState,
  nativeModeSetSleepTimer,
  nativeModeSnapshot,
} from './nativeModeBridge'
import {
  formatSleepTimerCountdown,
  formatSleepTimerMinutes,
  parseNativeSleepTimerState,
} from './sleepTimerOptions'

function isTimerActiveState(state) {
  return state.status === 'armed' || state.status === 'running' || state.status === 'fading'
}

export function useSleepTimer({
  isPlaying,
  isMetronomePlaying,
  nativeModeEnabled,
  onNativeSleepExpired,
}) {
  const supported = isNativeModeSupported()
  const enabled = supported && nativeModeEnabled && isNativeModeEnabled()

  const [timerState, setTimerState] = useState(() => ({
    status: 'off',
    durationSeconds: 0,
    remainingSeconds: 0,
    armed: false,
    running: false,
    fading: false,
    didExpire: false,
  }))
  const [displayRemainingSeconds, setDisplayRemainingSeconds] = useState(0)

  const syncRef = useRef({
    remainingSeconds: 0,
    syncedAtMs: 0,
    status: 'off',
  })
  const onNativeSleepExpiredRef = useRef(onNativeSleepExpired)

  useEffect(() => {
    onNativeSleepExpiredRef.current = onNativeSleepExpired
  })

  const applyNativeState = useCallback((raw) => {
    const parsed = parseNativeSleepTimerState(raw)
    setTimerState(parsed)
    syncRef.current = {
      remainingSeconds: parsed.remainingSeconds,
      syncedAtMs: performance.now(),
      status: parsed.status,
    }
    if (parsed.status === 'running' || parsed.status === 'fading') {
      setDisplayRemainingSeconds(parsed.remainingSeconds)
    } else {
      setDisplayRemainingSeconds(0)
    }
    return parsed
  }, [])

  const resyncFromNative = useCallback(async (source = 'manual') => {
    if (!enabled) {
      applyNativeState(null)
      return null
    }

    const snap = await nativeModeSnapshot()
    if (snap && typeof snap.sleepTimerStatus === 'string') {
      return applyNativeState(snap)
    }

    const state = await nativeModeGetSleepTimerState()
    if (state) {
      return applyNativeState(state)
    }

    if (source === 'expiration-check') {
      applyNativeState(null)
    }
    return null
  }, [applyNativeState, enabled])

  const selectDuration = useCallback(async (durationSeconds) => {
    if (!enabled) return
    if (!durationSeconds) {
      await nativeModeCancelSleepTimer()
      await resyncFromNative('cancel')
      return
    }
    await nativeModeSetSleepTimer(durationSeconds)
    await resyncFromNative('set')
  }, [enabled, resyncFromNative])

  const cancelTimer = useCallback(async () => {
    if (!enabled) return
    await nativeModeCancelSleepTimer()
    await resyncFromNative('cancel')
  }, [enabled, resyncFromNative])

  useEffect(() => {
    if (!enabled) {
      const resetId = window.setTimeout(() => applyNativeState(null), 0)
      return () => window.clearTimeout(resetId)
    }

    const mountId = window.setTimeout(() => {
      void resyncFromNative('mount')
    }, 0)

    const cleanupListener = addNativeSleepTimerListener((_event, data) => {
      applyNativeState(data)
      if (_event === 'nativeSleepTimerExpired') {
        onNativeSleepExpiredRef.current?.()
        void resyncFromNative('expired-event')
      }
    })

    const onVisibility = () => {
      if (!document.hidden) {
        void resyncFromNative('visibility')
      }
    }

    document.addEventListener('visibilitychange', onVisibility)

    let appHandle = null
    let cancelled = false
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        if (cancelled) return
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            void resyncFromNative('app-active')
          }
        }).then((handle) => {
          if (!cancelled) appHandle = handle
          else handle.remove()
        }).catch(() => {})
      }).catch(() => {})
    }

    return () => {
      cancelled = true
      window.clearTimeout(mountId)
      cleanupListener()
      document.removeEventListener('visibilitychange', onVisibility)
      appHandle?.remove()
    }
  }, [applyNativeState, enabled, resyncFromNative])

  useEffect(() => {
    if (!enabled || !isTimerActiveState(timerState)) {
      return undefined
    }

    const tickMs = timerState.fading || displayRemainingSeconds <= 35 ? 250 : 1000
    const resyncMs = timerState.fading || displayRemainingSeconds <= 35 ? 3000 : 12000

    const tickId = window.setInterval(() => {
      const { remainingSeconds, syncedAtMs, status } = syncRef.current
      if (status !== 'running' && status !== 'fading') {
        return
      }
      const elapsed = (performance.now() - syncedAtMs) / 1000
      const derived = Math.max(0, remainingSeconds - elapsed)
      setDisplayRemainingSeconds(derived)
      if (derived <= 0) {
        void resyncFromNative('expiration-check')
      }
    }, tickMs)

    const resyncId = window.setInterval(() => {
      void resyncFromNative('interval')
    }, resyncMs)

    return () => {
      window.clearInterval(tickId)
      window.clearInterval(resyncId)
    }
  }, [
    displayRemainingSeconds,
    enabled,
    resyncFromNative,
    timerState,
  ])

  useEffect(() => {
    if (!enabled) return undefined
    if (!isPlaying && !isMetronomePlaying && isTimerActiveState(timerState)) {
      const syncId = window.setTimeout(() => {
        void resyncFromNative('audio-idle')
      }, 0)
      return () => window.clearTimeout(syncId)
    }
    return undefined
  }, [enabled, isMetronomePlaying, isPlaying, resyncFromNative, timerState])

  const isActive = isTimerActiveState(timerState)
  const selectedDurationSeconds = timerState.durationSeconds

  const formatStatusSuffix = useCallback(() => {
    if (!enabled || timerState.status === 'off') {
      return ''
    }
    if (timerState.status === 'armed') {
      return ` · Timer ${formatSleepTimerMinutes(timerState.durationSeconds)}`
    }
    if (timerState.status === 'running' || timerState.status === 'fading') {
      return ` · ${formatSleepTimerCountdown(displayRemainingSeconds)}`
    }
    return ''
  }, [displayRemainingSeconds, enabled, timerState])

  const triggerAriaLabel = useCallback(() => {
    if (!enabled) return 'Sleep timer unavailable'
    if (timerState.status === 'off') return 'Open sleep timer'
    if (timerState.status === 'armed') {
      return `Sleep timer armed for ${Math.round(timerState.durationSeconds / 60)} minutes`
    }
    if (timerState.status === 'running' || timerState.status === 'fading') {
      const minutes = Math.floor(displayRemainingSeconds / 60)
      const seconds = Math.ceil(displayRemainingSeconds % 60)
      return `Sleep timer, ${minutes} minutes ${seconds} seconds remaining`
    }
    return 'Open sleep timer'
  }, [displayRemainingSeconds, enabled, timerState])

  return {
    supported,
    enabled,
    timerState,
    isActive,
    selectedDurationSeconds,
    displayRemainingSeconds,
    selectDuration,
    cancelTimer,
    resyncFromNative,
    formatStatusSuffix,
    triggerAriaLabel,
  }
}
