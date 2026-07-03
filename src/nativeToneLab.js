// =============================================================================
// NATIVE TONE LAB (organ-timbre experiment — Jul 2026)
// =============================================================================
// A small, REVERSIBLE, Native-Mode-only tone layer. It drives a soft organ/drawbar
// body layer inside the Swift NativeDroneEngine (see MoondroneAudioPlugin.swift,
// `setToneLab` + the organ layer in the render loop). The goal is to bring back
// Titan/Strings' old Tone.js "organy" glow — soft, harmonically rich, drawbar/
// triangle/saw-like — WITHOUT just making it louder.
//
// This is completely separate from the old Tone.js Tone Lab (src/toneLab.js), which
// only shapes the Tone.js/WebAudio droneEngine and never touches Native Mode.
//
// State lives here + in localStorage; the Swift engine smooths every value so live
// changes never click. Reset (or set all organ amounts to 0) restores the prior sound.
//
// Console API (open the web inspector while Native Mode is running on device):
//   window.moondroneNativeToneLab.get()
//   window.moondroneNativeToneLab.set({ stringsOrgan: 0.55, organToneBlend: 0.35 })
//   window.moondroneNativeToneLab.reset()
//   window.moondroneNativeToneLab.presets()
//
// ---- MANUAL TUNING EXAMPLES (copy/paste into the console) -------------------
//   // A touch more Titan organ body:
//   window.moondroneNativeToneLab.set({
//     stringsOrgan: 0.55,
//     organToneBlend: 0.35,
//     triangleBody: 0.55,
//     sawBody: 0.16,
//     formantBody: 0.22,
//   })
//
//   // Softer / darker Titan organ:
//   window.moondroneNativeToneLab.set({
//     stringsOrgan: 0.35,
//     organToneBrightness: 0.22,
//     sawBody: 0.08,
//   })
//
//   // A little cosmic body for Io:
//   window.moondroneNativeToneLab.set({ cosmosOrgan: 0.24 })
//
//   // A tiny bit for Shruti:
//   window.moondroneNativeToneLab.set({ shrutiOrgan: 0.12 })
//
//   // Back to the subtle default experiment:
//   window.moondroneNativeToneLab.reset()
//
// Revert entirely: delete this file + its import in App.jsx, remove
// nativeModeSetToneLab in nativeModeBridge.js and setNativeToneLab in
// nativeDroneExperiment.js, and remove the Tone Lab block in MoondroneAudioPlugin.swift.

import { isNativeModeSupported, nativeModeSetToneLab } from './nativeModeBridge'

const STORAGE_KEY = 'moondrone.nativeToneLab'

// ---- DEFAULTS / PRESETS / PERSISTENCE ---------------------------------------
// Edit THIS file to change default values and named presets.
// Saved localStorage values (key: moondrone.nativeToneLab) override these defaults on load.
// After changing defaults here, run window.moondroneNativeToneLab.reset() on a device that
// already has old saved settings — otherwise the phone keeps the previous experiment.
// The actual organ DSP lives in ios/App/App/MoondroneAudioPlugin.swift (setToneLab + render loop).
//
// Subtle experiment defaults: reproduces the current native sound + a gentle Titan organ.
export const NATIVE_TONE_LAB_DEFAULTS = Object.freeze({
  // ---- Global organ/body character ----
  organToneAmount: 0.25, // overall amount of drawbar-like harmonic body
  organToneBrightness: 0.3, // organ layer brightness (kept soft)
  organToneBlend: 0.25, // wet/dry blend of the organ-like layer
  triangleBody: 0.45, // hollow triangle body
  sawBody: 0.18, // subtle filtered saw density
  formantBody: 0.18, // gentle vowel/organ low-mid body
  outputTrimDb: 0, // safety only (-6..+6), NOT the main tone control
  // ---- Per-moon organ amount ----
  pureOrgan: 0.02, // Mimas — almost none, stay clean
  shrutiOrgan: 0.08, // Europa — tiny, stay shruti-like
  stringsOrgan: 0.45, // Titan — main target, soft organ glow
  cosmosOrgan: 0.18, // Io — a little body, stay cosmic
  binauralOrgan: 0.0, // Binaural — none by default, stay clear
  // ---- Per-moon safety trims (secondary; keep near 0) ----
  pureTrimDb: 0,
  shrutiTrimDb: 0,
  stringsTrimDb: 0,
  cosmosTrimDb: 0,
  binauralTrimDb: 0,
})

// Named starting points returned by .presets().
export const NATIVE_TONE_LAB_PRESETS = Object.freeze({
  // Current subtle experiment.
  default: { ...NATIVE_TONE_LAB_DEFAULTS },
  // No organ at all — the pre-experiment native sound.
  off: {
    ...NATIVE_TONE_LAB_DEFAULTS,
    organToneAmount: 0,
    organToneBlend: 0,
    pureOrgan: 0,
    shrutiOrgan: 0,
    stringsOrgan: 0,
    cosmosOrgan: 0,
    binauralOrgan: 0,
  },
  // Stronger old-Moondrone Titan organ glow.
  titanOrgan: {
    ...NATIVE_TONE_LAB_DEFAULTS,
    stringsOrgan: 0.55,
    organToneBlend: 0.35,
    triangleBody: 0.55,
    sawBody: 0.16,
    formantBody: 0.22,
  },
  // Softer/darker Titan organ.
  titanSoft: {
    ...NATIVE_TONE_LAB_DEFAULTS,
    stringsOrgan: 0.35,
    organToneBrightness: 0.22,
    sawBody: 0.08,
  },
  // A little celestial body on Io/Cosmos.
  cosmicGlow: {
    ...NATIVE_TONE_LAB_DEFAULTS,
    cosmosOrgan: 0.26,
  },
})

const UNIT_KEYS = [
  'organToneAmount', 'organToneBrightness', 'organToneBlend',
  'triangleBody', 'sawBody', 'formantBody',
  'pureOrgan', 'shrutiOrgan', 'stringsOrgan', 'cosmosOrgan', 'binauralOrgan',
]
const DB_KEYS = [
  'outputTrimDb', 'pureTrimDb', 'shrutiTrimDb', 'stringsTrimDb', 'cosmosTrimDb', 'binauralTrimDb',
]

function clampUnit(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

function clampDb(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(6, Math.max(-6, n))
}

// Merge a (possibly partial) settings object over `base`, clamping every field.
function normalize(base, patch = {}) {
  const out = {}
  for (const key of UNIT_KEYS) {
    out[key] = clampUnit(patch[key] ?? base[key], NATIVE_TONE_LAB_DEFAULTS[key])
  }
  for (const key of DB_KEYS) {
    out[key] = clampDb(patch[key] ?? base[key], NATIVE_TONE_LAB_DEFAULTS[key])
  }
  return out
}

function readStored() {
  try {
    const raw = window?.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return { ...NATIVE_TONE_LAB_DEFAULTS }
    return normalize(NATIVE_TONE_LAB_DEFAULTS, JSON.parse(raw))
  } catch {
    return { ...NATIVE_TONE_LAB_DEFAULTS }
  }
}

let settings = readStored()
const listeners = new Set()

function notifyListeners() {
  const snapshot = { ...settings }
  for (const cb of listeners) {
    try {
      cb(snapshot)
    } catch {
      // ignore listener failures
    }
  }
}

function persist() {
  try {
    window?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

function applySettings(next) {
  settings = normalize(NATIVE_TONE_LAB_DEFAULTS, next)
  persist()
  pushNativeToneLab()
  notifyListeners()
  return { ...settings }
}

// Push the current settings to the native engine (only meaningful on device / Native Mode).
export function pushNativeToneLab() {
  if (!isNativeModeSupported()) return null
  return nativeModeSetToneLab({ ...settings })
}

export function getNativeToneLabSettings() {
  return { ...settings }
}

export function setNativeToneLabSettings(patch = {}) {
  return applySettings({ ...settings, ...patch })
}

export function resetNativeToneLab() {
  return applySettings(NATIVE_TONE_LAB_DEFAULTS)
}

/** Alias for UI / React callers. */
export function resetNativeToneLabSettings() {
  return resetNativeToneLab()
}

export function getNativeToneLabPresets() {
  return JSON.parse(JSON.stringify(NATIVE_TONE_LAB_PRESETS))
}

export function applyNativeToneLabPreset(name) {
  const preset = NATIVE_TONE_LAB_PRESETS[name]
  if (!preset) {
    throw new Error(`Unknown Native Tone Lab preset: ${name}`)
  }
  return applySettings(preset)
}

export function subscribeNativeToneLab(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Push persisted settings once at startup so a customized experiment reaches the Swift engine
// even before the first Native Mode Play (the engine snaps to these targets on cold start).
pushNativeToneLab()

if (typeof window !== 'undefined') {
  window.moondroneNativeToneLab = {
    get: getNativeToneLabSettings,
    set: setNativeToneLabSettings,
    reset: resetNativeToneLab,
    presets: getNativeToneLabPresets,
    applyPreset: applyNativeToneLabPreset,
    DEFAULTS: { ...NATIVE_TONE_LAB_DEFAULTS },
  }
}
