# Droon Tech Notes

This file explains the project setup, architecture, and implementation details.

## Project Phase

The sound engine is **stable** — no further sound-engine changes unless explicitly requested. **Capacitor is configured** (see `CAPACITOR.md`). **Premium UI, About/Help, native icon/splash, and app lifecycle safety handler are complete.** Active work is **Capacitor device validation** on real hardware.

## Project Setup

Droon is built with Vite and React.

- Vite runs the local dev server and builds the app.
- React renders the app interface.
- Tone.js handles browser audio synthesis, effects, and sample playback.
- npm package name: `moondrone`

### Version control

Local **git** repository (initialized 2026). Baseline commit and tag:

| Item | Value |
|------|--------|
| Tag | `stable-post-phone-revert` |
| Commit | `e4e01cb` |
| Message | Stable Droon baseline after phone resonance revert |

Restore that snapshot:

```bash
git checkout stable-post-phone-revert
# or
git reset --hard stable-post-phone-revert
```

`.gitignore` excludes `node_modules/`, `dist/`, `.vite/`, env files, editor folders (`.cursor/`, `.idea/`, `.vscode/*` except extensions.json), and Capacitor/Android/iOS build artifacts. Set `user.name` / `user.email` before your first local commit if Git for Windows has no global identity yet.

## Main Files

- `src/App.jsx` — user interface for drone and metronome controls (moon-centered layout, Circle of Fifths key ring, atmosphere state)
- `src/App.css` — moon-centered celestial UI styles (atmosphere layers, moon artwork + glow stack, orbital note ring, compact controls, popovers, active-note glow, info modal)
- `src/atmospheres.js` — atmosphere/theme system (Space / Desert / Forest; per-atmosphere opacity)
- `src/AtmosphereSelector.jsx` — header atmosphere picker (compact popover menu, outside-click/Escape close)
- `src/moonArtwork.js` — per-preset moon PNG paths (`public/moons/`)
- `src/moonVisuals.js` — Moon × Phase CSS variables for glow, rim, halo, bloom, breath, luminance
- `src/PresetSelector.jsx` — compact Moon popover menu (display labels only; internal preset IDs unchanged)
- `src/MoodSelector.jsx` — compact Phase popover menu for non-Binaural Moons (UI label Phase; internal `moodId`)
- `src/moods.js` — Mood definitions/tuning (Bloom, Eclipse, width drift, True Orbit, Super dual beats)
- `src/moonLabels.js` — display labels and descriptions for user-facing Moon language
- `src/MetronomeMenu.jsx` — compact metronome header popover
- `src/InfoModal.jsx` — About and Help modal (tabs, Escape/backdrop close, accessible dialog)
- `src/useAppLifecycle.js` — platform lifecycle handler (`ENABLE_IOS_BACKGROUND_AUDIO`; iOS background playback, Android/web stop-on-hide)
- `src/soundTuning.js` — **single editable sound-design file** (preset voice gains, balance trims, Intensity/Breath/Reverb shaping, output/EQ, metronome tone, `AIR_SHIMMER_TUNING`, `MASTER_TUNING`). `droneEngine.js` imports values; routing stays in the engine.
- `src/toneLab.js` — **Tone Lab macros** (`TONE_LAB_TUNING`): master bus EQ, harmonic/breath/mood-harmonic macros, stereo width, and dynamics. Shared bus path for all Moons including Binaural. Re-exported from `soundTuning.js`. Edit here for subjective tone passes without touching engine routing.
- `src/droneEngine.js` — audio startup, drone playback, metronome scheduling, synthesis, effects, preset transitions, gain staging, Tone Lab wiring, `stopForLifecycle()`
- `src/presets.js` — re-exports preset and Binaural mode data from `soundTuning.js` (backward-compatible import path for UI)
- `src/metronomeSamples.js` — metronome sound modes, meters, sample IDs/URLs, triangle open player pool size

## UI Layout

Single-screen, mobile-first, **moon-centered celestial instrument**. Source: `src/App.jsx`, `src/App.css`. This is a UI/UX reorganization only — the sound engine, presets, routing, and mix are unchanged.

### Atmosphere system

- `src/atmospheres.js` defines three selectable backgrounds: **Space** (default), **Desert**, **Forest**. Manual header selection only — not tied to Moon, Phase, or sound. Append entries to add more without UI changes.
- Images live in `public/atmospheres/` (`space.png`, `desert.png`, `forest.png`), served at `/atmospheres/*`.
- Each atmosphere sets **opacity** only (Space `0.64`, Desert `0.75`, Forest `0.68`). Shared treatment in `App.css`: `background-size: cover`, `brightness(1.15)`, single scrim `rgba(0, 0, 0, 0.10)`.
- Background layers (`.atmosphere-image`, one per atmosphere) crossfade by toggling opacity over **1.8 s**.
- `atmosphereId` state in `App.jsx` persists per session via `sessionStorage` (`moondrone.atmosphere`). Legacy ids `moon` and `sacred-geometry` map to Space.
- `src/AtmosphereSelector.jsx` — header trigger shows active symbol (✦ / ☼ / ❋) + popover menu (closes on outside pointer-down or Escape).

### Minimal header

- No large title/branding text (the moon is the branding); visually hidden `h1` (`id="app-title"`) for accessibility
- Left: `Ready` / `Drone Active` indicator with status dot
- Right: atmosphere selector, compact metronome popover, and `?` About/Help button

### Moon-centered instrument (`.instrument`)

- **Moon orb** (`.moon-orb`) — per-preset PNG artwork (`<img class="moon-artwork">`) with controlled clip/scale crop; CSS glow/halo/phase ring behind and around it; gold play/stop glyph on top. Binaural uses Full phase for visuals (`moonVisuals.js`).
- **Moon × Phase visuals** — `getMoonStageVisualStyle(preset, phase)` sets `--mv-*` CSS variables on `.moon-stage` (Phase ~75%, Moon ~25%).
- **Circle of Fifths ring** (`.note-ring`) — 12-key `radiogroup` orbiting the moon. Active key glows amber; tapping a key while stopped starts the drone.
- **Control deck** (`.control-deck`) — top row Moon | Phase (Beat when Binaural); Register 1×4 row; Intensity, Breath, utilities.
- **Register** (`.register-grid`) — compact 1×4 `radiogroup` (Low/Medium/High/Very High).
- **Moon** (`src/PresetSelector.jsx`) — compact popover menu.
- **Phase** (`src/MoodSelector.jsx`) — compact non-Binaural movement selector. Binaural shows inline Beat `<select>` only (no helper note).
- **Intensity / Breath** — visible primary sliders with gold line icons. Drive audio shaping and moon visual glow/luminance/breathing.
- **Utilities** — Master Volume de-emphasized; Tuning is a compact A=Hz stepper.
- **Metronome** (`src/MetronomeMenu.jsx`) — compact header popover. Beat callbacks trigger moon ripples via `Tone.Draw.schedule`.

### About / Help modal

- Opened from header `?` button; state managed in `App.jsx` (`infoScreen`)
- Tabs switch between About and Help content
- Close via × button, Escape key, or backdrop tap
- Focus moves to close button on open; `document.body` scroll locked while open
- Version read from `package.json` via `InfoModal.jsx`

## User-Facing Controls

### Drone

- Circle of Fifths key selector
- Octave/register selector (1×4 segmented row)
- Moon popover
- Phase popover (non-Binaural only)
- Binaural Beat selector (inline when Binaural is selected; no on-screen helper text)
- Tuning stepper (A = 415–445 Hz, default 440)
- Intensity slider (default 70) — unified tonal control: warmth/brightness, filter cutoff, resonance/Q, harmonic focus, and low-end balance (UI neutral anchor 50)
- Breath slider (default 35)
- Projection is always enabled internally for phone-speaker translation (no UI toggle)
- Reverb: fixed subtle background level, no UI control (`FIXED_REVERB_PERCENT = 20`, passed on `start()`; not changed by preset selection)
- Compact Master Volume slider (0–100% UI, default 100%; internally capped at 0.75 normalized for clean phone output)
- Moon Play / Stop transport

### Metronome

- BPM slider (40–200) in the header popover
- Sound selector (Wood / Triangle)
- Meter selector (2/4–6/4 plus Straight No Accent)
- Play / Stop (independent from drone)

The UI calls the drone engine when the user interacts with any of these controls. Audio logic stays in `droneEngine.js` separate from the interface.

## Voice Model

Standard layers (indices 0–5), intervals relative to selected register:

| Index | Interval | Waveform | Role |
|-------|----------|----------|------|
| 0 | −12 | triangle | Low octave |
| 1 | 0 | sine | Root |
| 2 | +7 | triangle | Fifth |
| 3 | +12 | sine | Octave |
| 4 | +24 | sine | Additional octave |
| 5 | +31 | sine | Upper fifth |

Extension voices:

| Index | Preset | Interval / pitch | Role |
|-------|--------|------------------|------|
| 6 | Shruti | Low-register root | Foundation at High/Very High (below index 0 body layer) |
| 6 | Cosmos | Octave 2, same key | Permanent Low-register foundation above Low register |
| 6 | Binaural | root − beat/2 | Left panned undertone |
| 7 | Binaural | root + beat/2 | Right panned undertone |
| 8 | Cosmos | +36 | Celestial octave |
| 9 | Cosmos | +36 | Sky root (quiet upper extension) |
| 10 | Cosmos | +48 | Sky octave (quiet upper extension) |

`VOICE_COUNT` is 11. Indices 6–10 are silent or unused for presets that do not need them.

Preset-specific behavior:

- **Pure:** indices 0–5 only, standard sine/triangle oscillators
- **Choir:** indices 0–5 with three oscillators per layer (centered main + quieter L/R detuned ensemble), intensity-scaled mix
- **Strings:** indices 0–5 with custom sine+saw partials, dual oscillators per layer, ensemble detune, and slow drift
- **Shruti:** indices 0–5 plus index 6 foundation at High/Very High
- **Cosmos:** indices 0–5 plus index 6 Low-register foundation plus indices 8–10 upper extensions
- **Binaural:** indices 0–5 main stack plus indices 6–7 quiet panned undertones

## Output Routing

Drone and metronome are separate buses that sum into one master limiter. There is **no drone compressor** and **no per-bus limiters**.

### Drone Bus

```
Oscillators
  → per-voice gains
  → per-voice panners (Binaural undertones only)
  → tonal lowpass filter
  → projection dry narrower (StereoWidener; 0.30 always-on, dry only; Binaural exempt at 0.5)
  → reverb
  → stereo widener (base width 0.36 + Mood width drift)
  → mood bloom EQ (high shelf, 1.6 kHz)
  → mood eclipse EQ (moving peaking notch, 700–2300 Hz)
  → projection low-mid cut (peaking; −3.4 dB @ 250 Hz, always on)
  → projection presence ×4 (peaking; +2.0/+2.7/+2.1/+1.5 dB @ 950/1600/2600/3800 Hz)
  → preset low-mid EQ (Shruti / Cosmos / Binaural — peaking cuts, intensity-scaled)
  → preset upper-mid EQ (Shruti / Cosmos / Binaural — peaking cuts, intensity-scaled)
  → drone mid voicing EQ (peaking −0.75 dB @ 440 Hz, Q 0.38 — all presets)
  → AIR shimmer low-mid scoop + air shelf (when `AIR_SHIMMER_TUNING.enabled`; neutral when off)
  → Tone Lab bus EQ (when `TONE_LAB_TUNING.enabled`; neutral when off):
      highpass (lowCutHz) → lowpass (highCutHz) → lowMid peaking (~320 Hz)
      → highMid peaking (~2500 Hz) → air high shelf (~4.2 kHz)
  → drone bus EQ (low shelf −4 dB @ 210 Hz)
  → output volume (user + preset/register trim + AIR high-register trim + Tone Lab dynamics.outputTrimDb)
  → master pre-compressor low shelf
  → master compressor → [soft saturation] → makeup gain → master limiter
  → destination
```

**Additional mood/projection generators:**

```
True Orbit pair (mood-dependent)
  → per-partner gain/pan (0.5 per partner)
  → shared orbit bus gain (gain-gated; × moonPhaseHarmonics.gain)
  → tonal lowpass filter (same downstream path as voices from filter onward)

Super dual-beat pairs (Super mood only)
  → hard-panned L/R pair gains (gain-gated; × moonPhaseHarmonics.gain)
  → dual-beat bus
  → Tone Lab highpass input (joins Tone Lab bus — skips reverb/widener/projection
     so L/R beat stays hard-panned, but still gets Tone Lab EQ + output trim + master stage)
```

**Projection (always on).** Phone-speaker translation is now baseline behavior
(`PROJECTION_TUNING.enabledByDefault = true`) and has no UI toggle. It narrows the
dry body pre-reverb for mono-safe summation (Binaural exempt), trims low-mid waste
via a bus dip and low-layer voice scales (`getProjectionVoiceScale()`), and adds
broad vocal-presence peaks for perceived loudness/clarity. No output-gain,
limiter, or compression change. Ramped by `applyProjectionNodes()`; tuning in
`PROJECTION_TUNING` (`src/soundTuning.js`).

**Mood bus motion.** `moodBloomEq` and `moodEclipseEq` sit post-reverb and
pre-Projection so Bloom/Eclipse affect the full drone+ambience spectrum. Stereo
width drift is folded into `getStereoWidth()`. Per-voice Mood detune freezes
during startup, note/register crossfade, and preset-transition guard windows.
Bloom/Eclipse EQ and stereo width drift continue on the bus during those guards.

**Mood auxiliary layers (True Orbit + Super dual beats).** Orbit and dual-beat
oscillators start once and stay running; audibility is gated only by gain ramps.
They share transition guards with voice gains during startup and note/register
crossfades. During **moon changes while playing**, decorative motion on the **old deck** is frozen when that deck is captured; the **new deck** starts orbit/dual beats during silent settle, then both decks crossfade at output gain only. The legacy per-layer aux morph (`scheduleMoonAuxLayerCrossfade`) is bypassed when `fullChainCrossfade` or masked simple fade handles the Moon change.
snap to **0**, oscillators start, then fade in over `START_FADE_SECONDS` (4 s)
alongside voices.

**Super dual beats.** Super adds two true binaural-style stereo oscillator pairs:
root carrier split by **4 Hz**, and octave carrier split by **7.5 Hz**. They join
the **Tone Lab bus** (not the raw output node) so they receive the same output
trim, Tone Lab EQ, and master stage as the main drone while still skipping
Projection dry-narrowing and reverb (L/R separation preserved). Tuned in
`MOOD_DUAL_BEATS.super` (`beatA.gain` 0.028, `beatB.gain` 0.022). Other moods
do not define dual beats.

**Tone Lab.** When `TONE_LAB_TUNING.enabled`, macros in `src/toneLab.js` shape master
bus EQ, AIR shimmer partials/breath, moon-phase harmonic level/motion/brightness
(non-Binaural moods only), stereo width, and master dynamics for **all Moons**
including Binaural. Binaural-only differences: no Phase/Mood, Beat/undertones,
undertone panning, and projection dry-width exemption — not a separate bus bypass.

### Metronome Bus

```
Sample players (Tone.Player)
  → trim (METRONOME_TRIM_DB)
  → presence EQ (peaking +3 dB @ 3.2 kHz)
  → click EQ (peaking +1.5 dB @ 5 kHz)
  → soft clip (tanh wave shaper, post-EQ)
  → output gain (METRONOME_OUTPUT_DB)
  → master limiter
  → destination
```

Per-click attack: player volume ramps from `METRONOME_ATTACK_SOFTENING_DB` below target to target over 3 ms.

### Combined Behavior

- When metronome starts, drone output receives a fixed `DRONE_METRONOME_HEADROOM_DB` (−1.5 dB) offset via near-instant ramp (0.05 s). One-time level change — not beat-by-beat ducking.
- **Master stage** (when `MASTER_TUNING.masterStageBypassEnabled` is false): drone bus → pre-compressor low shelf → compressor → optional soft saturation → makeup gain → brick-wall limiter. Tone Lab `dynamics.compressorAmount` and `dynamics.limiterCeilingDb` override `MASTER_TUNING` compressor/limiter settings when Tone Lab is enabled (all Moons, including Binaural).
- Metronome bus bypasses compressor/saturation and meets only the final limiter (clicks never pump the drone body).
- Metronome scheduling uses lookahead (0.12 s) with a 25 ms timer interval.

### Remaining Audio Validation

- **Drone + metronome balance on phone speakers** — only major open mix item; may need final level tuning on real devices inside the app wrapper.

## Metronome Implementation

- Samples defined in `src/metronomeSamples.js` and loaded from `public/`.
- Wood mode: `blockHigh` (downbeat), `blockLow` (other beats).
- Triangle mode: `triangleOpen` (downbeat), `triangleClosed` (other beats).
- Triangle open uses a pool of 12 players (`TRIANGLE_OPEN_PLAYER_POOL_SIZE`). Only idle players are used — playing samples are never restarted, so open rings sustain fully.
- If all triangle open players are busy (extreme edge case), that beat is skipped rather than cutting off a ring.
- Wood and triangle closed use single players (short samples, safe to retrigger).
- Meter changes while playing take effect at the next measure boundary.
- **Straight (No Accent)** meter (`METRONOME_STRAIGHT_METER`) — all beats use the regular (non-accent) sample and level.
- Default: Wood sound, 80 BPM, 4/4 meter.

## Sound Tuning (`src/soundTuning.js`)

All musically tweakable numbers live in one file. Edit here in Cursor — no in-app editor.

| Section | What it controls |
|---------|------------------|
| `PRESET_VOICE_GAINS` / `PRESETS` | Per-preset layer balance, filter defaults, default reverb |
| `COSMOS_EXTENSION_GAINS`, `FOUNDATION_ROOT_GAIN`, `SHRUTI_REGISTER_DAMPING` | Extension layers, foundation weight, High/VH Shruti damping |
| `VOICE_LAYER_PRESENCE`, `FOUNDATION_PRESENCE` | How Intensity/Breath scale each harmonic layer |
| `PRESET_BALANCE_TRIM_DB`, `REGISTER_BALANCE_TRIM_DB`, `PRESET_REGISTER_BALANCE_TRIM_DB` | Output loudness matching per preset/register (preset-specific High/VH offsets for Mimas and Titan) |
| `PRESET_AIR_SHIMMER_GAIN_SCALE` | Per-preset breath bed, AIR partials, and air shelf (register overrides for Low/VH) |
| `PRESET_MOON_PHASE_HARMONICS_GAIN_SCALE` | Per-preset Phase/Mood harmonic layer trim (True Orbit, bloom, dual beats, orbit detune) |
| `PRESET_REGISTER_VOICE_GAIN_SCALE` | Per-preset, per-register voice index trims (e.g. Mimas VH root, High/VH +12 ring; Titan VH upper bloom; Io VH +12; Binaural VH stack) |
| `PRESET_BREATH_VOICE_GAIN_SCALE`, `STRINGS_TUNING.breathVoiceGainScale` | Preset-specific Breath gain follow on core body layers (indices 0, 1, 3) via `getPresetBreathVoiceGainScale()` |
| `INTENSITY_TUNING` | Neutral point, filter/Q curves, low-end settling, resonance |
| `BREATH_TUNING` | Cycle speed, depth, exhale asymmetry, motion on voices |
| `REVERB_TUNING` | Wetness mapping curve, decay/preDelay scaling, slider ramp |
| `OUTPUT_TUNING`, `SPEAKER_SAFETY_TUNING` | Master cap, trims, shelf/mid EQ, phone-speaker scales |
| `PROJECTION_TUNING` | Always-on phone-speaker translation (dry narrowing, low-mid cut, presence EQ) |
| `PRESET_BUS_EQ_*` | Shruti/Cosmos/Binaural mid congestion cuts |
| `METRONOME_TUNING` | Click level, EQ, soft clip, downbeat vs regular balance |
| `AIR_SHIMMER_TUNING` | Low-mid scoop, air shelf, preset harmonic partials, breath noise (bus active for all Moons; Binaural skips breath-noise hiss and preset partials) |
| `MASTER_TUNING` | Master compressor, saturation, makeup, limiter ceiling (baseline when Tone Lab off) |
| `TRANSITION_TUNING`, `VOICE_ARCHITECTURE` | **Advanced** — note/register fade timing, Breath continuity/guards; voice indices |
| `MOON_TRANSITION` | **Moon transition modes** — `mode: 'fullChainCrossfade'` (default), `fullChainCrossfade` tuning, `simpleFade` (masked fallback; `transitionTail.enabled: false`). Legacy voice/body/air/aux morph constants retained but bypassed for playing Moon changes |
| `MOON_VOICE_CROSSFADE` | Voice-rebuild index constants; Io extension deferral (no energy normalization, no post-morph) |
| `MOON_AUX_LAYER_CROSSFADE` | Enables curved aux morphs; timing/curve from `MOON_TRANSITION` |
| `MOON_CHANGE_DEBUG` | Dev console diagnostics (harmonic target tables, timeline probes — see below) |

Mood movement tuning lives in `src/moods.js` (`MOOD_TUNING`, `MOOD_TRUE_ORBIT`, `MOOD_DUAL_BEATS`).

**Tone Lab (`src/toneLab.js`)** — user-facing macros (no UI editor):

| Section | What it controls |
|---------|------------------|
| `enabled` | Master bypass for all Tone Lab shaping |
| `masterTone` | Tone Lab bus HPF/LPF, lowMid (~320 Hz), **highMid (~2500 Hz)**, air shelf |
| `harmonicLayer.gain` | AIR shimmer preset harmonic partials only (not mood orbit/dual beats) |
| `moonPhaseHarmonics` | True Orbit level, Super dual beats, bloom EQ swing, orbit cents, gain bloom |
| `breathAir` | Breath-noise level, tone, motion, soft envelope (floor/swell) |
| `stereo.width` | Global stereo width multiplier |
| `dynamics` | `outputTrimDb`, `limiterCeilingDb`, `compressorAmount` (all Moons) |

**Regression check:** after edits, compare Shruti Medium @ Intensity 70 / Volume 100% on phone speakers against git tag **`stable-post-phone-revert`**; verify Play/Stop and drone+metronome for clicks/pumping; verify Binaural ↔ Europa Moon switches while playing (High/Very High); verify Play → immediate note change and Mimas/Europa → Io full-chain crossfade at Intensity ~70 / Breath ~35.

**Dev diagnostics (dev builds only — `window.moondroneDebug` in `src/main.jsx`):**

```js
// Moon transition mode (persisted in localStorage: moondrone.moonTransitionMode)
moondroneDebug.setMoonTransitionMode('fullChainCrossfade') // default — dual complete chains
moondroneDebug.setMoonTransitionMode('masked')             // stable fade-down / rebuild / fade-up

// Full-chain crossfade lifecycle + resource diagnostics
moondroneDebug.setFullChainCrossfadeDebug(true)

// Note/register crossfade probes (swell fix validation)
moondroneDebug.setNoteChangeDebug(true)

// Legacy morph-path probes (only if morph path is manually re-enabled)
moondroneDebug.setMoonChangeDebug({ enabled: true })
moondroneDebug.setPresetTransitionDebug({ enabled: true })

// Titan High/VH air click isolation (Strings register experiments)
moondroneDebug.setStringsHighRegisterAirDebug({ freezeFilters: true })
moondroneDebug.setStringsIsolationMode({ enabled: true, mode: 'principles-only' })
moondroneDebug.setMoonTransitionIsolation({ enabled: true, voicesOnly: true }) // morph-path only
```

Flags live in `src/soundTuning.js` / engine state. Removed or reverted experimental paths: bridge tone, reverb bloom/tail on Moon change, energy normalization, post-morph voice swell, per-layer stagger tables, the **AIR/reverb cleanup pass** (pre-dispose wet ramps, incoming AIR de-click, `fullChainCrossfade.airCleanup` — made artifacts worse; do not re-apply as-is), and the **phone-resonance pass** (parallel exciter / phone bus EQ — fully reverted; not in current `src/`).

## Reference Tuning

The drone uses equal temperament with an adjustable reference A pitch.

- UI range: 415–445 Hz, step 1 Hz, default **440 Hz**
- Stored in `droneEngine.referenceA` via `setReferenceA()`
- All drone voice frequencies derive from MIDI note numbers and the current reference:

```
midiNote = Tone.Frequency(`${key}${octave}`).toMidi()
frequency = referenceA * 2 ** ((midiNote - 69) / 12)
```

- Voice intervals, Shruti foundation, Cosmos extensions, and Binaural undertones all use this calculation
- Binaural beat offset remains in Hz relative to the retuned root (`root ± beatHz / 2`)
- Metronome samples are unaffected
- At 440 Hz, frequencies match the previous fixed A440 behavior
- While playing, tuning changes ramp oscillator frequencies over `TUNING_RAMP_SECONDS` (0.9 s) without rebuilding voices
- Key/register changes still use the existing voice crossfade strategy

## Live Behavior

Verified in the web app. Regression-watch in the app wrapper.

- Tapping a key while stopped starts the drone at that key with the normal fade-in.
- **Startup note intent:** while `start()` is async (`isStarting && !isPlaying`), `setKey()` / `setOctave()` queue `pendingStartupNote` (last wins); `applyPendingStartupNoteIntent()` flushes before frequency setup and voice scheduling. `App.jsx` forwards note taps during startup instead of returning early — fixes production builds ignoring the first immediate note change after Play.
- Key and register changes while playing use a crossfade with no pitch glide and preserve Breath phase (see **Note/Register Crossfade Lifecycle** below).
- **Play from stopped:** voice gains cancel to **0 at `startTime`**, then ramp to target over `START_FADE_SECONDS` (4 s); True Orbit + Super dual beats snap silent, start oscillators, then fade in over the same 4 s window; `startupFadeEndsAt` set before `isPlaying = true`
- **Stop:** `cancelAndHoldAtTime` before reading gain for stop fade (avoids jump when interrupting startup ramp); orbit/dual beats fade out with `neutralizeOrbitPair` / `neutralizeDualBeats`; `noteCrossfadeEndsAt` cleared
- **`rampParam`:** passes optional `startTime` to `rampTo` (fixes scheduled-ramp desync)
- **Voice rebuild while stopped:** `hasStarted = false` so oscillators restart on next Play
- **Stop:** voice gains fade out over `STOP_FADE_SECONDS` (3 s) with a quick initial drop (`STOP_FADE_QUICK_SECONDS` / `STOP_FADE_QUICK_LEVEL`).
- Note and register crossfades: voice fade **~1.78 s** (0.75 s out, 0.18 s delay, 0.85 s in); guard **~1.56 s**. Incoming voices fade to the live Breath voicing, and Breath resumes from the same phase rather than resetting.
- Preset changes while playing use `applyPresetVoiceTransitions()`:
  - **Deactivating layers:** linear fade-out over 0.6s, then frequency update at silence
  - **Activating layers:** set frequency at silence, linear fade-in over 0.75s
  - **Retuning layers:** fade-out → frequency swap → fade-in
  - **Gain-only changes:** ramp over 0.85s
- During preset transitions (~1.35s max), the breath loop skips voice gain updates.
- During startup fade, note crossfade guard window, and preset transition windows, the breath loop and intensity/breath voice-gain ramps skip updates — guards: `startupFadeEndsAt`, `noteCrossfadeEndsAt`, `presetTransitionEndsAt`. **Mood auxiliary layers (True Orbit, Super dual beats) use the same guards** — the mood loop does not re-ramp them until guards clear. Mood per-voice detune also freezes during those windows. Bloom/Eclipse EQ and stereo width drift continue on the bus.
- **Reverb startup:** `start()` awaits `this.reverb.ready` after `ensureSignalChain()` and before oscillators start, preventing click/pop from async impulse-response generation on first Play.
- **Intensity** updates filter cutoff, Q/resonance, harmonic layer balance, and low-end settling via `applyBaseTonalState()` → `getBaseTonalAmount()` (= `getIntensityAmount()`). UI neutral anchor is 50; useful range compresses the top 10% of the slider (`INTENSITY_USEFUL_RANGE = 0.9`).
- **Breath** runs a fixed **12-second** cycle (`BREATH_CYCLE_SECONDS`). Base tonal state comes from Intensity only; `syncBreathModulation()` applies an effective offset (`getEffectiveTonalAmount()`) to filter, voices, and choir mix. Note/register crossfades preserve `breathStartTime`; Moon/preset changes while playing ramp instead of snapping shared tonal state. Preset bus EQ is not modulated by Breath. Breath uses `rampBreathParam()` (not `cancelAndHoldAtTime`).
- **Loudness balance:** `PRESET_BALANCE_TRIM_DB` and `REGISTER_BALANCE_TRIM_DB` sum in `getDroneBalanceTrimDb()` and apply in `applyVolume()` — output staging only.
- Reverb is fixed (no slider): `start()` receives `FIXED_REVERB_PERCENT` (20%) and `handlePresetChange` no longer touches reverb, so wetness stays constant (~0.09 wet) regardless of preset. `applyReverbWet()` still ramps over 1 second on start.
- Master Volume uses a decibel taper. UI shows 0–100% (default 100%). Internal cap is `OUTPUT_TUNING.maxMasterVolumeNormalized` (1.0) with `OUTPUT_BOOST_DB` staging into the master chain.
- Reverb decay and pre-delay are set when the audio graph is created from the active preset; they are not rebuilt live (intentional).
- Projection is always on by default. The old UI toggle/session key was removed.
- Mood applies only to non-Binaural Moons. Super is the only mood with true dual beat pairs; Binaural Moon's own beat controls are separate and unchanged. Tone Lab `moonPhaseHarmonics` scales mood harmonic layers only when Mood is active (never on Binaural).

## Tonal Architecture

Intensity and Breath share one tonal model but use separate update paths so Breath never permanently overwrites Intensity.

| Function | Tonal amount | Updates |
|----------|--------------|---------|
| `applyBaseTonalState()` | `getBaseTonalAmount()` (= `getIntensityAmount()`) | Filter freq/Q, voice gains, choir mix, preset bus EQ |
| `syncBreathModulation()` | `getEffectiveTonalAmount()` (= base + breath offset) | Filter freq/Q, voice gains, choir mix only |
| `reanchorBreathAfterContextChange()` | — | Stopped contexts can reset/snap to base; while playing, tonal state ramps and Breath phase is preserved |
| `beginNoteCrossfadeBreathReanchor()` | — | After note/register crossfade: clear guard and resume the same Breath cycle |

- **Intensity change:** `applyIntensity()` → base state + breath loop start/stop.
- **Breath loop tick:** `syncBreathModulation()` every `BREATH_UPDATE_SECONDS` (0.16 s); uses `rampBreathParam()` to avoid canceling long fades.
- **Register/Moon (stopped):** `reanchorBreathAfterContextChange()` can reset to a clean base state.
- **Note/register while playing:** phased crossfade lifecycle (below) — Breath phase is preserved; incoming voices target live Breath voicing.
- **Moon/preset while playing:** layer transitions own voice gains; shared tonal state ramps; Breath phase is preserved; Mood re-sync runs after voice transition/rebuild.
- **Guard windows:** `canRampVoiceGainsFromBreathOrIntensity()` returns false during startup fade, note crossfade guard (`noteCrossfadeEndsAt`), preset transition, and **`fullChainCrossfadeVoiceHoldUntil`** (breath voice ramps held until full-chain crossfade completes) — breath/intensity voice ramps are skipped so scheduled fades are not interrupted.

## Note/Register Crossfade Lifecycle

Key/register changes while playing call `crossfadeToCurrentPitch()`. Values live in `TRANSITION_TUNING` (`src/soundTuning.js`).

### Timeline (from transition request, `now = 0`)

| Time | Event |
|------|--------|
| **0** | `noteCrossfadeEndsAt` set to end of full guard (~1.56 s); Breath loop paused; outgoing voices start linear fade-out (0.75 s) |
| **0.18 s** | Incoming voices begin fade-in from 0 to the live Breath voicing (current breath offset included) |
| **0.75 s** | Outgoing voice fade-out complete |
| **~1.03 s** | Incoming voice fade-in complete |
| **~1.08 s** | Outgoing voice nodes disposed; register volume trim applied (`applyVolume()`) |
| **~1.11 s** | Guard clears; Breath resumes from the same `breathStartTime` (no phase reset) |
| **~1.56 s** | Guard window has fully elapsed; Breath/Intensity/Mood-detune voice writers are free again |

### Rules

1. **Guard first** — `noteCrossfadeEndsAt` is set before any tonal reset or outgoing fade scheduling.
2. **Outgoing voices frozen** — no Breath, Intensity, filter snap, or bus EQ updates on outgoing audio during the guard window.
3. **Incoming fade** — targets `getVoiceTargetGain(index, getEffectiveTonalAmount())`, so the new note enters at the same point in the Breath cycle.
4. **No filter snap on crossfade** — `snapSharedTonalState()` is not used on note/register crossfade; the Breath loop resumes from the preserved phase after incoming fade completes.
5. **Register changes while playing** — `applyPresetBusEq()` / `applyVolume()` ramp at crossfade **start** (not deferred to reanchor) so register trim matches incoming voices; fixes end-of-crossfade swell on octave changes.
6. **Fresh breath snapshot per note change** — stale pinned phases cannot stack across rapid taps and inflate entry targets.
7. **Rapid changes** — each outgoing voice set carries its **own** dispose timer (`registerOutgoingVoiceSet`), so interrupting a crossfade with another never strands the previous set. Only the breath-reanchor timeout is in `noteCrossfadeTimeoutIds` and cancelled on a new crossfade. This is the fix for the rapid-tap glitch (previously the shared dispose timeout was cleared, orphaning voices → stuck tones + accumulating oscillators).

### Functions

| Function | Role |
|----------|------|
| `crossfadeToCurrentPitch()` | Orchestrates guard, outgoing fade, incoming voices, per-set dispose registration + breath reanchor |
| `rampOutgoingVoiceGain()` | Hold current outgoing gain, linear ramp to 0 |
| `registerOutgoingVoiceSet()` / `removeOutgoingVoiceSet()` | Track a faded-out voice set with its own dispose timer; dispose it (+ re-apply register volume trim) when the timer fires |
| `disposeAllOutgoingVoiceSets()` | Immediately dispose all in-flight outgoing sets (used on lifecycle stop) |
| `beginNoteCrossfadeBreathReanchor()` | Clear guard and resume the preserved Breath cycle after incoming fade |
| `isNoteCrossfadeActive()` | `Tone.now() < noteCrossfadeEndsAt` |

## Moon Transition Modes (while playing)

Moon (preset) changes while the drone is playing route through **`applyPreset()`** → one of two modes selected by `this.moonTransitionMode` (default from `MOON_TRANSITION.mode`, persisted in `localStorage` as `moondrone.moonTransitionMode`).

| Mode | Path | Character |
|------|------|-----------|
| **`fullChainCrossfade`** (default) | `performFullChainMoonCrossfade()` | Two independent complete node graphs; equal-power crossfade at deck output gains only |
| **`masked`** | `performSimpleMoonTransition()` | Single `moonTransitionGain` fade-down → silent rebuild → fade-up; no old/new overlap |

Note/register crossfades (`crossfadeToCurrentPitch`) and stopped preset application are **unchanged** in both modes.

Bridge tone, reverb bloom/tail (`transitionTail.enabled: false`), and pre-dispose AIR/reverb wet cleanup are **not** used.

### Full-chain Moon crossfade (default)

Architecture: duplicate the **entire** current drone chain as a frozen **old deck**, build a **new deck** for the target Moon, crossfade only at **`moonTransitionGain`** (per-deck fade gain into `masterPreLowShelf`). No shared moving bus — each deck is a fully independent graph (voices, filter, EQ, reverb, AIR, orbit, dual beats, output trim).

**Signal routing (conceptual):**

```
old deck:  … → old moonTransitionGain (1 → 0) ─┐
                                              ├→ masterPreLowShelf → master stage → out
new deck:  … → new moonTransitionGain (0 → 1) ─┘
```

**Lifecycle (`performFullChainMoonCrossfade` → `startFullChainCrossfade`):**

1. **`abandonInFlightFullChainTransition()`** — fast-retire any pending old decks from a prior interrupted transition
2. **`captureFullChainTransitionSnapshot()`** — live Breath phase, effective tonal, Mood phase, key/register, Intensity, Master Volume, reference A (before freezing outgoing modulation)
3. **Capture** — `captureCurrentDroneDeck()`; bloom bus snapped silent; outputs disconnected from live meter tap where needed
4. **Limbo register** — old deck pushed to `fullChainCrossfadeDecks` immediately (prevents rapid Moon changes from stranding chains)
5. **Rebuild** — null guarded builders; `ensureSignalChain()` builds fresh `this.*` for new Moon; new `moonTransitionGain` snapped to 0
6. **Settle** — `settleNewMoonDeckWhileSilent(silentTime, snapRamp, transitionSnapshot)` applies the **same settled targets the outgoing deck had at capture**: preserved Breath/Mood phase (no reanchor when snapshot exists), voice gains at `getVoiceTargetGain(index, effectiveTonalAmount)`, filter/choir at effective tonal, mood bloom/eclipse, AIR/shimmer, Tone Lab/output trim, Cosmos extensions 8–10
7. **Ready wait** — old deck stays at **unity** until `newReverb.ready` (max `reverbReadyMaxWaitSeconds`, default 3 s)
8. **Crossfade** — single shared `startAt`; `fullChainCrossfadeVoiceHoldUntil = startAt + totalSeconds + 0.05`; `rampFullChainCrossfade()` equal-power old 1→0, new 0→1 over `totalSeconds` (default **1.5 s**)
9. **Dispose** — after crossfade + `disposeGuardSeconds` (default **0.25 s**), `disposeCrossfadeDeck()` tears down old deck completely (Strings ensemble, Choir nodes, convolvers, timeouts). Breath loop resumes without a corrective voice re-ramp spike after hold clears

**Rapid Moon changes:** `forceRetireAllCrossfadeDecks()` / `fastRetireCrossfadeDeck()` — quick fade gain to 0, then dispose (default **0.08 s** fast retire).

**Tuning** — `MOON_TRANSITION.fullChainCrossfade` in `src/soundTuning.js`:

| Key | Default | Purpose |
|-----|---------|---------|
| `totalSeconds` | 1.5 | Crossfade duration |
| `curve` | `equalPower` | Constant-power blend (or `easeInOutSine`) |
| `centerHeadroomDb` | 0 | Optional midpoint dip if sum swells |
| `disposeGuardSeconds` | 0.25 | Post-crossfade delay before old deck dispose |
| `reverbReadyMaxWaitSeconds` | 3 | Max hold at unity while waiting for new IR |
| `fastRetireSeconds` | 0.08 | Stranded old deck fast fade on supersede |

**Resource / crackling fix:** limbo registration, tracked timeouts (`reverbReadyTimeoutId`, `disposeTimeoutId`, `fastRetireTimeoutId`, probe timeouts), complete `disposeCrossfadeDeck()`, `logFullChainResourceDiagnostics()`, `countFullChainLiveResources()`.

**Known minor artifact:** small AIR/hiss clip on some Moon switches (especially → Mimas / → Io). An AIR/reverb cleanup pass (outgoing wet ramps, incoming AIR de-click, deferred breath) was **reverted** — it made transitions worse. Settled Moon voicing is unchanged.

**Key functions:**

| Function | Role |
|----------|------|
| `performFullChainMoonCrossfade()` | Orchestrates snapshot → capture → rebuild → settle → ready wait → crossfade |
| `captureFullChainTransitionSnapshot()` | Live modulation state from outgoing deck before freeze |
| `captureCurrentDroneDeck()` | Snapshot current chain into old deck object |
| `prepareCapturedCrossfadeDeck()` | Pin old fade gain at 1; snap bloom silent |
| `registerLimboCrossfadeDeck()` | Track old deck before crossfade starts |
| `settleNewMoonDeckWhileSilent()` | Apply settled new-Moon state at gain 0 from optional transition snapshot |
| `logFullChainSettleDiagnostics()` | Dev settle/crossfade target probes (extension gains 8–10, air/mood/output) when debug on |
| `startFullChainCrossfade()` | Shared-start equal-power ramp + voice-hold guard + scheduled dispose |
| `disposeCrossfadeDeck()` | Full teardown of old graph |
| `abandonInFlightFullChainTransition()` | Cancel superseded transition; fast-retire old decks |
| `queueStartupNoteIntent()` / `applyPendingStartupNoteIntent()` | Queue key/register during async `start()`; flush before scheduling |
| `logFullChainProbe()` / `logFullChainResourceDiagnostics()` | Dev lifecycle logging |

### Masked simple Moon transition (fallback)

`performSimpleMoonTransition()` — fade `moonTransitionGain` to trough → `rebuildMoonAtSettledStateWhileSilent()` → fade up. Timing from `MOON_TRANSITION.simpleFade` (~0.28 s out / ~0.55 s in when tail disabled). Reverb bloom/tail path exists in config but **`transitionTail.enabled: false`** — plain masked fade fixed prior swelling; do not re-enable without A/B testing.

Select via `moondroneDebug.setMoonTransitionMode('masked')`.

### Legacy moon voice-rebuild morph (bypassed)

The per-layer morph path (`pendingMoonVoiceRebuildCrossfade`, `scheduleMoonAirIdentityCrossfade`, `scheduleMoonAuxLayerCrossfade`, etc.) remains in `droneEngine.js` for reference and dev isolation, but **`applyPreset()` returns early** for playing Moon changes when either full-chain or masked simple fade is active (current production defaults). The section below documents that morph for historical context only.

## Moon Voice-Rebuild Crossfade (legacy morph — bypassed for playing Moon changes)

Switching to/from **Strings (Titan)**, **Cosmos (Io)**, or **Shruti (Europa)** while playing now uses **full-chain crossfade** (default) or **masked simple fade** (fallback) — not this morph path. This morph applies only if both active Moon modes are disabled and the engine falls through to `rebuildVoicesWhilePlaying()` → `crossfadeToCurrentPitch({ presetChange: true })`.

Architecture is a **single unified envelope** (`MOON_TRANSITION` in `src/soundTuning.js`) — one coordinated gesture, **smoothstep** curve, **no energy normalization**, **no post-morph swell**, **no per-layer stagger delays**.

### Timing windows (current defaults)

| Window | Seconds | What morphs |
|--------|---------|-------------|
| **Voice crossfade** | 2.2 | Main voice gains (indices 0–5): outgoing linear down, incoming smoothstep 0 → `entryTarget` |
| **Body identity** | 2.4 | Output/balance trim, preset + Tone Lab bus EQ, intensity-filter tonal target, projection, voice panning |
| **Air identity** | ~2.2 (voice window) | `airBreathGain`, breath-noise filters, `airShelfEq`, `airLowMidScoop` (freq/Q/gain) — moon-specific `PRESET_AIR_SHIMMER_GAIN_SCALE` |
| **Aux / motion** | 3.2 | Bloom, eclipse, orbit, dual beats; reverb wet; Io sky extensions 8–10 (deferred path) |
| **Guard** | 3.2 + margin | `presetTransitionEndsAt` / `noteCrossfadeEndsAt`; breath loop paused; `canRampVoiceGainsFromBreathOrIntensity()` false |

Gesture should feel **mostly complete within ~3 s**. Steady-state Moon sound unchanged — all caps/slew/overlap compensation are transition-only.

### Voice target planning

`planMoonVoiceCrossfadeEntry()` computes per-voice targets with:

- **`baseTonalAmount`** from breath snapshot (Intensity only — **not** `effectiveTonalAmount`, which includes breath offset and was inflating upper-harmonic `focusAmount` at breath peaks)
- **Breath cycle** from snapshot; if capture was near a swell peak, **`airBreathCyclePosition`** uses the neutral reanchor phase (`BREATH_TUNING.reanchorCyclePosition`) for air and voice breath components
- **`liveTarget`** = `getVoiceTargetGain(index, baseTonalAmount, true, breathCyclePosition)`
- **`entryTarget`** = `liveTarget` (or 0 when Io sky extension deferred)

Incoming voices ramp to `entryTarget` over `voiceCrossfadeSeconds` via `rampPresetCrossfadeEntryGain()` (smoothstep). **Upper harmonics:** indices **3, 4, 5**; Io sky **8, 9, 10** enter on deferred slow morph (see below).

### Layer routing (identity vs atmosphere)

| Category | Params | Window |
|----------|--------|--------|
| **Voice-coupled identity** | Voice gains 0–5, body bus trim/EQ/filter, air breath/shelf/scoop/filters | Voice / body / air windows |
| **Decorative motion** | Bloom, eclipse, orbit, dual beats, reverb ambience | `auxMorphSeconds` |
| **Overlap compensation** | Outgoing body voices **0, 1, 2, 6** fade out faster (`overlapCompensation.bodyVoiceOutgoingFadeScale`) so coherent same-pitch low-mid does not stack under incoming brightness | Outgoing only (no swell) |
| **Delta slew (transition-only)** | Bloom/eclipse/orbit/dual caps; Io sky 8–10 morph to 55% of live then breath loop closes remainder | During guard |

### Io extensions (indices 8–10)

When `deferExtensionsOnCosmosEnter: true`, main crossfade sets `entryTarget = 0`; `scheduleDeferredMoonCrossfadeExtensionGain()` ramps **0 → liveTarget × skyExtensionScale** over `auxMorphSeconds`. Not part of the main voice overlap sum.

### Completion handoff

`completePresetVoiceCrossfade()` is a **pure handoff** — no audible re-ramp:

1. Clears transition flags and snapshots
2. `startBreathLoop()` if Breath active — **does not** call `syncBreathModulation()` here (avoids Io drop / Titan swell after guard clears)
3. `startMoodLoop({ skipInitialSync: true })` when mood phase was carried over — reads values already at morph endpoints

No `beginMoonVoiceCrossfadePostMorph()`, no `beginNoteCrossfadeBreathReanchor()` on this path.

### Guard behavior (voice-rebuild)

During `presetTransitionEndsAt`:

- `canRampVoiceGainsFromBreathOrIntensity()` false — scheduled voice fades are not interrupted
- `canRampMoodAuxiliaryLayers()` false until guard clears (orbit/dual owned by aux morph scheduler)
- `applyAirBreathNoiseModulation()` skipped while `isMoonAuxLayerCrossfadeActive()`
- `applyBaseTonalState()` blocked by `isTonalBusTransitionGuarded()` — body/bus morphs owned by `applyPreset()` + aux scheduler
- Breath loop **paused** at crossfade start; phase **pinned** at capture (`captureMoonTransitionBreathSnapshot()`)

### Functions

| Function | Role |
|----------|------|
| `captureMoonTransitionBreathSnapshot()` | Breath phase, base/effective tonal amounts, outgoing voice/air gains; pause + pin phase |
| `planMoonVoiceCrossfadeEntry()` | Per-voice `liveTarget` / `entryTarget` from base tonal + breath phase |
| `scheduleMoonAirIdentityCrossfade()` | Air breath gain, noise filters, shelf, scoop on voice-coupled window |
| `scheduleMoonAuxLayerCrossfade()` | Bloom/eclipse/orbit/dual on aux window |
| `scheduleDeferredMoonCrossfadeExtensionGain()` | Io sky voices 8–10 |
| `getMoonTransitionVoicePlanningTonalAmount()` | `baseTonalAmount` for voice planning |
| `completePresetVoiceCrossfade()` | Clear guards; resume breath/mood loops |
| `logMoonHarmonicVoiceTransitionProbe()` | Dev table: indices 3–5, 8–10 targets at plan/complete |

### Tuning workflow

Edit `MOON_TRANSITION` in `src/soundTuning.js` (windows, `overlapCompensation`, `deltaSlew`, `airIdentity`). Use `moondroneDebug.setMoonChangeDebug({ enabled: true })` and compare **`entryTargetGain` vs `settledLiveTarget`** in harmonic-target logs. Regression: Titan ↔ Io and Titan ↔ Europa at Breath 35–70%, Intensity 70+, High/Very High.

## Gain Staging

### Drone

| Constant | Value | Purpose |
|----------|-------|---------|
| `OUTPUT_BOOST_DB` | 7 | Master volume boost range (into master stage) |
| `MIN_VOLUME_DB` | −40 | Master volume floor |
| `MAX_MASTER_VOLUME_NORMALIZED` | 1.0 | Engine volume cap at UI 100% |
| `DRONE_OUTPUT_TRIM_DB` | −2 | Fixed drone bus trim before master stage |
| `DRONE_BASS_SHELF_FREQUENCY` | 210 Hz | Phone clarity — gentle low cleanup |
| `DRONE_BASS_SHELF_GAIN_DB` | −4 | Low shelf cut |
| `DRONE_MID_VOICING_EQ_FREQUENCY` | 440 Hz | Ambient-style wide mid voicing cut (all presets) |
| `DRONE_MID_VOICING_EQ_Q` | 0.38 | Wide Q — gentle, not scooped |
| `DRONE_MID_VOICING_EQ_GAIN_DB` | −0.75 | Shallow mid congestion trim |
| Projection low-mid cut | −3.4 dB @ 250 Hz | Always-on phone-speaker decongestion |
| Projection presence EQ | +2.0/+2.7/+2.1/+1.5 dB @ 950/1600/2600/3800 Hz | Always-on clarity / perceived projection |
| `AMBIENT_BODY_VOICING_SCALE` | 0.92–0.96 | Body layers indices 0–3 |
| `DRONE_BASS_SHELF_Q` | 0.7 | Low shelf Q |
| `DRONE_METRONOME_HEADROOM_DB` | −1.5 | Fixed drone offset when metronome active |
| `PRESET_BALANCE_TRIM_DB` | per preset | Output loudness trim |
| `REGISTER_BALANCE_TRIM_DB` | per register | Output loudness trim |
| Tone Lab `dynamics.outputTrimDb` | see `toneLab.js` | Final trim before master (all Moons) |
| Tone Lab `dynamics.limiterCeilingDb` | see `toneLab.js` | Master limiter ceiling (all Moons) |
| `SPEAKER_UPPER_HARMONIC_SCALE` | High/Very High | Scales indices 3–5 for phone-friendly upper stack |
| `SPEAKER_COSMOS_EXTENSION_SCALE` | High 0.8 / VH 0.62 | Scales Cosmos indices 8–10 |
| `SPEAKER_CHOIR_UPPER_HARMONIC_MULTIPLIER` | High 0.9 / VH 0.82 | Extra Choir upper-harmonic trim |
| `SPEAKER_STRINGS_UPPER_HARMONIC_MULTIPLIER` | High 0.92 / VH 0.84 | Extra Strings upper-harmonic trim |
| `MASTER_TUNING.ceilingDb` | −1.5 | Baseline limiter when Tone Lab off |
| Binaural undertone gain | 0.07 | Pan ±0.52 |
| Super dual beat A/B gains | 0.028 / 0.022 | Hard-panned; Super only; × `moonPhaseHarmonics.gain` |
| True Orbit mood gain | 0.037–0.105 | Mood-dependent; × `moonPhaseHarmonics.gain` |
| Foundation root multiplier | 0.58 | × preset root gain |
| `SPEAKER_LOW_LAYER_SCALE_BY_REGISTER` | Low 0.8, Medium 0.9 | Scales indices 0, 2, and foundation for phone efficiency |

### Metronome

| Constant | Value | Purpose |
|----------|-------|---------|
| `METRONOME_TRIM_DB` | −7 | Input trim |
| `METRONOME_OUTPUT_DB` | +7.5 | Bus output gain |
| `METRONOME_ATTACK_SOFTENING_DB` | −5 | Click attack starts this far below target |
| `METRONOME_ATTACK_RAMP_SECONDS` | 0.003 | Attack ramp duration |
| `METRONOME_SOFT_CLIP_DRIVE` | 2.1 | Post-EQ tanh clip drive |
| `METRONOME_SOFT_CLIP_SCALE` | 0.72 | Post-EQ tanh clip output scale |
| `METRONOME_ACCENT_DB` | 0 | Downbeat level offset |
| `METRONOME_REGULAR_DB` | −4 | Other beat level offset |
| `METRONOME_PRESENCE_FREQUENCY` | 3200 Hz | Upper-mid presence boost |
| `METRONOME_PRESENCE_GAIN_DB` | +3 | Presence boost amount |
| `METRONOME_CLICK_FREQUENCY` | 5000 Hz | Click/attack articulation |
| `METRONOME_CLICK_GAIN_DB` | +1.5 | Click boost amount |
| Soft clip curve | `tanh(2.1) × 0.72` | Post-EQ peak control on metronome bus |

## Binaural Implementation

- Main drone layers 0–5 play as a centered warm stack.
- Indices 6 and 7 are quiet triangle undertones panned left and right (`BINAURAL_UNDERTONE_GAIN` 0.07, pan ±0.52).
- Each undertone is offset by half the selected beat frequency from the root.
- Beat modes defined in `src/presets.js` (`BINAURAL_MODES`). Default: Theta at 4 Hz.
- `setBinauralBeatHz()` updates undertone frequencies when mode changes.
- Preset bus EQ profile: −0.9 dB @ 400 Hz / −1.1 dB @ 880 Hz.
- **Tone Lab / AIR:** same bus EQ and output dynamics path as other Moons when enabled. Mood/Phase macros remain off.
- **Live Moon transitions:** undertone voices (indices 6/7) use deferred enter/exit handling — silent through main preset ramp on enter, then fade in; immediate fade-out on leave before repointing to Shruti/Cosmos foundation roles. Main bus (Tone Lab + AIR) stays on the shared path throughout (fixes Europa ↔ Binaural pops).
- **Startup:** undertone oscillators snap to gain 0 before `oscillator.start()`; Play fade uses the same `START_FADE_SECONDS` as other voices. Super dual-beat oscillators also start on Play but remain at pairGain 0 on Binaural.

## Mood Implementation

- `src/moods.js` defines `MOODS`, `MOOD_TUNING`, `MOOD_TRUE_ORBIT`, and `MOOD_DUAL_BEATS`.
- Mood applies only when the active Moon is not Binaural (`isMoodActive()`); Binaural's beat controls replace Mood.
- `startMoodLoop()` runs on a slow `requestAnimationFrame` cadence and calls `syncMoodModulation()`.
- Per-voice Mood detune is skipped during startup, note/register crossfades, and preset transitions so it cannot fight scheduled fades/retunes.
- Bloom/Eclipse are bus EQs (`moodBloomEq`, `moodEclipseEq`) so they work across sparse Moons as well as dense ones. Bloom swing and eclipse depth scale with Tone Lab `moonPhaseHarmonics.gain` / `motionDepth` / `brightness` when Tone Lab is active.
- True Orbit is a dedicated symmetric oscillator pair routed into the tonal lowpass path. Bus level scales with `moonPhaseHarmonics.gain`. Super orbit gain: 0.078; Full 0.037; Blue 0.054; Blood 0.105; New: none.
- Super dual beats: two stereo pairs routed into the **Tone Lab bus** (see Output Routing). Levels scale with `moonPhaseHarmonics.gain`. Tuned gains: beatA 0.028, beatB 0.022.
- Orbit and dual-beat oscillators start once and remain running; audibility is controlled by gain ramps only. On Play: snap silent → start oscillators → 4 s fade-in with voices. Stop/lifecycle: fade or snap silent.

## Shruti Implementation

- Index 6 foundation root at High and Very High registers (Low register — oct 2; one octave below index 0 at High).
- Register voicing trims reduce octave body (indices 0/3) and +24 layer (index 4) at High/Very High; foundation trimmed at Very High.
- Very High + Intensity ≥ 80: stress damping on filter focus, fifth, foundation, and upper layers.
- Preset bus EQ profile: −1.5 dB @ 430 Hz / −1.2 dB @ 900 Hz (scaled by intensity above 60% and register).

## Preset Bus EQ

Shared filter pair (`presetLowMidEq`, `presetUpperMidEq`) after widener, before low shelf. Profiles in `PRESET_BUS_EQ_PROFILES`:

| Preset | Low-mid cut | Upper-mid cut |
|--------|-------------|---------------|
| Shruti | −1.5 dB @ 430 Hz | −1.2 dB @ 900 Hz |
| Cosmos | −1.0 dB @ 480 Hz | −1.0 dB @ 1050 Hz |
| Binaural | −0.9 dB @ 400 Hz | −1.1 dB @ 880 Hz |

Cuts scale from 0 at Intensity 60% to full at 100%. Pure, Strings, and Choir bypass preset bus EQ (filters remain in chain at 0 dB).

## Cosmos Implementation

- `usesCosmosConstantRoot()` enables index 6 at octave 2 for all registers except Low.
- Indices 8–10 use `getCosmosExtensionGain()` with quiet base gains and high-intensity softening.
- Middle root/octave preset gains are reduced relative to earlier Cosmos voicing.
- Preset bus EQ profile: −1.0 dB @ 480 Hz / −1.0 dB @ 1050 Hz.

## Strings Implementation

- Custom partial oscillators: sine fundamental plus descending saw harmonics (body 9%, mid 6%, upper 4%).
- Two oscillators per layer, detuned ±1–3 cents.
- `scheduleStringsDrift()`: ±0.7 cent drift over 22–38 s ramps, 12–28 s pauses.
- Switching to/from Strings triggers voice-rebuild crossfade.

## Choir Implementation

> Choir was removed from the user-facing preset list. The engine code below is retained (harmless) but not selectable in the UI.

- Three oscillators per layer: centered main plus L/R detuned ensemble at ±1–3 cents.
- Side voices ~11–18% each; subtle pan ±0.16; intensity-scaled bloom.
- Switching to/from Choir triggers voice-rebuild crossfade.

## Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `START_FADE_SECONDS` | see `TRANSITION_TUNING` | Play fade-in from stopped |
| `STOP_FADE_SECONDS` | see `TRANSITION_TUNING` | Manual Stop fade-out |
| `STOP_FADE_QUICK_SECONDS` | 0.35 | Initial quick drop at Stop start |
| `STOP_FADE_QUICK_LEVEL` | 0.42 | Gain multiplier after quick drop |
| `NOTE_FADE_OUT_SECONDS` | 0.75 | Outgoing note/register fade-out |
| `NOTE_FADE_IN_DELAY_SECONDS` | 0.18 | Gap before incoming fade starts |
| `NOTE_FADE_IN_SECONDS` | 0.85 | Incoming note/register fade-in |
| `BREATH_REANCHOR_DELAY_SECONDS` | 0.08 | Pause after incoming fade before tonal settle |
| `BREATH_REANCHOR_RAMP_SECONDS` | 0.45 | Ramp filter/EQ/choir to base before Breath resumes |
| `INTENSITY_RAMP_SECONDS` | 1.25 | Intensity/filter ramps |
| `PRESET_LAYER_FADE_OUT_SECONDS` | 0.6 | Preset layer deactivation |
| `PRESET_LAYER_FADE_IN_SECONDS` | 0.75 | Preset layer activation |
| `PRESET_GAIN_RAMP_SECONDS` | 0.85 | Preset gain-only changes |
| `BREATH_CYCLE_SECONDS` | 12 | Full breath cycle |
| `BREATH_UPDATE_SECONDS` | 0.16 | Breath loop tick interval |
| `BREATH_OFFSET_DEPTH` | 0.44 | Max tonal offset from Breath slider |
| `INTENSITY_NEUTRAL_UI` | 50 | UI anchor for warmth/brightness curves |
| `INTENSITY_USEFUL_RANGE` | 0.9 | Compresses top 10% of slider |
| `DEFAULT_INTENSITY` | 70 | Default Intensity slider |
| `DEFAULT_BREATH` | 35 | Default Breath slider |
| `DEFAULT_METRONOME_BPM` | 80 | Default metronome BPM |
| `DEFAULT_PRESET` | Shruti | Default preset on load |
| `DEFAULT_REFERENCE_A_HZ` | 440 | Default tuning reference |
| `TUNING_RAMP_SECONDS` | 0.9 | Live tuning change ramp |

## Mobile Audio Notes

Mobile browsers require a user tap before sound can start.

Audio startup happens from Play button tap (drone or metronome). Tone.js must be started before creating or starting audio nodes.

If the browser audio context is suspended, the app resumes it before playing (`resumeContextIfNeeded()` in `start()` and `startMetronome()`).

On iPhone, silent mode can mute browser Web Audio. If audio looks like it is running but no sound is heard, check the silent switch or silent mode setting.

## App Lifecycle

Implemented in `src/useAppLifecycle.js` (wired from `App.jsx`). Constant: `ENABLE_IOS_BACKGROUND_AUDIO = true`. Does not change sound design, presets, routing, or manual Stop fade timing.

### Platform behavior

**iOS (native) — background audio required**

When the app backgrounds or the device locks while playback is active:

1. Drone and metronome **keep playing** (requires `UIBackgroundModes: audio` in `ios/App/App/Info.plist`)
2. UI remains **Drone Active** if it was playing before background
3. On foreground return, `resumeAudioContextForLifecycle()` wakes a suspended Web Audio context when needed

**Android and web — stop on background**

When the app backgrounds, locks, or the page hides:

1. `droneEngine.stopForLifecycle()` runs immediately
2. Metronome timer stops; Breath/Mood loops and Strings drift stop
3. All drone voice gains cancel scheduled ramps and go to 0 instantly; orbit/dual-beat gains snap silent
4. UI syncs to **Ready** — `isPlaying` and `isMetronomePlaying` become false
5. User settings (key, register, preset, tuning, sliders) are preserved

On foreground/resume (Android/web): nothing auto-starts. User must tap Play again.

### Triggers

| Event | iOS | Android / web |
|-------|-----|---------------|
| `document.visibilitychange` when hidden | Continue playback | Stop |
| `window.pagehide` | Continue (no stop listener) | Stop |
| `@capacitor/app` `appStateChange` when inactive | Continue playback | Stop |
| Foreground / `isActive === true` | Resume suspended context if playing | N/A (already stopped) |

### `stopForLifecycle()` vs `stop()`

| Method | Use | Fade |
|--------|-----|------|
| `stop()` | User taps Stop | 3 s voice fade-out (quick initial drop) |
| `stopForLifecycle()` | Android/web background interruption | Immediate gain to 0 |

Both leave oscillators and the signal chain intact so the next Play can use the normal **4 s** startup fade (`START_FADE_SECONDS`).

### Device validation still required

Confirm on real hardware:

- **iOS:** playback continues through background and lock screen; foreground return has no stuck/silent context; lock-screen controls behave as expected
- **Android:** clean stop on background/lock, Ready UI on return, no metronome burst, normal Play restart

## Capacitor Wrapper (Active)

**Wrapper:** Capacitor 8 — see `CAPACITOR.md` for commands and platform requirements.

| Setting | Value |
|---------|-------|
| Config | `capacitor.config.json` |
| App name | Droon |
| App ID | `com.droon.app` |
| `webDir` | `dist` (matches `vite.config.js` `build.outDir`) |
| Android project | `android/` |
| iOS project | `ios/` |

### npm Scripts

- `cap:sync` — `npm run build && npx cap sync`
- `cap:assets` — regenerate native icon/splash from `assets/branding/` via `scripts/generate-cap-assets.mjs`
- `cap:copy` — copy web assets only
- `cap:open:android` / `cap:open:ios` — open native IDE
- `cap:run:android` / `cap:run:ios` — build, sync, and open

### Branding Assets

Source images in `assets/branding/`:

- `moondrone-icon.png` (1024×1024) — icon source
- `moondrone-splash-master.png` (2732×2732) — splash source
- `moondrone-splash-phone-ratio.png` — reference only

`@capacitor/assets` generates into `android/app/src/main/res/` and `ios/App/App/Assets.xcassets/`. Background color: `#090807`.

### Workflow

Develop in the browser with `npm run dev`. When testing in a native shell, run `npm run cap:sync` then open the platform project. The sound engine preset/mix architecture is unchanged by the wrapper; lifecycle behavior is handled in `useAppLifecycle.js` (iOS background audio vs Android/web stop-on-hide).

### Remaining Device Validation

- **Native icon/splash on device** — clean-rebuild and verify home-screen icon and launch splash
- **Web Audio in native shell** — confirm `Tone.start()` and context resume work on first Play tap in iOS and Android WebViews
- **Drone + metronome balance** — only major open audio item; test on phone speakers inside the wrapper
- **Audio session / silent mode** — test speaker, headphones, and silent switch
- **App lifecycle** — handler implemented; verify iOS background/lock-screen playback and Android stop-on-background on device
- **Long-running playback** — metronome scheduling and drone stability
- **Distribution target** — TestFlight / internal vs. public App Store

Do not reopen sound-engine architecture unless wrapper testing exposes a specific regression.
