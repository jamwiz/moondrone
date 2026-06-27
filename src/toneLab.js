/**
 * Moondrone Tone Lab
 * ==================
 * Centralized sound-shaping knobs for all Moons. Edit THIS file to shape the
 * overall tone without digging through droneEngine.js or soundTuning.js.
 *
 * Set `enabled: false` to bypass the entire Tone Lab layer (underlying
 * AIR_SHIMMER_TUNING and MASTER_TUNING behave as before).
 *
 * Binaural uses the same Tone Lab and AIR bus path as other Moons during live
 * transitions. Binaural-only behavior: no Phase/Mood, Beat selector, quiet L/R
 * undertones, and undertone panning. Level matching uses PRESET_BALANCE_TRIM_DB.Binaural
 * and BINAURAL_UNDERTONE_GAIN — not a separate master limiter/output stage.
 *
 * QUICK PRESETS (copy values into the sections below):
 * ----------------------------------------------------
 * Safe default (current sound):
 *   masterTone: { lowCutHz: 35, highCutHz: 12000, lowMidGainDb: 0, airGainDb: 0 }
 *   harmonicLayer: { gain: 1 }, breathAir: { gain: 1, tone: 0.5, motionDepth: 1 }
 *   stereo: { width: 1 }, dynamics: { outputTrimDb: -1, limiterCeilingDb: -1.5, compressorAmount: 1 }
 *
 * Brighter / more open:
 *   masterTone: { lowCutHz: 45, highCutHz: 12000, lowMidGainDb: -0.8, airGainDb: 1.2 }
 *   harmonicLayer: { gain: 1.1 }, breathAir: { gain: 0.9, tone: 0.72, motionDepth: 1.1 }
 *   stereo: { width: 1.08 }, dynamics: { outputTrimDb: -1.2, limiterCeilingDb: -1.5, compressorAmount: 1 }
 *
 * Warmer / less mud:
 *   masterTone: { lowCutHz: 28, highCutHz: 9000, lowMidGainDb: -1.8, airGainDb: -0.5 }
 *   harmonicLayer: { gain: 0.85 }, breathAir: { gain: 0.7, tone: 0.35, motionDepth: 0.9 }
 *   stereo: { width: 0.92 }, dynamics: { outputTrimDb: -1, limiterCeilingDb: -1.5, compressorAmount: 0.85 }
 *
 * Cleaner high-register:
 *   masterTone: { lowCutHz: 40, highCutHz: 10500, lowMidGainDb: -1.2, airGainDb: 0.3 }
 *   harmonicLayer: { gain: 0.65 }, breathAir: { gain: 0.6, tone: 0.55, motionDepth: 1 }
 *   stereo: { width: 1 }, dynamics: { outputTrimDb: -1.8, limiterCeilingDb: -2, compressorAmount: 0.9 }
 */

// Safe defaults for every master-tone field (used when toneLab.js omits a knob).
export const TONE_LAB_MASTER_TONE_DEFAULTS = {
  lowCutHz: 35,
  highCutHz: 12000,
  lowMidGainDb: 0,
  lowMidFrequencyHz: 320,
  lowMidQ: 0.5,
  speakerPresenceGainDb: 0,
  speakerPresenceFrequencyHz: 1600,
  speakerPresenceQ: 0.55,
  highMidGainDb: 0,
  highMidFrequencyHz: 2500,
  highMidQ: 0.85,
  airGainDb: 0,
  airFrequencyHz: 4200,
  airQ: 0.5,
  upperAirGainDb: 0,
  upperAirFrequencyHz: 7000,
  upperAirQ: 0.45,
}

/**
 * Merge user masterTone with defaults; ignore undefined/null so partial presets
 * (e.g. quick-preset comments missing highMidGainDb) never produce NaN ramps.
 */
export function resolveToneLabMasterTone(masterTone = {}) {
  const resolved = { ...TONE_LAB_MASTER_TONE_DEFAULTS }

  for (const [key, value] of Object.entries(masterTone ?? {})) {
    if (value !== undefined && value !== null && Number.isFinite(Number(value))) {
      resolved[key] = Number(value)
    }
  }

  return resolved
}

// Complete finite bypass/neutral targets for every Tone Lab bus EQ param.
export const TONE_LAB_BUS_EQ_NEUTRAL = {
  lowCutHz: 20,
  highCutHz: 20000,
  lowMidGainDb: 0,
  lowMidFrequencyHz: 320,
  lowMidQ: 0.5,
  speakerPresenceGainDb: 0,
  speakerPresenceFrequencyHz: 1600,
  speakerPresenceQ: 0.55,
  highMidGainDb: 0,
  highMidFrequencyHz: 2500,
  highMidQ: 0.85,
  airGainDb: 0,
  airFrequencyHz: 4200,
  airQ: 0.5,
  upperAirGainDb: 0,
  upperAirFrequencyHz: 7000,
  upperAirQ: 0.45,
}

const TONE_LAB_BUS_EQ_KEYS = Object.keys(TONE_LAB_BUS_EQ_NEUTRAL)

/**
 * Resolve every Tone Lab bus EQ target as a finite number.
 * Active mode uses masterTone; bypass/neutral uses TONE_LAB_BUS_EQ_NEUTRAL.
 */
export function resolveToneLabBusEqTargets({ active = true, masterTone = {} } = {}) {
  const source = active
    ? resolveToneLabMasterTone(masterTone)
    : resolveToneLabMasterTone(TONE_LAB_BUS_EQ_NEUTRAL)
  const targets = {}

  for (const key of TONE_LAB_BUS_EQ_KEYS) {
    const numeric = Number(source[key])
    targets[key] = Number.isFinite(numeric) ? numeric : TONE_LAB_BUS_EQ_NEUTRAL[key]
  }

  return targets
}

export const TONE_LAB_TUNING = {
  // Master bypass — set false to disable all Tone Lab shaping instantly.
  enabled: true,

  // ---------------------------------------------------------------------------
  // MASTER TONE — whole drone bus EQ (post-reverb, pre-master)
  // ---------------------------------------------------------------------------
  masterTone: {
    // High-pass on the full drone bus. Cuts sub rumble and mud.
    // Range: 20–180 Hz. Lower = more bass; higher = tighter/cleaner low end.
    // Safe default: 35 (gentle, nearly transparent).
    lowCutHz: 100,

    // Low-pass on the full drone bus. Rolls off brightness/air.
    // Range: 2500–12000 Hz. Lower = darker; higher (12000) = most open.
    // Safe default: 12000 (minimal rolloff — matches pre-Tone-Lab openness).
    highCutHz: 12000,

    // Broad peaking EQ around 200–500 Hz (center ~320 Hz).
    // Negative = less warmth/mud; positive = fuller body.
    // Range: -4 to +2 dB. Safe default: 0 (neutral).
    // Global clarity lift (Jun 2026): eased low-mid blanket + presence + air so car/
    // phone playback reads brighter without harshness. Still negative in the presence
    // region — warm/soft character preserved.
    lowMidGainDb: -22,
    lowMidFrequencyHz: 320,
    lowMidQ: 0.1,

    // Broad phone / small-speaker presence band (~1.2–2 kHz). Independent from
    // highMidGainDb (harshness / upper-mid bite). Helps the drone read on iPhone,
    // car, and small speakers without simply making it brighter.
    // Positive = more projection / forwardness; negative = softer / more recessed.
    // Range: -3 to +3 dB. Safe default: 0 (transparent).
    speakerPresenceGainDb: 3,
    speakerPresenceFrequencyHz: 1600,
    speakerPresenceQ: 0.1,

    // Broad peaking EQ around 2–3 kHz (center ~2500 Hz) — the presence / harshness /
    // nasal / digital-edge / upper-harmonic-bite region. Targets fatigue from
    // upper-mid energy without touching the air shelf above ~4 kHz.
    // Negative = smoother, warmer, less fatiguing; positive = more presence and
    // overtone articulation.
    // Range: -6 to +3 dB. Safe default: 0 (neutral).
    // Examples: -2 dB = smoother; -4 dB = very soft / meditation-oriented; +1 dB = more presence.
    highMidGainDb: -3,
    highMidFrequencyHz: 2500,
    highMidQ: 0.85,

    // High shelf “air” band (~4.2 kHz). Added on top of AIR_SHIMMER air shelf.
    // Range: -2 to +3 dB. Safe default: 0 (no extra air from Tone Lab).
    airGainDb: 12.5,
    airFrequencyHz: 4200,
    airQ: 0.1,

    // Upper-air / sparkle band (~7 kHz). Independent from airGainDb (~4.2 kHz).
    // Controls shimmer, gloss, whisp, and top-end edge — not general openness.
    // Positive = more sparkle and top-end openness; negative = softer, less hiss/whisp.
    // Range: -3 to +3 dB. Safe default: 0 (transparent).
    upperAirGainDb: 3,
    upperAirFrequencyHz: 7600,
    upperAirQ: 0.55,
  },

  // ---------------------------------------------------------------------------
  // HARMONIC LAYER — global multiplier for added harmonic partials / shimmer
  // ---------------------------------------------------------------------------
  harmonicLayer: {
    // Scales all Tone-Lab-aware harmonic partials (AIR_SHIMMER partials underneath).
    // Range: 0–1.5. 0 = no added harmonics; 1 = current; >1 = more shimmer.
    gain: .8,
  },

  // ---------------------------------------------------------------------------
  // MOON PHASE HARMONICS — mood/orbit harmonic layer (non-binaural moons only)
  // ---------------------------------------------------------------------------
  moonPhaseHarmonics: {
    // Global volume for the mood harmonic layer (True Orbit pair, per-voice orbit
    // cents, harmonic bloom redistribution, Super dual beats, bloom EQ level).
    // Range: 0–1.5. 0 = off; 1 = current behavior.
    gain: .3,

    // Tone control for the phase harmonic layer — bloom shelf swing and orbit shimmer.
    // Range: 0–1.5. 0 = darker/smoother; 1 = current; >1 = brighter (cautious).
    brightness: 5,

    // How much the phase harmonic layer moves (orbit sweep, bloom, eclipse, orbit cents).
    // Range: 0–1.5. 0 = steady; 1 = current motion.
    motionDepth: 1,
  },

  // ---------------------------------------------------------------------------
  // BREATH AIR — breath-noise texture macros
  // ---------------------------------------------------------------------------
  breathAir: {
    // Global breath-noise level multiplier.
    // Range: 0–1.5. 0 = silence noise layer; 1 = current amount.
    gain: .5,

    // Shifts noise darker (0) ↔ brighter (1) via HPF/LPF endpoints.
    // 0.5 = calibrated to match current AIR_SHIMMER breath filter range.
    tone: 0.5,

    // How strongly noise follows the Breath cycle swell.
    // Range: 0–1.5. 0 = flat; 1 = current motion; >1 = more obvious swell.
    motionDepth: 1.5,

    // --- Soft breath envelope (no hard on/off gate) ---
    // Subtle bed at cycle trough when Breath slider > 0 (not obvious hiss).
    // Range: 0–0.25. Safe default: 0.1.
    floorLevel: 0.5,

    // Soft-knee on the breath curve — lower = smoother, less abrupt.
    // Range: 0.2–1.2. Safe default: 0.42.
    swellSoftness: 0.2,

    // Peak sharpness — lower = more gradual swell/fade.
    // Range: 0.5–1.5. Safe default: 0.88.
    swellShape: 0.77,
  },

  // ---------------------------------------------------------------------------
  // STEREO — global width multiplier (all Moons)
  // ---------------------------------------------------------------------------
  stereo: {
    // Multiplies computed stereo width after preset/mood offsets.
    // Range: 0–1.5. 0 = mono; 1 = current width; >1 = wider (clamped to 1).
    width: 1.5,
  },

  // ---------------------------------------------------------------------------
  // DYNAMICS — final trim, limiter, compressor macro
  // ---------------------------------------------------------------------------
  dynamics: {
    // Final output trim before the master stage (replaces AIR overallLoudnessTrimDb).
    // Range: -6 to +2 dB. Safe default: -1 (matches current overall trim).
    outputTrimDb: 0,

    // Brick-wall limiter ceiling (dBFS).
    // Range: -3 to -0.5 dB. Safe default: -1.5.
    limiterCeilingDb: -1,

    // Compressor strength macro. 1 = current MASTER_TUNING glue level.
    // Range: 0–1.5. Lower = gentler/less squash; higher = more glue (watch pumping).
    // Maps to threshold, ratio, and makeup — not a blind crush.
    compressorAmount: 1.5,

    // Final post-limiter output trim. Use mainly for attenuation after mastering.
    // Positive values can exceed the limiter ceiling and may clip device output.
    // Calibrated 2026 via dev output meter (+3 dB vs prior 0 dB default).
    finalOutputTrimDb: 21,
  },
}

// Bypass/neutral dynamics targets (finite defaults for every field).
export const TONE_LAB_DYNAMICS_NEUTRAL = {
  outputTrimDb: 0,
  limiterCeilingDb: -1.5,
  compressorAmount: 1,
  finalOutputTrimDb: 0,
}

// Compressor macro anchors (internal — do not edit unless you know the master chain).
export const TONE_LAB_COMPRESSOR_MACRO = {
  gentle: { thresholdDb: -10, ratio: 1.5, makeupGainDb: 3 },
  reference: { thresholdDb: -18, ratio: 2.2, makeupGainDb: 4.5 },
  strong: { thresholdDb: -24, ratio: 2.8, makeupGainDb: 5.5 },
}

/**
 * Interpolate compressor settings from dynamics.compressorAmount (0–1.5).
 */
export function getToneLabCompressorSettings(amount = TONE_LAB_TUNING.dynamics.compressorAmount) {
  const clamped = Math.max(0, Math.min(1.5, amount))
  const { gentle, reference, strong } = TONE_LAB_COMPRESSOR_MACRO

  if (clamped <= 1) {
    const t = clamped
    return {
      thresholdDb: gentle.thresholdDb + (reference.thresholdDb - gentle.thresholdDb) * t,
      ratio: gentle.ratio + (reference.ratio - gentle.ratio) * t,
      makeupGainDb: gentle.makeupGainDb + (reference.makeupGainDb - gentle.makeupGainDb) * t,
    }
  }

  const t = clamped - 1
  return {
    thresholdDb: reference.thresholdDb + (strong.thresholdDb - reference.thresholdDb) * t,
    ratio: reference.ratio + (strong.ratio - reference.ratio) * t,
    makeupGainDb: reference.makeupGainDb + (strong.makeupGainDb - reference.makeupGainDb) * t,
  }
}

/**
 * Breath-noise envelope: smooth swell/fade tied to the Breath cycle.
 * Uses a soft knee + floor instead of a hard gate (no silence-to-hiss jumps).
 */
export function computeBreathAirEnvelope(shapedCurve, breathAmount, settings) {
  if (breathAmount <= 0) {
    return 0
  }

  const {
    floorLevel = 0.1,
    swellSoftness = 0.42,
    swellShape = 0.88,
    motionDepth = 1,
  } = settings
  const floor = Math.max(0, Math.min(0.25, floorLevel))
  const positiveSwell = Math.max(0, shapedCurve)
  // Smoothstep the cycle input so discrete breath ticks read as a continuous swell.
  const smoothedSwell = positiveSwell * positiveSwell * (3 - 2 * positiveSwell)
  // Soft knee: lifts the quiet part of the cycle instead of cutting to zero.
  const knee = smoothedSwell ** Math.max(0.35, swellSoftness)
  // motionDepth scales swell amplitude — not peak sharpness (avoids jagged steps).
  const shaped = knee ** Math.max(0.55, Math.min(1.1, swellShape))
  const swelled = floor + (1 - floor) * shaped
  const depth = Math.max(0, Math.min(1.5, motionDepth))
  const depthScaled = floor + (swelled - floor) * depth

  return breathAmount * Math.min(1, depthScaled)
}

/**
 * Breath-noise HPF/LPF endpoints from breathAir.tone (0 = dark, 1 = bright).
 * tone 0.5 matches current AIR_SHIMMER breath filter calibration.
 */
export function getToneLabBreathFilterEndpoints(tone = TONE_LAB_TUNING.breathAir.tone) {
  const clamped = Math.max(0, Math.min(1, tone))

  return {
    highpassMinHz: 1600 + (1100 - 1600) * clamped,
    highpassMaxHz: 1100 + (750 - 1100) * clamped,
    lowpassMinHz: 3200 + (4200 - 3200) * clamped,
    lowpassMaxHz: 5000 + (7000 - 5000) * clamped,
  }
}

/**
 * Scale mood harmonic motion (orbit sweep, bloom, eclipse, orbit cents). 1 = unchanged.
 */
export function scaleMoonPhaseHarmonicMotion(value, motionDepth = TONE_LAB_TUNING.moonPhaseHarmonics.motionDepth) {
  return value * Math.max(0, motionDepth)
}

/**
 * Brightness macro for mood bloom high-shelf swing (dB). 1 = unchanged.
 */
export function applyMoonPhaseHarmonicBloomBrightness(
  bloomGainDb,
  brightness = TONE_LAB_TUNING.moonPhaseHarmonics.brightness,
) {
  const clamped = Math.max(0, Math.min(1.5, brightness))

  if (clamped === 1) {
    return bloomGainDb
  }

  const swing = 0.35 + 0.65 * Math.min(1, clamped) + Math.max(0, clamped - 1) * 0.2
  const offsetDb = (clamped - 1) * 1.8

  return bloomGainDb * swing + offsetDb
}

/**
 * Brightness macro for True Orbit / per-voice orbit cents (less shimmer when darker).
 * 1 = unchanged.
 */
export function scaleMoonPhaseHarmonicOrbitCents(
  cents,
  brightness = TONE_LAB_TUNING.moonPhaseHarmonics.brightness,
) {
  const clamped = Math.max(0, Math.min(1.5, brightness))

  if (clamped === 1) {
    return cents
  }

  const shimmer = 0.5 + 0.5 * Math.min(1, clamped) + Math.max(0, clamped - 1) * 0.15

  return cents * shimmer
}
