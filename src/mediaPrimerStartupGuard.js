// Guards the media-primer + Tone/WebAudio startup handoff on iOS.
//
// During this window, iOS often emits AVAudioSession interruption-began and AudioContext
// "interrupted" as the primer and WebAudio route hand off. Those are expected — not fatal.
import { audioDiag } from './audioDiagnostics'

const SETTLE_MS = 1200

let startupActive = false
let startupReason = null
let settleTimer = null

export function beginMediaPrimerStartup(reason) {
  if (settleTimer) {
    window.clearTimeout(settleTimer)
    settleTimer = null
  }

  startupActive = true
  startupReason = reason
  audioDiag('startup-guard', 'startup guard begin', { reason })
}

export function endMediaPrimerStartup(reason, { immediate = false } = {}) {
  const finish = () => {
    startupActive = false
    audioDiag('startup-guard', 'startup guard end', { reason, prior: startupReason })
    startupReason = null
  }

  if (immediate) {
    if (settleTimer) {
      window.clearTimeout(settleTimer)
      settleTimer = null
    }
    finish()
    return
  }

  if (settleTimer) {
    window.clearTimeout(settleTimer)
  }

  settleTimer = window.setTimeout(() => {
    settleTimer = null
    finish()
  }, SETTLE_MS)
}

export function isMediaPrimerStartupActive() {
  return startupActive
}

export function getMediaPrimerStartupReason() {
  return startupReason
}
