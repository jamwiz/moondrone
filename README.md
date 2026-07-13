# Droon

Beautiful drones for practice and meditation.

A mobile-first drone app for musicians, built with React, Vite, and Tone.js.

## Moons

- **Mimas** — clean, centered root focus
- **Europa** — warm, grounded practice drone with register foundation roots
- **Titan** — warm, bowed-string ensemble for intonation and practice
- **Io** — vast, airy vertical space with Low-register foundation and sky layers
- **Binaural** — centered main drone with quiet panned undertones for headphone beat listening

Default Moon: **Europa** (internal sound ID: Shruti)

## Phases

For every non-Binaural Moon, **Phase** controls the slow movement behavior (internal sound code still uses `moodId` / `moods.js`):

- **New** — stable reference, minimal movement
- **Full** — clearly alive, warm harmonic bloom
- **Blue** — floating, spacious, shimmering orbit
- **Blood** — darker, deeper, stronger eclipse and body movement
- **Super** — biggest, brightest, most radiant, with true dual headphone beats

Binaural shows a **Beat** selector instead of the Phase menu (no helper text under the control).

## UI Layout

Single-screen, mobile-first layout optimized for phone screen space.

**Compact status header** — no large title or decorative branding on the main screen (app icon/splash carry branding). Shows a Ready / Drone Active indicator on the left, with Atmosphere, Metronome, and `?` About/Help controls on the right.

**Atmosphere** — manual background selection via the header button (Space, Desert, Forest). Not tied to Moon or Phase.

**Moon-centered instrument:**

- The moon is the single Play / Stop transport control (per-preset PNG artwork with CSS glow/halo/phase ring).
- A Circle of Fifths key ring surrounds the moon.
- Control deck top row: **Moon** | **Phase** (or **Beat** when Binaural is selected).
- **Register** uses a compact 1×4 segmented row beneath that.
- Moon and Phase use compact popovers; Binaural beat selector appears inline when Binaural is selected.
- Intensity and Breath stay visible as primary shaping controls with subtle gold line icons.
- Master Volume and Tuning are compact utility controls.
- Metronome lives in a header popover with Tempo, Meter, Sound, and Play / Stop (Play is highlighted when stopped; Stop is subdued while the metronome runs).

## Controls

### Drone

- Circle of Fifths key selector
- Register selector (Low, Medium, High, Very High) in a compact 1×4 row
- Moon popover
- Phase popover for non-Binaural Moons
- Tuning stepper (A = 415–445 Hz, default 440)
- Binaural Beat selector inline when Binaural is selected (no on-screen helper note)
- Moon Play / Stop control
- Intensity and Breath sliders; reverb is fixed internally at a subtle level (no slider)
- Compact Master Volume utility slider

### Metronome

Runs independently from the drone.

- BPM slider (40–200, default 80)
- Sound selector: Wood or Triangle
- Meter selector: 2/4 through 6/4 plus **Straight (No Accent)** (default 4/4)
- Play / Stop — Play highlighted when stopped; Stop subdued while playing

Metronome samples live in `public/` (`block.high.mp3`, `block.low.mp3`, `triangle.open.mp3`, `triangle.closed.mp3`).

## Audio Behavior

- Play from stopped fades in over **4 seconds**; manual Stop fades out over **3 seconds** (lifecycle/background stop is immediate)
- **Note and register** changes while playing use phased voice crossfades (no pitch glide). Breath phase is preserved; incoming voices fade to the live Breath voicing.
- **Startup note change:** tapping a different key while Play is still starting (async IR/context setup) is queued and applied before voices schedule — the first immediate note switch after Play is reliable in production builds.
- **Moon** changes while playing use **full-chain crossfade** by default: the entire current drone chain is captured as a frozen old deck, a brand-new complete chain is built for the new Moon, and the two decks are equal-power crossfaded at their output gains (**1.5 s**). The old deck stays fully audible until the new reverb IR is ready, then both ramps share one start time. Silent settle uses a **transition snapshot** (Breath/Mood phase, effective tonal, trims/EQ) so incoming Moons — especially **Mimas/Europa → Io** — do not enter hot and then settle. A stable **masked** fallback (fade-down → silent rebuild → fade-up) remains available for debugging.
- Settled Moon sound, master output, limiter/compressor, metronome, and note/register behavior are unchanged — only the transition path differs.
- Projection is always enabled internally for phone-speaker clarity and perceived loudness; there is no Projection UI toggle, and no master-gain or limiter change.
- First Play waits for reverb impulse response to load (prevents startup click/pop)
- Master Volume UI shows 0–100% (default 100%); internal output is capped for clean phone speakers
- **iOS (native):** drone and metronome continue during background and lock screen (`UIBackgroundModes: audio`); on foreground return the app attempts to resume a suspended Web Audio context while playback was active
- **Android and web:** on background, lock, or page hide, drone and metronome stop immediately; UI returns to Ready; settings are preserved; user must tap Play again

### Dev transition controls (browser only)

```js
moondroneDebug.setMoonTransitionMode('fullChainCrossfade') // default
moondroneDebug.setMoonTransitionMode('masked')             // stable fallback
moondroneDebug.setFullChainCrossfadeDebug(true)            // lifecycle + resource probes
moondroneDebug.setNoteChangeDebug(true)                    // note/register crossfade probes
```

## Documentation

- `VISION.md` — product vision and constraints
- `PROJECT_STATE.md` — current features and architecture snapshot
- `SOUND_NOTES.md` — sound design goals and preset character
- `TECH_NOTES.md` — engine architecture and implementation details
- `src/toneLab.js` — Tone Lab macros for subjective tuning (master EQ, harmonics, dynamics; shared path for all Moons)
- `ROADMAP.md` — milestone planning
- `TODO.md` — app wrapping and device validation tasks
- `CAPACITOR.md` — Capacitor setup and native build workflow

## Version control

Local git repository. Baseline tag **`stable-post-phone-revert`** (`e4e01cb`) — post–phone-resonance-revert state with startup-note and full-chain Io settle fixes.

```bash
git checkout stable-post-phone-revert   # inspect baseline
git reset --hard stable-post-phone-revert   # restore working tree to baseline
```

## Development (Web)

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

### Dev output meter (development builds only)

The final master output has a passive analyzer tap and a **dev-only calibration gain** in dev builds only. It is **not included in production** (`npm run build`).

1. Start the app: `npm run dev -- --host` or `npm run preview -- --host`
2. Open the app in a browser (use the LAN URL when using `--host`)
3. Press **Play** on the moon
4. Tap the small **Meter** button at the bottom-right (hidden until opened)
5. Watch Peak / Hold / RMS, clip status, level bars, and spectrum while changing Moons or registers

#### Loudness calibration with dev output gain

Use the **Dev output gain** slider (−6 to +6 dB, 0.5 dB steps) to find the best production trim **without changing production tuning**:

1. Pick a reference Moon, register, and Master Volume (usually 100%).
2. Press Play and open **Meter**.
3. Note **Prod trim** (current production `finalOutputTrimDb` from Tone Lab — unchanged by this tool).
4. Raise or lower **Dev gain** until Peak Hold sits where you want (typically **−3 to −1 dB** under clip, no **Near clip** / **CLIP** on phone speakers).
5. Read **Effective** = Prod trim + Dev gain. The dB offset you applied on Dev gain is the adjustment to consider for `finalOutputTrimDb` in `src/toneLab.js` — apply that change manually in Tone Lab when ready; the dev slider does not write production constants.

Example: Prod trim **−1.0 dB**, Dev gain **+1.5 dB** sounds right → try setting `finalOutputTrimDb` to **+0.5 dB** in Tone Lab, then reset Dev gain to **0** and verify again.

The panel remembers open/closed state for the browser session (`sessionStorage` key `moondrone.devMeter.visible`). Dev output gain always starts at **0 dB** each load.

## Mobile App (Capacitor)

Droon is wrapped with Capacitor. The Vite build output (`dist/`) is synced into native `android/` and `ios/` projects.

```bash
npm run cap:sync              # build + sync web assets to native projects
npm run cap:assets            # regenerate native icon/splash from branding sources
npm run cap:open:android      # open in Android Studio
npm run cap:open:ios          # open in Xcode (macOS only)
```

Branding source images live in `assets/branding/`. See `CAPACITOR.md` for full setup, asset generation, platform requirements, and workflow.
