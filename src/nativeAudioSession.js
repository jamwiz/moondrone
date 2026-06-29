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
export async function configureNativePlaybackSession(reason = 'play') {
  if (!isIosNative()) {
    return null
  }

  try {
    const state = await MoondroneAudio.configurePlaybackSession()
    audioDiag('native-audio-session', `configurePlaybackSession ok (${reason})`, state)
    return state
  } catch (error) {
    audioDiag('native-audio-session', `configurePlaybackSession FAILED (${reason})`, {
      message: error?.message ?? String(error),
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
