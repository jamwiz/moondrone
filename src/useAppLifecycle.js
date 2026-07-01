import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { droneEngine } from './droneEngine'
import { audioDiag } from './audioDiagnostics'
import { configureNativePlaybackSession, getNativeSessionDebugState } from './nativeAudioSession'
import { isPrimerPlaying, pausePrimer } from './iosMediaPrimer'
import { isMediaPrimerStartupActive } from './mediaPrimerStartupGuard'
import { msSinceUserAudioAction } from './audioActivity'
import { ENABLE_IOS_BACKGROUND_AUDIO } from './backgroundAudioConfig'

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

// Background audio policy lives in its own leaf module so the audio engine can read it too (without
// an import cycle). Re-exported here for existing importers.
export { ENABLE_IOS_BACKGROUND_AUDIO }

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

// On app resume: background audio is disabled, so the lifecycle stop already made us idle before we
// got here. Do NOT prewarm the native session here — a prewarm marks Playback "recently configured"
// and a fast Play would then skip its own media-primer-before / drone-post-context configures and
// could be silent. Just clear stale recovery state and stay idle; the next user Play owns session
// setup (and forces past the throttle via lifecycleStopPendingPlay).
function handleResumeHealthCheck(source) {
  droneEngine.clearBackgroundRecoveryState?.(source)
  audioDiag('lifecycle', 'resume after background stop — idle', lifecycleSnapshot({ source }))
  audioDiag('lifecycle', 'resume prewarm skipped — waiting for user Play', { source })
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
  audioDiag('lifecycle', 'background audio disabled — stopping playback', lifecycleSnapshot({ source }))

  // Graceful declick + clean teardown (NOT a hard reset). Engine reflects stopped intent
  // synchronously so the next Play takes the safe foreground startup path.
  const { wasPlaying, wasMetronomePlaying } = droneEngine.gracefulStopForLifecycle()

  // Make the UI honest immediately — never leave Play active when lifecycle stopped audio.
  setIsPlaying(false)
  setIsMetronomePlaying(false)

  // Pause the primer only AFTER audio has been stopped (force past the startup-guard skip).
  try {
    pausePrimer(`background-stop:${source}`, { force: true })
  } catch {
    // Primer may be absent on non-iOS; ignore.
  }

  audioDiag('lifecycle', 'background stop complete — UI stopped', {
    source,
    wasPlaying,
    wasMetronomePlaying,
  })
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
          // If a willResignActive pre-mute ducked audio but no real background stop followed
          // (transient resign — Control Center, banner), ramp it back up. No-op after a real stop.
          droneEngine.restoreFromBackgroundPreMute?.('appStateChange-active')
          handleResumeHealthCheck('appStateChange-active')
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
