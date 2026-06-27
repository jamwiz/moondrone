import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { droneEngine } from './droneEngine'

// Production: iOS native app continues drone/metronome during background and lock screen.
// Requires UIBackgroundModes audio in ios/App/App/Info.plist.
// Set to false only to restore stop-on-background on iOS (not recommended for release).
export const ENABLE_IOS_BACKGROUND_AUDIO = true

// Temporary diagnostics for foreground resume — set true locally when debugging lifecycle resume.
const BACKGROUND_AUDIO_RESUME_DEBUG = false

function isIosNativePlatform() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

function shouldAllowIosBackgroundPlayback() {
  return ENABLE_IOS_BACKGROUND_AUDIO && isIosNativePlatform()
}

function shouldStopPlaybackOnVisibilityOrPageHide() {
  return !shouldAllowIosBackgroundPlayback()
}

// Native appStateChange: iOS may continue in background; Android keeps stop-on-inactive.
function shouldStopPlaybackOnNativeAppStateInactive() {
  if (shouldAllowIosBackgroundPlayback()) {
    return false
  }

  return true
}

function shouldAttemptLifecycleResume(uiIsPlaying) {
  return shouldAllowIosBackgroundPlayback()
    && uiIsPlaying
    && droneEngine.isPlaying
}

function logBackgroundAudioResume(source, details) {
  if (!BACKGROUND_AUDIO_RESUME_DEBUG) {
    return
  }

  console.log(`[Moondrone background-audio-resume:${source}]`, details)
}

function warnBackgroundAudioResumeBlocked() {
  console.warn(
    '[Moondrone background-audio] Audio was suspended by the browser. Tap Play/Resume to continue.',
  )
}

async function attemptForegroundResume(source, uiIsPlaying, uiIsMetronomePlaying) {
  const baseLog = {
    documentHidden: document.hidden,
    uiIsPlaying,
    uiIsMetronomePlaying,
    engineIsPlaying: droneEngine.isPlaying,
    engineIsStarting: droneEngine.isStarting,
    contextStateBefore: droneEngine.getContextState?.() ?? 'unknown',
  }

  if (!shouldAttemptLifecycleResume(uiIsPlaying)) {
    logBackgroundAudioResume(source, {
      ...baseLog,
      skipped: true,
      reason: !ENABLE_IOS_BACKGROUND_AUDIO
        ? 'ios background audio disabled'
        : !isIosNativePlatform()
          ? 'not ios native'
          : !uiIsPlaying
            ? 'ui not playing'
            : !droneEngine.isPlaying
              ? 'engine not playing'
              : 'unknown',
    })
    return
  }

  let resumeResult

  try {
    resumeResult = await droneEngine.resumeAudioContextForLifecycle()
  } catch (error) {
    resumeResult = {
      attempted: true,
      stateBefore: baseLog.contextStateBefore,
      stateAfter: droneEngine.getContextState?.() ?? 'unknown',
      resumed: false,
      error: error?.message ?? String(error),
      blocked: true,
    }
  }

  logBackgroundAudioResume(source, {
    ...baseLog,
    skipped: false,
    contextStateAfter: resumeResult.stateAfter,
    resumeAttempted: resumeResult.attempted,
    resumeSucceeded: resumeResult.resumed,
    resumeBlocked: resumeResult.blocked,
    resumeError: resumeResult.error,
  })

  if (resumeResult.blocked) {
    warnBackgroundAudioResumeBlocked()
  }
}

function stopPlaybackForLifecycle(setIsPlaying, setIsMetronomePlaying) {
  const { wasPlaying, wasMetronomePlaying } = droneEngine.stopForLifecycle()

  if (wasPlaying) {
    setIsPlaying(false)
  }

  if (wasMetronomePlaying) {
    setIsMetronomePlaying(false)
  }
}

export function useAppLifecycle(setIsPlaying, setIsMetronomePlaying, uiIsPlaying = false, uiIsMetronomePlaying = false) {
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (shouldStopPlaybackOnVisibilityOrPageHide()) {
          stopPlaybackForLifecycle(setIsPlaying, setIsMetronomePlaying)
        }

        return
      }

      void attemptForegroundResume('visibilitychange-visible', uiIsPlaying, uiIsMetronomePlaying)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    const onPageShow = (event) => {
      if (BACKGROUND_AUDIO_RESUME_DEBUG) {
        console.log('[Moondrone background-audio-resume:pageshow-meta]', {
          persisted: event.persisted,
        })
      }

      void attemptForegroundResume('pageshow', uiIsPlaying, uiIsMetronomePlaying)
    }

    const onWindowFocus = () => {
      void attemptForegroundResume('window-focus', uiIsPlaying, uiIsMetronomePlaying)
    }

    // pagehide can fire during iOS backgrounding — skip stop when iOS background audio is enabled.
    const onPageHide = () => {
      if (shouldStopPlaybackOnVisibilityOrPageHide()) {
        stopPlaybackForLifecycle(setIsPlaying, setIsMetronomePlaying)
      }
    }

    if (shouldStopPlaybackOnVisibilityOrPageHide()) {
      window.addEventListener('pagehide', onPageHide)
    } else {
      window.addEventListener('pageshow', onPageShow)
      window.addEventListener('focus', onWindowFocus)
    }

    let appListenerHandle = null
    let cancelled = false

    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        if (cancelled) {
          return
        }

        App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            if (shouldStopPlaybackOnNativeAppStateInactive()) {
              stopPlaybackForLifecycle(setIsPlaying, setIsMetronomePlaying)
            }

            return
          }

          if (shouldAllowIosBackgroundPlayback()) {
            void attemptForegroundResume('appStateChange-active', uiIsPlaying, uiIsMetronomePlaying)
          }
        }).then((handle) => {
          if (cancelled) {
            handle.remove()
            return
          }

          appListenerHandle = handle
        })
      }).catch(() => {})
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)

      if (shouldStopPlaybackOnVisibilityOrPageHide()) {
        window.removeEventListener('pagehide', onPageHide)
      } else {
        window.removeEventListener('pageshow', onPageShow)
        window.removeEventListener('focus', onWindowFocus)
      }

      appListenerHandle?.remove()
    }
  }, [setIsPlaying, setIsMetronomePlaying, uiIsPlaying, uiIsMetronomePlaying])
}
