// =============================================================================
// NATIVE DRONE EXPERIMENT (temporary POC — Jul 2026)
// =============================================================================
// Thin JS bridge to the native Swift `NativeDrone` Capacitor plugin. Completely
// isolated from the Tone.js/WebAudio engine and the normal Play button. Used only
// to test whether native Swift audio survives Silent Mode and lock/background.
//
// Revert: delete this file, remove its import + buttons from AudioDebugPanel.jsx,
// remove the NativeDronePlugin registration/classes in MoondroneAudioPlugin.swift,
// and remove UIBackgroundModes from ios/App/App/Info.plist.

import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeDrone = registerPlugin('NativeDrone')

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

// Console API so the native drone can be triggered separately from the real engine:
//   moondroneNativeDrone.start()      moondroneNativeDrone.start(0.3)
//   moondroneNativeDrone.setVolume(0.1)
//   moondroneNativeDrone.stop()
if (typeof window !== 'undefined') {
  window.moondroneNativeDrone = {
    start: startNativeDrone,
    stop: stopNativeDrone,
    setVolume: setNativeDroneVolume,
    isAvailable: isNativeDroneAvailable,
  }
}
