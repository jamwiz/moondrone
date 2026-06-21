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

export const METRONOME_SAMPLE_URLS = {
  blockHigh: '/block.high.mp3',
  blockLow: '/block.low.mp3',
  triangleOpen: '/triangle.open.mp3',
  triangleClosed: '/triangle.closed.mp3',
}
