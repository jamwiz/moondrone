// Single source of truth for the iOS background-audio policy.
//
// Background audio is intentionally DISABLED. Keeping Moondrone playing in the background under
// WKWebView/TestFlight was too glitchy (pops, context interruptions, frozen metronome timing, and
// "UI playing but silent" states). When the app backgrounds/locks/goes inactive we stop cleanly and
// make the UI honest; the next Play is a clean foreground start.
//
// Do NOT flip this back on without also restoring UIBackgroundModes `audio` in
// ios/App/App/Info.plist. Kept in its own leaf module so both the lifecycle hook and the audio
// engine can read it without an import cycle.
export const ENABLE_IOS_BACKGROUND_AUDIO = false
