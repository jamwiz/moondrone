// User-facing moon names for sound presets. Internal preset IDs (Pure, Shruti, …)
// stay unchanged in the engine and soundTuning.js — only display labels change here.

export const PRESET_MOON_LABELS = {
  Pure: 'Mimas',
  Shruti: 'Europa',
  Strings: 'Titan',
  Cosmos: 'Io',
  // Kept as "Binaural" (not a moon name) so users can find headphone beats fast.
  Binaural: 'Binaural',
}

export const MOON_DESCRIPTIONS = {
  Mimas: 'clean, centered tone',
  Europa: 'warm grounded practice drone',
  Titan: 'bowed-string atmosphere',
  Io: 'vast radiant cosmic drone',
  Binaural: 'headphone beat moon (replaces Phase with beat controls)',
}

export function getMoonLabel(presetName) {
  return PRESET_MOON_LABELS[presetName] ?? presetName
}
