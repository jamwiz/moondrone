export const SLEEP_TIMER_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30 min', value: 1800 },
  { label: '60 min', value: 3600 },
  { label: '120 min', value: 7200 },
]

export function formatSleepTimerMinutes(durationSeconds) {
  const minutes = Math.round(durationSeconds / 60)
  return `${minutes}m`
}

export function formatSleepTimerCountdown(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export function parseNativeSleepTimerState(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      status: 'off',
      durationSeconds: 0,
      remainingSeconds: 0,
      armed: false,
      running: false,
      fading: false,
      didExpire: false,
    }
  }

  const status = typeof raw.sleepTimerStatus === 'string' ? raw.sleepTimerStatus : 'off'
  const durationSeconds = Number(raw.sleepTimerDurationSeconds) || 0
  const remainingSeconds = Number(raw.sleepTimerRemainingSeconds) || 0

  return {
    status,
    durationSeconds,
    remainingSeconds,
    armed: Boolean(raw.sleepTimerArmed),
    running: Boolean(raw.sleepTimerRunning),
    fading: Boolean(raw.sleepTimerFading),
    didExpire: Boolean(raw.sleepTimerDidExpire),
  }
}
