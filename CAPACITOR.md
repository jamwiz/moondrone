# Moondrone — Capacitor Setup

Moondrone uses [Capacitor](https://capacitorjs.com/) to wrap the existing Vite + React + Tone.js web app as native iOS and Android apps. The wrapper preserves the single-screen UI and stable sound-engine architecture — preset routing and mix design are unchanged.

## Configuration

| Setting | Value |
|---------|-------|
| App name | Moondrone |
| App ID | `com.moondrone.app` |
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

Canonical source images live in `assets/branding/`:

| File | Size | Purpose |
|------|------|---------|
| `moondrone-icon.png` | 1024×1024 | App icon source |
| `moondrone-splash-icon-transparent.png` | 1024×1024 | Android 12+ splash icon (transparent, dark background) |
| `moondrone-splash-master.png` | 2732×2732 | iOS splash source only (not used for Android native splash) |
| `moondrone-splash-phone-ratio.png` | 1290×2732 | Alternate/reference only (not used for generation) |

`scripts/generate-cap-assets.mjs` runs platform-specific generation:

- **iOS** — `moondrone-icon.png` + `moondrone-splash-master.png` (full-screen splash artwork)
- **Android** — `moondrone-icon.png` for launcher icons; transparent `moondrone-splash-icon-transparent.png` copied to `drawable/splash_icon.png` for the Android 12+ splash API

Android launch theme (`AppTheme.NoActionBarLaunch`) uses `Theme.SplashScreen` with background `#090807` and `@drawable/splash_icon` — not the full-screen `moondrone-splash-master.png`.

Background color for generation matches the app palette: `#090807`.

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

Moondrone does **not** support background audio in v1. When the app goes to the background or the page hides, playback stops cleanly and the UI returns to Ready.

Implementation:

- `src/useAppLifecycle.js` — registers lifecycle listeners from `App.jsx`
- `droneEngine.stopForLifecycle()` — immediate stop (metronome timer off, voice gains to 0); manual Stop uses a **3 s** fade
- `@capacitor/app` — `appStateChange` when `isActive === false` on native
- `visibilitychange` + `pagehide` — WebView and browser dev fallbacks

User settings (key, register, preset, sliders) are preserved. Foreground return does not auto-resume — user taps Play again.

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
5. Test backgrounding, lock screen, and return to app — should stop cleanly and show Ready (handler implemented; verify on device)
6. Confirm metronome scheduling and drone playback stay stable
7. Decide distribution target (TestFlight vs. App Store)

See `TODO.md` for the full checklist.
