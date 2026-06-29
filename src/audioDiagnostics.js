// Targeted iOS audio diagnostics with an in-app ring buffer.
//
// TestFlight device logs are hard to inspect, so every diagnostic is also kept
// in a small in-memory ring buffer reachable from the console / automation via
// window.moondroneDebug.audioLog(). Entries are only added on discrete events
// (Play taps, audio-session calls, lifecycle/interruption transitions) — never
// per beat or per frame — so this is safe to leave on in a release build.
//
// Set AUDIO_DIAG to false to silence console output; the buffer still records so
// window.moondroneDebug.audioLog() remains useful.
export const AUDIO_DIAG = true

const MAX_ENTRIES = 200
const buffer = []

export function audioDiag(scope, message, details) {
  const entry = {
    t: new Date().toISOString(),
    scope,
    message,
    details: details === undefined ? null : details,
  }

  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) {
    buffer.shift()
  }

  if (!AUDIO_DIAG) {
    return
  }

  if (details === undefined) {
    console.log(`[Moondrone ${scope}] ${message}`)
  } else {
    console.log(`[Moondrone ${scope}] ${message}`, details)
  }
}

export function getAudioDiagnostics() {
  return buffer.slice()
}

export function clearAudioDiagnostics() {
  buffer.length = 0
}

// Expose the buffer in every build (not just dev) so a TestFlight build can be
// inspected from a remote/web inspector console: window.moondroneDebug.audioLog().
if (typeof window !== 'undefined') {
  window.moondroneDebug = window.moondroneDebug || {}
  window.moondroneDebug.audioLog = getAudioDiagnostics
  window.moondroneDebug.clearAudioLog = clearAudioDiagnostics
}
