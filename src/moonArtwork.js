// Per-preset moon artwork (internal preset IDs → public asset paths).
// User-facing moon names: Pure=Mimas, Shruti=Europa, Strings=Titan, Cosmos=Io.

const MOON_ARTWORK = {
  Pure: '/moons/moon.png',
  Shruti: '/moons/Europa.png',
  Strings: '/moons/Titan.png',
  Cosmos: '/moons/Io.png',
  Binaural: '/moons/Binaural.png',
}

export function getMoonArtworkSrc(presetName) {
  return MOON_ARTWORK[presetName] ?? MOON_ARTWORK.Shruti
}
