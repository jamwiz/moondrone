// Shared timestamp of the most recent user-initiated audio control (Play/Stop/metronome tap, or a
// key/moon change made while playing). The lifecycle native prewarm uses this to avoid asserting
// the AVAudioSession right after a tap — focus/visibility/appState events can fire during normal
// control interactions, and a native reconfigure at that moment emits an audioSessionInterrupted
// that can disrupt or hard-reset live audio. Kept module-global so App.jsx and useAppLifecycle.js
// can share it without prop drilling.
let lastUserAudioActionAt = 0

export function markUserAudioAction() {
  lastUserAudioActionAt = Date.now()
}

export function msSinceUserAudioAction() {
  return Date.now() - lastUserAudioActionAt
}
