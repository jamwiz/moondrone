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
//   // Softer + snappier phase/mood movement:
//   window.moondroneNativeToneLab.set({
//     moodAmount: 0.45,
//     moodResonanceAmount: 0.30,
//     moodOrbitAmount: 0.25,
//     moodTransitionSpeed: 0.75,
//   })
//
//   // A bit more mood depth but still fairly quick to settle:
//   window.moondroneNativeToneLab.set({
//     moodAmount: 0.70,
//     moodTransitionSpeed: 0.45,
//   })
//
//   // Make the mood/orbit/resonant tone arrive faster on note/register changes + soften mood:
//   window.moondroneNativeToneLab.set({
//     moodPitchFollowSpeed: 0.85,
//     moodAmount: 0.45,
//     moodResonanceAmount: 0.25,
//     moodOrbitAmount: 0.25,
//   })
//
//   // Turn the native metronome up (0–3.0; 1 = original level):
//   window.moondroneNativeToneLab.set({ nativeMetronomeVolume: 2.0 })
//
//   // Brighten the native metronome click (0 = dark/woody … 0.5 = default … 1 = bright):
//   window.moondroneNativeToneLab.set({ nativeMetronomeTone: 0.7 })
//
//   // Back to production defaults:
//   window.moondroneNativeToneLab.reset()
//
//   // Apply the baked production preset by name:
//   window.moondroneNativeToneLab.applyPreset('productionFinal')
//
// Revert entirely: delete this file + its import in App.jsx, remove
// nativeModeSetToneLab in nativeModeBridge.js and setNativeToneLab in
// nativeDroneExperiment.js, and remove the Tone Lab block in MoondroneAudioPlugin.swift.

import { isNativeModeSupported, nativeModeSetToneLab } from './nativeModeBridge'

const STORAGE_KEY = 'moondrone.nativeToneLab'
const STORAGE_VERSION_KEY = 'moondrone.nativeToneLab.version'
// Bump when production defaults change so stale debug experiments are not preserved.
const STORAGE_VERSION = 2

// ---- DEFAULTS / PRESETS / PERSISTENCE ---------------------------------------
// Production defaults (Jul 2026 ship). reset() and fresh installs use these values.
// The actual organ DSP lives in ios/App/App/MoondroneAudioPlugin.swift (setToneLab + render loop).
export const NATIVE_TONE_LAB_DEFAULTS = Object.freeze({
  // ---- Global organ/body character ----
  organToneAmount: 0.78,
  organToneBrightness: 1,
  organToneBlend: 0,
  triangleBody: 0.91,
  sawBody: 0.8,
  formantBody: 0.09,
  outputTrimDb: 0,
  // ---- Per-moon organ amount ----
  pureOrgan: 0.7,
  shrutiOrgan: 0.7,
  stringsOrgan: 1,
  cosmosOrgan: 0.72,
  binauralOrgan: 0.22,
  // ---- Per-moon safety trims (secondary; keep near 0) ----
  pureTrimDb: 0,
  shrutiTrimDb: 0,
  stringsTrimDb: 0,
  cosmosTrimDb: -2.9,
  binauralTrimDb: -0.1,
  // ---- Mood / phase shaping (Native Mode only; Binaural ignores mood) ----
  moodAmount: 0.65,
  moodResonanceAmount: 0.94,
  moodTransitionSpeed: 0.84,
  moodOrbitAmount: 0.66,
  moodPitchFollowSpeed: 0.75,
  // ---- Native metronome (Native Mode only) ----
  nativeMetronomeVolume: 3,
  nativeMetronomeTone: 0.5,
})

// Params whose valid range is not the usual 0–1 (or -6..+6 dB): [min, max].
const CUSTOM_RANGE = Object.freeze({
  nativeMetronomeVolume: [0, 3.0],
})

// Named starting points returned by .presets().
export const NATIVE_TONE_LAB_PRESETS = Object.freeze({
  default: { ...NATIVE_TONE_LAB_DEFAULTS },
  productionFinal: { ...NATIVE_TONE_LAB_DEFAULTS },
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
  'moodAmount', 'moodResonanceAmount', 'moodTransitionSpeed', 'moodOrbitAmount',
  'moodPitchFollowSpeed',
  'nativeMetronomeTone',
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

function clampRange(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
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
  for (const key of Object.keys(CUSTOM_RANGE)) {
    const [min, max] = CUSTOM_RANGE[key]
    out[key] = clampRange(patch[key] ?? base[key], min, max, NATIVE_TONE_LAB_DEFAULTS[key])
  }
  return out
}

function readStored() {
  try {
    const storedVersion = window?.localStorage?.getItem(STORAGE_VERSION_KEY)
    if (storedVersion !== String(STORAGE_VERSION)) {
      const fresh = { ...NATIVE_TONE_LAB_DEFAULTS }
      window?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(fresh))
      window?.localStorage?.setItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION))
      return fresh
    }
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
    window?.localStorage?.setItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION))
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
