Drune

Beautiful drones for practice and meditation.

A mobile-first drone and practice app for musicians.

## Core Principles

- Beautiful sound comes first
- Simple interface
- Fast startup
- Works well on phones
- Sound controls should shape musical tone, not add complexity

## Version 1 (Web App — Complete)

The core web sound engine is built and stable:

- Circle of Fifths key selector
- Register selector
- Continuous drone with 15-second gentle Play fade-in from stopped
- Volume control
- Moon selector with Mimas, Europa, Titan, Io, and Binaural (display labels; internal sound IDs unchanged)
- Phase selector for non-Binaural Moons: New, Full, Blue, Blood, Super (UI label; internal `moodId` / `moods.js`)
- Binaural Beat selector (when Binaural is selected; replaces Phase)
- Tuning control (A = 415–445 Hz)
- Intensity and Breath controls (Intensity is the unified tonal control — warmth, brightness, focus, and low-end balance; Reverb is fixed internally)
- High quality sound engine with preset-specific voice extensions
- Sample-based metronome with Wood and Triangle sounds, BPM and meter controls
- Smooth note, register, and Moon transitions with continuous Breath phase
- Reliable mobile audio startup
- Phone-optimized output routing with a single master limiter (no heavy compression)

## Completed: Premium UI Refactor

The main screen has been refactored for app-store readiness:

- Compact status-only header (Ready / Drone Active indicator, Atmosphere, Metronome, and `?` About/Help button)
- Single-screen moon-centered instrument
- Moon is the only Play / Stop transport, with an integrated premium gold control disc
- Circle of Fifths key ring around the moon
- Compact control deck: top row Moon | Phase (Beat when Binaural); Register 1×4 row; Intensity, Breath, Master Volume, and Tuning
- Moon, Phase, and Metronome use compact popovers; Binaural Beat selector appears inline when selected
- Per-preset moon PNG artwork plus CSS glow/rim/halo/phase ring; visuals respond to Moon, Phase, Intensity, Breath, startup, and metronome beats
- Premium spacing, typography, and mobile scroll behavior
- Tabular-nums on slider value readouts

## Completed: About / Help and Branding

- About and Help modal (`src/InfoModal.jsx`) opened from header `?` button
- Branding sources organized in `assets/branding/`
- Native app icon and splash generated via `@capacitor/assets` (`npm run cap:assets`)

## Completed: App Lifecycle Safety

- **iOS (native):** drone and metronome continue during background and lock screen; foreground return resumes a suspended Web Audio context when playback was active
- **Android and web:** on background, lock, or page hide, drone and metronome stop immediately; UI returns to Ready; user must tap Play again
- User settings preserved across lifecycle events

## Current Phase: App-Store Readiness (Device Validation)

Sound engine, UI, About/Help, native icon/splash, and lifecycle safety handler are complete. Remaining work:

- Capacitor device validation on real iOS/Android hardware (including lifecycle handler verification)
- Do not change the sound engine unless explicitly requested

## Current Sound Direction

- Shruti-inspired
- Warm
- Spacious
- Not synthy
- Loud and clear on phone speakers without obvious pumping or limiter artifacts
- Projection is always enabled internally for phone-speaker clarity; no output-gain or limiter-ceiling increase
- Phases add slow movement without replacing the steady practice core; Super is the most radiant and includes true headphone beat layers
- Gentle 15-second startup bloom from stopped; 2-second manual stop fade-out (lifecycle stop is immediate)

## Product Constraints

- Prioritize sound quality over adding features
- Keep the app mobile-first
- Avoid unnecessary complexity
- Do not add authentication, databases, accounts, cloud services, analytics, or monetization unless explicitly requested

## Future (After App Wrapping)

- User-designed custom drone sounds
- Saved custom presets
- Sound Lab
- Scale practice
- Ear training
- Practice prompts
