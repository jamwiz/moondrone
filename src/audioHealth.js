import { audioDiag } from './audioDiagnostics'

// Shared, explicit health model for the iOS audio system. The app uses this to decide whether a
// lightweight start path is safe: lightweight paths are ONLY allowed when health is `stable`.
//
//   cold        no audio has started yet (or fully reset)
//   starting    a start/recovery is in progress; not yet trustworthy
//   stable      context has stayed running for a settle window after startup/recovery
//   interrupted iOS pulled focus / context went interrupted
//   recovering  a single shared recovery attempt is in progress
//   uncertain   context appears running but health was not confirmed (e.g. ambiguous resume)
//   failed      a start or recovery failed; treat as cold for path decisions
export const AudioHealth = {
  COLD: 'cold',
  STARTING: 'starting',
  STABLE: 'stable',
  INTERRUPTED: 'interrupted',
  RECOVERING: 'recovering',
  UNCERTAIN: 'uncertain',
  FAILED: 'failed',
}

let state = AudioHealth.COLD
let stableTimer = null

function clearStableTimer() {
  if (stableTimer) {
    clearTimeout(stableTimer)
    stableTimer = null
  }
}

export function getAudioHealth() {
  return state
}

export function isAudioHealthStable() {
  return state === AudioHealth.STABLE
}

// Any explicit transition cancels a pending "settle to stable" timer — e.g. an interruption that
// lands during the settle window must not later be overwritten by a stale stabilize.
export function setAudioHealth(next, reason = '') {
  clearStableTimer()

  if (next === state) {
    return state
  }

  const from = state
  state = next
  audioDiag('audio-health', `audio health -> ${next}`, { from, reason })
  return state
}

// Transition to `stable` only after the context has stayed running for `delayMs`. `confirmRunning`
// is re-checked at fire time so a context that dropped during the window does NOT become stable.
export function scheduleAudioStable(delayMs, confirmRunning, reason = '') {
  clearStableTimer()

  stableTimer = setTimeout(() => {
    stableTimer = null

    if (typeof confirmRunning === 'function' && !confirmRunning()) {
      audioDiag('audio-health', 'audio health stable deferred — context not running at confirm', { reason })
      return
    }

    setAudioHealth(AudioHealth.STABLE, reason || 'settle-window')
  }, delayMs)
}
