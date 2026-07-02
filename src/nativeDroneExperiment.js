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

export async function setNativeDroneFrequency(rootHz) {
  const result = await NativeDrone.setNativeDroneFrequency({ rootHz })
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
    isAvailable: isNativeDroneAvailable,
    DEFAULT_PARTIALS: NATIVE_DRONE_DEFAULT_PARTIALS,
  }
}
