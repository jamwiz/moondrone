// Background environments for Moondrone — fixed full-screen layers behind the UI.
// Selected manually via the header atmosphere button; not tied to Moon/Phase/sound.

export const ATMOSPHERES = [
  {
    id: 'space',
    label: 'Space',
    symbol: '✦',
    image: '/atmospheres/space.png',
    opacity: 0.70,
    scrim: 0.08,
    brightness: 1.10,
    contrast: 1.05,
    saturate: 1.04,
  },
  {
    id: 'desert',
    label: 'Desert',
    symbol: '☼',
    image: '/atmospheres/desert.png',
    opacity: 0.86,
    scrim: 0.05,
    brightness: 1.08,
    contrast: 1.08,
    saturate: 1.06,
  },
  {
    id: 'forest',
    label: 'Forest',
    symbol: '❋',
    image: '/atmospheres/forest.png',
    opacity: 0.78,
    scrim: 0.06,
    brightness: 1.10,
    contrast: 1.07,
    saturate: 1.10,
  },
]

export const DEFAULT_ATMOSPHERE_ID = 'space'

const LEGACY_ATMOSPHERE_IDS = {
  moon: 'space',
  'sacred-geometry': 'space',
}

export function getAtmosphere(id) {
  return ATMOSPHERES.find((atmosphere) => atmosphere.id === id) ?? ATMOSPHERES[0]
}

export function resolveAtmosphereId(storedId) {
  const id = LEGACY_ATMOSPHERE_IDS[storedId] ?? storedId
  return ATMOSPHERES.some((atmosphere) => atmosphere.id === id) ? id : DEFAULT_ATMOSPHERE_ID
}
