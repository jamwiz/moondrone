/**
 * Moondrone Moods
 * ===============
 * A "Mood" is the slow motion/behavior layer applied to a non-binaural Moon.
 * Moods are curated packages that internally combine advanced motion engines
 * (Orbit, Harmonic Bloom, Eclipse, Epsilon Drift, Tides/Nested rates) — they are
 * NOT exposed as separate controls.
 *
 * Design rules (see also the engine's mood loop in droneEngine.js):
 * - Extremely slow. Cycles 60–180 s. Felt after 30–60 s, never announced.
 * - No obvious gain modulation: no tremolo, no pumping, no volume cycling.
 *   Movement comes from harmonic redistribution, micro-detune, phase/stereo
 *   drift, and spectral masking — never overall level swells.
 * - Practice-safe: the ROOT's detune is hard-capped (see MOOD_ROOT_DETUNE_CAP_CENTS)
 *   so the perceived pitch center holds for intonation even on the livelier moods.
 * - When a Moon is Binaural, moods do not apply (beat controls replace Mood).
 *
 * Display names are kept separate from internal IDs so they can be retitled
 * without touching engine logic. All numbers below are safe to tune later.
 */

// `short` is what the on-screen Mood selector shows (compact, no "Moon" suffix).
// `name`/`description` are used by Help/About where the fuller language fits.
export const MOODS = [
  { id: 'new', short: 'New', name: 'New Moon', description: 'Minimal and clear — a stable reference, best for intonation practice.' },
  { id: 'full', short: 'Full', name: 'Full Moon', description: 'Clearly alive, with a warm, breathing harmonic bloom.' },
  { id: 'blue', short: 'Blue', name: 'Blue Moon', description: 'The most spacious and distant — weightless and dreamlike, with slow shimmering drift.' },
  { id: 'blood', short: 'Blood', name: 'Blood Moon', description: 'Dark and deep, with a strong low-body wobble and sweeping eclipse.' },
  { id: 'super', short: 'Super', name: 'Super Moon', description: 'Huge, bright, and radiant — the most expansive, luminous mood.' },
]

export const DEFAULT_MOOD_ID = 'full'

export function getMoodName(moodId) {
  return MOODS.find((mood) => mood.id === moodId)?.name ?? moodId
}

export function getMoodShortName(moodId) {
  const mood = MOODS.find((entry) => entry.id === moodId)
  return mood?.short ?? mood?.name ?? moodId
}

// Loop cadence + smoothing. Slow params don't need 60 fps; ramps overlap so
// motion stays continuous and click-free. (Seconds.)
export const MOOD_LOOP_TUNING = {
  updateSeconds: 0.5,
  rampSeconds: 1.4,
}

// Harmonic-bloom redistribution weights by voice index — a SMALL secondary body
// motion on top of the primary (audible) bloom EQ below. Opposing phase so the
// sum stays ~constant (no volume swell). Root (1) is intentionally 0 so the
// fundamental stays rock-steady for practice. Targets only layers that actually
// carry gain across presets. Indices: 0 low −12, 2 fifth, 4 +24.
export const MOOD_BLOOM_WEIGHTS = { 0: -0.5, 2: 1.0, 4: 0.6 }

// ---- Bloom / Eclipse spectral EQ (the primary, reliably audible mechanism) ----
// Harmonic bloom and eclipse are driven by dedicated bus EQ nodes, not by voice
// gains. This works on every preset (even sparse Europa/Shruti, whose upper
// voiceGains are 0) and reads as the spectrum opening/closing and bands passing
// into shadow — true timbral motion, not a volume swell.
export const MOOD_BLOOM_SHELF_FREQUENCY = 1600 // high-shelf: lifts/lowers the "air"
export const MOOD_BLOOM_SHELF_Q = 0.7
export const MOOD_ECLIPSE_PEAK_Q = 1.2
export const MOOD_ECLIPSE_FREQUENCY_MIN = 700 // eclipse notch sweeps this range
export const MOOD_ECLIPSE_FREQUENCY_MAX = 2300

// Root detune is capped this small (cents) regardless of mood so the perceived
// pitch center never drifts — tuners stay true for intonation practice.
export const MOOD_ROOT_DETUNE_CAP_CENTS = 1.0
export const MOOD_ROOT_DETUNE_SCALE = 0.4

// True Orbit — a DEDICATED symmetric oscillator pair (separate from the voices),
// centered on a musically useful pitch. One partner sweeps up while the other
// sweeps down, so they converge to unison and diverge again over a slow lunar
// cycle. Because the pair stays symmetric around the center, perceived tuning
// never drifts; what you hear is the beat rate swelling and easing — real
// "orbiting" frequencies, not per-voice micro-detune. Engine: droneEngine.js
// orbit-pair methods. A mood without `trueOrbit` has no orbit pair at all.
//   semitoneOffset  center pitch above the current root (12 = octave, 7 = fifth)
//   maxCents        peak symmetric detune at full divergence (each partner ±this)
//   gain            linear bus level of the pair (kept small; well under root)
//   pan             stereo spread of the two partners (±) — shimmer on headphones,
//                   still a mono-safe amplitude beat on a phone speaker
//   sweepPeriod(2)  cycle lengths (s) for the slow nested convergence/divergence
export const MOOD_TRUE_ORBIT = {
  // New Moon — no true orbit (most stable reference for intonation practice).
  new: null,
  // Full Moon — gentle octave orbit: the upper harmonic level is `gain`; peak beat
  // rate is `maxCents`; swell speed is `sweepPeriod` / `sweepPeriod2` (via
  // getOrbitSweepCents). nestedWeight in MOOD_TUNING.full feeds the same nested wave.
  // Breath does not couple to the orbit pair — only global filter/voice motion stacks
  // perceptually, so Full bloom/epsilon periods are kept slow and nestedWeight low.
  full: { semitoneOffset: 12, maxCents: 2.5, gain: 0.037, pan: 0.16, sweepPeriod: 240, sweepPeriod2: 400 },
  // Blue Moon — the prominent upper harmonic retuned to a MINOR SEVENTH above the
  // root (10 st) for a cool, mysterious color instead of an octave. Kept soft (gain
  // pulled back a hair) and wide/slow so the b7 is felt as atmosphere — the orbit's
  // detune shimmer keeps it from ringing like an obvious dominant-7th chord tone.
  blue: { semitoneOffset: 10, maxCents: 22, gain: 0.054, pan: 0.5, sweepPeriod: 82, sweepPeriod2: 124 },
  // Blood Moon — strongest, darkest orbit on the fifth; level pulled back slightly
  // with the overall mood trim while keeping its dramatic dark beating character.
  blood: { semitoneOffset: 7, maxCents: 52, gain: 0.105, pan: 0.44, sweepPeriod: 28, sweepPeriod2: 46 },
  // Super Moon — big, clean, BRIGHT orbit on the octave (not the darker fifth):
  // strong and radiant with a wide stereo halo. Trimmed vs earlier builds so the
  // added Super-only dual beats keep overall level in family with other moods.
  super: { semitoneOffset: 12, maxCents: 38, gain: 0.078, pan: 0.5, sweepPeriod: 36, sweepPeriod2: 58 },
}

// True dual binaural-style beats — SUPER ONLY. Two dedicated hard-panned stereo
// oscillator pairs whose actual L/R FREQUENCY DIFFERENCE is the beat (not an LFO /
// nested modulation curve). On headphones these are real binaural beats; summed to
// a phone speaker they become a gentle amplitude beat, so gains are kept low — that
// low level is the deliberate mono/speaker-safety lever (we can't detect headphones
// in the browser). Routed into the Tone Lab bus (post-reverb path, skipping widener
// so L/R stays hard-panned) then output trim → master limiter. Carriers track
// key/register/reference A; beatHz is a FIXED Hz split so the beat rate stays
// constant at any pitch. No mood but Super has this.
//   semitoneOffset  carrier pitch above the current root (0 = root, 12 = octave)
//   beatHz          L/R frequency split = the actual beat frequency
//   gain            linear bus level of the pair (low; headphone-first, speaker-safe)
//   pan             L/R spread (±, near-hard for clean binaural separation)
export const MOOD_DUAL_BEATS = {
  // Super only. Beat A: deep/slow on the root. Beat B: brighter, on the octave.
  // Levels trimmed so the pair sums near other moods' True Orbit layers once routed
  // through the Tone Lab bus (see buildDualBeats in droneEngine.js).
  super: {
    beatA: { semitoneOffset: 0, beatHz: 4, gain: 0.028, pan: 0.9 },
    beatB: { semitoneOffset: 12, beatHz: 7.5, gain: 0.022, pan: 0.9 },
  },
}

// Per-mood motion parameters. Omitted fields = that engine is off for the mood.
//   epsilonCents   micro-detune depth (cents), all layers — analog warmth/life
//   orbitCents     slow relative detune depth (cents) on octave/upper layers only
//                  (never root or fifth) → audible slow beating against the root
//                  harmonics = "orbiting", with the pitch center held steady
//   widthDepth     stereo-width deviation around base 0.36 — spatial drift
//   bloomDb        high-shelf gain swing (dB) — spectrum opens/closes (bloom)
//   eclipseDb      peaking-notch depth (dB) that sweeps frequency — shadow/reveal
//   gainBloomDepth small body redistribution (fraction) — secondary to bloomDb
//   *Period(2)     cycle lengths (s); two periods + nestedWeight create nested
//                  "waves within waves" (Tides) without literal beats/pumping
export const MOOD_TUNING = {
  // New Moon — purest, most stable reference. Sub-musical epsilon drift only.
  // Intentionally NOT boosted: this is the steady tuning anchor.
  new: {
    epsilonCents: 0.8,
    epsilonPeriod: 80,
  },

  // Full Moon — slowest clearly-moving phase: tidal bloom/epsilon only (no per-voice
  // orbitCents). nestedWeight kept low so the True Orbit beat envelope stays smooth
  // and does not pick up chorus-like nested flutter when Breath is raised.
  full: {
    epsilonCents: 1.7,
    epsilonPeriod: 176,
    bloomDb: 3.7,
    bloomPeriod: 184,
    bloomPeriod2: 300,
    gainBloomDepth: 0.07,
    nestedWeight: 0.18,
  },

  // Blue Moon — the most spacious/distant mood: widest stereo migration of any
  // mood and very slow, weightless celestial movement, with a cooler (darker)
  // bloom so it never competes with Super's brightness/radiance. Shimmer comes
  // from width + a quiet, gentle slow orbit rather than energetic beating.
  blue: {
    epsilonCents: 1.6,
    epsilonPeriod: 96,
    orbitCents: 6,
    orbitPeriod: 96,
    orbitPeriod2: 150,
    widthDepth: 0.34,
    widthPeriod: 120,
    widthPeriod2: 88,
    bloomDb: 2.4,
    bloomPeriod: 130,
    bloomPeriod2: 190,
    gainBloomDepth: 0.04,
    nestedWeight: 0.46,
  },

  // Blood Moon — darker and deeper: stronger low-body wobble (orbit + gain motion)
  // and a deep, sweeping eclipse notch. Depth pulled back slightly with the overall
  // mood trim; keeps its dark identity. Headphone-best, still speaker-safe.
  blood: {
    epsilonCents: 2.2,
    epsilonPeriod: 54,
    orbitCents: 12,
    orbitPeriod: 48,
    orbitPeriod2: 82,
    widthDepth: 0.23,
    widthPeriod: 64,
    widthPeriod2: 42,
    bloomDb: 2.6,
    bloomPeriod: 60,
    bloomPeriod2: 94,
    eclipseDb: 10.5,
    eclipsePeriod: 48,
    gainBloomDepth: 0.105,
    nestedWeight: 0.52,
  },

  // Super Moon — biggest, brightest, most radiant: the strongest high "air" bloom
  // of any mood, wide spacious stereo, clean strong orbit, and NO eclipse (nothing
  // is hidden — it stays luminous). bloomDb stays highest but trimmed so dual beats
  // do not push Super dramatically above Full / Blue / Blood.
  super: {
    epsilonCents: 1.8,
    epsilonPeriod: 70,
    orbitCents: 9,
    orbitPeriod: 56,
    orbitPeriod2: 92,
    widthDepth: 0.27,
    widthPeriod: 78,
    widthPeriod2: 52,
    bloomDb: 4.3,
    bloomPeriod: 64,
    bloomPeriod2: 104,
    gainBloomDepth: 0.088,
    nestedWeight: 0.46,
  },
}
