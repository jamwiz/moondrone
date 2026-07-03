// =============================================================================
// NATIVE MODE BRIDGE (temporary experiment — Jul 2026)
// =============================================================================
// Lets the existing Moondrone UI controls drive the native Swift `NativeDrone`
// engine instead of the Tone.js engine, WITHOUT deleting or replacing Tone.js.
//
// Isolation rules:
//   • Native Mode is OFF by default. When off, App.jsx behaves 100% as before.
//   • The enabled flag is read live via isNativeModeEnabled() inside the App
//     handlers, so no Tone.js code path changes when off.
//   • All native calls here swallow errors (log only) so a native failure can
//     never break the UI.
//
// Revert: delete this file, remove its imports/branches in App.jsx, remove the
// Native Mode toggle in AudioDebugPanel.jsx. (NativeDrone plugin + Info.plist
// UIBackgroundModes are shared with the earlier native drone POC.)

import { Capacitor } from '@capacitor/core'
import {
  setNativeDroneBreath,
  setNativeDroneFrequency,
  setNativeDroneIntensity,
  setNativeDronePartials,
  setNativeDroneVolume,
  startNativeDrone,
  stopNativeDrone,
} from './nativeDroneExperiment'

const STORAGE_KEY = 'moondrone.nativeMode'
const listeners = new Set()

let nativeModeEnabled = readInitialFlag()

function readInitialFlag() {
  try {
    return window?.localStorage?.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function isNativeModeEnabled() {
  return nativeModeEnabled
}

export function isNativeModeSupported() {
  return Capacitor.isNativePlatform()
}

export function setNativeModeEnabled(enabled) {
  nativeModeEnabled = Boolean(enabled)
  try {
    window?.localStorage?.setItem(STORAGE_KEY, nativeModeEnabled ? 'true' : 'false')
  } catch {
    // ignore storage failures (private mode, etc.)
  }
  for (const cb of listeners) {
    try {
      cb(nativeModeEnabled)
    } catch {
      // ignore listener failures
    }
  }
  return nativeModeEnabled
}

export function subscribeNativeMode(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

// --- Musical helpers --------------------------------------------------------

const SEMITONE_BY_KEY = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5,
  'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
}

// Equal-temperament frequency, mirroring the Tone.js engine math
// (midiToFrequency: referenceA * 2^((midi - 69) / 12), A4 = MIDI 69).
export function keyOctaveToHz(key, octave, referenceA = 440) {
  const semitone = SEMITONE_BY_KEY[key] ?? 0
  const midi = (octave + 1) * 12 + semitone
  return referenceA * 2 ** ((midi - 69) / 12)
}

// Simple moon → partial-set mapping. Intentionally rough — this proves the UI can
// drive the native engine, not a full recreation of every Moondrone voice.
const PRESET_PARTIALS = {
  // Mimas — near-sine purity: strong root + soft octave.
  Pure: [
    { ratio: 1, gain: 0.6 },
    { ratio: 2, gain: 0.14 },
  ],
  // Europa — root + fifth + octave with a touch of upper.
  Shruti: [
    { ratio: 1, gain: 0.5 },
    { ratio: 1.5, gain: 0.28 },
    { ratio: 2, gain: 0.18 },
    { ratio: 3, gain: 0.06 },
  ],
  // Titan — fuller, more harmonics (string-like).
  Strings: [
    { ratio: 1, gain: 0.45 },
    { ratio: 1.5, gain: 0.14 },
    { ratio: 2, gain: 0.24 },
    { ratio: 3, gain: 0.14 },
  ],
  // Io — airy octave + upper partials.
  Cosmos: [
    { ratio: 1, gain: 0.42 },
    { ratio: 2, gain: 0.22 },
    { ratio: 3, gain: 0.14 },
    { ratio: 4, gain: 0.08 },
  ],
  // Binaural — plain root + octave (true binaural beating not modeled here).
  Binaural: [
    { ratio: 1, gain: 0.5 },
    { ratio: 2, gain: 0.2 },
  ],
}

export function partialsForPreset(presetName) {
  return PRESET_PARTIALS[presetName] ?? PRESET_PARTIALS.Shruti
}

// --- Routing (UI values → NativeDrone). All fire-and-forget + error-safe. ----

function safe(promise) {
  return Promise.resolve(promise).catch((error) => {
    console.warn('[NativeMode] native call failed:', error?.message ?? error)
    return null
  })
}

// uiVolumePercent is 0–100; NativeDrone expects 0–1.
export function nativeModePlay({ key, octave, referenceA, intensity, breath, volumePercent, presetName }) {
  const hz = keyOctaveToHz(key, octave, referenceA)
  return safe(
    (async () => {
      await startNativeDrone(clamp01(volumePercent / 100))
      await setNativeDronePartials(partialsForPreset(presetName))
      await setNativeDroneFrequency(hz)
      await setNativeDroneIntensity(clamp01(intensity / 100))
      await setNativeDroneBreath(clamp01(breath / 100))
    })(),
  )
}

export function nativeModeStop() {
  return safe(stopNativeDrone())
}

export function nativeModeSetFrequency(key, octave, referenceA) {
  return safe(setNativeDroneFrequency(keyOctaveToHz(key, octave, referenceA)))
}

export function nativeModeSetIntensity(uiPercent) {
  return safe(setNativeDroneIntensity(clamp01(uiPercent / 100)))
}

export function nativeModeSetBreath(uiPercent) {
  return safe(setNativeDroneBreath(clamp01(uiPercent / 100)))
}

export function nativeModeSetVolume(uiPercent) {
  return safe(setNativeDroneVolume(clamp01(uiPercent / 100)))
}

export function nativeModeSetPreset(presetName) {
  return safe(setNativeDronePartials(partialsForPreset(presetName)))
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(1, Math.max(0, value))
}
