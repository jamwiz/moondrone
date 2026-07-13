# Moondrone Roadmap

This roadmap tracks the main phases for Moondrone.

## Completed: Mobile-First Practice Instrument (Web)

The core web app is built and the sound engine is complete.

- Key and register selectors
- Continuous drone playback with five user-facing Moons (Mimas, Europa, Titan, Io, Binaural; internal sound IDs unchanged)
- Mood movement system for non-Binaural Moons (New, Full, Blue, Blood, Super) — UI label **Phase**
- Binaural preset with selectable beat modes; headphones note in About/Help only
- Sound controls: intensity, breath, reverb, master volume
- Sample-based metronome (Wood / Triangle, BPM 40–200, meters 2/4–6/4 plus Straight No Accent)
- Reliable mobile browser audio startup
- Multi-layer drone voice with preset-specific extensions (11 voices total)
- Single master limiter output routing (no drone compressor, no per-bus limiters)
- Smooth note, register, and Moon transitions
- Simple single-screen mobile UI

## Completed Sound Work

- Sample-based metronome (Wood and Triangle, independent transport)
- Output routing refactor: single master limiter, removed drone compressor and per-bus limiters
- Phone loudness and mix refinement (drone bass shelf, metronome presence/click EQ, metronome level)
- Metronome audibility tuning without damaging drone tone (presence at 3.2 kHz and 5 kHz rather than heavy drone EQ cuts)
- Triangle open player pool (12 voices) for full sustain without cut-off
- Cosmos vertical space revision (reduced middle root/octave, added sky layers)
- Choir root balance revision (quieter roots, preserved harmonics)
- Preset transition smoothing (ramped layer activation/deactivation and retuning)
- Binaural revision (main drone stack plus quiet panned undertones)
- Rebrand from Jam Drone to Moondrone
- Reverb slider behavior, note/register crossfades, limiter pumping — resolved in web app; watch during regression only
- Startup click/pop fix — await `reverb.ready` before first audible output
- Play fade-in from stopped — **4 s** with breath-loop guard (`startupFadeEndsAt`)
- Manual Stop fade — **3 s** with quick initial drop; lifecycle stop remains immediate
- Unified Intensity control — warmth/brightness, filter cutoff, resonance, and low-end balance (UI neutral anchor 50; default 70)
- Preset and register loudness balance trims on drone output (not voice gains)
- Breath regression fix — base vs. effective tonal model, 12 s cycle, reanchor on register/preset/crossfade changes
- Mood system — bloom/eclipse EQ, stereo drift, True Orbit, and Super-only true dual beats
- Always-on Projection — phone-speaker translation via low-mid decongestion, presence support, and mono-safe dry narrowing
- Transition cleanup — note/register changes preserve Breath phase; Moon changes avoid hard tonal snaps and stale mood writes
- Straight (No Accent) metronome meter
- Shruti register voicing, Very High stress damping, and preset bus EQ
- Cosmos and Binaural preset-specific bus EQ profiles

## Completed: Capacitor Setup

**Capacitor is configured** — see `CAPACITOR.md`. App ID `com.moondrone.app`, `webDir` `dist`, `android/` and `ios/` projects added.

## Completed: Premium UI Refactor

Main screen refactored for app-store readiness:

- Compact status-only header (Ready / Drone Active + `?` button — no large title or waveform)
- Single-screen moon-centered instrument
- Moon is the only drone Play / Stop transport
- Circle of Fifths key ring replaces the older chromatic grid
- Register, Moon, Phase, Intensity, Breath, Master Volume, and Tuning fit in a compact control deck
- Moon, Phase, and Metronome use compact popovers; Binaural Beat selector appears inline when selected
- Active-note amber glow and moon visual feedback while playing
- Premium spacing, typography, and mobile scroll behavior
- Tabular-nums on slider value readouts
- Accessible buttons, radiogroups, and popovers

## Completed: Moondrone V2 — Moon-Centered Interface

UI/UX redesign into a celestial instrument (sound engine untouched):

- Atmosphere/theme system (`src/atmospheres.js`) — Space (default), Desert, Forest; manual header selection; per-atmosphere opacity; 1.8 s crossfade; per-session persistence (`src/AtmosphereSelector.jsx`)
- Moon centerpiece is the transport control, with per-preset PNG artwork and CSS glow/phase ring
- CSS moon glow/halo/phase ring with startup bloom, Moon × Phase visuals, Intensity response, Breath breathing, and beat-synchronized metronome ripples
- Circle of Fifths key ring replacing the 3×4 grid
- Compact 1×4 Register row; Moon popover; Phase popover (Beat inline for Binaural)
- Intensity and Breath remain visible as primary shaping controls; Master Volume and Tuning are compact utilities
- Metronome moved to a compact header popover
- Minimal header (status + atmosphere + Help); no large title/branding
- Accessibility, lifecycle, modal, metronome, binaural, and tuning behavior preserved

## Completed: Cleanup + iPhone Speaker Pass

Focused pass — no routing, limiter, or mix-architecture changes:

- Choir removed from the user-facing preset list (engine code retained, not exposed)
- Reverb slider removed; reverb fixed at a subtle background level (`FIXED_REVERB_PERCENT` 20%), not changed by preset selection
- Rapid note/key-switch glitch fixed: outgoing crossfade voices retire via their own per-set dispose timer, preventing orphaned/stuck voices on rapid taps
- iPhone-speaker voicing: Pure given gentle harmonic color (no longer a naked sine), Strings high-end softened; Shruti untouched
- Circle-of-Fifths note buttons enlarged for bigger tap targets (still full-orbit, no overflow 320–430 px)
- Single-screen visual spacing polish: slightly larger moon/ring, moon artwork + CSS glow, Desert atmosphere readability (`opacity 0.75`), and subtle gold Intensity/Breath icons

## Completed: About / Help and Native Branding

- About and Help modal with tabbed content (`src/InfoModal.jsx`)
- Branding sources in `assets/branding/` (`moondrone-icon.png`, `moondrone-splash-master.png`)
- `@capacitor/assets` installed; `npm run cap:assets` generates iOS/Android icon and splash
- Native projects updated with Moondrone icon and splash assets

## Completed: App Lifecycle Safety

Pre-device lifecycle audit and platform-specific handler:

- `droneEngine.stopForLifecycle()` — immediate stop on interruption (Android/web; not iOS background)
- `src/useAppLifecycle.js` — background handler from `App.jsx` (`ENABLE_IOS_BACKGROUND_AUDIO`)
- `@capacitor/app` for native `appStateChange`
- **iOS:** drone and metronome continue during background/lock screen; foreground attempts Web Audio context resume
- **Android:** stop on inactive; sync UI to Ready; preserve settings; user taps Play again
- **Web dev:** stop on tab hide / page hide (same as Android lifecycle stop)

## Completed: Per-Moon Balance Tuning (2026)

Targeted voicing passes for phone-speaker balance — no routing, limiter, or Tone Lab global changes:

- **Mimas (Pure)** — root-centric fifth, whole-preset and VH register trims, Phase harmonic and air/shimmer scales, High/VH +12 ring control, preset-specific Breath gain follow
- **Titan (Strings)** — softer root, air/Phase trims, VH upper-bloom voice scales, Breath gain follow on core body layers
- **Io (Cosmos)** — VH Phase harmonic and +12 octave trims
- **Binaural** — VH upper stack and undertone trims
- **Europa (Shruti)** — intentionally unchanged in these passes
- Per-moon tables in `soundTuning.js`: `PRESET_REGISTER_BALANCE_TRIM_DB`, `PRESET_AIR_SHIMMER_GAIN_SCALE`, `PRESET_MOON_PHASE_HARMONICS_GAIN_SCALE`, `PRESET_REGISTER_VOICE_GAIN_SCALE`, `PRESET_BREATH_VOICE_GAIN_SCALE`
- Metronome popover: Play highlighted when stopped; Stop subdued while playing

## Current Phase: App-Store Readiness (Device Validation)

Sound engine, UI, About/Help, native branding, and lifecycle safety handler are complete. Remaining work:

- Capacitor device validation (audio startup, lifecycle verification on device, silent mode, icon/splash on device)
- Decide distribution target: TestFlight / internal vs. public App Store

### Sound Engine — Frozen Unless Requested

- Master Volume: UI 0–100% (default 100%), internal cap at clean phone level
- Metronome bus at +7 dB; single master limiter architecture unchanged
- Play fade-in: **4 s** from stopped; manual Stop fade-out: **3 s**
- Projection: always on internally; no UI toggle; no output-gain or limiter change
- Phases: New, Full, Blue, Blood, Super (UI label; internal `moods.js`); Super includes two true dual beat layers for headphone listening
- Listening validation for drone + metronome balance at Master Volume 100%

## Later

These ideas stay deferred so the app-wrapping phase stays focused.

- Sound Lab
- Saved presets
- User-designed custom drone sounds
- Scale practice
- Ear training
- Additional metronome sounds or subdivisions
- Practice prompts

## Non-Goals Unless Explicitly Requested

- Authentication
- Databases
- Accounts
- Cloud services
- Analytics
- Monetization
