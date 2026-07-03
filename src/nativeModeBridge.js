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
import { BINAURAL_MODES, DEFAULT_BINAURAL_MODE_ID } from './soundTuning'
import { DEFAULT_MOOD_ID } from './moods'
import { METRONOME_STRAIGHT_METER } from './metronomeSamples'
import {
  configureAndStartNativeDrone,
  reassertNativeDrone,
  setNativeDroneBinauralBeat,
  setNativeDroneBreath,
  setNativeDroneFrequency,
  setNativeDroneIntensity,
  setNativeDroneMood,
  setNativeDronePreset,
  setNativeDroneRegister,
  setNativeDroneVolume,
  startNativeMetronome,
  stopNativeMetronome,
  setNativeMetronomeBpm,
  setNativeMetronomeMeter,
  setNativeMetronomeSoundMode,
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

// LEGACY / DEBUG ONLY — Moon → raw partial-set mapping. This is NO LONGER the native
// sound source: the Swift NativeDroneEngine now owns a full "Moondrone voice model"
// (named voice layers, per-preset voiceGains, breath, air, register, mood) selected by
// NAME via setNativeDronePreset. This table is kept only for the console POC path
// (moondroneNativeDrone.setPartials / partialsForPreset). Safe to delete once the POC
// buttons are removed.
const PRESET_PARTIALS = {
  // Mimas — near-sine purity: dominant root with only a whisper of octave/twelfth sheen.
  Pure: [
    { ratio: 1, gain: 0.66 },
    { ratio: 2, gain: 0.1 },
    { ratio: 3, gain: 0.035 },
  ],
  // Europa — tanpura/shruti-box character: strong root drone + fifth + stacked octaves.
  Shruti: [
    { ratio: 1, gain: 0.5 },
    { ratio: 1.5, gain: 0.26 },
    { ratio: 2, gain: 0.2 },
    { ratio: 3, gain: 0.1 },
    { ratio: 4, gain: 0.05 },
  ],
  // Titan — rich, saw-like string body: full harmonic series 1..6 with a smooth roll-off.
  Strings: [
    { ratio: 1, gain: 0.44 },
    { ratio: 2, gain: 0.26 },
    { ratio: 3, gain: 0.17 },
    { ratio: 4, gain: 0.11 },
    { ratio: 5, gain: 0.07 },
    { ratio: 6, gain: 0.045 },
  ],
  // Io — airy/celestial: lighter root, emphasized upper octaves + a high shimmer partial.
  Cosmos: [
    { ratio: 1, gain: 0.36 },
    { ratio: 2, gain: 0.22 },
    { ratio: 3, gain: 0.15 },
    { ratio: 4, gain: 0.11 },
    { ratio: 6, gain: 0.06 },
    { ratio: 8, gain: 0.03 },
  ],
  // Binaural — two near-unison roots (~1% detune) create a slow beating, plus a soft octave.
  Binaural: [
    { ratio: 1, gain: 0.4 },
    { ratio: 1.01, gain: 0.38 },
    { ratio: 2, gain: 0.16 },
  ],
}

// LEGACY / DEBUG ONLY — see PRESET_PARTIALS note above. Not used by the Native Mode
// sound path anymore (kept for the console POC).
export function partialsForPreset(presetName) {
  return PRESET_PARTIALS[presetName] ?? PRESET_PARTIALS.Shruti
}

// Presets the native voice model knows by name (src Swift NativeDroneEngine.presets).
const NATIVE_MODEL_PRESETS = new Set(['Pure', 'Shruti', 'Strings', 'Cosmos', 'Binaural'])

function nativePresetName(presetName) {
  return NATIVE_MODEL_PRESETS.has(presetName) ? presetName : 'Shruti'
}

// Selected binaural mode → beat Hz (matches soundTuning BINAURAL_MODES). Non-Binaural
// presets get 0 so the native engine renders no L/R beat carriers.
export function beatHzForMode(binauralModeId) {
  const mode = BINAURAL_MODES.find((m) => m.id === binauralModeId)
    ?? BINAURAL_MODES.find((m) => m.id === DEFAULT_BINAURAL_MODE_ID)
  return mode?.beatHz ?? 4
}

function beatHzForPreset(presetName, binauralModeId) {
  return presetName === 'Binaural' ? beatHzForMode(binauralModeId) : 0
}

// --- Routing (UI values → NativeDrone). All fire-and-forget + error-safe. ----

function safe(promise) {
  return Promise.resolve(promise).catch((error) => {
    console.warn('[NativeMode] native call failed:', error?.message ?? error)
    return null
  })
}

// Register octave is passed straight through (2=Low … 5=VeryHigh); the native engine uses
// it for register voicing in addition to the pitch encoded in rootHz.
function safeOctave(octave) {
  const n = Number(octave)
  return Number.isFinite(n) ? Math.max(2, Math.min(5, Math.round(n))) : 3
}

// uiVolumePercent is 0–100; NativeDrone expects 0–1. Presets are driven by NAME so the
// native "Moondrone voice model" (voiceGains, breath, air, register, mood) does the
// synthesis. This is now a SINGLE atomic native call: the Swift side configures the whole
// voice state (preset/register/pitch/mood/beat/intensity/breath) and then starts, so the
// drone begins directly in the selected state — no default-Shruti/D3 flash, no per-call lag.
export function nativeModePlay({ key, octave, referenceA, intensity, breath, volumePercent, presetName, binauralModeId, moodId }) {
  const hz = keyOctaveToHz(key, octave, referenceA)
  const preset = nativePresetName(presetName)
  return safe(
    configureAndStartNativeDrone({
      volume: clamp01(volumePercent / 100),
      rootHz: hz,
      octave: safeOctave(octave),
      preset,
      mood: moodId ?? DEFAULT_MOOD_ID,
      beatHz: beatHzForPreset(preset, binauralModeId),
      intensity: clamp01(intensity / 100),
      breath: clamp01(breath / 100),
    }),
  )
}

export function nativeModeStop() {
  return safe(stopNativeDrone())
}

// Re-assert the native drone after the shared iOS session was reconfigured (metronome
// start). Fire-and-forget + error-safe; never toggles drone UI state.
export function nativeModeReassert() {
  return safe(reassertNativeDrone())
}

// transition: 'note' (default) for key/octave changes → native dip+retune gesture;
//             'glide' for reference-A tuning steps → smooth audible pitch ramp.
export function nativeModeSetFrequency(key, octave, referenceA, transition = 'note') {
  return safe(
    (async () => {
      await setNativeDroneRegister(safeOctave(octave))
      await setNativeDroneFrequency(keyOctaveToHz(key, octave, referenceA), transition)
    })(),
  )
}

export function nativeModeSetRegister(octave) {
  return safe(setNativeDroneRegister(safeOctave(octave)))
}

export function nativeModeSetMood(moodId) {
  return safe(setNativeDroneMood(moodId ?? DEFAULT_MOOD_ID))
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

export function nativeModeSetPreset(presetName, binauralModeId) {
  const preset = nativePresetName(presetName)
  return safe(
    (async () => {
      await setNativeDronePreset(preset)
      await setNativeDroneBinauralBeat(beatHzForPreset(preset, binauralModeId))
    })(),
  )
}

export function nativeModeSetBinauralBeat(binauralModeId) {
  return safe(setNativeDroneBinauralBeat(beatHzForMode(binauralModeId)))
}

// --- Native metronome routing (Native Mode only) ----------------------------
// The Tone.js metronome path (Tone.start / ensureMetronomeChain / media-primer) reconfigured
// the shared iOS audio session and got interrupted, killing the native drone. In Native Mode the
// metronome is synthesized natively and mixed into the same render path — no Tone/WebAudio at all.

// The Tone meter model is a string: 'straight' (no accent) or a beats-per-bar number-string.
// The native engine wants an Int: 0 = straight, else the beat count.
function nativeMeterInt(meter) {
  if (meter === METRONOME_STRAIGHT_METER || meter === 'straight') {
    return 0
  }
  const n = Number(meter)
  return Number.isFinite(n) ? Math.max(0, Math.min(12, Math.round(n))) : 4
}

function safeBpm(bpm) {
  const n = Number(bpm)
  return Number.isFinite(n) ? Math.max(30, Math.min(300, Math.round(n))) : 100
}

export function nativeModeStartMetronome({ bpm, meter, soundMode } = {}) {
  return safe(
    startNativeMetronome({
      bpm: safeBpm(bpm),
      meter: nativeMeterInt(meter),
      soundMode: soundMode ?? 'wood',
    }),
  )
}

export function nativeModeStopMetronome() {
  return safe(stopNativeMetronome())
}

export function nativeModeSetMetronomeBpm(bpm) {
  return safe(setNativeMetronomeBpm(safeBpm(bpm)))
}

export function nativeModeSetMetronomeMeter(meter) {
  return safe(setNativeMetronomeMeter(nativeMeterInt(meter)))
}

export function nativeModeSetMetronomeSoundMode(soundMode) {
  return safe(setNativeMetronomeSoundMode(soundMode ?? 'wood'))
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(1, Math.max(0, value))
}
