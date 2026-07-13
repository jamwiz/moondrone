// =============================================================================
// NATIVE DRONE EXPERIMENT (temporary POC — Jul 2026)
// =============================================================================
// Thin JS bridge to the native Swift `NativeDrone` Capacitor plugin. Completely
// isolated from the Tone.js/WebAudio engine and the normal Play button. Used only
// to test whether a slightly-more-Moondrone-like native engine (smoothed volume/
// frequency/breath/intensity + partials) survives Silent Mode and lock/background.
//
// Revert: delete this file, remove its import + buttons from AudioDebugPanel.jsx,
// remove the NativeDronePlugin registration/classes in MoondroneAudioPlugin.swift,
// and remove UIBackgroundModes from ios/App/App/Info.plist.

import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeDrone = registerPlugin('NativeDrone')

// Simple Moondrone-like preset: root + fifth + octave.
export const NATIVE_DRONE_DEFAULT_PARTIALS = [
  { ratio: 1.0, gain: 0.5 },
  { ratio: 1.5, gain: 0.3 },
  { ratio: 2.0, gain: 0.2 },
]

export function isNativeDroneAvailable() {
  return Capacitor.isNativePlatform()
}

export async function startNativeDrone(volume) {
  const options = typeof volume === 'number' ? { volume } : {}
  const result = await NativeDrone.startNativeDrone(options)
  console.log('[NativeDrone] startNativeDrone ->', result)
  return result
}

// Atomic configure + start — one native round-trip so the drone begins directly in the
// requested voice state (no default-Shruti/D3 flash, no per-call latency). Params:
//   { volume, rootHz, octave, preset, mood, beatHz, intensity, breath } (all 0–1 where 0–1).
export async function configureAndStartNativeDrone(params = {}) {
  const result = await NativeDrone.configureAndStartNativeDrone(params)
  console.log('[NativeDrone] configureAndStartNativeDrone ->', result)
  return result
}

// Re-assert the native engine after the shared iOS session was reconfigured (e.g. the
// WebAudio metronome started in Native Mode). Never changes logical running state.
export async function reassertNativeDrone() {
  const result = await NativeDrone.reassertNativeDrone()
  console.log('[NativeDrone] reassertNativeDrone ->', result)
  return result
}

// Read-only engine snapshot (no side effects). Returns the Swift snapshot dict (isRunning, preset,
// nativeMetronomePlaying, …). Used by lifecycle resume in Native Mode to rehydrate the UI.
export async function getNativeDroneSnapshot() {
  return await NativeDrone.getNativeDroneSnapshot()
}

export async function stopNativeDrone() {
  const result = await NativeDrone.stopNativeDrone()
  console.log('[NativeDrone] stopNativeDrone ->', result)
  return result
}

export async function setNativeDroneVolume(value) {
  const result = await NativeDrone.setNativeDroneVolume({ value })
  console.log('[NativeDrone] setNativeDroneVolume ->', result)
  return result
}

// transition: 'note' (default) → musical dip+retune gesture (key/register changes);
//             'glide' → smooth audible pitch ramp (small reference-A tuning steps).
export async function setNativeDroneFrequency(rootHz, transition = 'note') {
  const result = await NativeDrone.setNativeDroneFrequency({ rootHz, transition })
  console.log('[NativeDrone] setNativeDroneFrequency ->', result)
  return result
}

export async function setNativeDronePartials(partials = NATIVE_DRONE_DEFAULT_PARTIALS) {
  const result = await NativeDrone.setNativeDronePartials({ partials })
  console.log('[NativeDrone] setNativeDronePartials ->', result)
  return result
}

export async function setNativeDroneBreath(value) {
  const result = await NativeDrone.setNativeDroneBreath({ value })
  console.log('[NativeDrone] setNativeDroneBreath ->', result)
  return result
}

export async function setNativeDroneIntensity(value) {
  const result = await NativeDrone.setNativeDroneIntensity({ value })
  console.log('[NativeDrone] setNativeDroneIntensity ->', result)
  return result
}

export async function setNativeDronePreset(name) {
  const result = await NativeDrone.setNativeDronePreset({ name })
  console.log('[NativeDrone] setNativeDronePreset ->', result)
  return result
}

export async function setNativeDroneBinauralBeat(beatHz) {
  const result = await NativeDrone.setNativeDroneBinauralBeat({ beatHz })
  console.log('[NativeDrone] setNativeDroneBinauralBeat ->', result)
  return result
}

// Register/octave (2=Low, 3=Medium, 4=High, 5=VeryHigh). Lets the native voice model
// mimic Low/Med/High/VH voicing + output trim like the Tone.js engine.
export async function setNativeDroneRegister(octave) {
  const result = await NativeDrone.setNativeDroneRegister({ octave })
  console.log('[NativeDrone] setNativeDroneRegister ->', result)
  return result
}

// Mood id (new/full/blue/blood/super) — slow native timbral motion. Ignored for Binaural.
export async function setNativeDroneMood(name) {
  const result = await NativeDrone.setNativeDroneMood({ name })
  console.log('[NativeDrone] setNativeDroneMood ->', result)
  return result
}

// ---- Native metronome (Native Mode only) ----------------------------------------------------
// Fully native click synthesis mixed into the same render path as the native drone — no Tone.js,
// WebAudio, media-primer, or session reconfigure. meter: 0 = straight (no accent), 2…6 = beats/bar.
export async function startNativeMetronome({ bpm, meter, soundMode } = {}) {
  const result = await NativeDrone.startNativeMetronome({ bpm, meter, soundMode })
  console.log('[NativeDrone] startNativeMetronome ->', result)
  return result
}

export async function stopNativeMetronome() {
  const result = await NativeDrone.stopNativeMetronome()
  console.log('[NativeDrone] stopNativeMetronome ->', result)
  return result
}

export async function setNativeMetronomeBpm(bpm) {
  const result = await NativeDrone.setNativeMetronomeBpm({ bpm })
  return result
}

export async function setNativeMetronomeMeter(meter) {
  const result = await NativeDrone.setNativeMetronomeMeter({ meter })
  return result
}

export async function setNativeMetronomeSoundMode(soundMode) {
  const result = await NativeDrone.setNativeMetronomeSoundMode({ soundMode })
  return result
}

// ---- Native Tone Lab (organ-timbre experiment, Native Mode only) -----------------------------
// Pushes the (already-clamped) tone-lab settings object to Swift, which smooths every value so
// live changes never click. Reversible: setting all organ amounts to 0 returns the prior sound.
export async function setNativeToneLab(settings = {}) {
  const result = await NativeDrone.setNativeToneLab(settings)
  return result
}

// ---- Native sleep timer (Native Mode only) -------------------------------------------------
export async function setNativeSleepTimer(durationSeconds) {
  const result = await NativeDrone.setNativeSleepTimer({ durationSeconds })
  console.log('[NativeDrone] setNativeSleepTimer ->', result)
  return result
}

export async function cancelNativeSleepTimer() {
  const result = await NativeDrone.cancelNativeSleepTimer()
  console.log('[NativeDrone] cancelNativeSleepTimer ->', result)
  return result
}

export async function getNativeSleepTimerState() {
  return await NativeDrone.getNativeSleepTimerState()
}

export function addNativeSleepTimerListener(callback) {
  if (!Capacitor.isNativePlatform()) {
    return () => {}
  }
  const handles = []
  const events = ['nativeSleepTimerStateChanged', 'nativeSleepTimerExpired']
  for (const eventName of events) {
    const promise = NativeDrone.addListener(eventName, (data) => {
      try {
        callback(eventName, data)
      } catch {
        // ignore listener failures
      }
    })
    handles.push(promise)
  }
  return () => {
    for (const promise of handles) {
      promise.then((handle) => handle.remove()).catch(() => {})
    }
  }
}

// Console API so the native engine can be driven separately from the real engine:
//   moondroneNativeDrone.start(0.2)
//   moondroneNativeDrone.setFrequency(146.83)   // D3
//   moondroneNativeDrone.setPartials([{ratio:1,gain:0.5},{ratio:2,gain:0.25}])
//   moondroneNativeDrone.setBreath(0.6)
//   moondroneNativeDrone.setIntensity(0.9)
//   moondroneNativeDrone.setVolume(0.1)
//   moondroneNativeDrone.stop()
if (typeof window !== 'undefined') {
  window.moondroneNativeDrone = {
    start: startNativeDrone,
    stop: stopNativeDrone,
    setVolume: setNativeDroneVolume,
    setFrequency: setNativeDroneFrequency,
    setPartials: setNativeDronePartials,
    setBreath: setNativeDroneBreath,
    setIntensity: setNativeDroneIntensity,
    setPreset: setNativeDronePreset,
    setBinauralBeat: setNativeDroneBinauralBeat,
    setRegister: setNativeDroneRegister,
    setMood: setNativeDroneMood,
    configureAndStart: configureAndStartNativeDrone,
    reassert: reassertNativeDrone,
    snapshot: getNativeDroneSnapshot,
    startMetronome: startNativeMetronome,
    stopMetronome: stopNativeMetronome,
    setMetronomeBpm: setNativeMetronomeBpm,
    setMetronomeMeter: setNativeMetronomeMeter,
    setMetronomeSoundMode: setNativeMetronomeSoundMode,
    isAvailable: isNativeDroneAvailable,
    DEFAULT_PARTIALS: NATIVE_DRONE_DEFAULT_PARTIALS,
    setSleepTimer: setNativeSleepTimer,
    cancelSleepTimer: cancelNativeSleepTimer,
    getSleepTimerState: getNativeSleepTimerState,
  }

  if (import.meta.env.DEV) {
    // Debug: set a short sleep timer without exposing it in the production menu.
    // Example: window.moondroneNativeDrone.setSleepTimer(30)
    window.moondroneNativeSleepTimerDebug = {
      setSeconds: (seconds) => setNativeSleepTimer(seconds),
      cancel: () => cancelNativeSleepTimer(),
      state: () => getNativeSleepTimerState(),
    }
  }
}
