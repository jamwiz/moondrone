# Drune Project State

Use this file to refresh context for another agent or chat window.

## Current Phase

**App-store readiness (device validation)** — sound engine, premium UI, About/Help, native icon/splash, and lifecycle safety handler are complete.

Capacitor is configured (`CAPACITOR.md`). Branding sources are in `assets/branding/`; native icons and splash screens are generated via `npm run cap:assets`. App lifecycle safety is implemented (`useAppLifecycle.js`, `droneEngine.stopForLifecycle()`). Remaining work: Capacitor device validation on real hardware. Do not change the sound engine unless explicitly requested.

## UI Layout (Current)

Single-screen, mobile-first, **moon-centered celestial instrument**. Source: `src/App.jsx`, `src/App.css`. The sound engine is untouched by this redesign — only the interface was reorganized.

### Atmosphere system

- `src/atmospheres.js` — three selectable backgrounds: **Space** (default), **Desert**, **Forest**. Manual header selection only; not tied to Moon, Phase, or sound.
- Images in `public/atmospheres/` (`space.png`, `desert.png`, `forest.png`). Legacy stored ids `moon` and `sacred-geometry` resolve to Space.
- Per-atmosphere **opacity** only (Space `0.64`, Desert `0.75`, Forest `0.68`). Shared `brightness(1.15)` and a single scrim (`rgba(0, 0, 0, 0.10)`) in `App.css`.
- Background layers crossfade over **1.8 s** opacity transition.
- Selection persists per session via `sessionStorage` (`moondrone.atmosphere`).
- `src/AtmosphereSelector.jsx` — header trigger shows the active atmosphere symbol (✦ / ☼ / ❋) + popover menu.

### Minimal header

- No large title or branding text (the moon is the branding); visually hidden `h1` for accessibility
- Left: `Ready` / `Drone Active` indicator with status dot
- Right: atmosphere selector, compact metronome popover (Play highlighted when stopped; Stop subdued while playing), and `?` About/Help button (`src/InfoModal.jsx`)

### Moon-centered instrument (`.instrument`)

- **Moon centerpiece / transport** (`.moon-orb`) — the moon itself is the only drone Play / Stop control. Per-preset PNG artwork (`src/moonArtwork.js`, `public/moons/`) with a controlled clip/scale crop; gold play/stop glyph on top.
- **Moon × Phase visuals** (`src/moonVisuals.js`) — Phase ~75% identity, Moon ~25% influence on glow, rim, halo, bloom, breath, and luminance CSS variables on `.moon-stage`. Binaural uses Full phase for visuals.
- **CSS glow stack** — `.moon-orb-glow` (gold halo), `.moon-phase-glow` (colored phase ring behind artwork), `.moon-light-field` / `.moon-haze` / `.moon-pulse` on the stage. No corrective overlay layers on the PNG.
- **Circle of Fifths key ring** (`.note-ring`) — 12 chromatic keys orbiting the moon. Active note glows amber. Tapping a key while stopped starts the drone.
- **Control deck** (`.control-deck`) — top row **Moon | Phase** (Beat when Binaural); second row **Register** (1×4 segmented control); then Intensity, Breath, Master Volume, and Tuning.
- **Moon** (`src/PresetSelector.jsx`) — compact popover (Mimas/Europa/Titan/Io/Binaural display labels; internal preset IDs unchanged).
- **Phase** (`src/MoodSelector.jsx`, `src/moods.js`) — compact non-Binaural movement selector: New, Full, Blue, Blood, Super. Binaural replaces Phase with an inline Beat `<select>` only.
- **Intensity / Breath** — visible primary sliders; also drive moon glow, rim, luminance, and breathing visuals.
- **Utilities** — Master Volume de-emphasized; Tuning is a compact A=Hz stepper.
- **Metronome** (`src/MetronomeMenu.jsx`) — compact header popover. Play/Stop styling inverted for clarity (stopped = active/highlighted, playing = inactive/subdued). Beat callbacks trigger moon ripples via `Tone.Draw.schedule`.

### About / Help

- Modal overlay opened from header `?` button
- Tabs: About (tagline, description, version, headphones note) and Help (getting started, controls, tuning, presets, metronome, binaural, troubleshooting)
- Close via × button, Escape key, or backdrop tap
- Source: `src/InfoModal.jsx`

## Current Features

### Drone

- Circle of Fifths key selector (12 chromatic keys)
- Register selector with Low, Medium, High, and Very High options in a 1×4 segmented row
- Tuning stepper (A = 415–445 Hz, default 440) — retunes all drone voices in equal temperament
- Moon popover with Mimas, Europa, Titan, Io, and Binaural (display labels; internal IDs remain Pure/Shruti/Strings/Cosmos/Binaural)
- Phase popover for non-Binaural Moons: New, Full, Blue, Blood, Super
- Binaural Beat selector (inline when Binaural is selected; no on-screen helper text)
- Moon Play / Stop control (only transport for the drone)
- Intensity slider (default 70) — unified tonal control: warmth/brightness, filter cutoff, resonance, harmonic focus, and low-end balance (UI neutral anchor 50)
- Breath slider (default 35)
- Projection is always enabled internally for phone-speaker clarity; no UI toggle
- Reverb is fixed internally at a subtle background level (no user slider)
- Compact Master Volume utility slider (0–100% UI, default 100%; internally capped for clean phone output)
- Continuous multi-layer drone voice (six standard layers plus preset-specific extension voices)
- Tapping a key while stopped starts the drone with the normal fade-in (**4 s**)

### Metronome

- Independent Play / Stop (runs alongside or without the drone)
- BPM slider (40–200, default 80)
- Sound selector: Wood or Triangle (sample-based)
- Meter selector: 2/4, 3/4, 4/4, 5/4, 6/4, and **Straight (No Accent)** (default 4/4)
- Wood: block high (downbeat) / block low (other beats)
- Triangle: open (downbeat) / closed (other beats)
- Triangle open uses a 12-player pool so sustained rings are not cut off by later beats
- Moon visualization: one subtle radial ripple per metronome beat while the metronome is active

## App Lifecycle (Current)

Platform behavior (`src/useAppLifecycle.js`, `ENABLE_IOS_BACKGROUND_AUDIO = true`):

**iOS (native):**

- Drone and metronome **continue** during background and lock screen (`UIBackgroundModes: audio` in `ios/App/App/Info.plist`)
- On foreground return while playback was active, the app calls `droneEngine.resumeAudioContextForLifecycle()` to wake a suspended Web Audio context
- UI stays **Drone Active** while backgrounded if playback was running

**Android and web:**

- On background, lock, or page hide: `droneEngine.stopForLifecycle()` runs immediately
- Drone voice gains go to 0; metronome timer stops; breath loop and Strings drift stop
- UI syncs to **Ready**; settings preserved; user taps Play again

Triggers: `document.visibilitychange` (hidden), `window.pagehide` (non-iOS background path), and `@capacitor/app` `appStateChange` when `isActive === false` (Android stop path).

- Manual **Stop** uses a **3 s** fade with a quick initial drop. Lifecycle stop (Android/web) is immediate to avoid suspended-context resume glitches.

## Sound Engine Status

The web sound engine is in a **stable, shippable state**:

- **Moons / preset engines** — Mimas/Pure, Europa/Shruti, Titan/Strings, Io/Cosmos, and Binaural are implemented and tuned (Choir engine code remains but is not user-selectable). Per-moon balance tables in `soundTuning.js`: output/register trims, air/shimmer scale, Phase harmonic scale, per-register voice scales, and preset-specific Breath gain follow (Mimas + Titan)
- **Metronome** — sample-based Wood and Triangle with independent transport
- **Output routing** — single master limiter; no drone compressor or per-bus limiters
- **Transitions** — note/register phased crossfades preserve Breath phase (note-change swell fixed: guard armed, fresh breath snapshot, register trim at crossfade start). **Moon changes while playing** use **`fullChainCrossfade`** by default: dual complete independent chains, equal-power output crossfade (**1.5 s**), old deck held at unity until new reverb `.ready`, shared ramp start, limbo registration + complete old-deck disposal (crackling/resource leak fixed). **Silent settle** captures a live transition snapshot (Breath phase, effective tonal, Mood phase) and applies full settled targets before crossfade — fixes Mimas/Europa → Io hot entry; **`fullChainCrossfadeVoiceHoldUntil`** holds breath voice ramps during crossfade. Stable **`masked`** fallback (fade-down → silent rebuild → fade-up; reverb bloom/tail disabled). Legacy per-layer moon morph code retained but bypassed in both active modes. Small AIR/hiss clip on some Moon switches (especially → Mimas / → Io) is a known, accepted artifact — AIR/reverb cleanup and **phone-resonance** passes were tried and fully reverted
- **Startup** — 4 s Play fade-in from stopped; True Orbit + Super dual beats fade in over the same window; breath/mood-auxiliary loops guarded during startup (`startupFadeEndsAt`). **Startup note intent:** `pendingStartupNote` queues key/register during async `start()`; last request wins and flushes before voice scheduling — first immediate note change after Play is honored in production builds
- **Tone Lab** — `src/toneLab.js` macros for master EQ, harmonics, breath air, moon-phase harmonics, and dynamics (no UI editor); shared bus path for all Moons including Binaural
- **Reverb** — fixed subtle background level (`FIXED_REVERB_PERCENT` 20% → ~0.09 wet), set on start and not changed by preset selection; `await reverb.ready` before first audible output (prevents click/pop on startup)
- **Mix architecture** — drone and metronome buses, headroom offset, presence/click EQ on metronome
- **Mood engine** — non-Binaural movement layer with bloom/eclipse EQ, stereo drift, per-voice detune, True Orbit pair, and Super-only true dual beats
- **Projection** — always-on phone-speaker translation via low-mid decongestion, presence EQ, and mono-safe dry narrowing (Binaural exempt)

### Remaining Audio Item

- **Drone + metronome balance on phone speakers** — validate at Master Volume 100% (UI full = internal clean cap) with metronome bus at +7 dB.

### Regression Watch (not open issues)

Re-check these only during wrapper testing or if audio code changes:

- Note-change crossfade / pitch glide — no glide; no swell at crossfade end; rapid key taps fixed (per-set dispose timers)
- **Startup note change** — Play then immediate key tap honors the first switch (`pendingStartupNote` / `queueStartupNoteIntent` in engine; `App.jsx` forwards note taps during `isStarting`)
- Moon full-chain crossfade — no gap (old audible until new ready), no midpoint swell, no crackling on rapid Moon changes, old decks disposed cleanly; **Mimas/Europa → Io** should not enter hot then settle (transition snapshot + silent settle alignment)
- Moon AIR/hiss artifact — small clip especially → Mimas (Pure) and → Io (Cosmos); do not re-apply the reverted AIR/reverb cleanup pass without a lighter approach
- Masked Moon fallback — still stable if switched via `moondroneDebug.setMoonTransitionMode('masked')`
- Preset transition smoothing (Binaural ↔ Europa undertone path; layer transitions when stopped)
- Triangle open sample cut-off at faster tempos
- Limiter pumping with drone + metronome — addressed via post-EQ metronome clip + click attack soften; verify on device
- First-Play click/pop (addressed via `reverb.ready` wait)
- Background during crossfade — unlikely edge case; verify on device if lifecycle code changes

## Architecture

- React + Vite + Tone.js
- npm package name: `moondrone`
- Mobile-first single-screen web UI with a moon-centered instrument
- **Git** — local repository at project root; baseline tag **`stable-post-phone-revert`** (`e4e01cb`) captures post–phone-resonance-revert state plus startup-note and full-chain Io settle fixes. Restore with `git checkout stable-post-phone-revert` or `git reset --hard stable-post-phone-revert`

## Source Files

- `src/App.jsx` — UI and control state for drone and metronome (moon-centered layout, Circle of Fifths ring, compact control deck, atmosphere state)
- `src/App.css` — moon-centered celestial UI styles (atmosphere layers, moon artwork + glow stack, orbital note ring, compact controls, popovers, info modal)
- `src/atmospheres.js` — atmosphere definitions (opacity per background; shared scrim/brightness in CSS)
- `src/AtmosphereSelector.jsx` — header atmosphere picker (compact popover menu)
- `src/moonArtwork.js` — preset → moon PNG path mapping
- `src/moonVisuals.js` — Moon × Phase CSS custom properties for glow/rim/halo/luminance
- `src/PresetSelector.jsx` — compact Moon popover menu (display labels only)
- `src/MoodSelector.jsx` — compact Phase popover menu for non-Binaural Moons (internal `moodId`)
- `src/moods.js` — Mood definitions and tuning (bloom/eclipse/orbit/dual beats)
- `src/MetronomeMenu.jsx` — compact metronome header popover
- `src/InfoModal.jsx` — About and Help modal content and behavior
- `src/useAppLifecycle.js` — platform lifecycle handler (iOS background audio; Android/web stop-on-hide)
- `src/droneEngine.js` — Tone.js audio engine: drone voices, metronome scheduling, gain staging, effects, preset transitions, `stopForLifecycle()`
- `src/soundTuning.js` — centralized sound-design parameters (presets, trims, Intensity/Breath/Reverb, output/EQ, metronome)
- `src/presets.js` — re-exports preset and Binaural data from `soundTuning.js`
- `src/metronomeSamples.js` — metronome sound modes, meters, sample URLs, triangle open pool size
- `scripts/generate-cap-assets.mjs` — copies branding sources and runs `@capacitor/assets` generation

## Drone Voice Model

- Standard voice stack (indices 0–5): low octave (−12), root (0), fifth (+7), octave (+12), additional octave (+24), upper fifth (+31)
- Index 6: foundation/extension slot — Shruti register foundation at High/Very High, Cosmos permanent Low-register root above Low register, or Binaural left undertone
- Index 7: Binaural right undertone (Binaural preset only)
- Indices 8–10: Cosmos-only upper extensions — celestial octave (+36), sky root (+36), sky octave (+48)
- `VOICE_COUNT` is 11
- Strings: sine+saw custom partials, dual-voice ensemble detuning (±1–3 cents), slow independent pitch drift on layers 0–5
- Choir (engine code retained, not user-selectable): three-voice ensemble per layer (static ±1–3 cent detune, subtle stereo spread, intensity-scaled bloom)
- Shruti/Europa: Low-register foundation root at High and Very High registers
- Cosmos: constant Low-register foundation root, reduced middle root/octave balance, three quiet upper sky layers
- Binaural: full main stack on layers 0–5 plus quiet left/right panned undertones on indices 6–7

## Output Routing

Both drone and metronome sum into a **single master limiter** at −0.5 dB. There is no drone compressor and no per-bus limiters.

**Drone bus:**

```
voices → tonal LP → projection dry-narrower → reverb → widener / mood EQ / projection EQ
  → preset low-mid EQ (Shruti / Cosmos / Binaural only)
  → preset upper-mid EQ (Shruti / Cosmos / Binaural only)
  → mid voicing EQ → low shelf (−4 dB @ 210 Hz)
  → output volume (DRONE_OUTPUT_TRIM_DB = −2, plus preset/register balance trim)
  → master limiter → destination
```

True Orbit routes into the tonal lowpass path. Super-only dual-beat pairs route directly to the drone output so their L/R headphone split stays intact.

**Metronome bus:**

```
sample players → trim (−7 dB) → presence EQ (+3 dB @ 3.2 kHz)
  → click EQ (+1.5 dB @ 5 kHz) → soft clip → output gain (+7.5 dB)
  → master limiter → destination
```

When the metronome is playing, the drone receives a fixed −1.5 dB headroom offset (near-instant ramp, not slow ducking).

## Sound and Mix Notes

- Default preset: Shruti. Default Binaural mode: Theta at 4 Hz. Headphones note lives in About/Help only (not on the main Beat control).
- **Intensity** is the single tonal control — warmth/brightness, filter cutoff, resonance, harmonic emphasis, and low-end balance. UI neutral anchor is 50 (default slider 70).
- **Breath** adds slow cyclic movement above and below the Intensity tonal center on a fixed **12-second** cycle. Base tonal state comes from Intensity only; Breath modulates filter, voices, and choir mix via an effective offset. **Note/register crossfades while playing preserve Breath phase** and fade incoming voices to the live breath voicing, so Breath does not restart or jump.
- **Phase** (internal: Mood) is separate from Moon: New/Full/Blue/Blood/Super shape slow movement for non-Binaural Moons. Super adds two true headphone beat layers (4 Hz root carrier, 7.5 Hz octave carrier).
- Preset and register **loudness balance trims** normalize perceived level across combinations without changing voice gains or limiter architecture.
- Transition timing: note/register crossfade **0.75 / 0.18 / 0.85 s** voice fades, **~1.56 s** guard; **Moon (playing):** `fullChainCrossfade` **1.5 s** equal-power + **0.25 s** dispose guard (default), or masked **~0.28 s** out / **~0.55 s** in; preset layer transitions **0.6–0.85 s**; Play/Stop fades in `TRANSITION_TUNING`. Tuning: `MOON_TRANSITION.fullChainCrossfade` and `MOON_TRANSITION.simpleFade` in `soundTuning.js`.
- Master Volume uses a decibel taper (`OUTPUT_BOOST_DB = 17`, `MIN_VOLUME_DB = −42`).
- Metronome audibility is achieved primarily through presence/click EQ and level, not by carving drone tone.

## Branding Assets

Source images in `assets/branding/`:

| File | Purpose |
|------|---------|
| `moondrone-icon.png` | App icon source (1024×1024) |
| `moondrone-splash-icon-transparent.png` | Android 12+ splash icon (transparent on `#090807`) |
| `moondrone-splash-master.png` | iOS splash source only (2732×2732) |
| `moondrone-splash-phone-ratio.png` | Alternate/reference only (not used for generation) |

Regenerate native icon/splash: `npm run cap:assets` then `npm run cap:sync`.

## Current Priority

**App-store readiness remaining items:** Capacitor device validation on real iOS/Android hardware (including lifecycle handler verification). Sound engine, UI, About/Help, native icon/splash, and lifecycle safety handler are complete.

## Before Making Changes

Read `VISION.md` first. Treat `TECH_NOTES.md` and `SOUND_NOTES.md` as references for engine behavior. Use `TODO.md` for the active task list. Compare audio regressions against git tag **`stable-post-phone-revert`** when tuning the engine.
