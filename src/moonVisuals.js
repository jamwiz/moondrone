/**
 * Central moon appearance — Moon preset + Phase combine into CSS custom properties
 * for tint, rim, halo, bloom, breath, and luminance. Full + Europa is the baseline
 * (current default look). No artwork is replaced; values drive overlays and blends.
 */

const VISUAL_BASE = {
  luminanceIdle: 0.58,
  luminancePlayBase: 0.94,
  luminancePlayIntensity: 0.34,
  saturateIdle: 0.9,
  saturatePlay: 1.1,
  glowOpacityIdleFactor: 1,
  glowOpacityPlayFactor: 1,
  glowScaleFactor: 1,
  glowStrengthFactor: 1,
  bloomOpacityFactor: 1,
  bloomSizeFactor: 1,
  breathAmplitude: 1,
  rimStrength: 1,
  rimR: 255,
  rimG: 244,
  rimB: 220,
  rimGlowR: 255,
  rimGlowG: 224,
  rimGlowB: 168,
  haloInnerR: 251,
  haloInnerG: 209,
  haloInnerB: 148,
  haloOuterR: 246,
  haloOuterG: 192,
  haloOuterB: 128,
  bloomInnerR: 250,
  bloomInnerG: 212,
  bloomInnerB: 158,
  bloomOuterR: 246,
  bloomOuterG: 195,
  bloomOuterB: 131,
  surfaceBloomR: 249,
  surfaceBloomG: 207,
  surfaceBloomB: 150,
  surfaceBloom2R: 255,
  surfaceBloom2G: 228,
  surfaceBloom2B: 182,
  surfaceTintR: 0,
  surfaceTintG: 0,
  surfaceTintB: 0,
  surfaceTintOpacity: 0,
  // Eclipse / colored wash (multiply) — tints craters + shadows, darkens body.
  eclipseR: 20,
  eclipseG: 8,
  eclipseB: 6,
  eclipseOpacity: 0,
  eclipseCenterOpacity: 0,
  // Atmospheric haze — extra outer light-field veil (Blue/Super expand it).
  hazeOpacity: 0,
  hazeR: 188,
  hazeG: 206,
  hazeB: 232,
  // Moon-character tint — a SECOND soft-light overlay that stacks on top of the
  // Phase tint (never replaces it) so the moon adds ~20–30% warmth/coolness.
  moonTintR: 0,
  moonTintG: 0,
  moonTintB: 0,
  moonTintOpacity: 0,
}

/**
 * Phase = the dominant lunar condition (~70–80% of the moon's identity).
 * Values are pushed hard so each Phase reads instantly from across the room.
 * Full is the neutral reference; the others depart from it dramatically.
 */
const PHASE_VISUAL = {
  // NEW — hidden in darkness: body very dim, glow nearly gone, thin silver rim.
  new: {
    luminanceIdle: 0.3,
    luminancePlayBase: 0.52,
    luminancePlayIntensity: 0.18,
    saturateIdle: 0.7,
    saturatePlay: 0.78,
    glowOpacityIdleFactor: 0.22,
    glowOpacityPlayFactor: 0.28,
    glowScaleFactor: 0.82,
    glowStrengthFactor: 0.34,
    bloomOpacityFactor: 0.28,
    bloomSizeFactor: 0.86,
    breathAmplitude: 0.6,
    rimStrength: 0.55,
    rimR: 206,
    rimG: 214,
    rimB: 230,
    rimGlowR: 150,
    rimGlowG: 162,
    rimGlowB: 184,
    haloInnerR: 150,
    haloInnerG: 162,
    haloInnerB: 184,
    haloOuterR: 96,
    haloOuterG: 106,
    haloOuterB: 126,
    surfaceTintR: 28,
    surfaceTintG: 34,
    surfaceTintB: 52,
    surfaceTintOpacity: 0.42,
    // Gentle umbra to deepen the shadowed body without going red.
    eclipseR: 10,
    eclipseG: 12,
    eclipseB: 20,
    eclipseOpacity: 0.4,
    eclipseCenterOpacity: 0.16,
  },
  // FULL — neutral baseline: warm ivory moon, balanced halo (the reference).
  full: {},
  // BLUE — cold, distant, nocturnal: moonlit-snow silver-blue, wide hazy glow.
  blue: {
    luminanceIdle: 0.5,
    luminancePlayBase: 0.84,
    luminancePlayIntensity: 0.3,
    saturateIdle: 0.62,
    saturatePlay: 0.74,
    glowOpacityPlayFactor: 1.12,
    glowScaleFactor: 1.34,
    glowStrengthFactor: 1.05,
    bloomOpacityFactor: 1.18,
    bloomSizeFactor: 1.42,
    breathAmplitude: 1.08,
    rimStrength: 1.05,
    rimR: 198,
    rimG: 220,
    rimB: 255,
    rimGlowR: 150,
    rimGlowG: 190,
    rimGlowB: 245,
    haloInnerR: 176,
    haloInnerG: 208,
    haloInnerB: 248,
    haloOuterR: 116,
    haloOuterG: 156,
    haloOuterB: 216,
    bloomInnerR: 178,
    bloomInnerG: 210,
    bloomInnerB: 248,
    bloomOuterR: 120,
    bloomOuterG: 160,
    bloomOuterB: 220,
    surfaceBloomR: 196,
    surfaceBloomG: 220,
    surfaceBloomB: 252,
    surfaceBloom2R: 220,
    surfaceBloom2G: 236,
    surfaceBloom2B: 255,
    surfaceTintR: 96,
    surfaceTintG: 150,
    surfaceTintB: 214,
    surfaceTintOpacity: 0.32,
    hazeOpacity: 0.3,
    hazeR: 176,
    hazeG: 206,
    hazeB: 244,
  },
  // BLOOD — eclipse / blood moon: dark copper body, red craters, amber-red halo.
  blood: {
    luminanceIdle: 0.36,
    luminancePlayBase: 0.62,
    luminancePlayIntensity: 0.24,
    saturateIdle: 1.15,
    saturatePlay: 1.4,
    glowOpacityPlayFactor: 1.2,
    glowScaleFactor: 1.06,
    glowStrengthFactor: 1.1,
    bloomOpacityFactor: 1.18,
    bloomSizeFactor: 1.04,
    breathAmplitude: 0.94,
    rimStrength: 1.5,
    rimR: 255,
    rimG: 132,
    rimB: 72,
    rimGlowR: 224,
    rimGlowG: 70,
    rimGlowB: 36,
    haloInnerR: 224,
    haloInnerG: 92,
    haloInnerB: 48,
    haloOuterR: 138,
    haloOuterG: 40,
    haloOuterB: 22,
    bloomInnerR: 214,
    bloomInnerG: 84,
    bloomInnerB: 44,
    bloomOuterR: 138,
    bloomOuterG: 38,
    bloomOuterB: 20,
    surfaceBloomR: 210,
    surfaceBloomG: 88,
    surfaceBloomB: 46,
    surfaceBloom2R: 236,
    surfaceBloom2G: 128,
    surfaceBloom2B: 70,
    surfaceTintR: 150,
    surfaceTintG: 36,
    surfaceTintB: 18,
    surfaceTintOpacity: 0.4,
    // Strong red multiply wash across the whole disc + a deep eclipse vignette.
    eclipseR: 120,
    eclipseG: 26,
    eclipseB: 14,
    eclipseOpacity: 0.78,
    eclipseCenterOpacity: 0.46,
  },
  // SUPER — overflowing with light: brightest body, largest halo, biggest bloom.
  super: {
    luminanceIdle: 0.7,
    luminancePlayBase: 1.16,
    luminancePlayIntensity: 0.5,
    saturatePlay: 1.14,
    glowOpacityIdleFactor: 1.3,
    glowOpacityPlayFactor: 1.55,
    glowScaleFactor: 1.4,
    glowStrengthFactor: 1.5,
    bloomOpacityFactor: 1.7,
    bloomSizeFactor: 1.5,
    breathAmplitude: 1.5,
    rimStrength: 1.4,
    rimR: 255,
    rimG: 250,
    rimB: 232,
    rimGlowR: 255,
    rimGlowG: 236,
    rimGlowB: 186,
    haloInnerR: 255,
    haloInnerG: 244,
    haloInnerB: 214,
    haloOuterR: 255,
    haloOuterG: 220,
    haloOuterB: 156,
    bloomInnerR: 255,
    bloomInnerG: 232,
    bloomInnerB: 186,
    bloomOuterR: 255,
    bloomOuterG: 214,
    bloomOuterB: 146,
    surfaceBloomR: 255,
    surfaceBloomG: 224,
    surfaceBloomB: 166,
    surfaceBloom2R: 255,
    surfaceBloom2G: 242,
    surfaceBloom2B: 206,
    hazeOpacity: 0.26,
    hazeR: 255,
    hazeG: 232,
    hazeB: 176,
  },
}

/**
 * Moon preset = material character (~20–30%). Kept SECONDARY on purpose: only
 * multiplicative *Factor nudges, a gentle luminanceFactor, and a stacking
 * moonTint overlay — so the moon never overrides the Phase's color identity.
 */
const MOON_VISUAL = {
  // Mimas — neutral, realistic, restrained.
  Pure: {
    luminanceFactor: 0.96,
    glowOpacityPlayFactor: 0.9,
    bloomOpacityFactor: 0.88,
    glowStrengthFactor: 0.92,
    breathFactor: 0.94,
  },
  // Europa — warm, balanced (baseline character).
  Shruti: {
    moonTintR: 196,
    moonTintG: 150,
    moonTintB: 96,
    moonTintOpacity: 0.08,
  },
  // Titan — slightly golden, atmospheric.
  Strings: {
    moonTintR: 214,
    moonTintG: 158,
    moonTintB: 70,
    moonTintOpacity: 0.2,
    bloomOpacityFactor: 1.06,
    bloomSizeFactor: 1.06,
    glowStrengthFactor: 1.04,
  },
  // Io — more radiant, larger bloom.
  Cosmos: {
    luminanceFactor: 1.05,
    glowScaleFactor: 1.14,
    glowStrengthFactor: 1.16,
    glowOpacityPlayFactor: 1.14,
    bloomOpacityFactor: 1.2,
    bloomSizeFactor: 1.16,
    breathFactor: 1.16,
  },
  // Binaural — cool silver, clean, focused.
  Binaural: {
    moonTintR: 150,
    moonTintG: 168,
    moonTintB: 196,
    moonTintOpacity: 0.16,
    glowScaleFactor: 0.94,
    glowOpacityPlayFactor: 0.92,
    bloomOpacityFactor: 0.9,
  },
}

/**
 * Combine phase (primary lunar condition) with moon preset (material character).
 * Phase sets the base profile; moon applies overrides and multiplies *Factor keys.
 */
function resolveMoonVisual(presetName, phaseId) {
  const phase = PHASE_VISUAL[phaseId] ?? PHASE_VISUAL.full
  const moon = MOON_VISUAL[presetName] ?? MOON_VISUAL.Shruti

  const merged = { ...VISUAL_BASE, ...phase }

  for (const [key, value] of Object.entries(moon)) {
    if (key === 'luminanceFactor') {
      merged.luminanceIdle *= value
      merged.luminancePlayBase *= value
    } else if (key === 'breathFactor') {
      merged.breathAmplitude *= value
    } else if (key.endsWith('Factor') && typeof value === 'number') {
      merged[key] = (merged[key] ?? 1) * value
    } else if (value !== undefined) {
      merged[key] = value
    }
  }

  return merged
}

export function getMoonStageVisualStyle(presetName, phaseId) {
  const v = resolveMoonVisual(presetName, phaseId)

  return {
    '--mv-luminance-idle': String(v.luminanceIdle),
    '--mv-luminance-play-base': String(v.luminancePlayBase),
    '--mv-luminance-play-intensity': String(v.luminancePlayIntensity),
    '--mv-saturate-idle': String(v.saturateIdle),
    '--mv-saturate-play': String(v.saturatePlay),
    '--mv-glow-opacity-idle-factor': String(v.glowOpacityIdleFactor),
    '--mv-glow-opacity-play-factor': String(v.glowOpacityPlayFactor),
    '--mv-glow-scale-factor': String(v.glowScaleFactor),
    '--mv-glow-strength-factor': String(v.glowStrengthFactor),
    '--mv-bloom-opacity-factor': String(v.bloomOpacityFactor),
    '--mv-bloom-size-factor': String(v.bloomSizeFactor),
    '--mv-breath-amplitude': String(v.breathAmplitude),
    '--mv-rim-strength': String(v.rimStrength),
    '--mv-rim-r': String(v.rimR),
    '--mv-rim-g': String(v.rimG),
    '--mv-rim-b': String(v.rimB),
    '--mv-rim-glow-r': String(v.rimGlowR),
    '--mv-rim-glow-g': String(v.rimGlowG),
    '--mv-rim-glow-b': String(v.rimGlowB),
    '--mv-halo-inner-r': String(v.haloInnerR),
    '--mv-halo-inner-g': String(v.haloInnerG),
    '--mv-halo-inner-b': String(v.haloInnerB),
    '--mv-halo-outer-r': String(v.haloOuterR),
    '--mv-halo-outer-g': String(v.haloOuterG),
    '--mv-halo-outer-b': String(v.haloOuterB),
    '--mv-bloom-inner-r': String(v.bloomInnerR),
    '--mv-bloom-inner-g': String(v.bloomInnerG),
    '--mv-bloom-inner-b': String(v.bloomInnerB),
    '--mv-bloom-outer-r': String(v.bloomOuterR),
    '--mv-bloom-outer-g': String(v.bloomOuterG),
    '--mv-bloom-outer-b': String(v.bloomOuterB),
    '--mv-surface-bloom-r': String(v.surfaceBloomR),
    '--mv-surface-bloom-g': String(v.surfaceBloomG),
    '--mv-surface-bloom-b': String(v.surfaceBloomB),
    '--mv-surface-bloom2-r': String(v.surfaceBloom2R),
    '--mv-surface-bloom2-g': String(v.surfaceBloom2G),
    '--mv-surface-bloom2-b': String(v.surfaceBloom2B),
    '--mv-surface-tint-r': String(v.surfaceTintR),
    '--mv-surface-tint-g': String(v.surfaceTintG),
    '--mv-surface-tint-b': String(v.surfaceTintB),
    '--mv-surface-tint-opacity': String(v.surfaceTintOpacity),
    '--mv-moon-tint-r': String(v.moonTintR),
    '--mv-moon-tint-g': String(v.moonTintG),
    '--mv-moon-tint-b': String(v.moonTintB),
    '--mv-moon-tint-opacity': String(v.moonTintOpacity),
    '--mv-eclipse-r': String(v.eclipseR),
    '--mv-eclipse-g': String(v.eclipseG),
    '--mv-eclipse-b': String(v.eclipseB),
    '--mv-eclipse-opacity': String(v.eclipseOpacity),
    '--mv-eclipse-center-opacity': String(v.eclipseCenterOpacity),
    '--mv-haze-opacity': String(v.hazeOpacity),
    '--mv-haze-r': String(v.hazeR),
    '--mv-haze-g': String(v.hazeG),
    '--mv-haze-b': String(v.hazeB),
  }
}
