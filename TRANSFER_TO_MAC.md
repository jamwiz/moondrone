# Transfer Moondrone to Mac (iOS Testing)

Use this guide when copying the project from Windows to a Mac for Xcode builds and iPhone testing.

## 1. Required software on the Mac

| Software | Notes |
|----------|-------|
| **macOS** | Recent version supported by current Xcode |
| **Xcode** | Latest stable from the Mac App Store or [developer.apple.com](https://developer.apple.com/xcode/) |
| **Xcode Command Line Tools** | Install if prompted: `xcode-select --install` |
| **Node.js** | LTS recommended (v20+). Verify with `node -v` and `npm -v` |
| **Apple ID** | Free account works for personal device testing |
| **Apple Developer account** | Optional for TestFlight/App Store; required for some distribution workflows |

You do **not** need Android Studio for iOS-only testing.

## 2. Commands to run after copying the project

Copy the full project folder (excluding `node_modules` and `dist` if you want a smaller transfer — they are regenerated).

```bash
cd /path/to/jam-drone

# Install dependencies (uses package-lock.json)
npm install

# Build web app and sync into the iOS project
npm run cap:sync
```

Optional — only if icon/splash assets are missing or you changed branding sources:

```bash
npm run cap:assets
npm run cap:sync
```

Verify the web app still builds:

```bash
npm run build
```

## 3. How to open the iOS project

**Option A — npm script (recommended):**

```bash
npm run cap:open:ios
```

**Option B — Xcode directly:**

Open `ios/App/App.xcodeproj` in Xcode.

The Capacitor app target is **App** inside the **App** project.

## 4. How to select an Apple signing team

1. Open the project in Xcode.
2. Select the **App** project in the navigator, then the **App** target.
3. Open **Signing & Capabilities**.
4. Check **Automatically manage signing**.
5. Choose your **Team** from the dropdown (your Apple ID / developer team).
6. Confirm **Bundle Identifier** is `com.moondrone.app`.

If Xcode reports a provisioning error, sign in under **Xcode → Settings → Accounts** and add your Apple ID, then retry.

## 5. How to run on a connected iPhone

1. Connect the iPhone via USB (or use wireless debugging if already paired).
2. Unlock the phone and trust the computer if prompted.
3. In Xcode, select your **iPhone** as the run destination (toolbar device menu).
4. Press **Run** (▶) or `Cmd+R`.
5. On first install, open **Settings → General → VPN & Device Management** on the iPhone and trust your developer certificate if iOS asks.

**Web Audio note:** Moondrone uses Tone.js. Tap **Play** in the app to start audio. If there is no sound, check the device volume and the iPhone silent switch.

## 6. Known project status

| Area | Status |
|------|--------|
| Sound engine | Stable — do not change unless explicitly requested |
| UI (compact header, moon-centered one-screen layout) | Complete |
| About / Help modal | Complete |
| Capacitor wrapper | Configured (Capacitor 8) |
| Native branding | Generated — iOS icon + splash in `Assets.xcassets` |
| Android splash | Dark `#090807` + transparent icon (Android-only) |
| App lifecycle safety | Implemented — stop on background/lock, Ready on return, no auto-resume |
| **Remaining work** | **iOS device validation** — audio startup, lifecycle verification, silent mode, speaker/headphones |

Primary validation goals on iPhone:

- Tone.js / Web Audio starts on first **Play** tap inside the Capacitor WebView
- Drone + metronome balance on phone speakers
- Background/lock stops playback cleanly; return shows Ready; Play restarts normally
- Metronome scheduling over extended playback and after lifecycle stop/restart

See `TODO.md` for the full checklist.

## 7. Current app version

| Source | Version |
|--------|---------|
| `package.json` | `1.0.0` |
| iOS `MARKETING_VERSION` (Xcode) | `1.0` |
| iOS `CURRENT_PROJECT_VERSION` (build number) | `1` |
| Android `versionName` | `1.0.0` |
| Android `versionCode` | `1` |
| About screen (from `package.json`) | Shows `1.0.0` |

**App identity**

| Setting | Value |
|---------|-------|
| Display name | Moondrone |
| Bundle ID | `com.moondrone.app` |
| npm package name | `moondrone` |

## 8. Troubleshooting notes

### `npm install` fails

- Ensure Node.js LTS is installed.
- Delete `node_modules` and run `npm install` again.
- `package-lock.json` is included — do not delete it unless intentionally regenerating the lockfile.

### Xcode cannot open the project / SPM errors

- Run `npm run cap:sync` again after `npm install`.
- In Xcode: **File → Packages → Reset Package Caches**, then build again.
- Capacitor 8 uses Swift Package Manager (`CapApp-SPM`) — CocoaPods is not required.

### Missing web assets in the iOS app

- `ios/App/App/public/` is **gitignored** and recreated by `npm run cap:sync`.
- Always run `npm run cap:sync` after copying the project or changing web source.

### Missing or stale icon/splash on iOS

- Source PNGs live in `assets/branding/`.
- Regenerate: `npm run cap:assets` then `npm run cap:sync`.
- iOS outputs: `ios/App/App/Assets.xcassets/AppIcon.appiconset/` and `Splash.imageset/`.

### Signing / provisioning errors

- Bundle ID must stay `com.moondrone.app` unless you intentionally create a new App ID in the Apple Developer portal.
- Enable **Automatically manage signing** and select a valid Team.
- For a new machine, you may need to register the device in your developer account (Xcode usually does this automatically).

### No audio on iPhone

- Tap **Play** or start the metronome — mobile Web Audio requires user interaction.
- Check volume and silent switch.
- See Help → Troubleshooting in the app.

### White or wrong splash on iOS

- iOS uses full-screen splash artwork from `moondrone-splash-master.png` (not the Android transparent-icon splash).
- Regenerate with `npm run cap:assets` if splash looks outdated.

---

## Transfer checklist — files that must be present

### Required (commit or copy)

```
package.json
package-lock.json
capacitor.config.json
index.html
vite.config.js
eslint.config.js
src/                          # App source
public/                       # Metronome samples, favicon
assets/branding/              # Source icon/splash PNGs (4 files)
scripts/generate-cap-assets.mjs
ios/                          # Xcode project (see gitignore exceptions below)
android/                      # Optional for iOS-only work, but include for full repo parity
```

**Branding sources (`assets/branding/`):**

- `moondrone-icon.png`
- `moondrone-splash-icon-transparent.png` (Android splash; safe to include)
- `moondrone-splash-master.png` (iOS splash source)
- `moondrone-splash-phone-ratio.png` (reference only)

**iOS native assets (committed in `ios/App/App/Assets.xcassets/`):**

- `AppIcon.appiconset/AppIcon-512@2x.png`
- `Splash.imageset/Default@*~universal~anyany*.png`

### Regenerated on Mac (do not need to copy)

```
node_modules/                 # npm install
dist/                         # npm run build
ios/App/App/public/           # npm run cap:sync
ios/App/App/capacitor.config.json
ios/App/App/config.xml
ios/capacitor-cordova-ios-plugins/
android/local.properties      # Machine-specific Android SDK path (Windows-only)
android/.gradle/ android/build/ android/app/build/
```

### Cross-platform notes

- Project scripts use `npx cap` and Node — no `.bat` or Windows-only paths in source or scripts.
- `android/local.properties` contains a Windows SDK path and is correctly gitignored; it does not affect iOS builds.
- `npm install` on Mac will fetch macOS-native optional dependencies (e.g. rolldown/lightningcss darwin bindings) automatically via `package-lock.json`.

---

## Quick reference

```bash
npm install
npm run cap:sync
npm run cap:open:ios
# In Xcode: select Team → select iPhone → Run
```
