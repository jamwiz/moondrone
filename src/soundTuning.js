/**
 * Moondrone Sound Tuning
 * ======================
 * Edit this file to adjust sound design. Routing, node creation, and scheduling
 * live in `droneEngine.js` — this file holds the musical numbers only.
 *
 * QUICK START — safest edits first
 * --------------------------------
 * 1. PRESET_VOICE_GAINS — layer balance per preset
 * 2. PRESET_BALANCE_TRIM_DB / REGISTER_BALANCE_TRIM_DB — loudness matching
 * 3. DEFAULT_INTENSITY / DEFAULT_BREATH — default slider positions
 * 4. Preset `reverb` defaults inside PRESETS — space character per preset
 *
 * EDIT CAREFULLY
 * --------------
 * - INTENSITY_TUNING, BREATH_TUNING — global control feel
 * - OUTPUT_TUNING, SPEAKER_SAFETY_TUNING — loudness and phone strain
 * - METRONOME_TUNING — click level and limiter interaction
 *
 * AVOID UNLESS YOU KNOW WHY
 * -------------------------
 * - TRANSITION_TUNING (Play/Stop/crossfade timing)
 * - MASTER_LIMITER_DB, DRONE_METRONOME_HEADROOM_DB
 * - Guard/timing values tied to engine stability
 *
 * TEST AFTER EDITS
 * ----------------
 * - Shruti / Medium / Intensity 70 / Master Volume 100% on phone speakers
 * - High and Very High registers (buzz/strain check)
 * - Play → Stop → Play quickly (transient check)
 * - Drone + metronome together (pumping check)
 * - A/B against git before subjective tuning passes
 */

// =============================================================================
// 1. PRESET VOICE BALANCE
// =============================================================================
// Voice index order for all six-layer presets:
//   [0] −12 low octave   [1] root   [2] fifth
//   [3] +12 octave       [4] +24    [5] +31 upper fifth
//
// Raise a layer → more energy at that interval (warmer, brighter, or airier).
// Lower a layer → less congestion; may reduce projection if over-done.

export const PRESET_VOICE_GAINS = {
  // Pure (Mimas): sine root + quiet −12 triangle body; +12 carries float. Less triangle
  // energy — space/harmonics over body weight (see register tables for VH octave-up).
  Pure: [0.072, 0.24, 0.003, 0.062, 0.003, 0],
  Shruti: [0.065, 0.38, 0.14, 0, 0.032, 0],
  Strings: [0.19, 0.36, 0.10, 0.015, 0.015, 0.01],
  Choir: [0.045, 0.41, 0.30, 0.25, 0.17, 0.07],
  Cosmos: [0.045, 0.30, 0.18, 0.20, 0.23, 0.11],
  Binaural: [0.055, 0.38, 0.17, 0.10, 0.055, 0.025],
}

// Per-preset oscillator waveform overrides (Tone.js types). Only listed indices
// change — everything else follows getVoiceOscillatorType defaults in the engine.
export const PRESET_VOICE_OSCILLATOR_TYPES = {}

// Per-preset multiplier on VOICE_LAYER_PRESENCE output (1 = unchanged).
export const PRESET_VOICE_PRESENCE_MULTIPLIER = {}

// Preset filter + reverb defaults (decay/preDelay/wet shape the preset's space).
// filter.frequency / Q = tonal starting point before Intensity reshapes them.
// reverb.wet = default slider % (0–100 scale in UI, stored 0–1 here).
export const PRESETS = [
  {
    name: 'Pure',
    voiceGains: PRESET_VOICE_GAINS.Pure,
    filter: { frequency: 2280, Q: 0.07 },
    reverb: { decay: 9, preDelay: 0.152, wet: 0.23 },
  },
  {
    name: 'Shruti',
    voiceGains: PRESET_VOICE_GAINS.Shruti,
    filter: { frequency: 850, Q: 0.52 },
    reverb: { decay: 5.2, preDelay: 0.095, wet: 0.19 },
  },
  {
    name: 'Strings',
    // Filter base lowered (was 5000) to gently roll off the saw upper edge for a
    // smoother high end on phone speakers without losing ensemble air.
    voiceGains: PRESET_VOICE_GAINS.Strings,
    filter: { frequency: 4200, Q: 0.1 },
    reverb: { decay: 5.6, preDelay: 0.08, wet: 0.21 },
  },
  {
    name: 'Cosmos',
    voiceGains: PRESET_VOICE_GAINS.Cosmos,
    filter: { frequency: 420, Q: 0.42 },
    reverb: { decay: 10.5, preDelay: 0.15, wet: 0.54 },
  },
  {
    name: 'Binaural',
    voiceGains: PRESET_VOICE_GAINS.Binaural,
    filter: { frequency: 385, Q: 0.33 },
    reverb: { decay: 5.2, preDelay: 0.08, wet: 0.28 },
  },
]

export const BINAURAL_MODES = [
  { id: 'delta', label: 'Delta — 2 Hz — Deep / Sleep', beatHz: 2 },
  { id: 'theta', label: 'Theta — 4 Hz — Meditation', beatHz: 4 },
  { id: 'alpha', label: 'Alpha — 8 Hz — Calm', beatHz: 8 },
  { id: 'low-beta', label: 'Low Beta — 12 Hz — Focus', beatHz: 12 },
  { id: 'beta', label: 'Beta — 16 Hz — Active Focus', beatHz: 16 },
  { id: 'gamma', label: 'Gamma — 40 Hz — Bright / Intense', beatHz: 40 },
]

export const DEFAULT_BINAURAL_MODE_ID = 'theta'
export const DEFAULT_PRESET = PRESETS.find((preset) => preset.name === 'Shruti')

// Cosmos-only sky layers (indices 8–10 in engine). Raise for more float; lower for less buzz.
export const COSMOS_EXTENSION_GAINS = {
  celestial: 0.042,
  skyRoot: 0.026,
  skyOctave: 0.022,
}

// Foundation root multiplier (Shruti High/Very High, Cosmos). Lower → less low-mid weight.
export const FOUNDATION_ROOT_GAIN = 0.54

export const PRESET_FOUNDATION_ROOT_GAIN = {
  Shruti: 0.44,
}

// Per-preset, per-register low-mid relief — ONLY Low and Medium registers.
// Multiplicative voice-gain scales (1 = unchanged) applied on top of each preset's
// voiceGains for specific layers, so a preset that is too bass-forward/forceful in
// the lower registers can be calmed without touching its High/Very High balance,
// the global bass shelf, projection EQ, or routing. Voice indices:
//   0 = −12 low octave   1 = root   2 = fifth   6 = foundation root (Cosmos const root)
// Only listed presets/registers/indices are affected; everything else stays at 1.
export const PRESET_LOW_MID_REGISTER_VOICING = {
  // Shruti (Europa): hollow low-mid — ease −12, root, and fifth in Low/Medium;
  // warmth from root + reverb, not chesty body density.
  Shruti: {
    2: { 0: 0.78, 1: 0.86, 2: 0.82 },
    3: { 0: 0.8, 1: 0.88, 2: 0.84 },
  },
  // Mimas (Pure): cavern low-mid — full −12 body at Low; Medium body eased back so
  // the register does not jump forward on the lowest principal note.
  Pure: {
    2: { 0: 1.06, 1: 0.7, 3: 0.8 },
    3: { 0: 0.85, 1: 0.72, 3: 0.84 },
  },
  // Io (Cosmos): less low-mid push / bass-forward weight in the lower registers.
  // Ease root, low octave, fifth, and (Medium-only) the constant foundation root,
  // leaving the sky/upper extensions intact so it opens up vertically and floats
  // rather than thinning out.
  Cosmos: {
    2: { 0: 0.86, 1: 0.86, 2: 0.92 },
    3: { 0: 0.88, 1: 0.88, 2: 0.93, 6: 0.8 },
  },
  // Binaural: deeper Low/Medium hollow — ease low octave, root, fifth, and undertone
  // pressure; High/VH root-forward tables below preserve beat clarity on headphones.
  Binaural: {
    2: { 0: 0.58, 1: 0.64, 2: 0.62, 3: 0.76 },
    3: { 0: 0.62, 1: 0.34, 2: 0.64, 3: 0.78 },
  },
}

// Binaural headphone undertones (not register foundations).
export const BINAURAL_UNDERTONE_GAIN = 0.064
export const BINAURAL_PAN_AMOUNT = 0.52

// Shruti register voicing trims at High / Very High (multiplicative, 1 = unchanged).
export const SHRUTI_REGISTER_DAMPING = {
  high: {
    octaveBodyLayers: 0.05, // indices 0 and 3
    upperOctaveLayer: 0.08, // index 4
    upperFifthLayer: 0.06, // index 5 (×0.75 of upperOctave value in engine)
  },
  veryHigh: {
    octaveBodyLayers: 0.14,
    upperOctaveLayer: 0.2,
    upperFifthLayer: 0.17,
    foundationVoicing: 0.11,
  },
  veryHighStressIntensity: 0.8, // internal tonal amount; Intensity UI ~80+
  veryHighStress: {
    filterFocus: 0.38,
    fifth: 0.11,
    foundation: 0.06,
    upperLayers: 0.16,
  },
}

// How Intensity scales each layer's presence (after preset voiceGains).
// Lower base → quieter layer; higher character/focus coeffs → more Intensity response.
export const VOICE_LAYER_PRESENCE = {
  lowOctave: { base: 0.45, lowSettlingScale: 0.46, breathScale: 0.35 },
  root: { base: 0.68, lowSettlingScale: 0.12, breathScale: 1 },
  fifth: { base: 0.07, characterScale: 0.64, focusScale: 0.3, breathScale: 0.22 },
  octave: { base: 0.01, characterScale: 0.64, focusScale: 0.82, breathScale: 0.18 },
  upperOctave: { base: 0.004, characterScale: 0.24, focusScale: 0.42, breathScale: 0.12 },
  upperFifth: { base: 0.002, characterScale: 0.12, focusScale: 0.22, breathScale: 0.08 },
}

export const FOUNDATION_PRESENCE = {
  rootBase: 0.68,
  lowSettlingScale: 0.12,
}

// Strings partial / ensemble character
export const STRINGS_TUNING = {
  partialCount: 6,
  sawAmountBody: 0.1,
  // Mid/upper saw trimmed slightly to soften the bright edge (phone-speaker pass).
  sawAmountMid: 0.055,
  sawAmountUpper: 0.038,
  ensembleDetuneCents: [
    [-2.4, 1.1], [-1.8, 2.2], [-1.3, 1.7],
    [-2.0, 0.9], [-1.5, 2.6], [-2.2, 1.5],
  ],
  driftCents: 0.7,
  driftRampMinSeconds: 22,
  driftRampMaxSeconds: 38,
  driftPauseMinSeconds: 12,
  driftPauseMaxSeconds: 28,
  // Extra follow on principle body layers during the Breath cycle (gain/presence only).
  // Multiplies breathMotion × breathScale for listed indices — no new LFO or pitch.
  breathVoiceGainScale: {
    0: 1.58,
    1: 1.62,
    2: 1.42,
  },
  // Titan principle-layer breath pulse — full Breath-slider range (not high-only).
  // Asymmetric: trough dips deeper; inhale peak stays near current Titan level.
  breathCoreMotion: {
    principleIndices: [0, 1, 2],
    sliderMotionCurve: 1.1,
    sliderMotionScale: 1.78,
    principleInhaleScale: 0.86,
    principleTroughExtra: 1.48,
    exhaleDipDepth: 0.3,
    exhaleSofteningBoost: 0.24,
    register: {
      4: {
        sliderMotionScale: 2.14,
        principleInhaleScale: 0.88,
        principleTroughExtra: 1.72,
        exhaleDipDepth: 0.4,
        exhaleSofteningBoost: 0.34,
      },
      5: {
        sliderMotionScale: 2.32,
        principleInhaleScale: 0.9,
        principleTroughExtra: 1.86,
        exhaleDipDepth: 0.48,
        exhaleSofteningBoost: 0.38,
      },
    },
  },
  // High/VH: deeper breath follow on principle layers (indices 0–2).
  breathVoiceGainScaleRegister: {
    4: { 0: 1.84, 1: 1.94, 2: 1.68 },
    5: { 0: 1.72, 1: 1.62, 2: 1.55 },
  },
  // Longer gain ramps on Titan principle layers at High/VH — deep breath motion
  // otherwise steps between 160 ms ticks and clicks at high Intensity.
  highRegisterBreathRampMultiplier: 2.35,
  // Slew the asymmetric exhale dip so trough depth arrives gradually, not as a step.
  highRegisterExhaleDipSlew: 0.68,
  // Final de-click pass for High/VH transitions only (not steady-state Breath).
  highRegisterTransitionDeClick: {
    disposeSilenceThreshold: 0.00035,
    preStopFadeSeconds: 0.016,
    stopDelaySeconds: 0.06,
    transitionBreathRampMultiplier: 1.75,
    driftResumeDelaySeconds: 0.14,
    firstDriftScale: 0.32,
    firstDriftRampMinSeconds: 5.5,
  },
  // High ↔ Very High register only — de-click envelope around air/noise retargeting.
  highRegisterAirTransition: {
    reanchorDelaySeconds: 0.12,
    noiseFadeDownSeconds: 0.04,
    noiseRetargetGapSeconds: 0.015,
    noiseFadeInSeconds: 0.5,
    shelfRampSeconds: 0.95,
    outputTrimRampSeconds: 0.52,
  },
  // Medium-register-only softening for the lowest body layer (voice index 0, the −12
  // low octave). Trims the saw bite and rolls off upper partials so Titan's low body
  // sits under the bow as foundation instead of speaking as a forward principal note.
  // sawScale multiplies STRINGS_SAW_AMOUNT_BODY; harmonicRolloff progressively reduces
  // partials from the 3rd up. Only Medium + index 0 is affected; Low/High/VH unchanged.
  mediumBodySoftening: {
    sawScale: 0.45,
    harmonicRolloff: 0.4,
  },
  // High/VH: warmer principle timbre — less saw/harmonic glare on root body layers.
  highRegisterVoicing: {
    4: {
      principleSawScale: 0.64,
      principleHarmonicRolloff: 0.18,
    },
    5: {
      principleSawScale: 0.38,
      principleHarmonicRolloff: 0.34,
      // Keep 2nd harmonic for pitch; trim upper-mid / lower-treble partials (h4+).
      principleSecondHarmonicScale: 0.88,
      principleUpperMidHarmonicScale: 0.4,
    },
  },
}

// Choir ensemble spread
export const CHOIR_TUNING = {
  ensemblePanAmount: 0.16,
  ensembleDetuneCents: [
    [0, 2.2, -1.8], [0, 1.7, -2.4], [0, 2.5, -1.6],
    [0, 1.9, -2.1], [0, 2.0, -2.3], [0, 1.6, -1.9],
  ],
  sideGainBase: 0.11,
  sideGainCharacterScale: 0.07,
}

// Cosmos high-Intensity softening and extension presence shaping
export const COSMOS_TUNING = {
  highIntensityStart: 0.65,
  highIntensityRange: 0.35,
  highIntensityCurvePower: 1.1,
  filterFocusDamping: 0.12,
  layerFocusDamping: 0.4,
  softenedPresenceMix: 0.72,
  extensionFocusDamping: 0.5,
  extensionPresenceBase: 0.002,
  extensionCharacterScale: 0.12,
  extensionFocusScale: 0.22,
  upperLayerSoftening: {
    basePerIndex: 0.24,
    indexStep: 0.04,
    celestial: 0.42,
    skyRoot: 0.46,
    skyOctave: 0.48,
  },
}

export const PRESET_CUSTOM_VOICE_STRUCTURES = ['Strings', 'Choir']

// =============================================================================
// 2. REGISTER & PRESET LOUDNESS TRIMS
// =============================================================================
// Output-stage dB offsets (not voice gains). +dB louder, −dB quieter.
// Safe range: about ±2 dB per tweak step.

export const REGISTER_OCTAVES = {
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
  VERY_HIGH: 5,
}

export const PRESET_BALANCE_TRIM_DB = {
  // Level-match after Mimas hollow reshape (not octave-up global trim).
  Pure: 0.55,
  Shruti: 0.38,
  // Moon-wide output trim — level-match Io/Mimas/Europa without altering voice balance.
  Strings: 1.4,
  Choir: -1.25,
  Cosmos: -1.6,
  // Gentle static level match / beat headroom — Low/Med voicing trims do most of the work.
  Binaural: -1.35,
}

// High / Very High were at −5 / −4 dB — so aggressive that those registers were
// both quiet AND still harsh (the cut lowered level but not the upper-harmonic
// bite). Harshness is now controlled spectrally by upperHarmonicScale above, so
// these level trims are relaxed to a gentle taper for much better loudness.
export const REGISTER_BALANCE_TRIM_DB = {
  [REGISTER_OCTAVES.LOW]: 0.25,
  [REGISTER_OCTAVES.MEDIUM]: 0.5,
  [REGISTER_OCTAVES.HIGH]: -2,
  [REGISTER_OCTAVES.VERY_HIGH]: -2.5,
}

// Per-preset register loudness trims (output stage, additive dB on top of REGISTER_BALANCE_TRIM_DB).
// Only listed presets/registers are affected; Shruti (Europa) is intentionally omitted.
export const PRESET_REGISTER_BALANCE_TRIM_DB = {
  Pure: {
    [REGISTER_OCTAVES.HIGH]: -1,
    [REGISTER_OCTAVES.VERY_HIGH]: -3.5,
  },
  Strings: {
    // Register mix lift (output stage) — VH slightly more than High; voice voicing unchanged.
    [REGISTER_OCTAVES.HIGH]: 0,
    [REGISTER_OCTAVES.VERY_HIGH]: 0.5,
  },
  // Binaural: ease Low/Medium output dominance; lift High/VH principal audibility
  // (register-relative rebalance — not a global preset trim).
  Binaural: {
    [REGISTER_OCTAVES.LOW]: -0.65,
    [REGISTER_OCTAVES.MEDIUM]: -0.52,
    [REGISTER_OCTAVES.HIGH]: 0.8,
    [REGISTER_OCTAVES.VERY_HIGH]: 0.95,
  },
}

// Per-preset air / breath / shimmer gain scale (multiplicative, 1 = unchanged).
// Applies to breath-noise bed, AIR harmonic partials, and the air shelf. Optional
// register overrides — Low gets the strongest cut for Mimas/Titan.
export const PRESET_AIR_SHIMMER_GAIN_SCALE = {
  Pure: {
    default: 0.62,
    register: {
      [REGISTER_OCTAVES.LOW]: 0.52,
      [REGISTER_OCTAVES.HIGH]: 0.55,
      [REGISTER_OCTAVES.VERY_HIGH]: 0.48,
    },
  },
  Strings: {
    default: 0.33,
    register: {
      [REGISTER_OCTAVES.LOW]: 0.29,
      // VH: breath bed + air shelf only (Strings voices use saw partials, not AIR partials).
      [REGISTER_OCTAVES.VERY_HIGH]: 0.28,
    },
  },
  // Io: soften AIR bed / shelf / partials — keep airy identity, less wispy forward shimmer.
  Cosmos: {
    default: 0.86,
    register: {
      [REGISTER_OCTAVES.HIGH]: 0.82,
      [REGISTER_OCTAVES.VERY_HIGH]: 0.76,
    },
  },
  // Binaural: gentle air-shelf openness — no breath-noise bed, no Cosmos partials.
  Binaural: {
    default: 1.04,
    register: {
      [REGISTER_OCTAVES.LOW]: 0.98,
      [REGISTER_OCTAVES.MEDIUM]: 1.0,
    },
  },
}

// Mimas (Pure) + Europa (Shruti): compress AIR/wind/shimmer only at high Breath slider.
// Unity at/below breathUiKnee; progressive reduction above the knee (not a flat cut).
export const PRESET_HIGH_BREATH_AIR_GAIN_SCALE = {
  Pure: {
    breathUiKnee: 42,
    minScale: 0.28,
    curvePower: 1.55,
  },
  Shruti: {
    breathUiKnee: 58,
    minScale: 0.52,
    curvePower: 1.35,
  },
}

// Per-preset Phase / mood harmonic layer trim (True Orbit, bloom, eclipse, dual beats,
// orbit detune, gain bloom). Multiplicative on moonPhaseHarmonics.gain only.
export const PRESET_MOON_PHASE_HARMONICS_GAIN_SCALE = {
  Pure: {
    default: 0.65,
    register: {
      [REGISTER_OCTAVES.HIGH]: 0.55,
      [REGISTER_OCTAVES.VERY_HIGH]: 0.48,
    },
  },
  Strings: {
    default: 0.35,
    register: {
      [REGISTER_OCTAVES.HIGH]: 0.30,
      [REGISTER_OCTAVES.VERY_HIGH]: 0.21,
    },
  },
  Cosmos: {
    default: 0.84,
    register: {
      [REGISTER_OCTAVES.HIGH]: 0.76,
      [REGISTER_OCTAVES.VERY_HIGH]: 0.70,
    },
  },
}

// Per-preset, per-register presence multiplier (1 = unchanged).
// Mimas VH only: octave-up principal — +12 leads, body layers demoted.
export const PRESET_REGISTER_VOICE_PRESENCE_MULTIPLIER = {
  Pure: {
    [REGISTER_OCTAVES.VERY_HIGH]: { 0: 0.9, 1: 0.36, 3: 2.05 },
  },
  // Binaural: root-forward High/VH — principal pitch reads centered; maskers eased back.
  Binaural: {
    [REGISTER_OCTAVES.MEDIUM]: { 1: 0.72 },
    [REGISTER_OCTAVES.HIGH]: { 1: 1.14, 0: 0.90, 2: 0.86, 3: 0.84, 4: 0.82, 5: 0.80 },
    [REGISTER_OCTAVES.VERY_HIGH]: { 1: 1.18, 0: 0.86, 2: 0.82, 3: 0.80, 4: 0.76, 5: 0.72 },
  },
  // Titan: High/VH principle layers — less upper-harmonic presence, warmer body.
  Strings: {
    [REGISTER_OCTAVES.HIGH]: { 0: 0.94, 1: 0.90, 2: 0.88 },
    [REGISTER_OCTAVES.VERY_HIGH]: { 0: 0.82, 1: 0.68, 2: 0.74 },
  },
}

// Per-preset, per-register voice gain scale (multiplicative, 1 = unchanged).
// Only listed preset/register/voice indices are trimmed — not whole-register output.
export const PRESET_REGISTER_VOICE_GAIN_SCALE = {
  // Europa: extra low-mid relief at Low/Medium (all registers above use SHRUTI_REGISTER_DAMPING).
  Shruti: {
    [REGISTER_OCTAVES.LOW]: { 0: 0.88, 1: 0.86, 2: 0.84 },
    [REGISTER_OCTAVES.MEDIUM]: { 0: 0.76, 1: 0.82, 2: 0.86 },
  },
  // Mimas: Low/Med/High retain root-centered hierarchy; VH octave-up experiment.
  Pure: {
    [REGISTER_OCTAVES.LOW]: { 4: 0 },
    [REGISTER_OCTAVES.MEDIUM]: { 0: 0.83, 1: 0.96, 3: 0.92, 4: 0 },
    [REGISTER_OCTAVES.HIGH]: { 1: 0.88, 3: 0.88, 4: 0.55 },
    [REGISTER_OCTAVES.VERY_HIGH]: { 0: 0.58, 1: 0.24, 3: 1.75, 4: 0.26 },
  },
  // Io: ease upper/sky harmonic layers at High/VH — body + extensions stay spacious.
  Cosmos: {
    [REGISTER_OCTAVES.HIGH]: { 3: 0.92, 4: 0.86, 5: 0.84 },
    [REGISTER_OCTAVES.VERY_HIGH]: { 3: 0.84, 4: 0.80, 5: 0.76 },
  },
  // Titan: High/VH principle gain trim; VH upper bloom unchanged from prior pass.
  // Medium: ease −12 body / root push without thinning the bowed ensemble.
  Strings: {
    [REGISTER_OCTAVES.MEDIUM]: { 0: 0.76, 1: 0.86, 2: 0.96 },
    [REGISTER_OCTAVES.HIGH]: { 0: 0.84, 1: 0.74, 2: 0.82 },
    [REGISTER_OCTAVES.VERY_HIGH]: { 0: 0.62, 1: 0.44, 2: 0.56, 3: 0.944, 4: 0.91, 5: 0.91 },
  },
  // Binaural: Low/Med hollow + undertone trim; High/VH root-forward for beat clarity.
  Binaural: {
    [REGISTER_OCTAVES.LOW]: { 0: 0.58, 1: 0.66, 2: 0.66, 3: 0.78, 6: 0.78, 7: 0.78 },
    [REGISTER_OCTAVES.MEDIUM]: { 0: 0.72, 1: 0.36, 2: 0.68, 3: 0.80, 6: 0.80, 7: 0.80 },
    [REGISTER_OCTAVES.HIGH]: { 0: 0.86, 1: 1.16, 2: 0.80, 3: 0.82, 4: 0.78, 5: 0.74, 6: 0.96, 7: 0.96 },
    [REGISTER_OCTAVES.VERY_HIGH]: {
      0: 0.82,
      1: 1.36,
      2: 0.76,
      3: 0.78,
      4: 0.74,
      5: 0.70,
      6: 0.97,
      7: 0.97,
    },
  },
}

// Per-preset Breath-cycle gain follow on core body layers (indices 0, 1, 3).
// Multiplies breathMotion × breathScale only — same envelope, no pitch LFO.
export const PRESET_BREATH_VOICE_GAIN_SCALE = {
  Pure: {
    0: 1.4,
    1: 1.04,
    3: 1.12,
  },
  // Europa: principal/root breathes more audibly — gain follow only, no pitch motion.
  Shruti: {
    1: 1.38,
    0: 1.50,
  },
}

// Per-preset, per-register breath follow overrides (1 = use preset default above).
export const PRESET_REGISTER_BREATH_VOICE_GAIN_SCALE = {
  Pure: {
    [REGISTER_OCTAVES.VERY_HIGH]: { 0: 1.18, 1: 0.96, 3: 1.1 },
  },
}

// Per-preset Breath slider amount scale (multiplicative on getBreathAmount).
export const PRESET_BREATH_AMOUNT_SCALE = {
  Pure: 0.58,
}

// Per-preset Intensity soft ceiling — UI above softCeilingUi contributes less.
export const PRESET_INTENSITY_TUNING = {
  Pure: {
    softCeilingUi: 70,
    aboveCeilingContribution: 0.2,
  },
  // Binaural: upper-half intensity compression — UI 100 ≈ former 50–70% character.
  Binaural: {
    amountScale: 0.82,
    upperKneeUi: 50,
    upperMaxEffectiveUi: 67,
    upperCompressionPower: 2.4,
    brightAmountScale: 0.55,
    brightUpperKneeUi: 50,
    brightUpperMaxEffectiveUi: 58,
    brightUpperCompressionPower: 2.8,
    resonanceScale: 0.48,
  },
  // Io: default Intensity ~70 feels less piercing — harmonics soften above the knee.
  Cosmos: {
    amountScale: 0.94,
    softCeilingUi: 65,
    aboveCeilingContribution: 0.32,
  },
}

// =============================================================================
// 3. INTENSITY BEHAVIOR
// =============================================================================
// UI slider 0–100. Neutral warmth/brightness anchor = 50; default = 70.
// Raise neutral → darker/warmer at center. Raise usefulRange → more slider travel
// before hitting max internal amount.

export const DEFAULT_INTENSITY = 70

export const INTENSITY_TUNING = {
  neutralUi: 50,
  usefulRange: 0.9,
  defaultUi: DEFAULT_INTENSITY,

  // UI → internal amount curve
  amountLowerExponent: 0.9,
  amountUpperExponent: 1.2,
  amountUpperBoost: 0.15,

  // Dark (below neutral) / bright (above neutral) curves
  curvePowerDark: 1.1,
  curvePowerBright: 1.15,

  // Filter cutoff multiplier range (× preset base frequency)
  filterFrequencyMin: 0.48,
  filterFrequencyMax: 1.78,

  // Resonance / Q boost at high Intensity
  qGentleMax: 0.08,
  qStrongMax: 0.32,
  qFocusDamping: 0.5,
  qRampStartUi: 62,

  // Low-end reduction on low octave / foundation at high Intensity
  lowEndRampStartUi: 62,
  lowOctaveMaxReduction: 0.18,
  foundationMaxReduction: 0.14,
  lowOctaveDarkBoostMax: 0.1,
  foundationDarkBoostMax: 0.06,
  lowEndGentleExponent: 1.25,
  lowEndGentleScale: 0.4,
  lowEndStrongExponent: 1.1,
  highRegisterTonalStart: 0.7,
  highRegisterTonalScale: 0.35,

  qGentleExponent: 1.4,
  qStrongExponent: 1.15,
  shrutiVeryHighStressQDamping: 0.35,

  // Tonal shaping exponents (internal, not UI)
  characterCurvePower: 1.35,
  highFocusStart: 0.5,
  highFocusRange: 0.5,
  highFocusCurvePower: 1.4,
  lowSettlingStart: 0.4,
  lowSettlingRange: 0.6,
  lowSettlingCurvePower: 1.15,

  // Filter equation weights (advanced)
  filterFrequencyBaseWeight: 0.38,
  filterFrequencyCharacterScale: 0.74,
  filterFrequencyFocusScale: 0.34,
  filterQBaseWeight: 0.42,
  filterQCharacterScale: 1.15,
  filterQFocusScale: 1.85,
  filterQMinimum: 0.25,

  rampSeconds: 1.25,
}

// =============================================================================
// 4. BREATH BEHAVIOR
// =============================================================================
// Cycle length = speed. Offset depth = how far Breath moves around Intensity.
// Exhale asymmetry (1.45) = longer/softer exhale vs inhale.
// Too fast or too deep → seasick; too slow → static.

export const DEFAULT_BREATH = 35

export const BREATH_TUNING = {
  defaultUi: DEFAULT_BREATH,
  cycleSeconds: 12,
  updateSeconds: 0.16,
  sliderCurvePower: 1.08,

  offsetDepth: 0.44,
  voiceMotionDepth: 0.34,
  exhaleSoftening: 0.12,
  exhaleAsymmetry: 1.45,

  // After note/register changes: cycle position 0–1. ~0.54 = slightly exhale-side (soft entry).
  // Avoid 0.2–0.3 (peak inhale / brightest). 0 = neutral boundary.
  reanchorCyclePosition: 0.54,

  effectiveTonalMax: 1.15,
  breathRampMultiplier: 2, // × updateSeconds for filter/voice ramps
}

// =============================================================================
// 5. REVERB BEHAVIOR
// =============================================================================
// UI slider 0–100% maps through wetness curve below. Higher decay/preDelay = larger
// space. Too much wet = mud; too little = dry/practice-focused.

export const REVERB_TUNING = {
  sliderRampSeconds: 1,
  startupApplyRampSeconds: 1,

  wetLowScale: 0.45,
  wetLowThreshold: 0.25,

  wetMidBase: 0.10,
  wetMidRange: 0.32,
  wetMidThreshold: 0.65,
  wetMidCurvePower: 0.9,

  wetHighBase: 0.42,
  wetHighRange: 0.25,
  wetHighCurvePower: 0.8,

  decayMultiplier: 1.55,
  decayMax: 14,
  preDelayOffset: 0.045,
  preDelayMax: 0.18,
}

// Per-preset reverb wet multiplier at the same UI wet % (decay/preDelay live in PRESETS).
export const PRESET_REVERB_WET_SCALE = {
  Pure: 1.46,
  Shruti: 1.22,
}

// Per-preset projection softening — reduces dry vocal-presence push and widens the
// pre-reverb body so Mimas feels less exposed without changing global projection.
export const PRESET_PROJECTION_TUNING = {
  Pure: {
    presenceGainScale: 0.38,
    dryWidth: 0.5,
    lowMidCutGainDb: -5.5,
  },
  Shruti: {
    presenceGainScale: 0.72,
    dryWidth: 0.46,
    lowMidCutGainDb: -4.4,
  },
  // Binaural: decongest low-mid push; slight presence lift for openness (L/R beat exempt from dry narrow).
  Binaural: {
    presenceGainScale: 1.06,
    lowMidCutGainDb: -4.6,
  },
}

// Apply a fraction of bus EQ at Low/Medium (body scoop before High/VH full blend).
export const PRESET_BUS_EQ_ALWAYS_ON_BLEND = {
  Pure: 0.58,
  Shruti: 0.48,
  Binaural: 0.72,
}

// Per-preset, per-register bus/body EQ overrides (Medium Low/Medium spectral relief).
// When listed, replaces that register's low-mid/body-mid profile and blend floor.
export const PRESET_REGISTER_BUS_EQ = {
  Binaural: {
    [REGISTER_OCTAVES.LOW]: {
      lowMid: { frequency: 280, Q: 0.42, maxGainDb: -2.9 },
      bodyMid: { frequency: 680, Q: 0.44, maxGainDb: -1.5 },
      alwaysOnBlend: 0.88,
      minBlend: 0.84,
    },
    [REGISTER_OCTAVES.MEDIUM]: {
      lowMid: { frequency: 340, Q: 0.40, maxGainDb: -3.8 },
      bodyMid: { frequency: 720, Q: 0.44, maxGainDb: -2.2 },
      alwaysOnBlend: 0.94,
      minBlend: 0.90,
    },
  },
}

// Medium-register-only, key-following body notch. A single peaking dip whose center
// frequency tracks the lowest body/principal layer (voice index 0 = −12 low octave)
// of the currently selected key, so it tames that note's push on every key — not
// just C — without a broad register-wide gain cut. Only listed presets and only the
// Medium register are affected; Low/High/Very High and unlisted presets (Io/Cosmos,
// Binaural) stay fully transparent. gainDb is a cut (negative). frequencyScale nudges
// the notch above/below the index-0 fundamental if the pure fundamental sits too low.
// Depths intentionally gentle: the Medium body is now softened at the source by
// PRESET_MEDIUM_BODY_HARMONIC_SOFTENING / STRINGS_TUNING.mediumBodySoftening, so this
// notch only lightly tames the residual fundamental push instead of carrying the whole
// fix (avoids over-EQing the bass / making Medium thin).
export const PRESET_MEDIUM_BODY_NOTCH = {
  // Mimas: ease the cavern body fundamental so Medium does not jump forward.
  Pure: { gainDb: -1.2, Q: 1.2, frequencyScale: 1 },
  // Europa: gentle — preserve warmth, only shave the body push.
  Shruti: { gainDb: -1.0, Q: 1.2, frequencyScale: 1 },
  // Titan: strongest body of the three; slightly deeper, still narrow enough to keep bow.
  Strings: { gainDb: -1.4, Q: 1.1, frequencyScale: 1 },
}

// Safety clamp for the key-following Medium body notch center frequency (Hz).
export const PRESET_MEDIUM_BODY_NOTCH_FREQUENCY_RANGE = { min: 45, max: 320 }

// Medium-register-only harmonic softening for the lowest body layer (voice index 0,
// the −12 low octave). For the listed standard-voice presets, this replaces that
// layer's default triangle waveform with a darker, more sine-like custom partial set
// in Medium ONLY — the fundamental stays at full amplitude (foundation/bass gain
// preserved) while the upper (odd) harmonics that make it "speak" like a second
// principal voice are reduced. Low/High/Very High and unlisted presets (Io/Cosmos,
// Binaural) keep their normal index-0 oscillator. Strings/Titan is softened separately
// via STRINGS_TUNING.mediumBodySoftening (its body uses saw partials, not a triangle).
// Partials are harmonic amplitudes [h1, h2, h3, ...]; a pure triangle is roughly
// [1, 0, 0.111, 0, 0.04, ...], so these keep only a faint 3rd for warmth.
export const PRESET_MEDIUM_BODY_HARMONIC_SOFTENING = {
  // Mimas (Pure): triangle body → near-sine with a faint 3rd for warmth.
  Pure: { partials: [1, 0, 0.05] },
  // Europa (Shruti): keep a touch more warmth than Mimas, still far softer than triangle.
  Shruti: { partials: [1, 0, 0.06] },
}

// =============================================================================
// 6. OUTPUT & SPEAKER-SAFETY TUNING
// =============================================================================

export const OUTPUT_TUNING = {
  // Master Volume: UI 100% maps to this internal cap (0–1).
  // Raised to 1.0 — the old 0.75 cap was a band-aid for the previous limiter-only
  // chain and was the single biggest cause of low perceived loudness. The new
  // MASTER_TUNING stage (compressor + soft saturation + limiter) now keeps the
  // output clean, so UI 100% can use the full program level safely.
  maxMasterVolumeNormalized: 1.0,
  // Program level at UI 100% feeding the master stage. This is NOT the final
  // ceiling — the master compressor/limiter manage peaks downstream. Kept modest
  // so we drive the master stage with controlled gain, not raw level.
  outputBoostDb: 7,
  minVolumeDb: -40,
  droneOutputTrimDb: -2,

  // ⚠️ ADVANCED — legacy single-limiter ceiling. The real final ceiling now lives
  // in MASTER_TUNING.ceilingDb (the master stage replaced the limiter-only chain).
  masterLimiterDb: -0.5,

  // Fixed drone offset when metronome starts (one-time, not beat ducking)
  droneMetronomeHeadroomDb: -1.5,
  droneMetronomeHeadroomRampSeconds: 0.05,

  stereoWidth: 0.36,
}

// =============================================================================
// 6a. MASTER OUTPUT STAGE (mobile mastering)
// =============================================================================
// Coherent final-stage "mastering" for the DRONE bus only (the metronome bus
// bypasses the compressor/saturator and meets only the final limiter, so clicks
// never pump the drone). Signal flow:
//
//   drone output → preCompressorLowShelf → preMasterGain → compressor → soft saturation → makeup → ┐
//   metronome gain ─────────────────────────────────────────────────────► limiter → speakers
//
// Goal: materially louder PERCEIVED output without harsh peaks. The compressor
// reduces crest factor so makeup gain can lift RMS; gentle tanh saturation rounds
// peaks (and adds midband harmonics that read as loudness on tiny phone drivers)
// before a brick-wall limiter guarantees no clipping. Compression is stereo-linked
// and saturation is per-sample identical per channel, so the Binaural L/R beat is
// preserved (the master stage never narrows or collapses stereo).
export const MASTER_TUNING = {
  // Controlled drive into the compressor (dB). Raise for more loudness/compression.
  preMasterGainDb: 0,

  // Gentle low shelf immediately before the compressor. Trims sub/low energy so
  // stacked low octave + foundation + fifth do not slam the compressor/saturator
  // on external/Bluetooth speakers (the main source of severe distortion there).
  // iPhone loudness is preserved via makeup + midrange presence, not raw bass.
  preCompressorLowShelf: {
    frequency: 200,
    gainDb: -2.5,
    Q: 0.7,
  },

  // Drone-bus glue compressor. Slightly higher threshold + gentler ratio so bass-
  // heavy registers do not over-compress on larger speakers.
  compressorThresholdDb: -18,
  compressorRatio: 2.2,
  compressorKneeDb: 12,
  compressorAttackSeconds: 0.02,
  compressorReleaseSeconds: 0.25,

  // Make-up gain after compression — main perceived-loudness lift on iPhone.
  // Lowered 5 → 4.5: gentler gain staging before the limiter (less high-register strain).
  makeupGainDb: 4.5,

  // Gentle tanh soft-saturation. Lowered 1.15 → 1.1 for cleaner High/Very High output.
  saturationDrive: 1.1,
  saturationOutputScale: 0.97,

  // Final brick-wall ceiling (dBFS). Slightly lower for extra safety headroom.
  ceilingDb: -1.5,

  // Diagnostic bypass: set false to route compressor → makeup → limiter (no saturation).
  // Use with runMasterDiagnostics() / measure-master-stage script to isolate distortion.
  masterSaturationEnabled: true,

  // ⚠️ HARD REGRESSION-ISOLATION BYPASS.
  // When true, the ENTIRE new master stage is removed: no pre-low-shelf, no
  // pre-master gain, no compressor, no saturation, no makeup gain, no metering.
  // The drone bus connects through a single pass-through gain straight into a
  // legacy brick-wall limiter (OUTPUT_TUNING.masterLimiterDb) → speakers, exactly
  // like the pre-loudness-rework chain. Use this to answer: "do the glitches/
  // cutouts disappear when the new master stage is gone?". If they vanish here,
  // the regression lives in the master stage; if they persist, it is elsewhere.
  // Toggle on a device: droneEngine.setMasterStageBypassEnabled(true|false)
  masterStageBypassEnabled: false,

  // When true, engine attaches RMS taps at each master stage and logs snapshots.
  masterDiagnosticsEnabled: false,

  // Dev-only: when true, the engine logs master-bus RMS (dBFS) to the console
  // every 500 ms after start so loudness can be verified on a real device.
  meteringEnabled: false,
}

export const SPEAKER_SAFETY_TUNING = {
  // Global low shelf — reduces sub/low buildup. Slightly deeper for external speakers.
  bassShelfFrequency: 210,
  bassShelfGainDb: -4.5,
  bassShelfQ: 0.7,

  // Global gentle mid voicing — reduces 200–800 Hz congestion (all presets).
  // Pulled back from a deep −4 dB scoop to −1.8 dB: the old deep cut gutted the
  // warm body, which made the drone sound thin AND quiet (the upper harmonics
  // then dominated → "quiet but harsh"). Low-mud control now comes mostly from
  // the projection low-mid cut + bass shelf, not from gutting the core body.
  midVoicingEqFrequency: 600,
  midVoicingEqQ: 0.38,
  midVoicingEqGainDb: -1.8,

  // Body-layer scale (indices 0–3). Slightly more trim on low octave and fifth.
  ambientBodyVoicingScale: { 0: 0.9, 1: 0.94, 2: 0.9, 3: 0.96 },

  // Low-layer scale by register (indices 0, 2, foundation). Eased further so Low/
  // Medium do not feel pushy before the master stage on external speakers.
  lowLayerScaleByRegister: {
    [REGISTER_OCTAVES.LOW]: 0.74,
    [REGISTER_OCTAVES.MEDIUM]: 0.84,
    [REGISTER_OCTAVES.HIGH]: 1,
    [REGISTER_OCTAVES.VERY_HIGH]: 1,
  },

  // Upper harmonic scale — High / Very High only (indices 3–5).
  // Harshness/ear-fatigue at High/Very High comes from the +24 (idx 4) and +31
  // (idx 5) partials landing in the 1–4 kHz phone-breakup band. We now trim those
  // two partials much harder (spectral) while keeping the +12 octave (idx 3) more
  // intact for body — this removes the "stab" without lowering overall LEVEL, so
  // we can raise the High/Very High register trims and get louder + smoother.
  upperHarmonicScale: {
    [REGISTER_OCTAVES.HIGH]: { 3: 0.9, 4: 0.6, 5: 0.5 },
    [REGISTER_OCTAVES.VERY_HIGH]: { 3: 0.82, 4: 0.45, 5: 0.35 },
  },

  cosmosExtensionScale: {
    [REGISTER_OCTAVES.HIGH]: 0.8,
    [REGISTER_OCTAVES.VERY_HIGH]: 0.62,
  },

  choirUpperHarmonicMultiplier: {
    [REGISTER_OCTAVES.HIGH]: 0.9,
    [REGISTER_OCTAVES.VERY_HIGH]: 0.82,
  },

  stringsUpperHarmonicMultiplier: {
    [REGISTER_OCTAVES.HIGH]: 0.88,
    [REGISTER_OCTAVES.VERY_HIGH]: 0.8,
  },

  // Mimas (Pure): extra High/VH trim on +12/+24/+31 — global upperHarmonicScale
  // is shared; this preset-specific multiplier softens the 1–3 kHz phone band.
  pureUpperHarmonicMultiplier: {
    [REGISTER_OCTAVES.HIGH]: { 3: 0.86, 4: 0.68, 5: 0.62 },
    [REGISTER_OCTAVES.VERY_HIGH]: { 3: 0.62, 4: 0.34, 5: 0.28 },
  },
}

// =============================================================================
// 6c. HIGH / VERY HIGH CLEAN VOICING (diagnostic)
// =============================================================================
// Temporary A/B mode for isolating unpleasant spectral/beating artifacts in
// headphones at High/VH registers. Does NOT change master chain or register
// balance trims (no whole-register volume drop). Medium and Low are untouched.
//
// Toggle: HIGH_VH_CLEAN_VOICING.enabled = false to restore prior voicing.
// On device: droneEngine.setHighVhCleanVoicingEnabled(true|false)
//
// Diagnostic sequence:
//   1. layerScale 4/5 → 0 (disable +24 / +31)
//   2. If still ugly, lower layerScale[3] further (+12 octave)
//   3. disableMoodDetune / disableMoodOrbit silence beating sources
export const HIGH_VH_CLEAN_VOICING = {
  enabled: false,

  // Per-register multipliers on standard voice indices 3 (+12), 4 (+24), 5 (+31).
  // 0 = layer fully silenced. Only applies when register is High or Very High.
  layerScale: {
    [REGISTER_OCTAVES.HIGH]: { 3: 1, 4: 0, 5: 0 },
    [REGISTER_OCTAVES.VERY_HIGH]: { 3: 0.88, 4: 0, 5: 0 },
  },

  // Silence mood per-voice detune in High/VH (epsilon + orbit cents on voices).
  disableMoodDetune: true,

  // Silence True Orbit pair in High/VH (dedicated beat oscillators).
  disableMoodOrbit: true,

  // Stop mood gain-bloom redistribution on voice layers (index 4 has bloom weight).
  disableMoodGainRedistribution: true,

  // Reduce Intensity focus lift on upper layers (indices 3–5) in High/VH.
  intensityUpperFocusScale: 0.45,
}

// =============================================================================
// 6d. STERILE DIAGNOSTIC MODE (hard isolation test)
// =============================================================================
// Supersedes HIGH_VH_CLEAN_VOICING when enabled. Shruti/Europa High + Very High
// only — Medium/Low/other presets are untouched.
//
// Goal: simplest stable drone (root + fifth + −12 body) with ALL motion/modulation
// stripped so we can answer whether distortion lives in (A) core synthesis or
// (B) layered motion systems. Master chain, register balance trims, and EQ tuning
// constants are NOT changed — only runtime modulation is frozen/silenced.
//
// Toggle: STERILE_DIAGNOSTIC_MODE.enabled = false to restore normal behavior.
// On device: droneEngine.setSterileDiagnosticModeEnabled(true|false)
//
// Systems DISABLED in Shruti High/Very High when active:
//   • Mood loop: per-voice detune, gain redistribution, stereo width drift
//   • True Orbit pair + dual-beat oscillators
//   • Harmonic Bloom + Eclipse bus EQ motion
//   • Breath filter/gain modulation
//   • Intensity filter frequency/Q morphing + resonance boost
//   • Intensity character/focus layer presence motion
//   • Shruti Very High stress damping (intensity-driven)
//   • Preset bus EQ blend (Shruti upper/low-mid EQ motion at High/VH)
//   • Voice layers 3 (+12), 4 (+24), 5 (+31), foundation root (6)
//
// Systems LEFT ACTIVE (core drone path):
//   • Indices 0 (−12 body), 1 (root), 2 (fifth) at static preset gains
//   • Static preset filter base (850 Hz / Q 0.55 for Shruti)
//   • Reverb, projection, master chain, register balance trims
export const STERILE_DIAGNOSTIC_MODE = {
  // Disabled for the master-stage regression-isolation pass so voicing stays normal
  // (only the master stage changes). Re-enable to resume the sterile voicing test.
  enabled: false,
  presetName: 'Shruti',
  minRegisterOctave: REGISTER_OCTAVES.HIGH,
}

// Optional Titan (Strings) High/VH click isolation — dev console only.
// moondroneDebug.setStringsIsolationMode({ enabled: true, mode: 'principles-only' })
export const STRINGS_ISOLATION_MODE = {
  enabled: false,
  // 'principles-only' | 'principles-breath' | 'no-phase' | 'no-air'
  mode: 'principles-only',
  minRegisterOctave: REGISTER_OCTAVES.HIGH,
  // Log automation events during transitions to compare isolated vs full Titan.
  logAutomationEvents: false,
}

// Dev-only: isolate Titan High↔VH air click source (console).
// moondroneDebug.setStringsHighRegisterAirDebug({ freezeFilters: true })
export const STRINGS_HIGH_REGISTER_AIR_DEBUG = {
  freezeFilters: false,
  freezeNoiseGain: false,
  freezeShelf: false,
}

// Preset-specific bus EQ (Shruti, Cosmos, Binaural). Negative maxGainDb = cut.
// Scales in above Intensity 60% at High/Very High registers.
export const PRESET_BUS_EQ_INTENSITY_START = 0.6

export const SHRUTI_BUS_EQ = {
  lowMidFrequency: 380, lowMidQ: 0.48, lowMidMaxGainDb: -3,
  upperMidFrequency: 1500, upperMidQ: 0.62, upperMidMaxGainDb: -3.2,
}

export const COSMOS_BUS_EQ = {
  lowMidFrequency: 480, lowMidQ: 0.48, lowMidMaxGainDb: -1,
  upperMidFrequency: 1050, upperMidQ: 0.55, upperMidMaxGainDb: -1,
}

export const BINAURAL_BUS_EQ = {
  lowMidFrequency: 320, lowMidQ: 0.46, lowMidMaxGainDb: -3.1,
  upperMidFrequency: 820, upperMidQ: 0.58, upperMidMaxGainDb: -1.35,
}

// Mimas-only: gentle 1–3 kHz presence scoop at High/VH (pitch clarity preserved
// via root/fundamental; cuts harmonic insistence, not output level).
export const PURE_BUS_EQ = {
  lowMidFrequency: 400, lowMidQ: 0.42, lowMidMaxGainDb: -1.75,
  upperMidFrequency: 1950, upperMidQ: 0.48, upperMidMaxGainDb: -2.6,
}

// Mimas-only body-mid scoop (~650–950 Hz) — hollow cavern, not presence-region.
export const PRESET_BODY_MID_EQ = {
  Pure: { frequency: 820, Q: 0.52, maxGainDb: -1.35 },
  Shruti: { frequency: 620, Q: 0.5, maxGainDb: -1.15 },
  Binaural: { frequency: 720, Q: 0.48, maxGainDb: -1.45 },
}

export const PRESET_BUS_EQ_PROFILES = {
  Pure: {
    lowMid: { frequency: PURE_BUS_EQ.lowMidFrequency, Q: PURE_BUS_EQ.lowMidQ, maxGainDb: PURE_BUS_EQ.lowMidMaxGainDb },
    upperMid: { frequency: PURE_BUS_EQ.upperMidFrequency, Q: PURE_BUS_EQ.upperMidQ, maxGainDb: PURE_BUS_EQ.upperMidMaxGainDb },
  },
  Shruti: {
    lowMid: { frequency: SHRUTI_BUS_EQ.lowMidFrequency, Q: SHRUTI_BUS_EQ.lowMidQ, maxGainDb: SHRUTI_BUS_EQ.lowMidMaxGainDb },
    upperMid: { frequency: SHRUTI_BUS_EQ.upperMidFrequency, Q: SHRUTI_BUS_EQ.upperMidQ, maxGainDb: SHRUTI_BUS_EQ.upperMidMaxGainDb },
  },
  Cosmos: {
    lowMid: { frequency: COSMOS_BUS_EQ.lowMidFrequency, Q: COSMOS_BUS_EQ.lowMidQ, maxGainDb: COSMOS_BUS_EQ.lowMidMaxGainDb },
    upperMid: { frequency: COSMOS_BUS_EQ.upperMidFrequency, Q: COSMOS_BUS_EQ.upperMidQ, maxGainDb: COSMOS_BUS_EQ.upperMidMaxGainDb },
  },
  Binaural: {
    lowMid: { frequency: BINAURAL_BUS_EQ.lowMidFrequency, Q: BINAURAL_BUS_EQ.lowMidQ, maxGainDb: BINAURAL_BUS_EQ.lowMidMaxGainDb },
    upperMid: { frequency: BINAURAL_BUS_EQ.upperMidFrequency, Q: BINAURAL_BUS_EQ.upperMidQ, maxGainDb: BINAURAL_BUS_EQ.upperMidMaxGainDb },
  },
}

export const PRESET_BUS_EQ_REGISTER_BLEND = {
  highRegisterBlend: 0.72,
  veryHighRegisterBlend: 1,
  intensityBlendBase: 0.3,
  intensityBlendRange: 0.7,
  upperMidScaleHigh: 0.55,
  upperMidScaleVeryHigh: 1,
}

// Reference tuning (UI-facing range)
export const DEFAULT_REFERENCE_A_HZ = 440
export const MIN_REFERENCE_A_HZ = 415
export const MAX_REFERENCE_A_HZ = 445
export const TUNING_RAMP_SECONDS = 0.9

// =============================================================================
// 6b-2. AIR / SHIMMER PASS (conservative openness tuning)
// =============================================================================
// User-facing tone macros live in src/toneLab.js (TONE_LAB_TUNING). Edit that file
// for high-level shaping; AIR_SHIMMER_TUNING holds the underlying implementation.
// Bus EQ (scoop + air shelf) applies to all Moons when enabled. Preset-specific
// partials, breath-noise hiss, and voice pan are skipped or scaled for Binaural.
// Set enabled: false to revert the entire pass from one flag.
//
// Primary tweak knobs (if too bright / hissy / still dark):
//   1. airShelf.gainDb                    — overall openness (+ brighter, − darker)
//   2. breathNoise.gain                   — hiss amount at peak swell (0 = off)
//   3. breathAir.swellSoftness / swellShape — breath movement smoothness (toneLab.js)
//   4. highRegisterOutputTrimDb           — High/VH distortion safety (more negative = cleaner)
//   5. overallLoudnessTrimDb              — global level trim
export const AIR_SHIMMER_TUNING = {
  enabled: true,

  // (1) Extra low-mid scoop in the 180–450 Hz congestion zone (additive to existing
  // mid voicing + projection low-mid cut). Negative = less mud, more clarity.
  lowMidScoop: { frequency: 300, Q: 0.55, gainDb: -1.15 },
  presetLowMidScoop: {
    Pure: { frequency: 520, Q: 0.46, gainDb: -1.55 },
    Shruti: { frequency: 420, Q: 0.44, gainDb: -1.25 },
    Binaural: { frequency: 360, Q: 0.44, gainDb: -1.45 },
  },

  // (2) Gentle air shelf — opens the spectrum above ~4 kHz without a harsh treble spike.
  airShelf: { frequency: 4200, Q: 0.5, gainDb: 1.05 },
  // Scale the air shelf down at High/Very High to avoid treble/limiter strain.
  airShelfRegisterScale: {
    [REGISTER_OCTAVES.HIGH]: 0.78,
    [REGISTER_OCTAVES.VERY_HIGH]: 0.62,
  },

  // (3) Slight low-pass openness per preset at base Intensity (1 = unchanged).
  presetFilterOpenness: {
    Pure: 0.86,
    Shruti: 1,
    Strings: 1.04,
    Choir: 1.03,
    Cosmos: 1,
    Binaural: 1.04,
  },

  // (4) Custom harmonic partials on selected layers (replaces pure sine). Values are
  // amplitude ratios [fundamental, 2nd, 3rd, …]. Binaural + Strings use their own paths.
  presetHarmonicPartials: {
    Pure: {
      3: [1, 0.018, 0.004],
    },
    Shruti: {
      1: [1, 0.018],
      2: [1, 0.04, 0.012],
      4: [1, 0.065, 0.02],
    },
    Cosmos: {
      3: [1, 0.05, 0.02],
      4: [1, 0.058, 0.022],
      5: [1, 0.038, 0.012],
    },
    Choir: {
      1: [1, 0.02],
      3: [1, 0.04, 0.014],
      4: [1, 0.055, 0.018],
    },
  },
  // Scale upper harmonics (not the fundamental) at High/Very High for clean output.
  harmonicPartialRegisterScale: {
    [REGISTER_OCTAVES.HIGH]: 0.68,
    [REGISTER_OCTAVES.VERY_HIGH]: 0.48,
  },

  // (5) Filtered breath-noise bed — swells smoothly with the Breath cycle.
  breathNoise: {
    enabled: true,
    gain: 0.0055,
    highpassMinHz: 1400,
    highpassMaxHz: 900,
    lowpassMinHz: 3800,
    lowpassMaxHz: 6200,
    // Soft envelope (no hard gate). floorLevel = subtle bed at trough; swellSoftness
    // lifts quiet parts; swellShape controls peak sharpness (<1 = more gradual).
    floorLevel: 0.1,
    swellSoftness: 0.42,
    swellShape: 0.88,
    presetScale: {
      Pure: 0.48,
      Shruti: 1,
      Strings: 0.36,
      Choir: 0.9,
      Cosmos: 0.92,
      Binaural: 0,
    },
    // Longer ramps on the breath-noise bed reduce steppiness between breath ticks.
    rampMultiplier: 3.5,
    presetBreathNoise: {
      Pure: {
        swellSoftness: 0.64,
        swellShape: 0.74,
        floorLevel: 0.05,
        rampMultiplier: 6.2,
      },
    },
  },

  // (6) Extra output trim at High/Very High (additive to REGISTER_BALANCE_TRIM_DB).
  highRegisterOutputTrimDb: {
    [REGISTER_OCTAVES.HIGH]: -0.75,
    [REGISTER_OCTAVES.VERY_HIGH]: -1,
  },

  // (7) Stereo width boost (added to OUTPUT_TUNING.stereoWidth + mood offset).
  stereoWidthBoost: 0.06,
  presetStereoWidth: {
    Shruti: 0.47,
    Strings: 0.46,
    Cosmos: 0.52,
    Pure: 0.47,
    Choir: 0.42,
  },

  // (8) Per-voice pan spread (±). Binaural uses its own beat panning.
  presetVoicePan: {
    Shruti: { 0: -0.14, 2: 0.12, 4: 0.2 },
    Cosmos: { 0: -0.18, 2: 0.1, 3: -0.12, 4: 0.16, 5: 0.22 },
    Strings: { 0: -0.1, 3: 0.08, 4: 0.14 },
    Pure: { 0: -0.14, 1: 0.06, 3: 0.11 },
    Choir: { 2: -0.1, 4: 0.12, 5: 0.16 },
  },

  // (9) Global loudness trim for the air pass (used when Tone Lab is off).
  overallLoudnessTrimDb: -1,
}

// Presets that need voice rebuild on switch (waveform / custom partial changes).
export function presetUsesCustomOscillatorProfile(presetName) {
  if (PRESET_CUSTOM_VOICE_STRUCTURES.includes(presetName)) {
    return true
  }

  if (PRESET_VOICE_OSCILLATOR_TYPES[presetName]) {
    return true
  }

  if (AIR_SHIMMER_TUNING.presetHarmonicPartials[presetName]) {
    return true
  }

  return false
}

// =============================================================================
// 6b. PROJECTION (phone-speaker translation — ALWAYS ON)
// =============================================================================
// Projection is now part of the default voicing (no UI toggle). The intent is
// speech-style intelligibility and "cut", not synth brightness: trim energy the
// tiny phone driver can't reproduce, add vocal-presence in the band the ear and
// the driver are most efficient, and keep the body mono-safe so nothing cancels
// when the phone sums to (near) mono. No output-gain, limiter, or compression
// changes — perceived loudness comes from spectral balance, not raw level.
//
// Headphone safety: every boost is broad-Q and moderate, the high band tops out
// at ~3.8 kHz (no brittle 5 kHz+ spike), and the dry-narrowing only pulls the
// body toward center — the stereo reverb tail keeps its width. Binaural is exempt
// in the engine (its L/R beat must not collapse). `enabledByDefault` stays as the
// single source of truth so the whole layer can still be A/B'd from one flag.
export const PROJECTION_TUNING = {
  enabledByDefault: true,

  // (2) Decongest wasted low-mid energy ≈150–400 Hz so the upper bands read
  // clearly on a phone. A peaking dip plus trims on the two lowest body layers —
  // pushed a little deeper than before, still decongestion (not a high-pass), so
  // warmth/character survive and the drone never sounds thin.
  lowMidCut: { frequency: 250, Q: 0.8, gainDb: -3.6 },
  lowOctaveScale: 0.82, // index 0 (−12 low octave)
  foundationRootScale: 0.82, // Shruti/Cosmos foundation root only (not Binaural undertones)

  // (3) Vocal-presence projection. Lower bands nudged up slightly to preserve
  // iPhone perceived loudness after master-stage saturation/makeup trim — midrange
  // balance, not raw low-end. Upper bands unchanged (fatigue control).
  presence: [
    { frequency: 950, Q: 0.9, gainDb: 1.9 },
    { frequency: 1600, Q: 1.0, gainDb: 2.35 },
    { frequency: 2600, Q: 1.1, gainDb: 1.35 },
    { frequency: 3800, Q: 1.2, gainDb: 0.7 },
  ],

  // (4) Mono translation. A widener placed BEFORE the reverb narrows the DRY
  // body toward center (0.5 = unity, <0.5 = narrower) so it survives the phone's
  // mono/near-mono speaker summation without phase cancellation. Pulled slightly
  // tighter for stronger phone projection; the reverb tail (generated after this
  // node from a stereo IR) keeps its spacious width. Binaural is exempt.
  dryWidth: 0.3,

  rampSeconds: 0.6,
}

// =============================================================================
// 7. METRONOME TONE & BALANCE
// =============================================================================
// Raise output/presence → louder clicks (watch limiter pumping with drone).
// Raise softClipDrive → less peak, may need more output to compensate.

export const METRONOME_TUNING = {
  defaultBpm: 80,
  minBpm: 40,
  maxBpm: 200,
  // Steady-state audio-clock lookahead (beats queued on the Web Audio thread).
  lookaheadSeconds: 0.4,
  // One-shot prime before heavy drone transitions (voice rebuild / crossfade).
  transitionPrimeSeconds: 1.25,
  scheduleIntervalMs: 20,
  // Beats more than this many seconds late are skipped (no catch-up flams).
  lateToleranceSeconds: 0.02,
  // Cap audible beats scheduled per UI timer tick after a lag spike.
  maxBeatsPerScheduleTick: 2,
  // Re-prime metronome every N voices while building a new voice set.
  createVoicesPrimeInterval: 4,

  trimDb: -7,
  outputDb: 7.5,
  accentDb: 0,
  regularDb: -4,

  attackSofteningDb: -5,
  attackRampSeconds: 0.003,

  softClipDrive: 2.1,
  softClipScale: 0.72,

  presenceFrequency: 3200,
  presenceGainDb: 3,
  presenceQ: 0.75,

  clickFrequency: 5000,
  clickGainDb: 1.5,
  clickQ: 0.65,

  // Downbeat triangle.open sample only — wood / triangle.closed unchanged.
  triangleOpenSampleDb: -3,

  triangleOpenPlayerPoolSize: 12,
}

// =============================================================================
// 8. TRANSITIONS & ENGINE TIMING (advanced)
// =============================================================================
// Changing these affects Play/Stop feel and crossfade stability.
//
// Note/register crossfade (while playing) — phased lifecycle in TECH_NOTES.md:
//   1. noteCrossfadeEndsAt guard set first (~ fadeInEnd + breathReanchorDelay + breathReanchorRamp)
//   2. Outgoing voices fade out (noteFadeOutSeconds)
//   3. Incoming voices fade in after delay (noteFadeInDelaySeconds / noteFadeInSeconds)
//   4. Filter/EQ/choir ramp to base (breathReanchorRampSeconds), then Breath resumes
// Do not snap filter on crossfade; do not restart Breath before incoming fade completes.

export const TRANSITION_TUNING = {
  noteFadeOutSeconds: 0.75,
  noteFadeInDelaySeconds: 0.18,
  noteFadeInSeconds: 0.85,

  // Pause after incoming fade completes, then ramp filter/EQ to base before Breath resumes.
  breathReanchorDelaySeconds: 0.08,
  breathReanchorRampSeconds: 0.45,

  startFadeSeconds: 4,
  stopFadeSeconds: 3,
  stopFadeQuickSeconds: 0.35,
  stopFadeQuickLevel: 0.42,

  presetGainRampSeconds: 0.85,
  presetLayerFadeOutSeconds: 0.6,
  presetLayerFadeInSeconds: 0.75,

  // When an audible voice's target gain exceeds current gain by this ratio during a
  // Moon change, use fade-out/fade-in instead of a direct ramp (prevents Io swell).
  presetGainSwellGuardRatio: 1.5,

  // Optional click diagnostics during note/register/moon changes (dev console).
  clickDiagnosticsEnabled: false,

  // Live Phase / mood changes while already playing — not Play-from-stopped startup.
  moodLiveTransitionSeconds: 1.0,

  // Masked retune/repan for Binaural undertone voices (indices 6/7) during Moon changes.
  binauralRoleMaskSeconds: 0.055,
  binauralRoleMaskGainRatio: 0.38,
  binauralRoleSettleSeconds: 0.32,
  binauralUndertoneFadeInDelaySeconds: 0.04,

  // Deferred undertone enter: stay silent through main preset transition, then fade in.
  binauralUndertonePostTransitionSettleSeconds: 0.08,
  binauralUndertonePostTransitionFadeInSeconds: 0.8,

  // Immediate undertone exit fade at the start of a Binaural leave transition.
  binauralUndertoneExitFadeOutSeconds: 0.35,

  volumeRampSeconds: 0.25,

  // Titan-only micro headroom dip during high-intensity note/register switching.
  // Every audible Titan param (voice gains, oscillator frequency, breath-follow, drift,
  // air/shimmer/scoop, orbit/dual beats) already ramps on a note/register change, so the
  // tick is NOT a snap — it is the master saturator/limiter catching the brief combined
  // peak while the outgoing and incoming Titan voice sets overlap (two incoherent, rich,
  // near-ceiling signals raise the crest factor for the duration of the crossfade). This
  // is a tiny, smooth headroom dip on the whole-drone-bus group fader (idle at unity during
  // note/register changes) that holds across the outgoing-fade overlap window, then restores
  // to unity as the new note settles. NOT a permanent level cut, and never used during Moon
  // transitions (the full-chain crossfade owns the group fader there). Only engages for
  // Strings/Titan at high UI Intensity; disable with enabled: false.
  stringsSwitchHeadroom: {
    enabled: true,
    intensityUiThreshold: 80, // UI Intensity at/above which the dip engages
    dipDb: -1, // -0.5 to -1.5: depth of the momentary headroom dip
    dipInSeconds: 0.05, // smooth ramp down into the dip
    recoverSeconds: 0.18, // smooth ramp back to unity once the new note is settled
    // Hold spans the outgoing-fade overlap automatically; this only bounds a degenerate
    // (near-zero overlap) case so the dip is always at least this long before recovering.
    minHoldSeconds: 0.06,
  },
}

// =============================================================================
// Unified moon transition envelope (single source of truth for the voice-rebuild
// moon-change path, e.g. Titan <-> Io). One coordinated gesture:
//   - Voices: current -> live target, smoothstep, over voiceCrossfadeSeconds.
//   - Every secondary layer (air, bloom, eclipse, orbit, dual beats, Io sky
//     extensions, bus EQ/volume/reverb/projection): current -> live target,
//     smoothstep, over auxMorphSeconds, starting at t0 (no delays, no second
//     arrival). smoothstep keeps early weight low so layers rise gently.
//   - Guard clears at t0 + auxMorphSeconds; breath/mood loops then resume reading
//     the values already reached (no audible re-ramp).
// =============================================================================
export const MOON_TRANSITION = {
  enabled: true,

  // Transition mode for Moon (preset) changes WHILE PLAYING. Selectable at runtime via
  // moondroneDebug.setMoonTransitionMode('masked' | 'fullChainCrossfade').
  //   'masked'             – stable fade-down → silent rebuild → fade-up (the proven default).
  //                          No old/new overlap, no shared moving bus, no bridge tone, no
  //                          reverb bloom/tail. This is the safe fallback.
  //   'fullChainCrossfade' – experimental: the entire current drone chain (voices, filter,
  //                          EQ, reverb, width, output trim) is captured as a frozen "old
  //                          deck", a brand-new complete chain is built for the new Moon, and
  //                          the two complete chains are equal-power crossfaded at their
  //                          output gains into the shared master. No shared moving bus — each
  //                          deck is a fully independent node graph.
  mode: 'fullChainCrossfade',

  // Experimental full-chain crossfade tuning (only used when mode === 'fullChainCrossfade').
  fullChainCrossfade: {
    totalSeconds: 1.5,
    // 'equalPower' (constant-power, best for two different Moons) or 'easeInOutSine'.
    curve: 'equalPower',
    curveSteps: 64,
    // Optional center attenuation if old+new summing swells at the midpoint. 0 = none.
    // Try -3 to -6 (dB) only if the crossfade midpoint sounds louder than either Moon.
    centerHeadroomDb: 0,
    // Extra guard time after the crossfade before the old deck is disposed.
    disposeGuardSeconds: 0.25,
    // Max time to keep the old deck at full while waiting for the new reverb IR to render.
    // If .ready somehow never settles, the crossfade still starts (old deck never stranded).
    reverbReadyMaxWaitSeconds: 3,
    // Fast retire time for stranded old decks on rapid Moon changes (avoids stacking chains).
    fastRetireSeconds: 0.08,
  },

  // Simple Moon-change transition. Replaces the old per-layer voice-rebuild morph for
  // Moon changes while playing: one group gain (moonTransitionGain) fades the WHOLE drone
  // bus to silence, the new Moon is rebuilt + snapped to its settled state while silent,
  // then the group gain fades back up. No per-layer morphing, no deferred AIR/mood/extension
  // arrival, no post-transition handoff event. The settled sound is unchanged — it is the
  // exact state a fresh Play on that Moon would produce, just without a hard stop/click.
  simpleFade: {
    enabled: true,
    curve: 'smootherstep',
    curveSteps: 64,
    troughLinearGain: 0.004,
    rebuildSnapLinearGain: 0,
    settleSnapSeconds: 0.004,
    silentHoldSeconds: 0.003,
    // Transition tail / reverb bloom: DISABLED. This "drone melts into reverb" approach
    // popped/echoed and did not feel like the drone itself fading, so the masked fallback now
    // runs as the plain fade-down → silent rebuild → fade-up (which fixed the swelling). The
    // config is retained (inert) for reference only; do not re-enable.
    transitionTail: {
      enabled: false,
      tailSendFadeInSeconds: 0.15,
      // Open the tail send before the main dry starts fading so it captures continuous drone.
      dryFadeLeadSeconds: 0.12,
      dryFadeOutSeconds: 0.42,
      dryFadeInSeconds: 1.0,
      tailSendCloseStartSeconds: 0.5,
      tailSendCloseSeconds: 0.14,
      tailOutputFadeOutSeconds: 2.4,
      highpassStartHz: 100,
      highpassEndHz: 650,
      highpassSweepSeconds: 2.4,
      dampLowpassHz: 5200,
      reverbDecaySeconds: 8,
      reverbPreDelaySeconds: 0.04,
      sendPeakLinearGain: 0.28,
      outputPeakLinearGain: 0.12,
    },
    // Fallback when transitionTail.enabled is false.
    fadeOutSeconds: 0.28,
    fadeInSeconds: 0.55,
  },

  // Main voice crossfade. A moon change should feel mostly complete within ~3s, so the
  // whole gesture is kept short: voices crossfade here, body/air identity lands on the
  // bodyMorphSeconds window, and only decorative motion lingers to auxMorphSeconds.
  voiceCrossfadeSeconds: 2.2,
  voiceInDelaySeconds: 0,
  // Atmosphere/motion-only window (orbit, dual beats, eclipse, bloom, reverb). Kept short
  // so the previous moon's decorative tail does not obviously linger over the new moon.
  auxMorphSeconds: 3.2,
  // Voice-coupled identity/body morph window. The new moon's resonance/EQ identity
  // (output trim, preset + Tone Lab bus EQ, intensity-filter tonal target, projection,
  // voice panning) AND its breath/shimmer/air identity (air breath noise, air/shimmer
  // shelf, air low-mid scoop — all carrying PRESET_AIR_SHIMMER_GAIN_SCALE) must land WITH
  // its voices, not crawl in over the slow atmosphere window. Otherwise the old moon's
  // body/air rides under the new moon's voices during the overlap (Europa air lingering
  // over Titan, Titan air lingering over Europa, Io too thick / Titan underfilled).
  bodyMorphSeconds: 2.4,
  curve: 'smoothstep',
  curveSteps: 32,

  // Moon-specific breath/shimmer/air identity (not decorative atmosphere). Must land on
  // the voice crossfade window so the previous moon's air/noise color does not ride on
  // the new moon until the aux guard clears. Includes gain, shelf, scoop, and breath-
  // noise filter targets (PRESET_AIR_SHIMMER_GAIN_SCALE lives in those getters).
  airIdentity: {
    morphSeconds: null, // null → voiceCrossfadeSeconds
    // Linear morph lands AIR/shimmer identity with voices — smoothstep ease-in kept Io/Titan
    // sounding under-filled early and invited a late second swell when loops resumed.
    curve: 'linear',
    curvePower: 1,
    // When the outgoing moon's air gain is louder than the incoming target, finish the
    // morph sooner so old-moon noise clears before the incoming voice is fully present.
    outgoingFadeScale: 0.55,
    // If the snapshot breath phase is near a swell peak, morph air to the incoming moon's
    // target at the neutral reanchor phase instead of holding an outgoing breath peak.
    peakSwellRatioThreshold: 1.08,
  },

  // Decorative mood aux (bloom/eclipse/orbit/dual) uses the body window and true live
  // targets so completion is a no-op handoff — no post-guard swell from delta-slew remainders.
  moodAuxMorphSeconds: null, // null → bodyMorphSeconds
  moodAuxCurve: 'linear',
  moodAuxCurvePower: 1,

  // Transition-only delta slew cap (legacy). Disabled — morph endpoints now equal live targets.
  deltaSlew: {
    enabled: false,
    moodBloomDb: 0.6,
    moodEclipseDb: 0.6,
    orbitGain: 1,
    dualBeatGain: 1,
    skyExtensionScale: 0.55,
  },

  // Transition-only overlap compensation (no steady-state change). The root / sub /
  // fifth / foundation voices (indices below) are coherent same-pitch voices shared
  // across moons, so the equal-gain crossfade holds that resonant low-mid band near the
  // OUTGOING moon's level for the whole overlap. When the outgoing moon has a strong body
  // (Titan/Europa) and the incoming is Io, that strong low-mid stacks with Io's building
  // brightness, so the interval sounds louder/more resonant than settled Io and only
  // drops once the outgoing finally clears. Fading just those outgoing body voices faster
  // than the incoming build clears the resonance early so it never stacks. Outgoing only
  // decreases (no second swell); incoming targets and settled sound are untouched.
  overlapCompensation: {
    enabled: true,
    bodyVoiceIndices: [0, 1, 2, 6],
    bodyVoiceOutgoingFadeScale: 0.35,
  },

  // Transition-only incoming headroom while outgoing voices still overlap. Scales ramp to
  // 1.0 by voiceCrossfadeSeconds end — settled Io/Cosmos voicing unchanged after handoff.
  overlapHeadroom: {
    enabled: true,
    cosmosEnterFromPresets: ['Strings', 'Shruti'],
    cosmosIncomingVoiceScale: {
      0: 0.70,
      1: 0.72,
      2: 0.76,
      3: 0.82,
      4: 0.88,
      5: 0.90,
      6: 0.72,
      8: 0.70,
      9: 0.70,
      10: 0.70,
    },
    cosmosEnterOutgoingBodyFadeScale: 0.28,
    cosmosLeaveExtensionFadeScale: 0.45,
    cosmosLeaveExtensionIndices: [6, 8, 9, 10],
    voiceEnergyWeights: {
      0: 1.2,
      1: 1.0,
      2: 0.85,
      3: 0.75,
      4: 0.65,
      5: 0.55,
      6: 0.9,
      7: 0.2,
      8: 0.5,
      9: 0.45,
      10: 0.4,
    },
  },
}

// Dev-only Moon transition isolation toggles (console: moondroneDebug.setMoonTransitionIsolation)
export const MOON_TRANSITION_ISOLATION = {
  enabled: false,
  voicesOnly: false,
  muteIncomingExtensions: false,
  muteAirShimmer: false,
  muteMoodAux: false,
  muteOutgoingAfterSeconds: null,
  transitionOverlapScale: 1,
}

// Auxiliary layers share the single MOON_TRANSITION window/curve above.
export const MOON_AUX_LAYER_CROSSFADE = {
  enabled: true,
  curveSteps: MOON_TRANSITION.curveSteps,
  curve: MOON_TRANSITION.curve,
}

// Voice-level moon crossfade: incoming voices target the live breath voicing
// directly (no energy normalization, no post-morph). Index constants only.
export const MOON_VOICE_CROSSFADE = {
  normalizeIncomingSum: false,
  postMorphSeconds: 0,
  audibleGainThreshold: 0.0001,
  mainVoiceMaxIndex: 5,
  cosmosExtensionMinIndex: 8,
  deferExtensionsOnCosmosEnter: true,
}

// =============================================================================
// Optional — Preset transition diagnostics (dev console)
// Enable while playing, then switch Moons:
//   moondroneDebug.setPresetTransitionDebug({ enabled: true })
// Default watches Europa↔Titan (internal: Shruti↔Strings) in High/Very High only.
// Logs voice create/dispose, oscillator start/stop, gain/detune/pan targets,
// snapParam/setValueAtTime during the transition, and timed completion probes.
// =============================================================================
// Temporary Moon-change diagnostics (dev console). Enable while playing, switch Moons:
//   moondroneDebug.setMoonChangeDebug({ enabled: true })
// Voice-rebuild transitions (Titan↔Io/Europa): compact probe tables at plan, timed marks,
// complete-before/after, and complete+0.5s. Also logs harmonic-targets at plan + complete.
export const MOON_CHANGE_DEBUG = {
  enabled: false,
  // Unified voice-rebuild probe table — on by default when enabled: true
  transitionProbes: true,
  transitionProbeMarkSeconds: [0, 0.25, 0.5, 0.75, 1, 1.5, 2.2, 3.2],
  transitionProbePostCompleteSeconds: [0.5],
  compareEntryLevels: false,
  gainPathProbes: false,
  auxLayerTimeline: false,
  gainPathMarkSeconds: [0, 0.05, 0.1, 0.25, 0.5, 1, 2, 3],
  auxLayerMarkSeconds: [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5],
  ioEntryMarkSeconds: [0.1, 0.5, 1, 1.5, 2, 3, 4, 5],
  titanAuxMarkSeconds: [0.5, 1, 1.5, 2, 3, 4, 5],
  probeIntervalSeconds: 0.25,
  probeDurationSeconds: 5,
  // Logs upper-harmonic voice targets (indices 3–5, 8–10) for Titan↔Europa / Titan↔Io.
  harmonicVoiceProbe: false,
}

export const PRESET_TRANSITION_DEBUG = {
  enabled: false,

  // Internal preset names. Default: Shruti (Europa) ↔ Strings (Titan).
  watchPresetPairs: [
    ['Shruti', 'Strings'],
  ],

  // When true, only log in High (4) and Very High (5) registers.
  highRegistersOnly: true,

  // Log snapParam() and direct setValueAtTime() during watched transitions.
  logSnapCalls: true,

  // Schedule voice/bus snapshots at known transition milestone times.
  logCompletionProbes: true,
}

// Voice architecture indices (engine wiring — do not change unless adding voices)
export const VOICE_ARCHITECTURE = {
  intervals: [-12, 0, 7, 12, 24, 31],
  foundationRootIndex: 6,
  binauralRightIndex: 7,
  cosmosCelestialIndex: 8,
  cosmosCelestialInterval: 36,
  cosmosSkyRootIndex: 9,
  cosmosSkyRootInterval: 36,
  cosmosSkyOctaveIndex: 10,
  cosmosSkyOctaveInterval: 48,
}

export { TONE_LAB_TUNING } from './toneLab.js'
