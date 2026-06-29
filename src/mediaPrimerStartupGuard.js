// Guards the media-primer + Tone/WebAudio startup handoff on iOS.
//
// During this window, iOS often emits AVAudioSession interruption-began and AudioContext
// "interrupted" as the primer and WebAudio route hand off. Those are expected — not fatal.
import { audioDiag } from './audioDiagnostics'

const SETTLE_MS = 1200
const WATCHDOG_MS = 7000

let startupActive = false
let startupReason = null
let settleTimer = null
let watchdogTimer = null

function clearSettleTimer() {
  if (settleTimer) {
    window.clearTimeout(settleTimer)
    settleTimer = null
  }
}

function clearWatchdogTimer() {
  if (watchdogTimer) {
    window.clearTimeout(watchdogTimer)
    watchdogTimer = null
  }
}

function finishGuard(endReason) {
  clearSettleTimer()
  clearWatchdogTimer()
  startupActive = false
  audioDiag('startup-guard', 'startup guard end', { reason: endReason, prior: startupReason })
  startupReason = null
}

export function beginMediaPrimerStartup(reason) {
  clearSettleTimer()
  clearWatchdogTimer()

  startupActive = true
  startupReason = reason
  audioDiag('startup-guard', 'startup guard begin', { reason })

  watchdogTimer = window.setTimeout(() => {
    watchdogTimer = null
    if (!startupActive) {
      return
    }

    audioDiag('startup-guard', 'startup guard watchdog force clear', {
      prior: startupReason,
      delayMs: WATCHDOG_MS,
    })
    finishGuard('watchdog-force-clear')
  }, WATCHDOG_MS)
}

export function endMediaPrimerStartup(reason, { immediate = false } = {}) {
  if (immediate) {
    finishGuard(reason)
    return
  }

  clearSettleTimer()
  audioDiag('startup-guard', 'startup guard scheduled clear', { reason, delayMs: SETTLE_MS })

  settleTimer = window.setTimeout(() => {
    settleTimer = null
    finishGuard(reason)
  }, SETTLE_MS)
}

export function isMediaPrimerStartupActive() {
  return startupActive
}

export function getMediaPrimerStartupReason() {
  return startupReason
}
