import { Capacitor, registerPlugin } from '@capacitor/core'
import { audioDiag } from './audioDiagnostics'

const MoondroneAudio = registerPlugin('MoondroneAudio')

const nativeSessionDebug = {
  lastResult: null,
  lastError: null,
  registrationStatus: 'unknown',
}

// Throttle window for idempotent reconfigure: if the session is already Playback and was
// configured this recently, a throttled caller (e.g. metronome start) skips the native call.
// This prevents media-primer-before + metronome-post-context back-to-back churn that the
// TestFlight log associated with spurious audioSessionInterrupted events.
const NATIVE_SESSION_THROTTLE_MS = 1500
let lastPlaybackConfiguredAt = 0

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

  if (
    throttle
    && nativeSessionDebug.lastResult
    && nativeSessionDebug.lastResult.category === 'AVAudioSessionCategoryPlayback'
    && Date.now() - lastPlaybackConfiguredAt < NATIVE_SESSION_THROTTLE_MS
  ) {
    audioDiag('native-audio-session', `configurePlaybackSession SKIPPED — throttled (recent Playback) (${reason})`, {
      msSinceLast: Date.now() - lastPlaybackConfiguredAt,
    })
    return nativeSessionDebug.lastResult
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
      setNativeSessionDebug({ result: state ?? null, error: debugError, registrationStatus: 'no-state' })
      audioDiag('native-audio-session', `configurePlaybackSession returned NO STATE (${reason})`, state ?? null)
      return null
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

export function addNativeAudioSessionListeners({ onInterrupted, onInterruptionEnded } = {}) {
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
