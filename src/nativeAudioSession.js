import { Capacitor, registerPlugin } from '@capacitor/core'
import { audioDiag } from './audioDiagnostics'

const MoondroneAudio = registerPlugin('MoondroneAudio')

const nativeSessionDebug = {
  lastResult: null,
  lastError: null,
  registrationStatus: 'unknown',
  lastResultHadError: false,
}

// A native session result can resolve with a Playback category but still carry an error string
// (e.g. "Session activation failed" when backgrounded/locked). That is NOT a clean success.
export function nativeSessionResultHasError(state) {
  if (!state || typeof state !== 'object') {
    return false
  }
  const err = state.error
  return (typeof err === 'string' && err.length > 0)
    || (err != null && typeof err === 'object' && typeof err.message === 'string' && err.message.length > 0)
}

// Throttle window for idempotent reconfigure: if the session is already Playback and was
// configured this recently, a throttled caller (e.g. metronome start) skips the native call.
// This prevents media-primer-before + metronome-post-context back-to-back churn that the
// TestFlight log associated with spurious audioSessionInterrupted events.
const NATIVE_SESSION_THROTTLE_MS = 1500
let lastPlaybackConfiguredAt = 0

// When set (a timestamp in the future), throttled configure calls bypass the recent-Playback skip.
// Used for the first foreground Play after a background stop: resume intentionally does NOT prewarm,
// so the Play gesture must own session setup even though a prior configure happened "recently".
let forcePlaybackConfigureUntil = 0

// Force the next foreground configure calls (media-primer-before + drone-post-context) to bypass the
// recent-call throttle for a short window. Default window comfortably spans prime → Tone.start →
// post-context for one Play gesture.
export function forceNextNativePlaybackConfigure(windowMs = 4000) {
  forcePlaybackConfigureUntil = Date.now() + windowMs
}

export function getNativeSessionDebugState() {
  return {
    lastResult: nativeSessionDebug.lastResult,
    lastError: nativeSessionDebug.lastError,
    registrationStatus: nativeSessionDebug.registrationStatus,
  }
}

export function isIosNative() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
  } catch {
    return false
  }
}

// True when the last native result was Playback AND carried no error (the session is currently in
// the right category and was activated cleanly).
export function isNativePlaybackActive() {
  return Boolean(
    nativeSessionDebug.lastResult
    && nativeSessionDebug.lastResult.category === 'AVAudioSessionCategoryPlayback'
    && !nativeSessionDebug.lastResultHadError,
  )
}

// True only when the most recent native configure resolved cleanly (Playback, no error string).
// Recovery uses this to refuse marking audio health stable after a partial failure.
export function wasLastNativeConfigureClean() {
  return isNativePlaybackActive()
}

// True when Playback is active AND was (re)configured within the throttle window — i.e. a fresh
// reconfigure would be redundant churn. Used to skip metronome-post-context after a recent prewarm
// or media-primer-before configure.
export function isNativePlaybackRecentlyConfigured() {
  return isNativePlaybackActive()
    && Date.now() - lastPlaybackConfiguredAt < NATIVE_SESSION_THROTTLE_MS
}

function setNativeSessionDebug({ result, error, registrationStatus }) {
  if (result !== undefined) {
    nativeSessionDebug.lastResult = result
  }
  if (error !== undefined) {
    nativeSessionDebug.lastError = error
  }
  if (registrationStatus != null) {
    nativeSessionDebug.registrationStatus = registrationStatus
  }
}

export async function configureNativePlaybackSession(reason = 'play', { throttle = false } = {}) {
  if (!isIosNative()) {
    setNativeSessionDebug({ result: null, error: null, registrationStatus: 'not-ios' })
    audioDiag('native-audio-session', `skipped — not iOS native (${reason})`, {
      platform: Capacitor.getPlatform(),
    })
    return null
  }

  const forceActive = Date.now() < forcePlaybackConfigureUntil

  if (
    throttle
    && !forceActive
    && nativeSessionDebug.lastResult
    && nativeSessionDebug.lastResult.category === 'AVAudioSessionCategoryPlayback'
    && Date.now() - lastPlaybackConfiguredAt < NATIVE_SESSION_THROTTLE_MS
  ) {
    audioDiag('native-audio-session', `configurePlaybackSession SKIPPED — throttled (recent Playback) (${reason})`, {
      msSinceLast: Date.now() - lastPlaybackConfiguredAt,
    })
    return nativeSessionDebug.lastResult
  }

  if (throttle && forceActive) {
    // Startup de-duplication: a forced post-lock/background startup should configure native Playback
    // exactly ONCE. media-primer-before does the real re-assert; the later drone-post-context call is
    // redundant churn (which itself can emit an interruption → post-return Play pop). If a CLEAN
    // Playback configure already landed this recently, skip the duplicate — UNLESS the category is
    // wrong or the last configure carried an error, in which case a repeat is genuinely required.
    const cleanPlaybackFresh = isNativePlaybackActive()
      && Date.now() - lastPlaybackConfiguredAt < NATIVE_SESSION_THROTTLE_MS

    if (cleanPlaybackFresh) {
      audioDiag('native-audio-session', `native Playback configure skipped — already fresh for startup (${reason})`, {
        msSinceLast: Date.now() - lastPlaybackConfiguredAt,
      })
      return nativeSessionDebug.lastResult
    }

    const lastCategoryWrong = nativeSessionDebug.lastResult
      && nativeSessionDebug.lastResult.category !== 'AVAudioSessionCategoryPlayback'
    if (nativeSessionDebug.lastResultHadError || lastCategoryWrong) {
      audioDiag('native-audio-session', `native Playback configure repeated because category/error required it (${reason})`, {
        lastResultHadError: nativeSessionDebug.lastResultHadError,
        lastCategory: nativeSessionDebug.lastResult?.category ?? null,
      })
    }

    audioDiag('native-audio-session', `forcing native Playback session for foreground play after background stop (${reason})`, {
      msUntilForceExpires: forcePlaybackConfigureUntil - Date.now(),
    })
  }

  audioDiag('native-audio-session', `configurePlaybackSession → calling native (${reason})`)

  try {
    const state = await MoondroneAudio.configurePlaybackSession()

    if (!state || typeof state.category !== 'string') {
      const debugError = {
        message: 'Native call resolved without session state — plugin likely NOT registered',
        code: 'NO_STATE',
        looksUnimplemented: true,
      }
      nativeSessionDebug.lastResultHadError = true
      setNativeSessionDebug({ result: state ?? null, error: debugError, registrationStatus: 'no-state' })
      audioDiag('native-audio-session', `configurePlaybackSession returned NO STATE (${reason})`, state ?? null)
      return null
    }

    const hasError = nativeSessionResultHasError(state)
    nativeSessionDebug.lastResultHadError = hasError

    if (hasError) {
      // Playback category but activation failed — do NOT treat as a clean configure. Leave
      // lastPlaybackConfiguredAt stale so throttling does not suppress a real retry, and surface a
      // partial-failure log so recovery can refuse to mark audio health stable.
      setNativeSessionDebug({
        result: state,
        error: { message: typeof state.error === 'string' ? state.error : state.error?.message, partial: true },
        registrationStatus: 'registered',
      })
      audioDiag('native-audio-session', `native playback configure partial failure (${reason})`, state)
      return state
    }

    setNativeSessionDebug({ result: state, error: null, registrationStatus: 'registered' })
    if (state.category === 'AVAudioSessionCategoryPlayback') {
      lastPlaybackConfiguredAt = Date.now()
    }
    audioDiag('native-audio-session', `configurePlaybackSession SUCCESS (${reason})`, state)
    return state
  } catch (error) {
    const message = error?.message ?? String(error)
    const code = error?.code
    const looksUnimplemented = code === 'UNIMPLEMENTED' || /not implemented|unimplemented/i.test(message)
    const debugError = { message, code: code ?? null, looksUnimplemented }

    nativeSessionDebug.lastResultHadError = true
    setNativeSessionDebug({
      result: null,
      error: debugError,
      registrationStatus: looksUnimplemented ? 'unimplemented' : 'failed',
    })
    audioDiag('native-audio-session', `configurePlaybackSession FAILED (${reason})`, debugError)
    return null
  }
}

// Plays a short beep using NATIVE iOS audio (AVAudioEngine), bypassing WebAudio entirely.
// Returns { ...sessionState, beepStarted } on success, or { error } on failure / non-iOS.
export async function testNativePlaybackBeep() {
  if (!isIosNative()) {
    const result = { error: 'not iOS native', platform: Capacitor.getPlatform() }
    audioDiag('native-audio-session', 'testNativeBeep skipped — not iOS native', result)
    return result
  }

  audioDiag('native-audio-session', 'testNativeBeep → calling native')

  try {
    const state = await MoondroneAudio.testNativeBeep()
    audioDiag('native-audio-session', 'testNativeBeep SUCCESS', state)
    return state
  } catch (error) {
    const result = { error: error?.message ?? String(error), code: error?.code ?? null }
    audioDiag('native-audio-session', 'testNativeBeep FAILED', result)
    return result
  }
}

export function addNativeAudioSessionListeners({ onInterrupted, onInterruptionEnded, onWillResignActive, onDidBecomeActive } = {}) {
  if (!isIosNative()) {
    return () => {}
  }

  const handles = []

  if (onInterrupted) {
    handles.push(
      MoondroneAudio.addListener('audioSessionInterrupted', (data) => {
        audioDiag('native-audio-session', 'audioSessionInterrupted', data)
        onInterrupted(data)
      }),
    )
  }

  if (onWillResignActive) {
    handles.push(
      MoondroneAudio.addListener('audioWillResignActive', (data) => {
        audioDiag('native-audio-session', 'audioWillResignActive', data)
        onWillResignActive(data)
      }),
    )
  }

  if (onDidBecomeActive) {
    handles.push(
      MoondroneAudio.addListener('audioDidBecomeActive', (data) => {
        audioDiag('native-audio-session', 'audioDidBecomeActive', data)
        onDidBecomeActive(data)
      }),
    )
  }

  if (onInterruptionEnded) {
    handles.push(
      MoondroneAudio.addListener('audioSessionInterruptionEnded', (data) => {
        audioDiag('native-audio-session', 'audioSessionInterruptionEnded', data)
        onInterruptionEnded(data)
      }),
    )
  }

  return () => {
    handles.forEach((handlePromise) => {
      Promise.resolve(handlePromise)
        .then((handle) => handle?.remove?.())
        .catch(() => {})
    })
  }
}
