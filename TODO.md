# Moondrone TODO

Actionable tasks for the **app-store readiness** phase.

Sound engine and premium UI layout are **complete** — do not change presets, routing, or mix unless explicitly requested.

## Completed — Sound Engine

- [x] Core drone presets, metronome, routing, transitions, reverb, mix architecture
- [x] Reference tuning (A = 415–445 Hz)
- [x] Master Volume internal cap — UI shows 0–100% (default 100%), maps to 0.75 normalized at full
- [x] Metronome bus output +7 dB for clearer cut-through
- [x] Startup click/pop fix — await `reverb.ready` before first audible output
- [x] Play fade-in from stopped — **4 s** with breath-loop guard (`startupFadeEndsAt`)
- [x] Per-moon balance tuning (2026) — Mimas, Titan, Io, Binaural preset-specific trim tables and Breath gain follow

## Completed — Premium UI Refactor

- [x] Compact status-only header (Ready / Drone Active indicator + Atmosphere, Metronome, and `?` buttons)
- [x] Single-screen moon-centered instrument
- [x] Moon is the only drone Play / Stop transport (secondary Stop removed)
- [x] Circle of Fifths key ring replaces the older chromatic grid
- [x] Register selector converted to compact 1×4 segmented row
- [x] Moon selector converted to compact popover menu
- [x] Binaural Beat selector visible inline when Binaural is selected (no on-screen helper note)
- [x] Metronome popover Play/Stop styling — Play highlighted when stopped; Stop subdued while playing
- [x] Tuning converted to compact A=Hz stepper
- [x] Master Volume reduced to secondary utility control
- [x] Moon artwork PNGs + CSS glow/rim/phase ring polish with Intensity, Breath, startup bloom, and metronome beat ripples
- [x] Premium transport disc integrated into the moon
- [x] Visual spacing polish for current single-screen layout
- [x] Desert atmosphere readability polish (opacity `0.75`)

## Completed — Atmosphere, Moon Artwork, and Phase UI

- [x] Atmosphere system: Space (default), Desert, Forest — manual header selection; per-atmosphere opacity; shared brightness/scrim; 1.8 s crossfade
- [x] Per-preset moon PNG artwork (`public/moons/`, `src/moonArtwork.js`) with CSS glow/phase ring (`src/moonVisuals.js`)
- [x] User-facing **Phase** label (internal `moodId` / `MoodSelector` unchanged)
- [x] Control deck layout: Moon | Phase top row; Register 1×4 second row
- [x] Removed on-screen Binaural headphones helper text
- [x] Gold line icons added to Intensity and Breath
- [x] Layout, spacing, typography, and control hierarchy polish
- [x] Tabular-nums on slider value readouts
- [x] Mobile scroll fix (`place-items: safe center`)
- [x] Accessible buttons, radiogroups, popovers, and modal controls

## Completed — About / Help

- [x] About screen (app name, tagline, version, headphones note) — `src/InfoModal.jsx`
- [x] Help screen (getting started, controls, tuning, presets, metronome, binaural, troubleshooting)
- [x] Modal opened from header `?` button; Escape and backdrop close; accessible tabs

## Completed — Branding / Native Assets

- [x] Organize source assets in `assets/branding/` (`moondrone-icon.png`, `moondrone-splash-master.png`, phone-ratio reference)
- [x] Install `@capacitor/assets` and add `npm run cap:assets` script
- [x] Generate iOS app icons and splash screens
- [x] Generate Android app icons and splash screens

## Completed — Intensity Merge, Loudness Balance, and Breath Fix

- [x] **Tone slider removed** — useful filter-cutoff behavior merged into Intensity (UI neutral anchor 50, default 70)
- [x] **Intensity** is the single tonal control — warmth/brightness, filter cutoff, resonance/Q, harmonic focus, and low-end weight
- [x] **Preset loudness trims** (`PRESET_BALANCE_TRIM_DB`) — Pure +1.5, Shruti 0, Strings −0.5, Choir −1.5, Cosmos −2, Binaural −0.5 dB on drone output
- [x] **Register loudness trims** (`REGISTER_BALANCE_TRIM_DB`) — Low +1, Medium 0, High −0.75, Very High −1.25 dB on drone output
- [x] **Breath regression fix** — base tonal state from Intensity only; Breath adds cyclic offset via `syncBreathModulation()`; preset/stopped reanchor via `reanchorBreathAfterContextChange()`; note/register crossfade uses phased guard + deferred Breath reanchor
- [x] **Breath cycle** — 12 s (`BREATH_CYCLE_SECONDS`); bus EQ not modulated by Breath
- [x] **Straight (No Accent)** metronome meter — equal beat level, no downbeat accent
- [x] Manual **Stop** fade **3 s** (`STOP_FADE_SECONDS`) with quick initial drop; lifecycle stop remains immediate

## Completed — Preset Spectral Refinement

- [x] Shruti register voicing trims at High/Very High (octave body, +24 layer, foundation)
- [x] Shruti Very High + high Intensity stress damping (filter focus, fifth, foundation, upper layers)
- [x] Preset-specific drone bus EQ profiles (`PRESET_BUS_EQ_PROFILES`) — Shruti, Cosmos, Binaural
- [x] Shruti bus EQ: −1.5 dB @ 430 Hz / −1.2 dB @ 900 Hz (intensity/register scaled)
- [x] Cosmos bus EQ: −1.0 dB @ 480 Hz / −1.0 dB @ 1050 Hz
- [x] Binaural bus EQ: −0.9 dB @ 400 Hz / −1.1 dB @ 880 Hz

## Completed — App Lifecycle Safety

- [x] Pre-device audit of background/foreground and Web Audio suspension risks
- [x] `droneEngine.stopForLifecycle()` — immediate drone/metronome stop (not the 2 s manual Stop fade)
- [x] `src/useAppLifecycle.js` — platform lifecycle handler wired from `App.jsx` (`ENABLE_IOS_BACKGROUND_AUDIO`)
- [x] `@capacitor/app` — native `appStateChange` listener
- [x] **iOS:** continue playback during background/lock screen; foreground Web Audio context resume when needed
- [x] **Android/web:** stop on background; sync UI to Ready; preserve settings; user taps Play again

## Completed — Cleanup + iPhone Speaker Pass

- [x] Remove Choir from the user-facing preset list (engine code retained, not exposed)
- [x] Remove Reverb slider; fix reverb at a subtle background level (`FIXED_REVERB_PERCENT` 20%), not overridden by preset selection
- [x] Fix rapid note/key-switch glitch — per-set dispose timers (`registerOutgoingVoiceSet`) so interrupted crossfades cannot orphan voices
- [x] Pure voicing — gentle harmonic color (−12 + small +12), no longer a naked sine; balance trim 1.65 → 1.35 dB
- [x] Strings high-end softened (filter 5000 → 4200 Hz, saw mid/upper trim, upper-harmonic multiplier 0.88/0.80)
- [x] Enlarge Circle-of-Fifths note buttons (52/50/44 px); verified no overflow + 12 notes visible 320–430 px

## Completed — Moon, Mood, Projection, and Transition Cleanup

- [x] User-facing Preset language updated to **Moon**; display labels are Mimas, Europa, Titan, Io, and Binaural (internal preset IDs unchanged)
- [x] Phase selector added for non-Binaural Moons (UI label; internal `MoodSelector` / `moodId`); Binaural shows Beat controls instead
- [x] Current Phase list: New, Full, Blue, Blood, Super
- [x] Super added as the brightest/radiant Mood with strong bloom, clean True Orbit, and Super-only true dual beats
- [x] True Orbit implemented as a dedicated symmetric oscillator pair for moods that use it
- [x] Super-only true dual beats implemented with two stereo beat pairs (4 Hz root carrier and 7.5 Hz octave carrier)
- [x] Projection button removed; Projection is always enabled internally
- [x] Projection tuning strengthened for phone-speaker clarity/presence without master-gain or limiter changes
- [x] Full transition glitch pass: note/register changes preserve Breath phase; Moon changes avoid hard tonal snaps and stale mood writes; Binaural ↔ Europa pop fixed via shared Tone Lab/AIR bus path and deferred undertone fades

## Completed — Full-Chain Moon Crossfade (current default)

- [x] **`fullChainCrossfade`** as default Moon transition while playing — dual complete independent chains, equal-power output crossfade (1.5 s)
- [x] Gap fix — old deck held at unity until new reverb `.ready`; both ramps share one `startAt`
- [x] **Masked** fallback stable (`setMoonTransitionMode('masked')`); reverb bloom/tail disabled
- [x] Note-change swell fix — `noteCrossfadeEndsAt` on note crossfades, fresh breath snapshot, register trim at crossfade start
- [x] Resource/crackling fix — limbo registration, complete `disposeCrossfadeDeck()`, tracked timeouts, fast-retire on supersede
- [x] Dev diagnostics — `setFullChainCrossfadeDebug`, `setNoteChangeDebug`, mode persisted in `localStorage`
- [x] AIR/reverb cleanup pass **reverted** (made artifacts worse); small AIR/hiss on some Moon switches accepted as known minor artifact
- [x] Phone-resonance tuning pass **fully reverted** (no phone bus EQ / exciter remnants in `src/`)

## Completed — Production Glitch Fixes (2026)

- [x] **Startup note intent** — first key/register change during async Play is queued (`pendingStartupNote`) and flushed before voice scheduling; `App.jsx` forwards note taps during startup
- [x] **Full-chain Io settle alignment** — `captureFullChainTransitionSnapshot()` + silent settle with preserved Breath/Mood phase, effective tonal voice targets, mood/air/bus EQ; `fullChainCrossfadeVoiceHoldUntil` during crossfade (fixes Mimas/Europa → Io hot entry then settle)

## Completed — Version Control

- [x] Local git repository initialized
- [x] `.gitignore` for Vite + React + Capacitor (excludes `node_modules/`, `dist/`, build caches, env files, `.cursor/`)
- [x] Baseline commit **`e4e01cb`** with tag **`stable-post-phone-revert`**

## Dev Tooling

- [ ] Dev output meter: run `npm run dev -- --host` or `npm run preview -- --host`, press Play, tap **Meter**, verify Peak/Hold/RMS/bars/spectrum
- [ ] Loudness calibration: use **Dev output gain** slider to find target Peak Hold (−3 to −1 dB), note Prod trim + Dev gain = Effective, then apply offset to `finalOutputTrimDb` in `toneLab.js` manually
- [ ] Confirm production build (`npm run build` + `npm run preview`) does **not** show the Meter control or dev gain

## App-Store Readiness (Active)

- [ ] Review safe areas and current one-screen moon layout on small phones in Capacitor WebView
- [ ] Ensure visual consistency in Capacitor WebView (iOS and Android)
- [ ] After `npm run build`, confirm required web assets are present in `dist/` (see `CAPACITOR.md` — iOS packaging checklist)
- [ ] Verify native icon and splash on real devices after clean native rebuild

## Capacitor / Device Validation (Parallel)

- [x] Capacitor setup (`android/`, `ios/`, npm scripts)
- [ ] Verify Tone.js / Web Audio startup on first Play tap inside wrapper
- [ ] Verify iOS and Android audio behavior (speaker, headphones, silent mode)
- [ ] Verify **iOS** lifecycle: playback continues through background and lock screen; foreground return resumes suspended Web Audio context; no stuck/silent audio
- [ ] Verify **Android** lifecycle: background/lock stops cleanly, return shows Ready, Play restarts normally
- [ ] Confirm metronome scheduling stable in wrapper (including iOS background and Android lifecycle stop/restart)
- [ ] Decide distribution target: TestFlight / internal vs. public App Store

## Audio Validation (Listening Tests)

- [ ] Verify Master Volume 100% is loud but not clipped/strained (drone only)
- [ ] Verify drone + metronome balance at Master Volume 100% (metronome clearly audible)
- [ ] Verify no beat-by-beat limiter pumping with drone + metronome at 100%
- [ ] Verify Wood punchier and Triangle open still rings naturally after metronome bump
- [ ] Verify reference tuning across keys, registers, presets, and Binaural beat modes
- [ ] Verify **4 s** Play fade-in from stopped feels gentle and complete (no breath-loop interruption during startup guard)
- [ ] Verify **Play → immediate note change** honors the first key tap (production build)
- [ ] Verify Breath stays continuous after note/register/Moon changes (no restart, stuck bright/dull jump, or end-of-crossfade swell)
- [ ] Verify **full-chain Moon crossfade** — smooth overlap, no gap, no crackling on rapid Moon changes, old decks disposed; **Mimas/Europa → Io** at Intensity ~70 / Breath ~35 should not enter hot then settle
- [ ] Moon AIR/hiss — minor artifact on some switches (→ Mimas / → Io); confirm it has not regressed vs. current baseline

## Regression Watch (only if audio or lifecycle code changes)

- [ ] Background during note/preset crossfade — no stuck notes or resume blast
- [ ] Rapid note/key taps — no stuck tones, clicks, or CPU/audio overload (per-set outgoing dispose timers)
- [ ] Note/register changes — no pitch glide; no outgoing attack or incoming surge (crossfade guard + continuous Breath phase)
- [ ] Note/register/Moon changes — Breath remains continuous (no phase reset; no filter snap during crossfade)
- [ ] Moon changes — no click, pop, swell, crackling, or stranded old decks; masked fallback still works if selected
- [ ] Triangle open — full sustain at 80+ BPM
- [ ] First Play from stopped — no click/pop
