# Droon — Capacitor Setup

Droon uses [Capacitor](https://capacitorjs.com/) to wrap the existing Vite + React + Tone.js web app as native iOS and Android apps. The wrapper preserves the single-screen UI and stable sound-engine architecture — preset routing and mix design are unchanged.

## Configuration

| Setting | Value |
|---------|-------|
| App name | Droon |
| App ID | `com.droon.app` |
| Web assets (`webDir`) | `dist` |
| Vite build output | `dist` (see `vite.config.js`) |

`capacitor.config.json` is the source of truth. `webDir: "dist"` matches Vite's default `build.outDir`. Always run `npm run build` (or `npm run cap:sync`) before syncing so Capacitor copies a fresh production bundle.

`server.androidScheme: "https"` uses a secure WebView origin on Android, which helps Web Audio behave consistently.

## Dependencies

- `@capacitor/core` — runtime
- `@capacitor/cli` — dev tooling
- `@capacitor/android` — Android platform
- `@capacitor/ios` — iOS platform
- `@capacitor/app` — native app lifecycle events (`appStateChange`)
- `@capacitor/assets` — icon and splash generation (dev)

## Branding Source Assets

Canonical source images live in `assets/branding/` (see `scripts/generate-cap-assets.mjs`):

| File | Purpose |
|------|---------|
| `icon.png` | App icon source (1024×1024; required for `npm run cap:assets`) |
| `moondrone-splash-icon-transparent.png` | Android 12+ splash icon (transparent, dark background) |
| `moondrone-splash-master.png` | iOS full-screen splash source (staged as `splash.png` during generation) |

`scripts/generate-cap-assets.mjs` runs platform-specific generation:

- **iOS** — `icon.png` + staged `moondrone-splash-master.png` → `ios/App/App/Assets.xcassets/`
- **Android** — `icon.png` for launcher icons; transparent `moondrone-splash-icon-transparent.png` copied to `drawable/splash_icon.png` for the Android 12+ splash API

Android launch theme (`AppTheme.NoActionBarLaunch`) uses `Theme.SplashScreen` with background `#090807` and `@drawable/splash_icon` — not the full-screen splash master.

Background color for generation matches the app palette: `#090807`.

Committed native outputs (regenerate with `npm run cap:assets` after changing sources):

- **iOS:** `ios/App/App/Assets.xcassets/AppIcon.appiconset/`, `Splash.imageset/`
- **Android:** `android/app/src/main/res/mipmap-*`, `drawable/splash_icon.png`

## iOS packaging — web assets in `dist/`

After `npm run build`, confirm these paths exist under `dist/` before `npm run cap:sync`:

| Path | Used by |
|------|---------|
| `block.high.mp3`, `block.low.mp3` | Metronome (Wood) |
| `triangle.open.mp3`, `triangle.closed.mp3` | Metronome (Triangle) |
| `moons/moon.png`, `moons/Europa.png`, `moons/Titan.png`, `moons/Io.png`, `moons/Binaural.png` | Moon artwork |
| `atmospheres/space.png`, `atmospheres/desert.png`, `atmospheres/forest.png` | Background atmospheres |
| `index.html`, `assets/index-*.js`, `assets/index-*.css` | Capacitor WebView shell |

Capacitor copies `dist/` into `ios/App/App/public/` on sync (that folder is gitignored). Asset URLs in the app are root-relative (`/block.high.mp3`, `/moons/…`) and resolve correctly in the iOS WebView.

**iOS native requirements (already configured):**

- `ios/App/App/Info.plist` — `UIBackgroundModes` includes `audio` (background/lock-screen playback)
- `src/useAppLifecycle.js` — `ENABLE_IOS_BACKGROUND_AUDIO = true`

## npm Scripts

| Script | Purpose |
|--------|---------|
| `npm run cap:sync` | Build web app, then copy assets and update native projects |
| `npm run cap:assets` | Regenerate native icon/splash from `assets/branding/` sources |
| `npm run cap:copy` | Copy web assets only (no native dependency update) |
| `npm run cap:open:android` | Open the Android project in Android Studio |
| `npm run cap:open:ios` | Open the iOS project in Xcode |
| `npm run cap:run:android` | Build, sync, and open Android |
| `npm run cap:run:ios` | Build, sync, and open iOS |

### Regenerating icon/splash after branding changes

```bash
npm run cap:assets
npm run cap:sync
```

Then clean-rebuild in Android Studio or Xcode and verify on a real device.

## Workflow

### First-time setup (already done in repo)

```bash
npm install
npm run build
npx cap add android
npx cap add ios
npm run cap:assets
```

### Day-to-day development

Web UI and audio engine changes are still developed in the browser:

```bash
npm run dev
```

When ready to test in a native shell:

```bash
npm run cap:sync
npm run cap:open:android   # Windows / macOS / Linux
npm run cap:open:ios       # macOS only (Xcode required to build/run)
```

**Dev output meter:** use `npm run dev -- --host` or `npm run preview -- --host` in a browser (not a production Capacitor build). Press Play, tap **Meter** at the bottom-right. Use the **Dev output gain** slider (−6 to +6 dB) to calibrate loudness; see `README.md` for how to translate Dev gain into a `finalOutputTrimDb` change in `toneLab.js`.

Then run the app from Android Studio or Xcode on a device or emulator.

### Optional: live reload against Vite dev server

For faster UI iteration inside the native WebView, temporarily add to `capacitor.config.json`:

```json
"server": {
  "url": "http://YOUR_LAN_IP:5173",
  "cleartext": true,
  "androidScheme": "https"
}
```

Replace `YOUR_LAN_IP` with your machine's local network IP (not `localhost`). Remove the `url` and `cleartext` entries before production builds.

## App Lifecycle

Platform behavior (`ENABLE_IOS_BACKGROUND_AUDIO = true` in `src/useAppLifecycle.js`):

**iOS (native):** drone and metronome continue during background and lock screen. Requires `UIBackgroundModes: audio` in `ios/App/App/Info.plist` (already configured). On foreground return while playback was active, the app calls `droneEngine.resumeAudioContextForLifecycle()` to wake a suspended Web Audio context.

**Android and web:** when the app backgrounds or the page hides, playback stops cleanly and the UI returns to Ready.

Implementation:

- `src/useAppLifecycle.js` — registers lifecycle listeners from `App.jsx`
- `droneEngine.stopForLifecycle()` — immediate stop (Android/web path); manual Stop uses a **3 s** fade
- `droneEngine.resumeAudioContextForLifecycle()` — iOS foreground wake (does not restart playback or rebuild voices)
- `@capacitor/app` — `appStateChange` when `isActive === false` (Android stop) / `true` (iOS resume attempt)
- `visibilitychange` + `pagehide` / `pageshow` — WebView and browser dev fallbacks

User settings (key, register, preset, sliders) are preserved. Android/web foreground return does not auto-resume — user taps Play again.

See `TECH_NOTES.md` for full behavior and `TODO.md` for device validation checklist.

## Platform Requirements

### Android

- [Android Studio](https://developer.android.com/studio) with Android SDK
- JDK 17+ (bundled with recent Android Studio)
- Run from Windows, macOS, or Linux

### iOS

- macOS with [Xcode](https://developer.apple.com/xcode/)
- The `ios/` project can be generated on Windows, but building and running requires a Mac
- Apple Developer account needed for device testing and distribution

## Native Project Layout

```
android/                    # Android Studio project (committed)
ios/                        # Xcode project (committed)
assets/branding/            # Source icon/splash PNGs
scripts/generate-cap-assets.mjs
capacitor.config.json
dist/                       # Vite build output (gitignored; generated before sync)
```

**Version control:** the project uses local git. Baseline tag **`stable-post-phone-revert`** (`e4e01cb`) — see `README.md` / `TECH_NOTES.md`. Native build folders are committed; Gradle/Pods/build outputs are gitignored.

Generated native assets:

- **Android:** `android/app/src/main/res/mipmap-*` (icons), `drawable*/splash.png` (splash)
- **iOS:** `ios/App/App/Assets.xcassets/AppIcon.appiconset/`, `Splash.imageset/`

`@capacitor/assets` also generates PWA webp icons in `icons/` as a side effect; these are not wired to a manifest yet.

## Next Validation Steps

After opening a native build on real devices:

1. Verify native icon and splash appear correctly on home screen and launch
2. Verify Tone.js / Web Audio starts on first Play tap
3. Verify drone + metronome balance on phone speakers
4. Test speaker, headphones, and silent mode
5. Test **iOS** backgrounding and lock screen — playback should continue; foreground return should not leave audio stuck/silent
6. Test **Android** backgrounding and lock screen — should stop cleanly and show Ready
7. Confirm metronome scheduling and drone playback stay stable
8. Decide distribution target (TestFlight vs. App Store)

See `TODO.md` for the full checklist.
