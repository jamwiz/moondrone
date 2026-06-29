// Bridge to the native iOS MoondroneAudio plugin (ios/App/App/AppDelegate.swift).
//
// On iOS Capacitor this lets JS re-assert the AVAudioSession `.playback` category
// immediately before every Play, which is what makes audio ignore the Ring/Silent
// switch. On web / Android it is a safe no-op.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { audioDiag } from './audioDiagnostics'

const MoondroneAudio = registerPlugin('MoondroneAudio')

function isIosNative() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
  } catch {
    return false
  }
}

// Re-assert `.playback` + setActive(true) natively. Returns the native session state
// (category/mode/options/outputVolume/...) or null when not on iOS native.
//
// Failures here are loud (console.warn + audioLog) because a silently-missing native plugin
// is exactly the bug that left Silent Mode broken: registerPlugin() always returns a proxy,
// so the only way to know the native side ran is to see the returned category/mode/sampleRate.
export async function configureNativePlaybackSession(reason = 'play') {
  if (!isIosNative()) {
    audioDiag('native-audio-session', `skipped — not iOS native (${reason})`, {
      platform: (() => {
        try {
          return Capacitor.getPlatform()
        } catch {
          return 'unknown'
        }
      })(),
    })
    return null
  }

  audioDiag('native-audio-session', `configurePlaybackSession → calling native (${reason})`)
  console.warn(`[Moondrone native-audio-session] calling native configurePlaybackSession (${reason})`)

  try {
    const state = await MoondroneAudio.configurePlaybackSession()

    if (!state || typeof state.category !== 'string') {
      // The promise resolved but with no recognizable session state — treat as a registration
      // problem rather than success.
      console.warn(
        '[Moondrone native-audio-session] native call resolved WITHOUT session state — ' +
          'plugin likely NOT registered',
        state,
      )
      audioDiag('native-audio-session', `configurePlaybackSession returned NO STATE (${reason})`, state ?? null)
      return null
    }

    audioDiag('native-audio-session', `configurePlaybackSession SUCCESS (${reason})`, state)
    console.warn(
      `[Moondrone native-audio-session] SUCCESS (${reason}) category=${state.category} ` +
        `mode=${state.mode} sampleRate=${state.sampleRate} outputVolume=${state.outputVolume}`,
    )
    return state
  } catch (error) {
    const message = error?.message ?? String(error)
    const code = error?.code
    const looksUnimplemented = code === 'UNIMPLEMENTED' || /not implemented|unimplemented/i.test(message)

    console.warn(
      `[Moondrone native-audio-session] FAILED (${reason}) — ` +
        (looksUnimplemented
          ? 'MoondroneAudio plugin is NOT registered on this build.'
          : 'native call rejected.'),
      { message, code },
    )
    audioDiag('native-audio-session', `configurePlaybackSession FAILED (${reason})`, {
      message,
      code: code ?? null,
      looksUnimplemented,
    })
    return null
  }
}

// Subscribe to native interruption / media-reset events. `onInterrupted` fires when iOS
// takes audio focus (call/other app/Siri/media reset) — the app should stop cleanly.
// Returns an async cleanup function.
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
