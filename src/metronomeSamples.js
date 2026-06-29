export const METRONOME_SOUND_MODES = [
  { id: 'wood', label: 'Wood' },
  { id: 'triangle', label: 'Triangle' },
]

export const METRONOME_STRAIGHT_METER = 'straight'

export const METRONOME_METERS = [2, 3, 4, 5, 6]

export const METRONOME_METER_OPTIONS = [
  { value: METRONOME_STRAIGHT_METER, label: 'Straight (No Accent)' },
  ...METRONOME_METERS.map((meter) => ({ value: String(meter), label: `${meter}/4` })),
]

export const DEFAULT_METRONOME_SOUND_MODE = 'wood'
export const DEFAULT_METRONOME_METER = 4

export const METRONOME_SAMPLE_IDS = [
  'blockHigh',
  'blockLow',
  'triangleOpen',
  'triangleClosed',
]

import { METRONOME_TUNING } from './soundTuning'

export const TRIANGLE_OPEN_PLAYER_POOL_SIZE = METRONOME_TUNING.triangleOpenPlayerPoolSize

// Bundled under public/samples/ — copied to dist/samples/ and into the Capacitor iOS bundle.
// Use import.meta.env.BASE_URL so paths resolve correctly in dev, production web, and Capacitor.
const samplesBase = `${import.meta.env.BASE_URL}samples/`

export const METRONOME_SAMPLE_URLS = {
  blockHigh: `${samplesBase}block.high.wav`,
  blockLow: `${samplesBase}block.low.wav`,
  triangleOpen: `${samplesBase}triangle.open.wav`,
  triangleClosed: `${samplesBase}triangle.closed.wav`,
}

/** Resolve a metronome asset path against the current document (Capacitor-safe). */
export function resolveMetronomeSampleUrl(relativeOrAbsoluteUrl) {
  if (typeof window === 'undefined' || !relativeOrAbsoluteUrl) {
    return relativeOrAbsoluteUrl
  }

  try {
    return new URL(relativeOrAbsoluteUrl, window.location.href).href
  } catch {
    return relativeOrAbsoluteUrl
  }
}

export function getMetronomeSampleUrlDiagnostics() {
  return Object.fromEntries(
    METRONOME_SAMPLE_IDS.map((sampleId) => [
      sampleId,
      {
        path: METRONOME_SAMPLE_URLS[sampleId],
        resolved: resolveMetronomeSampleUrl(METRONOME_SAMPLE_URLS[sampleId]),
      },
    ]),
  )
}
