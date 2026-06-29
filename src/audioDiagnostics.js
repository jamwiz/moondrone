// Targeted iOS audio diagnostics.
//
// These logs only fire on discrete user actions (metronome taps) and audio
// lifecycle transitions (start result, interruption) — never per beat or per
// frame — so they are safe to leave on while validating a TestFlight build.
// Flip AUDIO_DIAG to false to silence them entirely.
export const AUDIO_DIAG = true

export function audioDiag(scope, message, details) {
  if (!AUDIO_DIAG) {
    return
  }

  if (details === undefined) {
    console.log(`[Moondrone ${scope}] ${message}`)
  } else {
    console.log(`[Moondrone ${scope}] ${message}`, details)
  }
}
