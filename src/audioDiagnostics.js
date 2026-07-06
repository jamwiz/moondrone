// Targeted iOS audio diagnostics with an in-app ring buffer + UI subscription.
// In-app debug panel (DBG chip) — dev builds only; hidden in production.
export const AUDIO_DIAG = import.meta.env.DEV

const MAX_ENTRIES = 200
const buffer = []
const uiListeners = new Set()

function notifyUiListeners() {
  uiListeners.forEach((listener) => {
    try {
      listener()
    } catch {
      // UI hook failure must never break logging.
    }
  })
}

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

  notifyUiListeners()

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

export function getRecentAudioDiagnostics(count = 20) {
  if (count <= 0) {
    return []
  }
  return buffer.slice(-count)
}

export function clearAudioDiagnostics() {
  buffer.length = 0
  notifyUiListeners()
}

export function subscribeAudioDiagnostics(listener) {
  uiListeners.add(listener)
  return () => {
    uiListeners.delete(listener)
  }
}

export function formatAudioDiagnosticsForCopy(entries = buffer) {
  return entries
    .map((entry) => {
      const details =
        entry.details == null
          ? ''
          : ` ${typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details)}`
      return `${entry.t} [${entry.scope}] ${entry.message}${details}`
    })
    .join('\n')
}

if (typeof window !== 'undefined') {
  window.moondroneDebug = window.moondroneDebug || {}
  window.moondroneDebug.audioLog = getAudioDiagnostics
  window.moondroneDebug.clearAudioLog = clearAudioDiagnostics
}
