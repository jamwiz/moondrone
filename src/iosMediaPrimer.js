// iOS-only HTMLAudioElement "media primer" workaround for WKWebView WebAudio + Silent Mode.
//
// Diagnosis from TestFlight: native AVAudioSession `.playback` works (native AVAudioEngine beep is
// audible in Silent Mode), but WebAudio/Tone output through WKWebView is still muted by the
// Ring/Silent switch. A hidden, actively-playing HTMLAudioElement forces the WebView to route its
// media audio through the active `.playback` session, which "unmutes" WebAudio alongside it.
//
// Rules (per product requirements):
//   - iOS native only — no-op on web/Android.
//   - Singleton hidden <audio>, controls=false, preload=auto, loop=true, playsInline=true.
//   - DO NOT set muted=true. Avoid volume=0 — use a real near-silent source.
//   - Keep playing while drone OR metronome audio is active; pause only when all audio stops.
import { Capacitor } from '@capacitor/core'
import { audioDiag } from './audioDiagnostics'

let audioEl = null
let primerSrc = null

const debugState = {
  created: false,
  playRequested: false,
  lastPlayResult: null, // 'resolved' | 'rejected:<msg>' | null
  paused: null,
  playing: false,
  currentTime: 0,
  readyState: null,
  error: null,
}

export function isIosNative() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
  } catch {
    return false
  }
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}

// Build a tiny near-silent looping mono WAV as a data URL. Amplitude ≈ 2/32767 (~-84 dBFS):
// real, non-muted audio that is inaudible. A data URL avoids the capacitor://localhost file-load
// failure that already breaks Tone.Player sample loading on this WebView.
function buildNearSilentWavDataUrl() {
  const sampleRate = 8000
  const durationSec = 0.5
  const numSamples = Math.floor(sampleRate * durationSec)
  const dataSize = numSamples * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  for (let index = 0; index < numSamples; index += 1) {
    const t = index / sampleRate
    const sample = Math.sin(2 * Math.PI * 60 * t) * 2
    view.setInt16(44 + index * 2, sample, true)
  }

  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }

  return `data:audio/wav;base64,${btoa(binary)}`
}

function ensureElement() {
  if (audioEl) {
    return audioEl
  }

  if (!primerSrc) {
    primerSrc = buildNearSilentWavDataUrl()
  }

  const el = document.createElement('audio')
  el.setAttribute('aria-hidden', 'true')
  el.controls = false
  el.preload = 'auto'
  el.loop = true
  el.playsInline = true
  // Intentionally NOT muted. Near-silent source instead of volume=0 so iOS treats it as real audio.
  el.volume = 1
  el.src = primerSrc
  el.style.position = 'fixed'
  el.style.width = '1px'
  el.style.height = '1px'
  el.style.opacity = '0'
  el.style.pointerEvents = 'none'
  el.style.left = '-9999px'

  el.addEventListener('play', () => {
    debugState.playing = true
    debugState.paused = el.paused
    audioDiag('media-primer', 'primer element event: play', snapshotEventDetails(el))
  })
  el.addEventListener('pause', () => {
    debugState.playing = false
    debugState.paused = el.paused
    audioDiag('media-primer', 'primer element event: pause', snapshotEventDetails(el))
  })
  el.addEventListener('error', () => {
    debugState.error = el.error ? `code ${el.error.code}` : 'unknown'
    audioDiag('media-primer', 'primer element event: error', { error: debugState.error })
  })

  document.body.appendChild(el)
  audioEl = el
  debugState.created = true
  audioDiag('media-primer', 'primer element created', { srcKind: 'data:audio/wav' })
  return el
}

function snapshotEventDetails(el) {
  return {
    paused: el.paused,
    currentTime: Number(el.currentTime?.toFixed?.(3) ?? el.currentTime),
    readyState: el.readyState,
  }
}

// Play the primer inside a user gesture. iOS native only. Resolves with a debug snapshot.
export async function ensurePrimerPlaying(reason = 'play') {
  if (!isIosNative()) {
    audioDiag('media-primer', `ensurePrimerPlaying skipped — not iOS native (${reason})`)
    return { skipped: true }
  }

  const el = ensureElement()
  debugState.playRequested = true
  audioDiag('media-primer', `media-primer play requested (${reason})`, snapshotEventDetails(el))

  try {
    await el.play()
    debugState.lastPlayResult = 'resolved'
    debugState.playing = !el.paused
    debugState.paused = el.paused
    audioDiag('media-primer', `media-primer play resolved (${reason})`, snapshotEventDetails(el))
  } catch (error) {
    const message = error?.message ?? String(error)
    debugState.lastPlayResult = `rejected:${message}`
    audioDiag('media-primer', `media-primer play REJECTED (${reason})`, { message })
  }

  return getPrimerDebugState()
}

// Pause the primer. Call only when the user has stopped all Moondrone audio (idle).
export function pausePrimer(reason = 'idle') {
  if (!audioEl) {
    return
  }

  try {
    audioEl.pause()
    audioEl.currentTime = 0
    debugState.playing = false
    debugState.paused = audioEl.paused
    audioDiag('media-primer', `primer paused (${reason})`, snapshotEventDetails(audioEl))
  } catch (error) {
    audioDiag('media-primer', `primer pause failed (${reason})`, {
      message: error?.message ?? String(error),
    })
  }
}

export function isPrimerPlaying() {
  return Boolean(audioEl) && !audioEl.paused
}

export function getPrimerDebugState() {
  if (audioEl) {
    debugState.paused = audioEl.paused
    debugState.playing = !audioEl.paused
    debugState.currentTime = Number(audioEl.currentTime?.toFixed?.(3) ?? audioEl.currentTime)
    debugState.readyState = audioEl.readyState
  }
  return { ...debugState }
}
