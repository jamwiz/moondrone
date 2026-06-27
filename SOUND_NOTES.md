# Moondrone Sound Notes

This file tracks sound design goals and the current sound-engine status for Moondrone.

## Project Phase

The sound engine is **stable**. Do not change presets, routing, or mix architecture unless explicitly requested. **Premium UI, About/Help, native icon/splash, and app lifecycle safety handler are complete.** Active work is **Capacitor device validation** on real hardware.

## Per-Moon Balance Tuning (2026)

Targeted voicing and trim passes for phone-speaker balance — no routing, limiter, or Tone Lab global changes. Europa (Shruti) intentionally unchanged.

**Mimas (Pure):** root-centric fifth (`0.009`), whole-preset trim +0.35 dB, VH register −2 dB, Phase harmonics 0.65 / High 0.55 / VH 0.48, air 0.88 / Low 0.75, High/VH +12 ring boost, VH root scale 0.86, Breath gain follow ×1.58/1.58/1.65 on indices 0/1/3. Current `voiceGains`: `[0.06, 0.6, 0.009, 0.1, 0.008, 0]`.

**Titan (Strings):** softer root (0.36), air 0.78 / Low 0.68 / VH 0.65, Phase harmonics 0.82 / High 0.70 / VH 0.48, VH upper bloom scales on indices 3–5, Breath gain follow ×1.44/1.44/1.48. Current `voiceGains`: `[0.19, 0.36, 0.10, 0.015, 0.015, 0.01]`.

**Io (Cosmos):** VH Phase harmonics High 0.9 / VH 0.85; VH +12 octave scale 0.86.

**Binaural:** VH upper stack and undertones trimmed (indices 3–7).

Tables: `PRESET_REGISTER_BALANCE_TRIM_DB`, `PRESET_AIR_SHIMMER_GAIN_SCALE`, `PRESET_MOON_PHASE_HARMONICS_GAIN_SCALE`, `PRESET_REGISTER_VOICE_GAIN_SCALE`, `PRESET_BREATH_VOICE_GAIN_SCALE`, `STRINGS_TUNING.breathVoiceGainScale`. Engine hook: `getPresetBreathVoiceGainScale()` in `droneEngine.js`.

## Cleanup + iPhone Speaker Pass

Focused pass — no routing, limiter, or mix-architecture changes.

- **Choir** removed from the user-facing preset list (engine code retained, just not exposed). `DEFAULT_PRESET` stays Shruti.
- **Reverb** is now a fixed subtle background level. No UI slider; `FIXED_REVERB_PERCENT = 20` is passed on `start()` and **not** changed by preset selection. 20% maps through the wetness curve to ~0.09 wet. Decay/pre-delay still come from the active preset's `reverb` (space character preserved).
- **Pure** voiced from a naked sine to a clean, centered tone with gentle harmonic color (see **Per-Moon Balance Tuning (2026)** for current gains and trims).
- **Strings** high-end softened: filter base 5000 → 4200 Hz, `sawAmountMid` 0.06 → 0.05, `sawAmountUpper` 0.04 → 0.03, upper-harmonic multiplier 0.92/0.84 → 0.88/0.80 at High/Very High.
- **Shruti** untouched.
- **Rapid note/key-switch glitch fixed** (engine): outgoing crossfade voices now retire via their own per-set dispose timer (`registerOutgoingVoiceSet`) instead of a shared timeout that the next crossfade cleared — previously this orphaned voices (stuck tones + accumulating oscillators) on rapid taps.

## Voicing Refinement (Spaciousness Pass)

*Historical snapshot — superseded by later passes including **Per-Moon Balance Tuning (2026)**. See preset sections below for current values.*

Subtle spectral/voicing pass to reduce low-mid congestion and add vertical air without changing routing, limiter, Intensity, Breath, reverb, or metronome behavior.

**Goal:** lighter, airier, more floating — less root-dominant and less stacked in the low mids — while preserving practice loudness on phone speakers.

**Audit findings (low-mid accumulation):**

- **Root + fifth stacking** — indices 1 and 2 carry most presets; root gains were 0.44–0.65 with fifths at 0.26–0.32, reinforcing the same harmonic region.
- **Low octave overlap** — index 0 (−12) adds a second body layer under root/fifth (Shruti, Strings, Binaural); Shruti also keeps index 3 at 0 so index 0 carries octave body.
- **Register octave duplication** — index 3 (+12) overlaps the fundamental region of the next register up; Strings and Choir had meaningful energy at +12 alongside strong root/fifth.
- **Foundation root (index 6)** — Shruti/Cosmos foundation at `voiceGains[1] × FOUNDATION_ROOT_GAIN` added another root-class layer in the low mids at High/Very High registers.

**Changes made:**

| Area | Before | After | Why |
|------|--------|-------|-----|
| Preset `voiceGains` (all six) | see preset sections below | small reductions on indices 0–3; tiny increases on indices 4–5 | Ease low-mid stack; add upper “air” without treble EQ |
| `FOUNDATION_ROOT_GAIN` | 0.68 | 0.64 | Less redundant foundation root weight (Shruti/Cosmos) |
| Cosmos extension base gains | 0.045 / 0.028 / 0.024 | 0.048 / 0.03 / 0.026 | Slightly more vertical sky presence (Cosmos only) |
| `PRESET_BALANCE_TRIM_DB` | Pure +1.5 … Cosmos −2 | +0.15 to +0.3 dB compensation per preset | Preserve perceived loudness after voicing reductions |

**Not changed:** output routing, master limiter, bus EQ profiles, Intensity/Breath logic, filter curves, reverb, metronome, UI, or preset identities.

**Per-preset voiceGains (after pass):**

| Preset | voiceGains |
|--------|------------|
| Pure | `[0, 0.62, 0, 0, 0, 0]` |
| Shruti | `[0.085, 0.57, 0.29, 0, 0.05, 0]` |
| Strings | `[0.19, 0.55, 0.30, 0.11, 0.05, 0.015]` |
| Choir | `[0.045, 0.41, 0.30, 0.25, 0.17, 0.07]` |
| Cosmos | `[0.045, 0.32, 0.19, 0.23, 0.28, 0.14]` |
| Binaural | `[0.07, 0.53, 0.24, 0.12, 0.055, 0.025]` |

**Per-preset balance trims (after pass):** Pure +1.65, Shruti +0.3, Strings −0.25, Choir −1.25, Cosmos −1.75, Binaural −0.25 dB.

## Register Foundation Spacing (High / Very High)

Targeted investigation: High register felt heavy, forward, and congested across presets — especially where a supporting foundation root reinforced the primary root in the same octave region.

**Audit — foundation and register behavior (index 6 unless noted):**

| Preset | High / Very High foundation | Issue |
|--------|------------------------------|-------|
| **Shruti** | Was Medium register (oct 3) | **At High register, foundation pitch equaled index 0 (−12 layer)** — e.g. C4 root with both foundation and index 0 at C3. Double root-class reinforcement in one octave. |
| **Cosmos** | Already Low register (oct 2) | No change — e.g. C4 root with foundation at C2, index 0 at C3. Vertical ladder already present. |
| **Binaural** | Undertones at root ± beat Hz (not register-based) | No change — spacing is beat-based, not octave foundation. |
| **Pure, Strings, Choir** | No foundation voice | No foundation change — congestion at High on these presets comes from the standard 0/1/2 stack only; not addressed here. |

**Standard stack (all presets, relative to selected register):**

| Index | Interval | High register example (C) |
|-------|----------|---------------------------|
| 0 | −12 | C3 |
| 1 | 0 (root) | C4 |
| 2 | +7 (fifth) | G4 |
| 3 | +12 | C5 |

Shruti keeps `voiceGains[3] = 0`, so index 0 carries octave body — making the Medium-register foundation overlap at High especially audible.

**Change made (Shruti only, High and Very High registers):**

| Register | Primary root (ex. C) | Index 0 | Foundation before | Foundation after |
|----------|---------------------|---------|-------------------|------------------|
| High (oct 4) | C4 | C3 | C3 (Medium) — **collided with index 0** | **C2 (Low)** |
| Very High (oct 5) | C5 | C4 | C3 (Medium) | **C2 (Low)** |

Implementation: `getFoundationRootOctave()` in `src/droneEngine.js` returns `LOW_REGISTER_OCTAVE` (2) when `currentOctave >= HIGH_REGISTER_OCTAVE` (4), instead of `MEDIUM_REGISTER_OCTAVE` (3).

**Why this should increase openness without reducing projection:**

- Removes duplicate energy at the same pitch as index 0 at High register — the main congestion source.
- Creates a clear vertical ladder: foundation below body (index 0) below primary root — “note floating above a foundation.”
- Foundation energy moves to a region where phone speakers already project well (low register), preserving grounding without stacking in the upper bass/low-mid.
- No treble boost, no routing/limiter/EQ changes, no gain compensation — spacing only.

**Not changed:** Cosmos foundation (already Low), Binaural undertones, preset `voiceGains`, bus EQ, balance trims, Intensity, Breath, reverb, UI.

## Metronome Limiter Pumping Fix

**Symptom:** Drone appeared to duck slightly on every metronome click despite no beat-by-beat ducking logic.

**Root cause — master limiter gain reduction on the full mix:**

- Drone and metronome sum into a single `Tone.Limiter` at −0.5 dB (`MASTER_LIMITER_DB`).
- Under the hood, Tone’s limiter is a compressor: **3 ms attack, 10 ms release, ratio 20**.
- The drone runs near the ceiling at Master Volume 100% (internal cap 0.75).
- Each metronome click adds a sharp transient on top of the steady drone.
- When the **combined peak** exceeds the −0.5 dB threshold, the limiter applies gain reduction to the **entire mixed signal** — not just the metronome — so the drone audibly dips with each click.
- The 10 ms release recovers quickly between beats, producing rhythmic pumping.
- The fixed −1.5 dB drone offset (`DRONE_METRONOME_HEADROOM_DB`) applies **once** when the metronome starts; it does not prevent per-beat limiter engagement.

**Contributing factor — metronome crest factor after EQ:**

- Chain was: trim → **soft clip** → presence EQ (+3 dB @ 3.2 kHz) → click EQ (+1.5 dB @ 5 kHz) → output (+7 dB).
- Peaking EQ **after** the soft clipper rebuilt resonant peaks on each click before the master limiter.

**Fix (transient management and gain staging only — no new ducking/compression):**

| Change | Before | After | Why |
|--------|--------|-------|-----|
| Metronome chain order | trim → clip → EQ → output | trim → EQ → **clip** → output | Clip EQ-boosted peaks on metronome bus before they hit master limiter |
| Click attack envelope | Instant full level | −5 dB → target over 3 ms | Reduces sample attack spike that triggers limiter |
| Soft clip curve | `tanh(1.7) × 0.76` | `tanh(2.1) × 0.72` | Slightly stronger post-EQ peak control |
| Metronome output gain | +7 dB | +7.5 dB | Restore perceived metronome loudness after peak reduction |

**Not changed:** master limiter, drone headroom offset (−1.5 dB on metronome start), routing architecture, drone compressor (none), per-bus limiters (none), Breath, Intensity, UI.

## Phone Speaker Efficiency (Projection Pass)

**Symptom:** Moondrone feels very loud but less projecting than ambient/ASMR reference drones; phone speakers sometimes show harmonic buzz/strain without obvious digital clipping.

**Why ambient/ASMR often sounds louder with less strain:**

- Phone speakers are tiny and efficient in roughly **800 Hz–3 kHz**; they struggle below **200–300 Hz** and distort when driven hard with stacked low-mid energy.
- ASMR/ambient pads are usually **spectrally lean below the speaker’s useful range** — energy is placed where the driver converts watts to perceived loudness.
- They use **fewer simultaneous body layers** (often one pad), lower crest factor, and mastering that targets midrange projection — not multi-oscillator stacks.
- Moondrone pushes **multiple fundamentals and triangle fifth harmonics** into 130–500 Hz simultaneously; the speaker wastes excursion on inaudible/distorted bass while the midrange lacks clean headroom.

**Root cause in Moondrone — speaker-efficiency mismatch, not insufficient output gain:**

| Factor | Effect on phone speakers |
|--------|--------------------------|
| **Stacked low-mid body** | Index 0 (−12 triangle) + root + index 2 (fifth triangle) + foundation (Shruti/Cosmos) = multiple strong sources in 130–500 Hz |
| **Triangle harmonics** | Indices 0 and 2 are triangles — odd harmonics add buzz when the driver is already stressed |
| **Low register output boost** | `REGISTER_BALANCE_TRIM_DB` Low was **+1 dB** — boosted the most bass-heavy register |
| **Foundation gain** | Index 6 at `voiceGains[1] × 0.64` adds another root-class layer in a region phones reproduce poorly |
| **Bass shelf too gentle** | −3 dB @ 200 Hz left substantial sub/low energy that phones cannot reproduce cleanly |
| **Mechanical distortion** | Buzz is often **speaker nonlinear distortion** (and intermodulation between detuned layers), not digital clip — limiter may contribute but is not the primary cause |
| **Intensity default 70** | Filter opens and Q/resonance rise, adding upper-mid focus but not fixing low-mid waste |

**Fix (voicing and gain staging only — no output gain increase, no treble boost, no limiter change):**

| Change | Before | After | Why |
|--------|--------|-------|-----|
| Bass shelf | −3 dB @ 200 Hz | **−4 dB @ 210 Hz** | Trim energy below phone useful range; frees excursion for mid projection |
| Low register trim | +1 dB | **+0.25 dB** | Stop boosting the most bass-heavy register |
| `FOUNDATION_ROOT_GAIN` | 0.64 | **0.58** | Less redundant foundation weight in inefficient band |
| Register low-layer scale | none | **Low ×0.8, Medium ×0.9** on indices 0, 2, foundation | Reduce low octave, fifth body, and foundation where fundamentals sit in muddy zone |
| Intensity low-end layer | index 0 + foundation | **index 0 + index 2 + foundation** | Fifth triangle now participates in high-Intensity low-end settling |

**Expected result:** less buzz/strain, clearer midrange projection, subjectively louder/cleaner on phone speakers — without raising master output gain or boosting highs.

**Not changed:** master limiter, `OUTPUT_BOOST_DB`, `MAX_MASTER_VOLUME_NORMALIZED`, preset balance trims, Intensity/Breath logic, routing, metronome.

## High / Very High Upper Harmonic Pass (Speaker Strain)

**Symptom:** Speaker strain, buzzing, and distortion most noticeable at **High and Very High registers** — not bass overload.

**Investigation — upper harmonic density at High / Very High (example key C):**

| Register | Root | Index 3 (+12) | Index 4 (+24) | Index 5 (+31) | Notes |
|----------|------|---------------|---------------|---------------|-------|
| High (oct 4) | C4 ~262 Hz | C5 ~523 Hz | **C6 ~1.0 kHz** | **~1.4 kHz** | `upperLayerPresence` scales up indices 3–5 at default Intensity 70 |
| Very High (oct 5) | C5 ~523 Hz | C6 ~1.0 kHz | **C7 ~2.1 kHz** | **~2.8 kHz** | Upper stack sits in phone breakup / intermodulation zone |

**Preset-specific buildup:**

| Preset | High/Very High upper harmonic risk |
|--------|-------------------------------------|
| **Cosmos** | Highest index 4/5 gains (0.28 / 0.14) **plus** sky extensions 8–10 (+36 / +48 semitones) — extreme harmonic density at Very High |
| **Choir** | Strong index 3–5 gains (0.25 / 0.17 / 0.07) with **3-voice detuned ensemble per layer** and high filter Q (0.92) — intermodulation buzz |
| **Strings** | Saw partials on all layers; upper register pushes rich harmonics into 1–3 kHz |
| **Shruti** | Index 4/5 active; existing High/Very High damping on index 4 only — index 5 undamped |
| **Binaural / Pure** | Smaller upper stack but index 4/5 still scale with Intensity focus curve |

**Root cause:** At High/Very High, fundamentals move up and the **+24 / +31 layers plus Cosmos extensions** stack multiple sines (and Choir/Strings harmonics) in the **1–4 kHz phone breakup region**. Default Intensity 70 increases `focusAmount`, which **raises upper-layer presence** via `upperLayerPresence[3–5]`. The speaker buzz is **upper-harmonic overload and intermodulation**, not insufficient master gain.

**Fix (High / Very High only — voicing scale, no master volume / limiter / EQ boost):**

| Change | Detail |
|--------|--------|
| Upper harmonic scale | Index 3: High ×0.93 / VH ×0.88; index 4: ×0.86 / ×0.76; index 5: ×0.80 / ×0.68 |
| Cosmos extensions 8–10 | High ×0.80 / Very High ×0.62 |
| Choir multiplier | Additional ×0.90 / ×0.82 on indices 3–5 |
| Strings multiplier | Additional ×0.92 / ×0.84 on indices 3–5 (saw partials) |
| Shruti index 5 damping | Added High/Very High register voicing trim (index 4 already damped) |
| Register trim compensation | High −0.75 → **−0.5 dB**; Very High −1.25 → **−1.0 dB** — preserves body loudness while trimming harsh upper stack |

**Not changed:** master volume cap, limiter, bass shelf, Low/Medium register voicing, Intensity/Breath curves, routing, metronome.

## Ambient Master Voicing Pass (Midrange Congestion)

**Framing:** Investigated Moondrone against professionally mastered ambient / ASMR / dungeon synth — recordings that project well on phones despite sounding lighter.

**Symptom:** Drone feels **dense in the middle of the spectrum** — heavy without brightness, High/Very High feel loud, harmonic buzz on speakers.

**Frequency regions contributing most to perceived heaviness (Shruti / Medium / key C as reference):**

| Region | Sources | Why it feels heavy |
|--------|---------|-------------------|
| **150–280 Hz** | Index 0 (−12) fundamental | Upper bass body; phones reproduce poorly → distortion waste |
| **250–450 Hz** | Index 1 root + index 2 fifth fundamentals | **Primary congestion zone** — two strong tones + `upperLayerPresence` root at ~0.72 |
| **350–650 Hz** | Triangle **harmonics** from indices 0 and 2 (3rd, 5th partials) | Fills the “middle” without adding brightness — classic synthesized density |
| **450–800 Hz** | Index 3 (+12 octave), fifth upper partials, Choir filter Q resonance | Midrange stack; at High/Very High the root moves up so this band stays crowded |
| **800 Hz+** | Indices 4–5, Cosmos extensions | Partially addressed by upper-harmonic pass; buzz when combined with dense 250–650 Hz foundation |

**Why ambient masters sound lighter but project better:**

- **Less simultaneous energy in 250–600 Hz** — often one primary tone, not root + fifth + low octave + harmonics
- **Higher spectral efficiency** — watts go to the phone’s sensitive band (~800 Hz–2 kHz), not into muddy low-mid stacking
- **Lower crest factor / fewer beating partials** — less intermodulation buzz
- **Perceived loudness ≠ total energy** — ambient mixes trade midrange density for clarity; Moondrone was optimized as a harmonic instrument, not a mastered pad

**Prior passes** addressed bass waste, foundation spacing, and High/Very High upper stack. **Remaining issue:** the **200–800 Hz body stack** (indices 0–3) on Pure, Strings, and Choir still has **no bus voicing** (preset peaking cuts only on Shruti/Cosmos/Binaural).

**Fix (very small — master ambient voicing, not preset redesign):**

| Change | Detail | Why |
|--------|--------|-----|
| Global mid voicing EQ | **−0.75 dB @ 440 Hz, Q 0.38** (all presets, always on) | Wide gentle cut — ambient-style midrange de-congestion; shallower/wider than reverted broad cut |
| `upperLayerPresence` body | Index 0: 0.52→**0.48**; index 1: 0.72→**0.68** | Less root/low-octave body weight in 250–450 Hz |
| Foundation `rootPresence` | 0.72→**0.68** | Match root body trim |
| `AMBIENT_BODY_VOICING_SCALE` | idx 0 ×0.92, 1 ×0.94, 2 ×0.93, 3 ×0.96 | Slight body-layer trim across all registers/presets |

**Not changed:** master volume cap, limiter, treble boost, preset `voiceGains`, Intensity/Breath curves, routing, metronome.

## Play / Stop Transient Fix (Intermittent Click/Pop)

**Symptom:** Occasional glitch, click, pop, or clip artifact immediately before or at Play/Stop — intermittent, suggesting timing/state rather than fixed gain levels.

**Most likely sources:**

| Issue | Mechanism |
|-------|-----------|
| **Play resume mid-stop-fade** | `rampParam` used `cancelAndHoldAtTime(startTime)` but **did not pass `startTime` to `rampTo`** — startup fade could desync from intended audio clock |
| **Play without forced silence** | After Stop (or Play during stop fade), voice gains were not reset to **0** before the startup fade — `cancelAndHoldAtTime` could hold a non-zero stop-fade level, audibly jumping when the startup ramp began |
| **Stop interrupting startup ramp** | `rampVoiceGainForStop` read **`param.value` before `cancelScheduledValues`** — during a scheduled startup fade, `.value` often still reads **0** while the audible level is higher → Stop snapped gain to the wrong level (audible click/pop) |
| **Preset voice rebuild** | `rebuildVoicesWhileStopped()` left `hasStarted = true` — next Play skipped `startVoiceOscillators()` on new voices (stale state after Strings/Choir rebuild) |
| **Stale crossfade guard** | `noteCrossfadeEndsAt` not cleared on Stop — could leave guard windows in inconsistent state |

**Fix (smallest scheduling/state changes — no fade duration or voicing changes):**

| Change | Detail |
|--------|--------|
| `start()` | Refresh `targetGain`; **hold/cancel + set 0 at `startTime`**; startup fade via **`rampParam(..., startTime)`**; clear crossfade/preset-transition guards |
| `stop()` | **`cancelAndHoldAtTime` before reading gain** in `rampVoiceGainForStop`; shared **`stopTime`**; clear **`noteCrossfadeEndsAt`** |
| `rampParam()` | Pass **`startTime`** through to **`rampTo(value, duration, startTime)`** |
| `rebuildVoicesWhileStopped()` | Set **`hasStarted = false`** so next Play starts fresh oscillators |

**Regression note:** An earlier attempt called **`stopBreathLoop()` on Stop** and read gain before cancel — this made Stop **worse**. Reverted breath stop; Stop fade now holds the scheduled gain first.

**Not changed:** Play fade (**4 s**), Stop fade (**3 s**), limiter, preset voicing at time of fix, reverb `ready` wait.

## Projection (Always-On — Phone-Speaker Translation)

Projection is now part of the default voicing. The UI toggle was removed; the
engine flag defaults on via `PROJECTION_TUNING.enabledByDefault = true`. The goal
is perceived loudness, clarity, and iPhone-speaker projection **without** raising
output gain, changing the limiter ceiling, or adding compression. It works by
spending less energy in muddy/inefficient bands and more in broad vocal-presence
regions.

Tuning lives in `PROJECTION_TUNING` (`src/soundTuning.js`):

1. **Reduce wasted low-mid energy (≈150–400 Hz).** Bus peaking dip **−3.4 dB @
   250 Hz, Q 0.8** plus voice trims: low octave (index 0) ×0.85 and Shruti/Cosmos
   foundation root ×0.85. This is decongestion, not a high-pass; the drone should
   keep warmth while freeing phone-speaker excursion for midrange projection.
2. **Harmonic projection / vocal presence.** Four broad peaking boosts on the
   post-reverb bus: **+2.0 dB @ 950 Hz**, **+2.7 dB @ 1.6 kHz**, **+2.1 dB @
   2.6 kHz**, and **+1.5 dB @ 3.8 kHz**. The boosts stay broad and below the
   brittle 5 kHz+ zone so headphones remain smooth.
3. **Mono translation.** `projectionDryNarrower` sits **before** reverb and pulls
   the dry body to **0.30** width for better near-mono phone summation. Reverb is
   downstream, so the wet tail stays spacious. **Binaural is exempt** (dry width
   remains 0.5) so its L/R beat does not collapse.
4. **Character preserved.** Moons keep their sound identity; Projection is a
   translation/balance layer, not a preset redesign.

**Tradeoffs to watch on device:** stronger presence can expose upper-register edge
on very small speakers; the low-mid trim slightly reduces body; dry width is more
centered on headphones while the reverb remains wide. No master-gain or limiter
change, so no new limiter-pumping mechanism is introduced.

## Phase System (Moon Movement Layer)

**UI label: Phase.** Internal code still uses `moodId`, `MoodSelector`, and `moods.js`. Phase is the slow movement/behavior layer for every non-Binaural Moon. Binaural keeps its dedicated Beat controls instead. Display names are separate from internal sound IDs: Mimas/Pure, Europa/Shruti, Titan/Strings, Io/Cosmos, Binaural.

Current Phase list:

| Phase | Role |
|-------|------|
| New | Stable reference, minimal motion |
| Full | Clearly alive, warm harmonic bloom |
| Blue | Floating/spatial/shimmering, clear orbit |
| Blood | Darker/deeper, stronger low-body wobble and eclipse |
| Super | Biggest/brightest/radiant, with true dual headphone beats |

### Phase engines

- **Bloom / Eclipse EQ:** dedicated bus filters after reverb. Bloom is a high shelf
  at 1.6 kHz; Eclipse is a moving peaking notch between 700–2300 Hz. These affect
  the whole drone spectrum, not only active voice layers.
- **Stereo width drift:** slow width offset around the base stereo width. New has
  none; Blue/Blood/Super are wider and more spatial.
- **Per-voice detune:** slow epsilon/orbit detune on standard voices. The root is
  scaled and hard-capped to keep practice pitch stable.
- **True Orbit:** dedicated symmetric oscillator pair. One partner sweeps up while
  the other sweeps down around a center pitch, so the beat rate converges/diverges
  without moving the perceived pitch center. Full/Blue/Super orbit on the octave;
  Blood orbits darker on the fifth; New has no true orbit.
- **Super true dual beats:** two dedicated hard-panned stereo oscillator pairs
  routed into the **Tone Lab bus** (post-reverb path, skipping widener/projection
  so L/R stays hard-panned) then output trim → master limiter. Beat A is
  root-based at **4 Hz**; Beat B is octave-based at **7.5 Hz**. Tuned gains:
  **0.028 / 0.022** (× Tone Lab `moonPhaseHarmonics.gain`). These are true L/R
  frequency differences, not nested LFO curves, and only Super enables them.

### Tone Lab (`src/toneLab.js`)

Centralized macros for subjective tuning **without UI changes**. Set
`TONE_LAB_TUNING.enabled: false` to bypass entirely (falls back to
`AIR_SHIMMER_TUNING` + `MASTER_TUNING` defaults).

| Section | Applies to | Controls |
|---------|------------|----------|
| `masterTone` | All Moons (when Tone Lab enabled) | Bus HPF/LPF, lowMid (~320 Hz), **highMid (~2500 Hz)**, air shelf |
| `harmonicLayer.gain` | All Moons (Binaural/Strings use their own partial paths) | AIR shimmer preset harmonic partials |
| `moonPhaseHarmonics` | Non-Binaural moods only | True Orbit, Super dual beats, bloom swing, orbit cents, gain bloom |
| `breathAir` | All Moons (Binaural breath-noise scale = 0) | Breath-noise level, tone, motion, soft envelope |
| `stereo.width` | All Moons | Global width multiplier |
| `dynamics` | All Moons | Output trim, limiter ceiling, compressor macro |

Binaural uses the **same Tone Lab bus EQ and AIR shimmer bus path** as other Moons
during live Moon transitions (prevents hard bus jumps / pops). Binaural-only
differences: no Phase/Mood, Beat selector, quiet L/R undertones (indices 6/7) with
deferred enter/exit fades, undertone panning, and projection dry-width exemption.
Level matching uses `PRESET_BALANCE_TRIM_DB.Binaural` and `BINAURAL_UNDERTONE_GAIN`
— not a separate master limiter/output stage.

### Mood auxiliary startup (Super Moon / Play click fix)

True Orbit and Super dual-beat layers previously ramped to full level in **~1.4 s**
while voices used a **4 s** Play fade — and the mood loop re-ramped every 0.5 s,
canceling scheduled values. Fix:

- Gains snap to **0** before oscillator start.
- Play schedules a **4 s** fade-in (`START_FADE_SECONDS`) alongside voices.
- Mood loop skips orbit/dual-beat ramps until startup/crossfade guards clear
  (`canRampMoodAuxiliaryLayers()`).
- Binaural undertones also snap to gain 0 before `oscillator.start()`.

## Overall Sound Goals

- Beautiful sound comes first.
- The drone should feel warm, musical, steady, and useful for practice.
- It should work well on phone speakers and headphones.
- It should be strong enough on phones without clipping, harsh distortion, or obvious limiter pumping.
- Startup should fade in at the correct pitch, with no pitch fall or glide.
- Current sound direction is Shruti-inspired, warm, spacious, and not synthy.
- Metronome should cut through clearly on phone speakers even when drone volume is high.
- New controls should only be added when they clearly improve sound or practice usefulness.

## Sound Engine Status

Stable and shippable for app wrapping:

| Area | Status |
|------|--------|
| Moons / preset engines | Complete and tuned — five user-facing Moons; Choir engine retained but not exposed |
| Metronome (Wood / Triangle) | Complete |
| Output routing / mix architecture | Stable |
| Note/register crossfades | Phased lifecycle — guard first, incoming fade to live Breath voicing, continuous Breath phase; note-change swell fixed |
| Moon changes while playing | **Shipped — `fullChainCrossfade` default.** Dual complete chains, equal-power output crossfade (1.5 s), gap fix, resource cleanup, transition snapshot silent settle (Mimas/Europa → Io alignment). Masked fallback stable. Legacy morph bypassed. Small AIR/hiss on some switches (→ Mimas / → Io) — accepted |
| Startup note change | **Shipped** — `pendingStartupNote` queue during async Play; first immediate key tap honored in production |
| Reverb slider | Verified — smooth wetness ramping |
| Triangle open sustain | Verified — 12-player pool |
| Limiter / combined playback | Fixed — post-EQ metronome clip + click attack soften to reduce master limiter pumping |
| Startup click/pop (reverb.ready) | Fixed — await reverb before first output |
| Play fade-in from stopped | 4 s with breath-loop + mood-auxiliary guard |
| Manual Stop fade-out | 3 s with quick initial drop |
| Preset bus EQ (Shruti, Cosmos, Binaural) | Complete — intensity-scaled peaking cuts |
| Shruti High/Very High voicing + stress damping | Complete |
| Unified Intensity control (Tone slider removed) | Complete — warmth/brightness, filter, resonance, low-end |
| Preset/register loudness balance trims | Complete — output staging via `getDroneBalanceTrimDb()` |
| Breath base/effective tonal model + continuity | Complete — 12 s cycle, no bus-EQ modulation; note/register crossfade preserves phase |
| Mood movement layer | Complete — New / Full / Blue / Blood / Super (UI: Phase); Binaural replaces Phase with Beat controls |
| True Orbit / Super dual beats | Complete — dedicated oscillator pairs; dual beats via Tone Lab bus; startup fade guarded |
| Tone Lab (shared bus path incl. Binaural) | Complete — `src/toneLab.js`; no UI editor |
| Projection | Complete — always on; phone-speaker translation with no output gain or limiter change |

### Remaining Open Items

- **Drone + metronome balance on phone speakers** — validate at Master Volume 100% (full/clean cap) with metronome bus at +7 dB.
- **Moon AIR/hiss artifact (minor)** — occasional small clip when switching to airy or clean Moons (especially → Mimas / → Io). Full-chain crossfade, note changes, and crackling are solid; do not treat this as a regression unless a new transition pass makes it worse.

### Regression Watch

Re-check only during wrapper testing or if audio code changes:

- Reverb slider artifacts
- Note-change glide
- Preset transition clicks/pops (Cosmos ↔ others; Binaural ↔ Europa verified fixed)
- Triangle cut-off at fast tempos
- Limiter pumping with drone + metronome
- First Play click/pop (addressed via `reverb.ready` wait)

## Current Engine Shape

- Six standard oscillator layers (indices 0–5): low octave, root, fifth, octave, additional octave up, and quiet upper fifth.
- Additional voices for preset-specific behavior:
  - Index 6: foundation root (Shruti/Cosmos) or Binaural left undertone
  - Index 7: Binaural right undertone
  - Indices 8–10: Cosmos-only upper extensions (celestial, sky root, sky octave)
- Total voice count is 11 (`VOICE_COUNT`).
- Root and top sine layers use sine waves; low octave and main fifth use triangle waves for body.
- The root is voiced as a rounded sine — gentle rather than dominant.
- Intensity is the single tonal-shaping control — warmth/brightness, filter cutoff, resonance/Q, harmonic focus, and low-end weight. UI neutral anchor is 50 (default slider 70); useful range compresses the top 10% of the slider.
- Breath adds slow cyclic movement above and below the Intensity tonal center on a fixed **12-second** cycle. Base state (`applyBaseTonalState`) comes from Intensity only; the breath loop (`syncBreathModulation`) applies an effective offset to filter, voices, and choir mix. Preset bus EQ is not modulated by Breath.
- **Note/register crossfades while playing** use a phased lifecycle: guard and outgoing fade first, incoming fade to the live Breath voicing, then Breath resumes from the same phase (no reset). **Moon/preset changes while playing** ramp tonal state instead of snapping and re-sync Mood after voice transitions.
- Stereo width base is 0.36. Mood may add slow width drift; Intensity and Breath do not directly drive width.
- Reverb slider ramps wetness smoothly; decay and pre-delay are set at graph creation.
- Output uses gain boost (`OUTPUT_BOOST_DB = 7`) and a **master stage** (compressor, optional saturation, makeup, limiter) when master bypass is off. Tone Lab `dynamics` overrides compressor/limiter when enabled.
- Drone bus has a gentle low shelf (−4 dB @ 210 Hz) for phone clarity without scooping tone.
- All Moons pass through **AIR shimmer** and **Tone Lab bus EQ** when their respective `enabled` flags are on (same bus path during live transitions). Binaural skips AIR breath-noise hiss and preset harmonic partials; Mood/Phase layers remain off.
- Shruti, Cosmos, and Binaural add preset-specific peaking cuts on the drone bus (see Preset Bus EQ below).
- Master Volume uses a decibel taper. UI **0–100%** (default 100%); internal cap `maxMasterVolumeNormalized` = 1.0.
- Preset and register **loudness balance trims** (`PRESET_BALANCE_TRIM_DB`, `REGISTER_BALANCE_TRIM_DB`) are summed in `getDroneBalanceTrimDb()` and applied in `applyVolume()` — output staging only, not voice gains.
- Reference tuning (A = 415–445 Hz, default 440) retunes all drone voices in equal temperament.
- True Orbit and Super dual-beat oscillators track key/register/reference A separately. Gain-gated by mood; Play uses 4 s fade-in with voices; dual beats route through Tone Lab bus.

## Output and Mix Philosophy

- Drone and metronome are separate buses summing into one **master stage** (compressor → optional saturation → makeup → limiter). Metronome bypasses compressor/saturation.
- When metronome is active, drone gets a fixed −1.5 dB headroom offset (near-instant, not audible pumping).
- Tone Lab `dynamics.outputTrimDb` and `dynamics.limiterCeilingDb` apply to all Moons when Tone Lab is enabled (including Binaural).
- Metronome audibility comes from presence/click EQ and level, not from carving drone body.
- Metronome soft clipping controls local peaks on the metronome bus only.
- Goal: warm drone body with metronome sitting on top via upper-mid articulation.

## Transition Timing

All values in `TRANSITION_TUNING` (`src/soundTuning.js`).

### Play / Stop

- Play fade-in from stopped: `startFadeSeconds` (**4 s** in `TRANSITION_TUNING`)
- Manual Stop fade-out: `stopFadeSeconds` (**3 s**)
- True Orbit + Super dual beats fade in over the same **4 s** Play window (not the mood loop’s 1.4 s ramp)

### Moon change while playing (default: full-chain crossfade)

All Moon switches while the drone is playing use **`MOON_TRANSITION.mode: 'fullChainCrossfade'`** (persisted in dev via `localStorage` key `moondrone.moonTransitionMode`).

| Step | Behavior |
|------|----------|
| Snapshot | **`captureFullChainTransitionSnapshot()`** — Breath phase, effective tonal, Mood phase, key/register, Intensity, volume, reference A (before outgoing deck freezes) |
| Capture | Entire current chain frozen as **old deck** (voices, filter, EQ, reverb, AIR, orbit, dual beats, `moonTransitionGain`); bloom bus snapped silent; registered as **limbo deck** immediately |
| Rebuild | Brand-new complete chain for the new Moon; new deck gain snapped to 0 |
| Settle | **`settleNewMoonDeckWhileSilent(..., transitionSnapshot)`** — same settled sound as the outgoing deck at capture: preserved Breath/Mood phase (no reanchor when snapshot exists), voice gains at effective tonal (incl. Cosmos 8–10), filter/choir/mood bloom-eclipse/AIR/output trim |
| Ready wait | Old deck stays at **unity** until new reverb `.ready` (max 3 s safety timeout) |
| Crossfade | **Equal-power** ramp old 1→0 and new 0→1 from **one shared `startAt`** over **1.5 s**; **`fullChainCrossfadeVoiceHoldUntil`** blocks breath voice re-ramp until crossfade completes |
| Dispose | Old deck disposed after crossfade + **0.25 s** guard; complete teardown (Strings ensemble, Choir nodes, meter taps, tracked timeouts) |

Tuning: `MOON_TRANSITION.fullChainCrossfade` in `src/soundTuning.js` (`totalSeconds`, `curve`, `disposeGuardSeconds`, `reverbReadyMaxWaitSeconds`, `fastRetireSeconds`).

**Masked fallback** (`moondroneDebug.setMoonTransitionMode('masked')`): fade `moonTransitionGain` down → silent rebuild → fade up (~0.28 s / ~0.55 s). Reverb bloom/tail path is **disabled** (`transitionTail.enabled: false`). Proven stable; use when comparing or if full-chain ever regresses.

**Not used in production:** bridge tone, reverb bloom/tail during Moon change, per-layer moon morph swell, pre-dispose AIR/reverb wet ramps (tried and reverted — made artifacts worse), or **phone-resonance bus EQ / exciter** (tried and fully reverted).

Dev probes: `moondroneDebug.setFullChainCrossfadeDebug(true)` (includes settle-silent / crossfade-start / crossfade-end target probes for Io extensions), `setNoteChangeDebug(true)`, `setMoonTransitionMode(...)`. Full detail in `TECH_NOTES.md`.

### Startup note change

While `start()` is still async (context unlock, `reverb.ready`), key/register taps queue **`pendingStartupNote`** (last wins). The engine flushes before frequency setup and voice scheduling; **`App.jsx`** forwards note taps during startup instead of dropping them. Fixes production builds where the first immediate note change after Play was ignored.

### Note / register crossfade (while playing)

| Phase | Seconds | Notes |
|-------|---------|--------|
| Outgoing fade-out | 0.75 | Linear from held current gain; no tonal reset first |
| Incoming delay | 0.18 | Both notes may overlap briefly (~0.57 s overlap) |
| Incoming fade-in | 0.85 | To the live Breath voicing (current Breath phase preserved) |
| Post-fade pause | 0.08 | Incoming at target before tonal settle |
| Breath resume/sync | 0.45 guard window | Breath loop resumes from the same phase; no hard tonal snap |
| **Guard window total** | **~1.56** | Breath/Intensity blocked for full window |

Breath resumes after the incoming fade without resetting `breathStartTime`. Outgoing voices are disposed shortly after incoming fade completes.

**Note-change swell fix:** `noteCrossfadeEndsAt` is armed for note-only crossfades; each change gets a fresh breath snapshot; register/output trim (`applyVolume`, preset bus EQ) moves at crossfade start so octave changes do not swell at the end.

### Preset layer transitions (stopped or non-rebuild path)

- Preset layer fade-out: 0.6 seconds
- Preset layer fade-in: 0.75 seconds
- Gain-only preset changes: 0.85 seconds
- Preset/stopped changes: `reanchorBreathAfterContextChange()` immediately

**Binaural undertones (indices 6/7).** On layer-transition paths (stopped or non–full-chain): entering Binaural keeps undertones silent through the main ramp then fades in; leaving fades undertones out before repointing to foundation roles. Tone Lab and AIR stay on the shared bus throughout.

### Legacy moon voice-rebuild morph (inactive)

The unified per-layer morph envelope (`MOON_TRANSITION` voice/body/air/aux windows, ~3 s) remains in code for reference and dev isolation probes, but **playing Moon changes no longer use it** — they go through full-chain crossfade (default) or masked simple fade (fallback). Do not re-enable energy normalization, post-morph swell, or the reverted AIR/reverb cleanup pass without careful A/B testing.

### Guard behavior

During note crossfade guard (`noteCrossfadeEndsAt`), breath/intensity voice writers are blocked. **Full-chain Moon changes** pause breath/mood on the old deck at capture and settle the new deck silently — no `presetTransitionEndsAt` morph guard. Legacy morph guard (`presetTransitionEndsAt`) applies only if the morph path is manually re-enabled.

## Pure Preset (Mimas)

- Clean, centered, warm reference tone — not a naked sine.
- Root-centered with gentle harmonic color: −12 warmth, a very subtle fifth (index 2), +12 octave, and a small +24 only above Medium register; no +31 partial.
- High/Very High: Phase harmonic layer trimmed (`PRESET_MOON_PHASE_HARMONICS_GAIN_SCALE`); +12 octave slightly boosted on High/VH; VH root scaled down; air/shimmer reduced on Low.
- Breath slider follows core body layers more strongly than other Moons (`PRESET_BREATH_VOICE_GAIN_SCALE`: indices 0/1/3 ×1.58/1.58/1.65).
- Fixed subtle reverb (no slider).
- Current `voiceGains`: `[0.06, 0.6, 0.009, 0.1, 0.008, 0]`; whole-preset balance trim +0.35 dB; additional High −1 dB / Very High −2 dB register trims.

## Shruti Preset

- Warm and grounded.
- Balanced root and fifth; subtle low octave.
- Low-register foundation root at High and Very High registers (one octave below the −12 body layer).
- Register voicing trims at High/Very High reduce octave body and +24 layer; foundation trimmed at Very High.
- Very High + Intensity ≥ 80: stress damping on filter focus, fifth, foundation, and upper layers (prevents clipping/harsh buildup).
- Preset bus EQ: −1.5 dB @ 430 Hz / −1.2 dB @ 900 Hz (intensity-scaled above 60%).
- Current `voiceGains`: `[0.085, 0.57, 0.29, 0, 0.05, 0]`

## Strings Preset (Titan)

- Small ensemble of sustained cellos and violas — not a synthesizer.
- Low octave, root, and fifth carry the sound; root gain reduced for a less forceful center.
- Custom sine+saw partials, dual oscillators per layer (±1–3 cent detune), slow independent drift.
- Air/shimmer and Phase harmonics trimmed per register; Very High upper bloom layers (indices 3–5) scaled down.
- Breath slider follows core body layers (`STRINGS_TUNING.breathVoiceGainScale`: indices 0/1/3 ×1.44/1.44/1.48).
- Switching to/from Strings rebuilds voices via **full-chain Moon crossfade** while playing (see Moon change while playing above); stopped switches use a normal rebuild.
- Current `voiceGains`: `[0.19, 0.36, 0.10, 0.015, 0.015, 0.01]`; balance trim −0.25 dB; High −1 dB / Very High −1.5 dB register trims.

## Choir Preset

- Vocal, human, singing, resonant, sacred.
- Higher filter Q for formant-like resonance at high Intensity.
- Quieter root layers; preserved upper harmonics.
- Three-voice ensemble per layer with static detune and subtle stereo spread.
- Current `voiceGains`: `[0.045, 0.41, 0.30, 0.25, 0.17, 0.07]`

## Cosmos Preset (Io)

- Vast, floating, infinite, dreamlike.
- Permanent Low-register foundation root; reduced middle root/octave.
- Quiet upper sky extensions for vertical space.
- High-intensity softening on upper layers and filter focus.
- Very High: Phase harmonics trimmed on High/VH; +12 octave body scaled down (`PRESET_REGISTER_VOICE_GAIN_SCALE`).
- Preset bus EQ: −1.0 dB @ 480 Hz / −1.0 dB @ 1050 Hz.
- Current six-layer `voiceGains`: `[0.045, 0.32, 0.19, 0.23, 0.28, 0.14]`
- Extension base gains: celestial `0.048`, sky root `0.03`, sky octave `0.026`
- Switching to/from Cosmos rebuilds voices via **full-chain Moon crossfade** while playing; sky extensions (8–10) are part of the new deck, not a deferred aux morph.

## Binaural Preset

- Designed for headphone listening.
- Standard six-layer stack centered; quiet L/R panned undertones for beat.
- Very High: upper stack and undertones trimmed slightly for headroom (`PRESET_REGISTER_VOICE_GAIN_SCALE`).
- Default mode: Theta at 4 Hz.
- Modes: Delta 2, Theta 4, Alpha 8, Low Beta 12, Beta 16, Gamma 40 Hz.
- Headphones recommendation appears in About/Help only (not under the main Beat control).
- Preset bus EQ: −0.9 dB @ 400 Hz / −1.1 dB @ 880 Hz.
- Current `voiceGains`: `[0.07, 0.53, 0.24, 0.12, 0.055, 0.025]`
- **Tone Lab / AIR:** same bus EQ and output dynamics as other Moons when enabled. No Phase/Mood macros. Undertones snap to gain 0 before oscillator start on Play; live Moon enter/exit uses deferred undertone fades (see Preset transitions above).

## Metronome Sound Notes

- Sample-based: Wood (block high/low) and Triangle (open/closed).
- Runs independently from the drone — can play alone or alongside.
- Default: Wood, 80 BPM, 4/4.
- **Straight (No Accent)** — equal beat level on every beat (no downbeat accent).
- Wood should feel clear and punchy on phone speakers without being painfully sharp.
- Triangle open should ring naturally; closed beats are shorter.
- Triangle open uses a 12-player pool — never restart a playing open sample.
- Metronome chain: trim → presence EQ (+3 dB @ 3.2 kHz) → click EQ (+1.5 dB @ 5 kHz) → soft clip → output gain (+7.5 dB).
- Presence/click EQ helps metronome cut through dense drone without global compression.
- Metronome bus output is +7.5 dB after post-EQ soft clipping for clearer cut-through without ducking or extra compression.
- **Open validation:** drone at 100% Master Volume + metronome on phone speakers — clicks must remain easy to hear.

## Reverb Notes

- Reverb is **fixed** at a subtle background level — no user slider. `FIXED_REVERB_PERCENT = 20` is passed on `start()`; 20% maps through the wetness curve to ~0.09 wet.
- Reverb adds depth without excessive tonal coloration.
- Preset selection does **not** change reverb wetness anymore (the per-preset wet override in `handlePresetChange` was removed). Decay/pre-delay still come from the active preset and are not rebuilt live (intentional).
- `Tone.Reverb` generates its impulse response asynchronously. `start()` awaits `reverb.ready` before oscillators begin, preventing click/pop on first Play or when reverb finishes loading mid-signal.

## Intensity Notes

- Single unified tonal control — not loudness or width.
- Below UI 50: warmer/darker — lower filter cutoff, slight low-end boost on low octave and foundation layers.
- Above UI 50: brighter/more focused — higher filter cutoff, rising resonance/Q, progressive low-end reduction on low octave and foundation layers.
- UI 50 is the neutral anchor for warmth/brightness curves; default slider is 70.
- Useful slider range maps to 0–90% of internal tonal amount; top 10% of the slider is compressed for fine control at high settings.
- At 0: extremely soft, plain, stable.
- At 75–100: rich, focused, singing, non-harsh.
- Root stays gentle and rounded across the full range.
- Cosmos additionally softens upper layers at high Intensity.
- Shruti Very High at Intensity ≥ 80 applies additional stress damping.

## Breath Notes

- Answers: how alive should the drone feel?
- Fixed **12-second** cycle (`BREATH_CYCLE_SECONDS`) moving above and below the Intensity tonal center.
- **Base vs. effective:** Intensity sets the base tonal amount (`getBaseTonalAmount` → `applyBaseTonalState`). Breath adds a cyclic offset (`getBreathModulationOffset` → `getEffectiveTonalAmount` → `syncBreathModulation`). The Breath slider never permanently overwrites Intensity.
- **Continuity after context change:** stopped register/note changes can reset to a clean base state, but **note/register while playing preserves the current Breath phase**. Incoming voices fade to the live Breath voicing; the loop resumes from the same `breathStartTime` instead of restarting.
- **Moon/preset while playing:** shared tonal state ramps instead of snapping; Breath phase is not reset. This prevents the final bright/dull harmonic kick that came from hard filter/EQ snaps during preset changes.
- Whole drone breathes together, including root — filter frequency/Q, voice gains, and choir mix. Preset bus EQ is **not** modulated by Breath.
- Inhale: open, resonant; exhale: grounded, warm, softer root.
- Exhale travels farther into the lower curve than inhale rises.
- At 0: completely still (base tonal state only). At 100: deep expansion/contraction, smooth and calming.
- Never modulates pitch, tremolo, chorus, or obvious effects.

## Loudness Balance Trims

Preset and register trims normalize perceived loudness at the drone output stage (`applyVolume()`). They do not change per-voice gains or limiter architecture.

| Preset | Trim |
|--------|------|
| Pure (Mimas) | +0.35 dB |
| Shruti (Europa) | +0.3 dB |
| Strings (Titan) | −0.25 dB |
| Choir | −1.25 dB |
| Cosmos (Io) | −1.75 dB |
| Binaural | −1.5 dB |

| Register | Trim |
|----------|------|
| Low | +0.25 dB |
| Medium | +0.5 dB |
| High | −2 dB |
| Very High | −2.5 dB |

Combined trim = preset + register + optional `PRESET_REGISTER_BALANCE_TRIM_DB` (Mimas High −1 / VH −2; Titan High −1 / VH −1.5).

### Per-moon spectral and motion trims (2026 balance passes)

These multiply existing layers — they do not change routing or Tone Lab globals.

| Table | Purpose |
|-------|---------|
| `PRESET_AIR_SHIMMER_GAIN_SCALE` | Breath bed, AIR partials, air shelf — Mimas default 0.88 / Low 0.75; Titan default 0.78 / Low 0.68 / VH 0.65 |
| `PRESET_MOON_PHASE_HARMONICS_GAIN_SCALE` | Phase harmonic motion — Mimas 0.65 / High 0.55 / VH 0.48; Titan 0.82 / High 0.70 / VH 0.48; Io VH High 0.9 / VH 0.85 |
| `PRESET_REGISTER_VOICE_GAIN_SCALE` | Targeted per-voice register trims (see preset sections above) |
| `PRESET_BREATH_VOICE_GAIN_SCALE` / `STRINGS_TUNING.breathVoiceGainScale` | Stronger Breath gain follow on Mimas and Titan core body layers only |

## Preset Bus EQ Notes

Preset-specific peaking cuts on the drone bus (after widener, before low shelf). Pure, Strings, and Choir leave these filters at 0 dB.

| Preset | Low-mid | Upper-mid | Scaling |
|--------|---------|-----------|---------|
| Shruti | −1.5 dB @ 430 Hz | −1.2 dB @ 900 Hz | From 0 at Intensity 60% to full at 100% |
| Cosmos | −1.0 dB @ 480 Hz | −1.0 dB @ 1050 Hz | Same |
| Binaural | −0.9 dB @ 400 Hz | −1.1 dB @ 880 Hz | Same |

Goal: narrow spectral cleanup per preset without global loudness reduction or limiter changes.

## Sound Tuning Refactor (Developer Files)

Behavior-preserving organization pass for core numbers; Tone Lab added for macro tuning.

- All core editable sound-design numbers in **`src/soundTuning.js`** with musician-friendly section comments.
- **`src/toneLab.js`** — user-facing tone macros (`TONE_LAB_TUNING`): master bus EQ, harmonics, breath air, moon-phase harmonics, stereo, dynamics. Re-exported from `soundTuning.js`. Binaural shares the Tone Lab bus path; Mood macros remain inactive on Binaural.
- **`PRESET_TRANSITION_DEBUG`**, **`MOON_CHANGE_DEBUG`** in `soundTuning.js` — optional dev console logging (`moondroneDebug.setPresetTransitionDebug`, `setMoonChangeDebug` in dev builds). Harmonic-target tables for Titan→Io / Titan→Europa when `enabled: true`. See `TECH_NOTES.md`.
- `src/presets.js` re-exports preset/Binaural data from the tuning file (UI import path unchanged).
- `src/droneEngine.js` imports tuning values; Tone.js node creation and routing in the engine.
- `src/metronomeSamples.js` reads triangle pool size from `METRONOME_TUNING`.
- **`PRESET_BREATH_VOICE_GAIN_SCALE`** / **`STRINGS_TUNING.breathVoiceGainScale`** — preset-specific Breath gain follow (Mimas, Titan).
- Per-moon trim tables: **`PRESET_REGISTER_BALANCE_TRIM_DB`**, **`PRESET_AIR_SHIMMER_GAIN_SCALE`**, **`PRESET_MOON_PHASE_HARMONICS_GAIN_SCALE`**, **`PRESET_REGISTER_VOICE_GAIN_SCALE`**.
- Mood harmonic tuning in **`src/moods.js`** (`MOOD_TUNING`, `MOOD_TRUE_ORBIT`, `MOOD_DUAL_BEATS`).

**Subjective tuning workflow:** edit `toneLab.js` first for tone/level passes; edit `moods.js` for per-Phase harmonic character; edit `soundTuning.js` for preset balance and engine constants.

## Note/Register Crossfade Breath Continuity

Fixed bright/open surge, post-switch attacks, and Breath phase restarts when changing key or register while playing.

### Problems addressed

| Issue | Cause |
|-------|--------|
| Incoming note surge / Breath restart | Earlier crossfade behavior reset Breath to a fixed reanchor phase and could fade to a target that did not match the live Breath curve |
| Outgoing note attack | Tonal reset (filter/EQ/choir snap) before outgoing fade; register bus EQ applied mid-transition |
| Intermittent double-hit | Rapid note changes left pending timeouts; stale reanchor on wrong voice set |
| Moon transition harmonic kick | `reanchorBreathAfterContextChange()` snapped shared tonal state while playing; Mood re-sync could run before voice replacement |

### Current behavior (phased lifecycle)

1. **Guard + pause Breath** — `noteCrossfadeEndsAt` set immediately (~1.56 s window)
2. **Outgoing fade** — linear 0.75 s from held gain; no tonal updates on outgoing audio
3. **Incoming fade** — 0.18 s delay, 0.85 s fade to live Breath voicing (`getEffectiveTonalAmount()`, phase preserved)
4. **Dispose outgoing** — after incoming fade; register volume trim only
5. **Breath resume/sync** — loop resumes from the same `breathStartTime`; no phase reset
6. **Mood guard** — per-voice mood detune freezes during transition windows; bus-level mood motion continues

Tuning: `TRANSITION_TUNING` and `BREATH_TUNING` in `src/soundTuning.js`. `BREATH_TUNING.reanchorCyclePosition` remains useful for stopped/base resets, not live note/register crossfades.

**Regression-watch:** outgoing bump, incoming attack, rapid key/register taps, register change with Breath ~35, Moon changes with strong Mood/Super active.

---

## Device Testing Notes (App Wrapping Phase)

Primary focus shifts from browser sound tuning to **wrapper and device behavior**:

- Verify drone + metronome balance on phone speakers (remaining open item)
- Verify Tone.js / Web Audio starts reliably from Play tap inside the wrapper
- Test iOS and Android: speaker, headphones, silent mode
- **iOS:** playback continues through background and lock screen; foreground return resumes suspended Web Audio context when needed
- **Android:** background/lock stops playback immediately; UI shows Ready; settings preserved; Play restarts normally
- Confirm metronome scheduling stays stable over extended playback, during iOS background, and after Android lifecycle stop/restart
- Confirm drone plays without glitches during normal app use
- Regression-watch the solved items above if any audio or lifecycle code changes
