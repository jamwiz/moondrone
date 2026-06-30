import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { droneEngine } from './droneEngine'
import { audioDiag } from './audioDiagnostics'
import { configureNativePlaybackSession, getNativeSessionDebugState } from './nativeAudioSession'
import { isPrimerPlaying } from './iosMediaPrimer'
import { isMediaPrimerStartupActive } from './mediaPrimerStartupGuard'
import { msSinceUserAudioAction } from './audioActivity'
import { getAudioHealth } from './audioHealth'

// Snapshot used by every lifecycle diagnostic so the debug panel can show what the app saw at
// each background/foreground transition.
function lifecycleSnapshot(extra = {}) {
  let nativeCategory = 'unknown'
  try {
    nativeCategory = getNativeSessionDebugState()?.lastResult?.category ?? 'none'
  } catch {
    nativeCategory = 'error'
  }

  let primerPlaying = 'n/a'
  try {
    primerPlaying = isPrimerPlaying()
  } catch {
    primerPlaying = 'error'
  }

  return {
    engineIsPlaying: droneEngine.isPlaying,
    contextState: droneEngine.getContextState?.() ?? 'unknown',
    documentHidden: typeof document !== 'undefined' ? document.hidden : 'n/a',
    nativeCategory,
    primerPlaying,
    iosBackgroundAudio: shouldAllowIosBackgroundPlayback(),
    ...extra,
  }
}

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

// Do not prewarm within this window after a user audio control tap — focus/visibility/appState
// events can fire during normal control interactions, and a native reconfigure right then emits an
// audioSessionInterrupted that can disrupt live audio.
const PREWARM_USER_ACTION_COOLDOWN_MS = 2000

// Strict gate: a native reconfigure is only harmless when truly idle. Returns a skip reason string
// (for logging) or null when prewarm is allowed.
function prewarmSkipReason() {
  if (isMediaPrimerStartupActive()) {
    return 'startup/stop in progress'
  }

  if (droneEngine.isStarting === true) {
    return 'startup/stop in progress'
  }

  if (droneEngine.isStopFadeActive?.() === true) {
    return 'startup/stop in progress'
  }

  if (droneEngine.isPlaying === true || droneEngine.metronomePlaying === true) {
    return 'audio active'
  }

  if (msSinceUserAudioAction() < PREWARM_USER_ACTION_COOLDOWN_MS) {
    return 'recent user audio action'
  }

  return null
}

// Safe, silent native prewarm: assert the AVAudioSession Playback category so it is already warm
// before the first Play tap. This does NOT play the media primer, does NOT call Tone.start, and
// does NOT start any oscillator/WebAudio — the actual audio unlock stays inside the Play gesture.
// Only fired on true app-open and native app-resume, and only when the strict idle gate passes —
// firing it during normal control flow was causing interruption-driven hard resets.
function prewarmNativePlaybackSession(source) {
  if (!isIosNativePlatform()) {
    return
  }

  const skipReason = prewarmSkipReason()
  if (skipReason) {
    audioDiag('native-prewarm', `prewarm skipped — ${skipReason}`, { source })
    return
  }

  audioDiag('native-prewarm', `prewarm native Playback session (${source})`)
  void configureNativePlaybackSession(`prewarm-${source}`, { throttle: true })
}

// On app resume, verify rather than blindly prewarm/reconfigure:
//   - audio active + context running   -> leave it alone (do not touch the session)
//   - audio active + context not running -> run the shared recovery path ONCE
//   - idle                              -> prewarm through the strict gate
function handleResumeHealthCheck(source, uiIsPlaying, uiIsMetronomePlaying) {
  const audioWasActive = uiIsPlaying === true
    || uiIsMetronomePlaying === true
    || droneEngine.isPlaying === true
    || droneEngine.metronomePlaying === true
  const contextState = droneEngine.getContextState?.() ?? 'unknown'

  if (audioWasActive) {
    if (contextState === 'running') {
      audioDiag('lifecycle', 'resume health check — audio active, no prewarm', {
        source,
        contextState,
        health: getAudioHealth(),
      })
      return
    }

    audioDiag('lifecycle', 'resume health check — recovering interrupted audio', {
      source,
      contextState,
      health: getAudioHealth(),
    })
    void Promise.resolve(droneEngine.attemptContextInterruptRecovery?.(`resume-${source}`)).then((recovered) => {
      const contextAfter = droneEngine.getContextState?.() ?? 'unknown'
      const audioStillActive = droneEngine.isPlaying === true || droneEngine.metronomePlaying === true

      if (recovered && contextAfter === 'running' && audioStillActive) {
        // Recovery only counts on resume when the context is verifiably running again. Stable is
        // gated separately (markAudioHealthStableSoon also re-checks native session + survival).
        audioDiag('lifecycle', 'resume recovery verified context running before stable', {
          source,
          contextState: contextAfter,
        })
        audioDiag('lifecycle', 'resume recovered active audio — no UI reset', {
          source,
          contextState: contextAfter,
        })
      }
    }).catch(() => {})
    return
  }

  audioDiag('lifecycle', 'resume health check — idle prewarm allowed', { source, contextState })
  prewarmNativePlaybackSession(source)
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

function stopPlaybackForLifecycle(setIsPlaying, setIsMetronomePlaying, source) {
  audioDiag('lifecycle', `stopForLifecycle CALLED (${source})`, lifecycleSnapshot())
  const { wasPlaying, wasMetronomePlaying } = droneEngine.stopForLifecycle()

  if (wasPlaying) {
    setIsPlaying(false)
  }

  if (wasMetronomePlaying) {
    setIsMetronomePlaying(false)
  }
}

export function useAppLifecycle(setIsPlaying, setIsMetronomePlaying, uiIsPlaying = false, uiIsMetronomePlaying = false) {
  // App open: silently warm the native Playback session ONCE on true mount (no audio, no Tone.start,
  // no primer). Kept in its own empty-deps effect so it cannot re-fire on every play/stop — the
  // main effect below re-runs when uiIsPlaying/uiIsMetronomePlaying change, and re-firing app-open
  // prewarm there was reconfiguring the native session mid-control and causing interruptions.
  useEffect(() => {
    prewarmNativePlaybackSession('app-open')
  }, [])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (shouldStopPlaybackOnVisibilityOrPageHide()) {
          audioDiag('lifecycle', 'visibilitychange → hidden (will stop)', lifecycleSnapshot())
          stopPlaybackForLifecycle(setIsPlaying, setIsMetronomePlaying, 'visibilitychange-hidden')
        } else {
          audioDiag(
            'lifecycle',
            'visibilitychange → hidden (stop SKIPPED — iOS background audio)',
            lifecycleSnapshot(),
          )
        }

        return
      }

      audioDiag('lifecycle', 'visibilitychange → visible', lifecycleSnapshot())
      void attemptForegroundResume('visibilitychange-visible', uiIsPlaying, uiIsMetronomePlaying)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    const onPageShow = (event) => {
      if (BACKGROUND_AUDIO_RESUME_DEBUG) {
        console.log('[Moondrone background-audio-resume:pageshow-meta]', {
          persisted: event.persisted,
        })
      }

      audioDiag('lifecycle', 'pageshow', lifecycleSnapshot({ persisted: event.persisted }))
      void attemptForegroundResume('pageshow', uiIsPlaying, uiIsMetronomePlaying)
    }

    const onWindowFocus = () => {
      audioDiag('lifecycle', 'window focus', lifecycleSnapshot())
      void attemptForegroundResume('window-focus', uiIsPlaying, uiIsMetronomePlaying)
    }

    // pagehide can fire during iOS backgrounding — skip stop when iOS background audio is enabled.
    const onPageHide = () => {
      if (shouldStopPlaybackOnVisibilityOrPageHide()) {
        audioDiag('lifecycle', 'pagehide (will stop)', lifecycleSnapshot())
        stopPlaybackForLifecycle(setIsPlaying, setIsMetronomePlaying, 'pagehide')
      } else {
        audioDiag('lifecycle', 'pagehide (stop SKIPPED — iOS background audio)', lifecycleSnapshot())
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
              audioDiag('lifecycle', 'app pause / inactive (will stop)', lifecycleSnapshot())
              stopPlaybackForLifecycle(setIsPlaying, setIsMetronomePlaying, 'appStateChange-inactive')
            } else {
              audioDiag(
                'lifecycle',
                'app pause / inactive (stop SKIPPED — iOS background audio)',
                lifecycleSnapshot(),
              )
            }

            return
          }

          audioDiag('lifecycle', 'app resume / active', lifecycleSnapshot())
          handleResumeHealthCheck('appStateChange-active', uiIsPlaying, uiIsMetronomePlaying)
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
