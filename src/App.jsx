import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_REFERENCE_A_HZ,
  MAX_MASTER_VOLUME_NORMALIZED,
  droneEngine,
} from './droneEngine'
import {
  DEFAULT_METRONOME_METER,
  DEFAULT_METRONOME_SOUND_MODE,
} from './metronomeSamples'
import { BINAURAL_MODES, DEFAULT_BINAURAL_MODE_ID, DEFAULT_PRESET, PRESETS } from './presets'
import { DEFAULT_MOOD_ID, MOODS } from './moods'
import { ATMOSPHERES, DEFAULT_ATMOSPHERE_ID, getAtmosphere, resolveAtmosphereId } from './atmospheres'
import { AtmosphereSelector } from './AtmosphereSelector'
import { PresetSelector } from './PresetSelector'
import { MoodSelector } from './MoodSelector'
import { MetronomeMenu } from './MetronomeMenu'
import { InfoModal } from './InfoModal'
import { useAppLifecycle } from './useAppLifecycle'
import { getMoonStageVisualStyle } from './moonVisuals'
import { getMoonArtworkSrc } from './moonArtwork'
import { audioDiag } from './audioDiagnostics'
import { addNativeAudioSessionListeners, configureNativePlaybackSession, forceNextNativePlaybackConfigure, isNativePlaybackActive } from './nativeAudioSession'
import { ensurePrimerPlaying, getPrimerDebugState, isPrimerPlaying, pausePrimer } from './iosMediaPrimer'
import { markUserAudioAction } from './audioActivity'
import {
  AudioHealth,
  getAudioHealth,
  isAudioHealthStable,
  setAudioHealth,
  scheduleAudioStable,
} from './audioHealth'
import {
  beginMediaPrimerStartup,
  endMediaPrimerStartup,
  isMediaPrimerStartupActive,
} from './mediaPrimerStartupGuard'
import {
  beginMetronomeOperation,
  isMetronomeOperationCurrent,
} from './metronomeOperationControl'
import './App.css'

const DevOutputMeter = import.meta.env.DEV
  ? lazy(() => import('./DevOutputMeter.jsx').then((module) => ({ default: module.DevOutputMeter })))
  : null

// Circle of Fifths order — the 12 chromatic keys arranged so each step is a
// perfect fifth. `value` matches the engine key names; `primary`/`secondary`
// give an elegant enharmonic label for the orbital ring.
const CIRCLE_OF_FIFTHS = [
  { value: 'C', primary: 'C' },
  { value: 'G', primary: 'G' },
  { value: 'D', primary: 'D' },
  { value: 'A', primary: 'A' },
  { value: 'E', primary: 'E' },
  { value: 'B', primary: 'B' },
  { value: 'F#', primary: 'F♯', secondary: 'G♭' },
  { value: 'C#', primary: 'C♯', secondary: 'D♭' },
  { value: 'G#', primary: 'G♯', secondary: 'A♭' },
  { value: 'D#', primary: 'D♯', secondary: 'E♭' },
  { value: 'A#', primary: 'A♯', secondary: 'B♭' },
  { value: 'F', primary: 'F' },
]

// Percent of the stage radius from center to each note button. Kept below ~43%
// so the button (centered on this radius) plus its own half-width stays inside
// the square stage on the narrowest phones — no edge clipping or overflow.
const NOTE_RING_RADIUS = 43

const OCTAVE_OPTIONS = [
  { label: 'Low', value: 2 },
  { label: 'Medium', value: 3 },
  { label: 'High', value: 4 },
  { label: 'Very High', value: 5 },
]

const DEFAULT_INTENSITY = 70
const DEFAULT_BREATH = 35
const DEFAULT_METRONOME_BPM = 80
// Delay before pausing the media primer after a drone Stop. Must exceed the drone stop fade so the
// fade completes audibly; pausing the primer earlier can make iOS interrupt the WebAudio context.
const DRONE_STOP_PRIMER_PAUSE_DELAY_MS = 5000
const DEFAULT_MASTER_VOLUME = 100
const MIN_REFERENCE_A_HZ = 415
const MAX_REFERENCE_A_HZ = 445
// Reverb is no longer user-controlled — kept as a fixed subtle background space.
// 20% maps through the engine wetness curve to a gentle ~0.09 wet signal.
const FIXED_REVERB_PERCENT = 20
// DIAGNOSTIC A/B: on a post-lock/cold-rebuild Play only, skip the media primer when native Playback
// is already fresh AND the (freshly rebuilt) AudioContext is already running. Isolates whether the
// Play-after-return click comes from the media-primer / AVAudioSession reactivation vs the drone
// graph. Normal first-launch and non-post-lock starts always use the primer.
const SKIP_MEDIA_PRIMER_ON_POST_LOCK_START = true
const ATMOSPHERE_STORAGE_KEY = 'moondrone.atmosphere'
// Mood = slow motion/behavior layer for non-binaural moons. Persisted per session.
const MOOD_STORAGE_KEY = 'moondrone.mood'

function toEngineVolume(uiPercent) {
  return (uiPercent / 100) * MAX_MASTER_VOLUME_NORMALIZED
}

function readPlayStartedTimestamp() {
  return Date.now()
}

function readStoredAtmosphere() {
  try {
    const stored = window.sessionStorage.getItem(ATMOSPHERE_STORAGE_KEY)
    if (stored) {
      return resolveAtmosphereId(stored)
    }
  } catch {
    // sessionStorage may be unavailable (private mode, WebView restrictions).
  }

  return DEFAULT_ATMOSPHERE_ID
}

function readStoredMood() {
  try {
    const stored = window.sessionStorage.getItem(MOOD_STORAGE_KEY)
    if (stored && MOODS.some((mood) => mood.id === stored)) {
      return stored
    }
  } catch {
    // sessionStorage may be unavailable (private mode, WebView restrictions).
  }

  return DEFAULT_MOOD_ID
}

function noteRingStyle(index, total) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  return {
    left: `${50 + NOTE_RING_RADIUS * Math.cos(angle)}%`,
    top: `${50 + NOTE_RING_RADIUS * Math.sin(angle)}%`,
  }
}

function App() {
  const [selectedKey, setSelectedKey] = useState('C')
  const [selectedOctave, setSelectedOctave] = useState(3)
  const [referenceA, setReferenceA] = useState(DEFAULT_REFERENCE_A_HZ)
  const [selectedPresetName, setSelectedPresetName] = useState(DEFAULT_PRESET.name)
  const [intensity, setIntensity] = useState(DEFAULT_INTENSITY)
  const [breath, setBreath] = useState(DEFAULT_BREATH)
  // Visual breath is decoupled from slider drag so CSS animations do not restart or
  // jump scale while the range input fires continuous updates during playback.
  const [breathVisual, setBreathVisual] = useState(DEFAULT_BREATH)
  const isBreathDraggingRef = useRef(false)
  const [volume, setVolume] = useState(DEFAULT_MASTER_VOLUME)
  const [binauralModeId, setBinauralModeId] = useState(DEFAULT_BINAURAL_MODE_ID)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDroneStarting, setIsDroneStarting] = useState(false)
  const [metronomeBpm, setMetronomeBpm] = useState(DEFAULT_METRONOME_BPM)
  const [isMetronomePlaying, setIsMetronomePlaying] = useState(false)
  const [metronomePulse, setMetronomePulse] = useState({ tick: 0, downbeat: false })
  const [infoScreen, setInfoScreen] = useState(null)
  const [atmosphereId, setAtmosphereId] = useState(readStoredAtmosphere)
  const [moodId, setMoodId] = useState(readStoredMood)
  const isStartingRef = useRef(false)
  const metronomeStartPendingRef = useRef(false)
  const dronePrimerPauseTimerRef = useRef(null)

  useAppLifecycle(setIsPlaying, setIsMetronomePlaying, isPlaying, isMetronomePlaying)

  // iOS audio interruptions (phone call, another app taking audio focus, Siri) leave the
  // Web Audio context "interrupted". The engine detects that and cleanly resets itself; here
  // we sync the UI so it never shows Drone Active / metronome running while actually silent.
  useEffect(() => {
    droneEngine.onPlaybackInterrupted = ({ wasPlaying, wasMetronomePlaying }) => {
      if (isMediaPrimerStartupActive()) {
        audioDiag('startup-guard', 'UI reset deferred during startup guard', {
          wasPlaying,
          wasMetronomePlaying,
        })
        return
      }

      audioDiag('interruption', 'playback interrupted by iOS — resetting UI', {
        wasPlaying,
        wasMetronomePlaying,
        primer: getPrimerDebugState(),
      })

      if (wasPlaying) {
        setIsPlaying(false)
        setIsDroneStarting(false)
      }

      if (wasMetronomePlaying) {
        beginMetronomeOperation('interruption')
        metronomeStartPendingRef.current = false
        setIsMetronomePlaying(false)
      }

      pausePrimer('interruption-reset', { force: true })
    }

    return () => {
      droneEngine.onPlaybackInterrupted = null
    }
  }, [])

  // iOS native: the AVAudioSession plugin tells us when another app/call/Siri takes audio focus
  // or media services reset. Hard-reset the engine (kills stale nodes so the next Play has no pop)
  // and reset the UI honestly. We never auto-resume — the user must press Play again.
  useEffect(() => {
    const cleanup = addNativeAudioSessionListeners({
      onInterrupted: (data) => {
        audioDiag('interruption', 'native audio session interrupted', data)
        droneEngine.handleNativeAudioInterruption(data?.reason ?? 'native')
      },
      onWillResignActive: (data) => {
        // Earliest lifecycle warning (before appStateChange-inactive): best-effort click-safe duck
        // while the context may still be running. Reversed on return if no real background follows.
        droneEngine.preMuteForImminentBackground?.(data?.reason ?? 'native-will-resign-active')
      },
      onDidBecomeActive: (data) => {
        // App returned active. Reverse a pre-mute duck if no real background stop happened (no-op
        // after a real stop). Robust regardless of Capacitor appStateChange mapping for transient
        // resigns (Control Center, banner) that may not fire appStateChange.
        droneEngine.restoreFromBackgroundPreMute?.(data?.reason ?? 'native-did-become-active')
      },
    })

    return cleanup
  }, [])

  // One moon pulse per actual metronome beat (synced to the audio clock via the
  // engine's visual-only onMetronomeBeat hook). No continuous animation.
  useEffect(() => {
    if (!isMetronomePlaying) {
      droneEngine.onMetronomeBeat = null
      return
    }

    droneEngine.onMetronomeBeat = (downbeat) => {
      setMetronomePulse((prev) => ({ tick: prev.tick + 1, downbeat }))
    }

    return () => {
      droneEngine.onMetronomeBeat = null
    }
  }, [isMetronomePlaying])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(ATMOSPHERE_STORAGE_KEY, atmosphereId)
    } catch {
      // Ignore storage failures — atmosphere still applies for this session.
    }
  }, [atmosphereId])

  useEffect(() => {
    // Mood applies live while playing (re-emerges) and is read on the next start().
    droneEngine.setMood(moodId)

    try {
      window.sessionStorage.setItem(MOOD_STORAGE_KEY, moodId)
    } catch {
      // Ignore storage failures — mood still applies for this session.
    }
  }, [moodId])

  const moonPhaseVisualId = selectedPresetName === 'Binaural' ? 'full' : moodId
  const moonVisualStyle = getMoonStageVisualStyle(selectedPresetName, moonPhaseVisualId)
  const moonArtworkSrc = getMoonArtworkSrc(selectedPresetName)

  function applyBinauralBeatToEngine(modeId = binauralModeId) {
    const mode = BINAURAL_MODES.find((item) => item.id === modeId)

    if (mode) {
      droneEngine.setBinauralBeatHz(mode.beatHz)
    }
  }

  // iOS WKWebView Silent-Mode workaround: inside the user gesture, (a) assert native .playback,
  // then (b) start the hidden HTMLAudioElement primer. Tone.start() + WebAudio happen next inside
  // droneEngine.start()/startMetronome(), which also re-assert native .playback afterwards (step e).
  // No-op on web/Android.
  async function ensureContextRunningAfterStart(label) {
    if (droneEngine.getContextState?.() === 'running') {
      return true
    }

    await droneEngine.attemptContextInterruptRecovery(label)

    if (droneEngine.getContextState?.() === 'running') {
      return true
    }

    // Primer handoff debounce may still be in flight — wait once then retry recovery.
    await new Promise((resolve) => {
      window.setTimeout(resolve, 1100)
    })

    if (droneEngine.getContextState?.() === 'running') {
      return true
    }

    await droneEngine.attemptContextInterruptRecovery(`${label}-retry`)
    return droneEngine.getContextState?.() === 'running'
  }

  async function primeForPlayback(reason) {
    audioDiag('media-primer', `primeForPlayback BEGIN (${reason})`)
    // Throttled: if app-open/resume prewarm (or a prior start) already set Playback recently, skip
    // the native call to avoid back-to-back configure churn. The primer play below is the unlock.
    await configureNativePlaybackSession('media-primer-before', { throttle: true })
    await ensurePrimerPlaying(reason)
    audioDiag('media-primer', `primeForPlayback END (${reason})`, getPrimerDebugState())
  }

  // True only when the shared audio system is genuinely healthy enough for a lightweight start
  // (no primer, no startup guard, no native reconfigure). masterChainReady alone does NOT qualify:
  // after a metronome stop or an interruption/recovery the chain can exist while the session is not
  // truly healthy. We require audio health == stable AND either the drone engine is ready on a
  // running context, OR the metronome is actively scheduling on a running context.
  function isAudioAlreadyLive() {
    if (!isAudioHealthStable()) {
      audioDiag('drone', 'drone lightweight start denied — audio health not stable', {
        health: getAudioHealth(),
      })
      return false
    }

    const diag = droneEngine.getMetronomeDiagnostics?.() ?? {}
    const contextRunning = diag.contextState === 'running'
    const metronomeLive = diag.metronomePlaying === true
      && diag.schedulerActive === true
      && contextRunning

    // Quick restart while a Stop fade is still active: warm graph + running context, and start()
    // force-silences the stopping graph. This is a genuine fast restart path.
    if (contextRunning && droneEngine.isStopFadeActive?.()) {
      audioDiag('drone', 'drone quick restart during active fade — using restart path', {
        health: getAudioHealth(),
      })
      return true
    }

    // Metronome actively scheduling → shared session is genuinely live → lightweight ok.
    if (metronomeLive) {
      return true
    }

    // After an explicit drone Stop, isReady/masterChainReady/running is NOT enough. Force the safe
    // startup path so the next Play actually makes sound.
    if (droneEngine.droneExplicitlyStopped) {
      audioDiag('drone', 'drone lightweight start denied — explicit stop requires safe start', {
        health: getAudioHealth(),
        ...diag,
      })
      return false
    }

    const droneReady = diag.isReady === true && contextRunning && droneEngine.isPlaying === true
    if (droneReady) {
      return true
    }

    audioDiag('drone', 'drone lightweight start denied — drone not ready and metronome not active', {
      health: getAudioHealth(),
      ...diag,
    })
    return false
  }

  function isMetronomeEngineReady() {
    // UI honesty gate: scheduler/context must be genuinely alive. The primer is a one-time unlock
    // and is intentionally NOT required here (it may pause after scheduling without breaking audio).
    const diag = droneEngine.getMetronomeDiagnostics?.() ?? {}
    return diag.metronomePlaying === true
      && diag.schedulerActive === true
      && (diag.beatsScheduled ?? 0) > 0
      && diag.contextState === 'running'
  }

  function handlePlayPointerDown() {
    if (isPlaying || isDroneStarting || isStartingRef.current) {
      return
    }

    markUserAudioAction()
    setIsDroneStarting(true)
  }

  async function handlePlay() {
    if (isPlaying || isStartingRef.current) {
      setIsDroneStarting(false)
      return
    }

    markUserAudioAction()
    setIsDroneStarting(true)
    isStartingRef.current = true

    // Invariant: never layer a new Play over live audio. If the UI says stopped but the engine still
    // reports playing, correct to a clean stop first so this Play starts from an honest state (this
    // makes "audio playing while UI says Ready" impossible even if a prior stop desynced).
    if (droneEngine.isPlaying === true) {
      audioDiag('drone', 'UI stopped but engine playing — correcting to stop', {
        contextState: droneEngine.getContextState?.(),
      })
      droneEngine.stop()
    }

    // After a lock/emergency interruption the old context is poisoned — the next Play must cold
    // rebuild and CANNOT reuse a lightweight / already-live / quick-restart path.
    const requireColdRebuild = droneEngine.requireColdAudioRebuildOnNextPlay === true
    // Only a Play that began *because of* a lock/background/emergency teardown gets the strict
    // post-start confirmation + cold-fail handling. A normal first launch / normal foreground Play
    // must keep the previous tolerant behavior (media-primer interruption-began is expected there).
    const postLockPlay = requireColdRebuild
      || droneEngine.forceSafeForegroundPlayPending === true
      || droneEngine.lifecycleStopPendingPlay === true
    const audioAlreadyLive = !requireColdRebuild && isAudioAlreadyLive()
    if (!audioAlreadyLive) {
      beginMediaPrimerStartup('drone-play')
      setAudioHealth(AudioHealth.STARTING, 'drone-play')
    }

    // First foreground Play after any UNSAFE audio teardown (background stop, hard reset, active
    // interruption with background audio disabled): resume intentionally did NOT prewarm, so this
    // gesture must own the native session setup. Force the media-primer-before + drone-post-context
    // configure calls past the recent-Playback throttle (otherwise both get skipped and the drone
    // can be silent despite a "running" context).
    if (droneEngine.forceSafeForegroundPlayPending || droneEngine.lifecycleStopPendingPlay || requireColdRebuild) {
      forceNextNativePlaybackConfigure()
    }

    let guardEnded = audioAlreadyLive
    let primerSkippedForDiagnostic = false

    try {
      audioDiag('drone', 'handlePlay ENTER', { audioAlreadyLive, requireColdRebuild })

      // Cold rebuild first (dispose + fresh AudioContext) so prime/start run on a clean context.
      if (requireColdRebuild) {
        await droneEngine.coldRebuildAudioContext('next-play-after-lock')
      }

      const canSkipPostLockPrimer = postLockPlay
        && SKIP_MEDIA_PRIMER_ON_POST_LOCK_START
        && isNativePlaybackActive()
        && droneEngine.getContextState?.() === 'running'

      if (audioAlreadyLive) {
        audioDiag('drone', 'drone start over live audio — skipping prime + native reconfigure', {
          ...droneEngine.getMetronomeDiagnostics?.(),
        })
      } else if (canSkipPostLockPrimer) {
        primerSkippedForDiagnostic = true
        audioDiag('drone', 'post-lock media-primer skipped for diagnostic', {
          nativePlaybackActive: isNativePlaybackActive(),
          contextState: droneEngine.getContextState?.(),
          requireColdRebuild,
        })
      } else {
        if (postLockPlay && SKIP_MEDIA_PRIMER_ON_POST_LOCK_START) {
          audioDiag('drone', 'post-lock media-primer used — native/category/context not safe to skip', {
            nativePlaybackActive: isNativePlaybackActive(),
            contextState: droneEngine.getContextState?.(),
            requireColdRebuild,
          })
        }
        await primeForPlayback('drone-play')
      }

      applyBinauralBeatToEngine()
      await droneEngine.start(
        selectedKey,
        toEngineVolume(volume),
        selectedOctave,
        intensity,
        breath,
        FIXED_REVERB_PERCENT,
        {
          skipNativeReconfigure: audioAlreadyLive,
          applyStartupMicroFade: !audioAlreadyLive,
          startupMicroFadeReason: requireColdRebuild ? 'next-play-after-lock' : 'foreground-start',
          postLockStartupMicroFade: postLockPlay,
        },
      )

      const contextOk = await ensureContextRunningAfterStart('drone-play')
      if (!contextOk) {
        throw new Error('AudioContext not running after drone start')
      }

      // Strict post-lock/cold-rebuild confirmation ONLY. Normal Play keeps the tolerant behavior
      // above (ensureContextRunningAfterStart already recovers a transient media-primer interruption).
      if (postLockPlay) {
        const playStartedAt = readPlayStartedTimestamp()
        const stable = await droneEngine.confirmStableStartWindow(playStartedAt)
        if (!stable) {
          audioDiag('drone', 'foreground startup failed — context interrupted after lock', {
            contextState: droneEngine.getContextState?.(),
          })
          throw new Error('Foreground startup not stable — context interrupted after lock')
        }
      }

      // Confirmed stable — clear all forced/cold flags.
      droneEngine.clearForegroundStartupFlags()
      if (postLockPlay) {
        audioDiag('drone', 'post-lock startup success — UI playing committed', {
          contextState: droneEngine.getContextState?.(),
        })
      }
      if (primerSkippedForDiagnostic) {
        audioDiag('drone', 'post-lock media-primer skip result — startup succeeded', {
          contextState: droneEngine.getContextState?.(),
        })
      }
      // UI playing is committed immediately here — same path for normal and post-lock success.
      setIsPlaying(true)
      setIsDroneStarting(false)
      if (!audioAlreadyLive) {
        endMediaPrimerStartup('drone-play-success')
      }
      scheduleAudioStable(600, () => droneEngine.getContextState?.() === 'running', 'drone-play-success')
      guardEnded = true
    } catch (error) {
      audioDiag('drone', 'handlePlay failed', { message: error?.message ?? String(error) })
      if (primerSkippedForDiagnostic) {
        audioDiag('drone', 'post-lock media-primer skip result — startup failed', {
          message: error?.message ?? String(error),
          contextState: droneEngine.getContextState?.(),
        })
      }
      setAudioHealth(AudioHealth.FAILED, 'drone-play-failed')
      if (postLockPlay) {
        // Post-lock/cold-rebuild Play failed — hard-abort so no partial drone graph survives
        // (silences + disposes, keeps next Play on the safe cold path). This prevents "sound-on
        // while UI says Ready" on repeated lock/background cycles.
        droneEngine.abortFailedForegroundStartup('handlePlay-failed')
      } else {
        // Normal Play failure: keep next Play forced onto the safe path, but do NOT escalate to a
        // full cold rebuild (a normal first-start media-primer interruption must not poison it).
        droneEngine.setSafeForegroundPlayPending(true)
      }
      setIsPlaying(false)
      setIsDroneStarting(false)
      if (!audioAlreadyLive) {
        endMediaPrimerStartup('drone-play-failed', { immediate: true })
      }
      guardEnded = true
      if (!isMetronomePlaying) {
        pausePrimer('drone-play-failed', { force: true })
      }
    } finally {
      if (!guardEnded && isMediaPrimerStartupActive()) {
        endMediaPrimerStartup('drone-play-finally-fallback', { immediate: true })
      }
      isStartingRef.current = false
    }
  }

  function handleStop() {
    if (!isPlaying) {
      setIsDroneStarting(false)
      return
    }

    markUserAudioAction()
    setIsDroneStarting(false)
    audioDiag('drone-lifecycle', 'drone stop fade begin')
    droneEngine.stop()
    setIsPlaying(false)

    // Keep the primer alive if the metronome is still playing.
    if (isMetronomePlaying) {
      return
    }

    // Do NOT pause the primer immediately: pausing it during the stop fade can make iOS
    // interrupt/suspend the WebAudio context, which cuts the fade short AND silences the next start.
    // Defer the pause until the fade has fully completed and the app is genuinely idle.
    schedulePrimerPauseAfterDroneStopFade()
  }

  function schedulePrimerPauseAfterDroneStopFade() {
    audioDiag('media-primer', 'primer pause deferred until drone stop fade complete')

    if (dronePrimerPauseTimerRef.current) {
      window.clearTimeout(dronePrimerPauseTimerRef.current)
    }

    dronePrimerPauseTimerRef.current = window.setTimeout(() => {
      dronePrimerPauseTimerRef.current = null

      const audioStillActive = droneEngine.isPlaying === true
        || droneEngine.isStarting === true
        || droneEngine.metronomePlaying === true
        || isStartingRef.current === true

      if (audioStillActive) {
        audioDiag('media-primer', 'primer pause skipped — would interrupt active WebAudio', {
          dronePlaying: droneEngine.isPlaying,
          metronomePlaying: droneEngine.metronomePlaying,
        })
        return
      }

      pausePrimer('drone-stop-fade-complete')
      audioDiag('drone-lifecycle', 'drone stop fade complete')
    }, DRONE_STOP_PRIMER_PAUSE_DELAY_MS)
  }

  function shouldForwardKeyToEngine() {
    return isPlaying
      || isStartingRef.current
      || droneEngine.isPlaying
      || droneEngine.isStarting
  }

  async function handleKeyChange(key) {
    setSelectedKey(key)

    if (shouldForwardKeyToEngine()) {
      droneEngine.setKey(key)
      return
    }

    markUserAudioAction()
    isStartingRef.current = true

    const requireColdRebuild = droneEngine.requireColdAudioRebuildOnNextPlay === true
    const postLockPlay = requireColdRebuild
      || droneEngine.forceSafeForegroundPlayPending === true
      || droneEngine.lifecycleStopPendingPlay === true
    const audioAlreadyLive = !requireColdRebuild && isAudioAlreadyLive()
    if (!audioAlreadyLive) {
      beginMediaPrimerStartup('drone-key-change-start')
      setAudioHealth(AudioHealth.STARTING, 'drone-key-change-start')
    }

    if (droneEngine.forceSafeForegroundPlayPending || droneEngine.lifecycleStopPendingPlay || requireColdRebuild) {
      forceNextNativePlaybackConfigure()
    }

    let guardEnded = audioAlreadyLive

    try {
      if (requireColdRebuild) {
        await droneEngine.coldRebuildAudioContext('next-play-after-lock')
      }

      if (audioAlreadyLive) {
        audioDiag('drone', 'drone key-change start over live audio — skipping prime + native reconfigure', {
          ...droneEngine.getMetronomeDiagnostics?.(),
        })
      } else {
        await primeForPlayback('drone-key-change-start')
      }

      applyBinauralBeatToEngine()
      await droneEngine.start(
        key,
        toEngineVolume(volume),
        selectedOctave,
        intensity,
        breath,
        FIXED_REVERB_PERCENT,
        {
          skipNativeReconfigure: audioAlreadyLive,
          applyStartupMicroFade: !audioAlreadyLive,
          startupMicroFadeReason: requireColdRebuild ? 'next-play-after-lock' : 'foreground-start',
          postLockStartupMicroFade: postLockPlay,
        },
      )

      const contextOk = await ensureContextRunningAfterStart('drone-key-change-start')
      if (!contextOk) {
        throw new Error('AudioContext not running after drone start')
      }

      if (postLockPlay) {
        const playStartedAt = readPlayStartedTimestamp()
        const stable = await droneEngine.confirmStableStartWindow(playStartedAt)
        if (!stable) {
          audioDiag('drone', 'foreground startup failed — context interrupted after lock', {
            contextState: droneEngine.getContextState?.(),
          })
          throw new Error('Foreground startup not stable — context interrupted after lock')
        }
      }

      droneEngine.clearForegroundStartupFlags()
      setIsPlaying(true)
      if (!audioAlreadyLive) {
        endMediaPrimerStartup('drone-key-change-start-success')
      }
      scheduleAudioStable(600, () => droneEngine.getContextState?.() === 'running', 'drone-key-change-success')
      guardEnded = true
    } catch (error) {
      audioDiag('drone', 'handleKeyChange start failed', { message: error?.message ?? String(error) })
      setAudioHealth(AudioHealth.FAILED, 'drone-key-change-failed')
      if (postLockPlay) {
        droneEngine.abortFailedForegroundStartup('handleKeyChange-failed')
      } else {
        droneEngine.setSafeForegroundPlayPending(true)
      }
      setIsPlaying(false)
      if (!audioAlreadyLive) {
        endMediaPrimerStartup('drone-key-change-failed', { immediate: true })
      }
      guardEnded = true
      if (!isMetronomePlaying) {
        pausePrimer('drone-key-change-failed', { force: true })
      }
    } finally {
      if (!guardEnded && isMediaPrimerStartupActive()) {
        endMediaPrimerStartup('drone-key-change-finally-fallback', { immediate: true })
      }
      isStartingRef.current = false
    }
  }

  function handleOctaveChange(octave) {
    setSelectedOctave(octave)
    droneEngine.setOctave(octave)
  }

  function applyTuning(nextReferenceA) {
    const clamped = Math.min(MAX_REFERENCE_A_HZ, Math.max(MIN_REFERENCE_A_HZ, nextReferenceA))
    setReferenceA(clamped)
    droneEngine.setReferenceA(clamped)
  }

  function handlePresetChange(presetName) {
    const nextPreset = PRESETS.find((preset) => preset.name === presetName)

    if (!nextPreset) {
      return
    }

    setSelectedPresetName(nextPreset.name)

    // Reverb is fixed (FIXED_REVERB_PERCENT) and intentionally not changed by
    // preset selection, so the subtle background space stays consistent.
    droneEngine.setPreset(nextPreset)

    if (nextPreset.name === 'Binaural') {
      applyBinauralBeatToEngine()
    }
  }

  function handleBinauralModeChange(event) {
    const nextModeId = event.target.value
    setBinauralModeId(nextModeId)
    applyBinauralBeatToEngine(nextModeId)
  }

  function handleMoodChange(nextMoodId) {
    setMoodId(nextMoodId)
    droneEngine.setMood(nextMoodId)
  }

  function handleIntensityChange(event) {
    const nextIntensity = Number(event.target.value)
    setIntensity(nextIntensity)
    droneEngine.setIntensity(nextIntensity)
  }

  function handleBreathPointerDown() {
    isBreathDraggingRef.current = true
  }

  function handleBreathPointerUp(event) {
    isBreathDraggingRef.current = false
    setBreathVisual(Number(event.target.value))
  }

  function handleBreathChange(event) {
    const nextBreath = Number(event.target.value)
    setBreath(nextBreath)
    droneEngine.setBreath(nextBreath)

    if (!isBreathDraggingRef.current) {
      setBreathVisual(nextBreath)
    }
  }

  function handleVolumeChange(event) {
    const nextVolume = Math.min(100, Math.max(0, Number(event.target.value)))
    setVolume(nextVolume)
    droneEngine.setVolume(toEngineVolume(nextVolume))
  }

  async function handleMetronomePlay() {
    markUserAudioAction()
    audioDiag('metronome', 'handleMetronomePlay invoked — UI BEFORE', {
      uiIsMetronomePlaying: isMetronomePlaying,
      metronomeStartPending: metronomeStartPendingRef.current,
      startupGuardActive: isMediaPrimerStartupActive(),
      ...droneEngine.getMetronomeDiagnostics?.(),
    })

    if (metronomeStartPendingRef.current) {
      audioDiag('metronome', 'handleMetronomePlay skipped — metronomeStartPending')
      return
    }

    if (isMetronomePlaying) {
      audioDiag('metronome', 'handleMetronomePlay EARLY RETURN — UI thinks metronome already playing', {
        engineMetronomePlaying: droneEngine.getMetronomeDiagnostics?.()?.metronomePlaying,
      })
      return
    }

    const operationToken = beginMetronomeOperation('play')
    metronomeStartPendingRef.current = true
    setMetronomePulse({ tick: 0, downbeat: false })

    // If the drone engine is genuinely alive (ready + master chain ready + context running), start
    // the metronome against that live session: do NOT re-prime media or reconfigure the native
    // session, which can emit an interruption that disrupts the drone. The primer is NOT required
    // for this decision (it may already be paused while the drone plays fine).
    // Lightweight "metronome over running drone" path requires genuinely healthy shared audio —
    // not just masterChainReady. After an interruption/recovery or a prior failure, force a safe
    // start instead of trusting a stale running/ready snapshot.
    // After a lock/emergency interruption the context is poisoned — never take the lightweight
    // "over running drone" path; force a cold rebuild first.
    const requireColdRebuild = droneEngine.requireColdAudioRebuildOnNextPlay === true
    const postLockPlay = requireColdRebuild
      || droneEngine.forceSafeForegroundPlayPending === true
      || droneEngine.lifecycleStopPendingPlay === true
    const droneDiag = droneEngine.getMetronomeDiagnostics?.() ?? {}
    const droneAlreadyRunning = !requireColdRebuild
      && isPlaying
      && isAudioHealthStable()
      && droneDiag.contextState === 'running'
      && droneDiag.isReady === true

    if (!droneAlreadyRunning) {
      beginMediaPrimerStartup('metronome-play')
      setAudioHealth(AudioHealth.STARTING, 'metronome-play')

      // First audio after an unsafe teardown (background/interruption/hard reset): force the native
      // configure calls past the throttle so the session is genuinely re-asserted.
      if (droneEngine.forceSafeForegroundPlayPending || droneEngine.lifecycleStopPendingPlay || requireColdRebuild) {
        forceNextNativePlaybackConfigure()
      }
    }
    let guardEnded = droneAlreadyRunning

    try {
      if (requireColdRebuild) {
        await droneEngine.coldRebuildAudioContext('next-play-after-lock')

        if (!isMetronomeOperationCurrent(operationToken)) {
          audioDiag('metronome', 'stale metronome operation ignored', { phase: 'after-cold-rebuild' })
          return
        }
      }

      if (droneAlreadyRunning) {
        audioDiag('metronome', 'metronome start over running drone — skipping re-prime + native reconfigure', {
          contextState: droneEngine.getContextState?.(),
          primerPlaying: isPrimerPlaying(),
        })
      } else {
        await primeForPlayback('metronome-play')

        if (!isMetronomeOperationCurrent(operationToken)) {
          audioDiag('metronome', 'stale metronome operation ignored', { phase: 'after-primeForPlayback' })
          return
        }
      }

      droneEngine.setMetronomeSoundMode(DEFAULT_METRONOME_SOUND_MODE)
      droneEngine.setMetronomeMeter(DEFAULT_METRONOME_METER)
      // Fast audible start ONLY when the shared session is genuinely stable (drone already running).
      // Cold / uncertain / interrupted / recovering / failed → engine prepares silently and starts
      // the audible scheduler only after its settle/recovery window confirms stability.
      const startResult = await droneEngine.startMetronome(metronomeBpm, {
        operationToken,
        skipNativeReconfigure: droneAlreadyRunning,
        fastAudibleStart: droneAlreadyRunning,
      })

      if (!isMetronomeOperationCurrent(operationToken)) {
        audioDiag('metronome', 'stale metronome operation ignored', { phase: 'after-startMetronome' })
        droneEngine.stopMetronome({ droneActive: isPlaying })
        return
      }

      if (!isMetronomeEngineReady()) {
        droneEngine.stopMetronome({ droneActive: isPlaying })
        throw new Error('Metronome failed — context, scheduler, beats, or primer not ready after start')
      }

      // UI truth gate: never show metronome playing while audio health is not stable. The engine
      // sets health stable at the audible-scheduler start (after its settle/recovery window), so by
      // here it should be stable; if not, keep UI false and treat as a failed start.
      if (!isAudioHealthStable()) {
        audioDiag('metronome', 'metronome UI true delayed — health not stable', {
          health: getAudioHealth(),
          ...droneEngine.getMetronomeDiagnostics?.(),
        })
        droneEngine.stopMetronome({ droneActive: isPlaying })
        throw new Error('Metronome health not stable — not setting UI playing')
      }

      if (startResult?.startupRecovered) {
        audioDiag('metronome', 'metronome startup recovered before UI true', {
          health: getAudioHealth(),
          ...droneEngine.getMetronomeDiagnostics?.(),
        })
      }

      audioDiag('metronome', 'startMetronome resolved — setting UI isMetronomePlaying=true', {
        uiIsMetronomePlayingBefore: isMetronomePlaying,
        operationToken,
        droneAlreadyRunning,
        ...droneEngine.getMetronomeDiagnostics?.(),
        primer: getPrimerDebugState(),
      })
      setIsMetronomePlaying(true)
      // Confirmed stable metronome start re-asserted the native session — clear the forced flags.
      droneEngine.clearForegroundStartupFlags()
      if (!droneAlreadyRunning) {
        endMediaPrimerStartup('metronome-play-success')
      }
      guardEnded = true
      audioDiag('metronome', 'handleMetronomePlay complete — UI AFTER setState(true) requested', {
        note: 'React state updates on next render; panel shows live uiIsMetronomePlaying',
      })
    } catch (error) {
      const shouldCleanup = isMetronomeOperationCurrent(operationToken)
      if (shouldCleanup) {
        beginMetronomeOperation('failed-start')
      }

      audioDiag('metronome', 'handleMetronomePlay FAILED — metronome start failed', {
        message: error?.message ?? String(error),
        uiIsMetronomePlaying: isMetronomePlaying,
        operationToken,
        shouldCleanup,
        droneAlreadyRunning,
        ...droneEngine.getMetronomeDiagnostics?.(),
        primer: getPrimerDebugState(),
      })
      console.error('[Moondrone metronome] start failed', error)
      droneEngine.stopMetronome({ droneActive: isPlaying })
      setIsMetronomePlaying(false)
      // Only poison shared health when the drone is NOT playing. If the drone is live, a failed
      // metronome attempt must not mark the shared session failed (that would needlessly force the
      // drone onto a heavy path / imply it is broken).
      if (!isPlaying) {
        setAudioHealth(AudioHealth.FAILED, 'metronome-play-failed')
        audioDiag('metronome', 'metronome startup failed — allowing clean drone start', {
          health: getAudioHealth(),
        })
        // Hard-abort ONLY when this was a post-lock/emergency play AND the drone is not live (a
        // normal metronome-first startup interruption must not poison the next Play; and a live
        // drone must never be torn down by a metronome failure).
        if (postLockPlay) {
          droneEngine.abortFailedForegroundStartup('handleMetronomePlay-failed')
        }
      }
      if (!droneAlreadyRunning) {
        endMediaPrimerStartup('metronome-play-failed', { immediate: true })
      }
      guardEnded = true
      if (!isPlaying && shouldCleanup) {
        pausePrimer('metronome-play-failed', { force: true })
      }
    } finally {
      metronomeStartPendingRef.current = false
      if (!guardEnded && isMediaPrimerStartupActive()) {
        endMediaPrimerStartup('metronome-play-finally-fallback', { immediate: true })
      }
    }
  }

  function handleMetronomeStop() {
    markUserAudioAction()
    beginMetronomeOperation('stop')
    metronomeStartPendingRef.current = false

    const droneActive = isPlaying || droneEngine.isPlaying === true
    droneEngine.stopMetronome({ droneActive })
    setIsMetronomePlaying(false)

    if (droneActive) {
      // Drone is still playing: leave the primer alone (pausing it during active drone playback can
      // provoke iOS/session weirdness) and verify/repair the drone output immediately so we never
      // depend on a background/resume to bring the drone back.
      audioDiag('metronome', 'metronome stop skipped primer pause — drone active')
      droneEngine.verifyDroneOutputAfterMetronomeStop?.()
    } else {
      // Now idle — pause the primer.
      pausePrimer('metronome-stop', { force: true })
    }
  }

  function handleMetronomeBpmChange(event) {
    const nextBpm = Number(event.target.value)
    setMetronomeBpm(nextBpm)
    droneEngine.setMetronomeBpm(nextBpm)
  }

  const activeAtmosphere = getAtmosphere(atmosphereId)

  return (
    <main
      className="app-shell"
      data-atmosphere={atmosphereId}
      style={{ '--atmosphere-scrim-opacity': activeAtmosphere.scrim }}
    >
      <div className="atmosphere" aria-hidden="true">
        {ATMOSPHERES.map((atmosphere) => (
          <div
            key={atmosphere.id}
            className="atmosphere-image"
            data-active={atmosphere.id === atmosphereId}
            style={{
              backgroundImage: `url("${atmosphere.image}")`,
              '--atmosphere-opacity': atmosphere.opacity,
              '--atmosphere-brightness': atmosphere.brightness,
              '--atmosphere-contrast': atmosphere.contrast,
              '--atmosphere-saturate': atmosphere.saturate,
            }}
          />
        ))}
        <div className="atmosphere-scrim" aria-hidden="true" />
      </div>

      <div className="app-stack">
        <h1 id="app-title" className="visually-hidden">Moondrone</h1>

        <header className="app-header">
          <span
            className={isPlaying || isDroneStarting ? 'status-indicator active' : 'status-indicator'}
            aria-live="polite"
          >
            <span className="status-dot" aria-hidden="true" />
            {isPlaying ? 'Drone Active' : isDroneStarting ? 'Starting…' : 'Ready'}
          </span>

          <div className="header-actions">
            <MetronomeMenu
              bpm={metronomeBpm}
              onBpmChange={handleMetronomeBpmChange}
              isPlaying={isMetronomePlaying}
              metronomeStartPendingRef={metronomeStartPendingRef}
              onPlay={handleMetronomePlay}
              onStop={handleMetronomeStop}
            />

            <AtmosphereSelector atmosphereId={atmosphereId} onChange={setAtmosphereId} />

            <button
              type="button"
              className="header-info-button"
              aria-label="About and help"
              onClick={() => setInfoScreen('about')}
            >
              ?
            </button>
          </div>
        </header>

        <section className="instrument" aria-label="Drone instrument">
          <div
            className="moon-stage"
            data-moon={selectedPresetName}
            data-phase={moonPhaseVisualId}
            style={{
              '--intensity': intensity / 100,
              '--breath': breathVisual / 100,
              ...moonVisualStyle,
            }}
          >
            <span
              className={isPlaying ? 'moon-light-field playing' : 'moon-light-field'}
              aria-hidden="true"
            />

            <span
              className={isPlaying ? 'moon-haze playing' : 'moon-haze'}
              aria-hidden="true"
            />

            {isMetronomePlaying && metronomePulse.tick > 0 ? (
              <span
                key={metronomePulse.tick}
                className={metronomePulse.downbeat ? 'moon-pulse downbeat' : 'moon-pulse'}
                aria-hidden="true"
              />
            ) : null}

            <button
              type="button"
              className={
                isPlaying
                  ? 'moon-orb playing'
                  : isDroneStarting
                    ? 'moon-orb starting'
                    : 'moon-orb'
              }
              aria-label={
                isPlaying
                  ? 'Drone active. Stop drone'
                  : isDroneStarting
                    ? 'Starting drone'
                    : 'Play drone'
              }
              aria-pressed={isPlaying}
              aria-busy={isDroneStarting}
              onPointerDown={!isPlaying ? handlePlayPointerDown : undefined}
              onClick={isPlaying ? handleStop : handlePlay}
            >
              <span className="moon-orb-glow" aria-hidden="true" />
              <span className="moon-phase-glow" aria-hidden="true" />
              <img
                className="moon-artwork"
                src={moonArtworkSrc}
                alt=""
                aria-hidden="true"
              />
              <span className="moon-orb-transport" aria-hidden="true">
                {isPlaying ? (
                  <svg className="moon-transport-icon" viewBox="0 0 24 24">
                    <rect x="7" y="7" width="10" height="10" rx="2.4" fill="currentColor" />
                  </svg>
                ) : (
                  <svg className="moon-transport-icon moon-transport-icon-play" viewBox="0 0 24 24">
                    <path d="M9 5.5 L18 12 L9 18.5 Z" fill="currentColor" />
                  </svg>
                )}
              </span>
            </button>

            <div
              className={isPlaying ? 'note-ring playing' : 'note-ring'}
              role="radiogroup"
              aria-label="Key"
            >
              {CIRCLE_OF_FIFTHS.map((note, index) => (
                <button
                  key={note.value}
                  type="button"
                  role="radio"
                  aria-checked={note.value === selectedKey}
                  aria-label={note.secondary ? `${note.primary} or ${note.secondary}` : note.primary}
                  className={note.value === selectedKey ? 'note-button selected' : 'note-button'}
                  style={noteRingStyle(index, CIRCLE_OF_FIFTHS.length)}
                  onClick={() => handleKeyChange(note.value)}
                >
                  <span className="note-primary">{note.primary}</span>
                  {note.secondary ? <span className="note-secondary">{note.secondary}</span> : null}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="control-deck">
          <div className="deck-top">
            <section className="moon-block" aria-label="Moon">
              <span className="deck-label">Moon</span>
              <PresetSelector
                selectedPresetName={selectedPresetName}
                onChange={handlePresetChange}
              />
            </section>

            <section className="phase-block" aria-label={selectedPresetName === 'Binaural' ? 'Binaural beat' : 'Phase'}>
              {selectedPresetName === 'Binaural' ? (
                <>
                  <span className="deck-label">Beat</span>
                  <select
                    className="field-select field-select-compact"
                    value={binauralModeId}
                    onChange={handleBinauralModeChange}
                    aria-label="Binaural beat frequency"
                  >
                    {BINAURAL_MODES.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.label} · {mode.beatHz} Hz
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <span className="deck-label">Phase</span>
                  <MoodSelector selectedMoodId={moodId} onChange={handleMoodChange} />
                </>
              )}
            </section>
          </div>

          <section className="register-block" aria-label="Register">
            <span className="deck-label">Register</span>
            <div className="register-grid" role="radiogroup" aria-label="Register">
              {OCTAVE_OPTIONS.map((octave) => (
                <button
                  key={octave.value}
                  type="button"
                  role="radio"
                  aria-checked={octave.value === selectedOctave}
                  className={octave.value === selectedOctave ? 'register-cell selected' : 'register-cell'}
                  onClick={() => handleOctaveChange(octave.value)}
                >
                  {octave.label}
                </button>
              ))}
            </div>
          </section>

          <div className="deck-sliders">
            <section className="mini-control" aria-labelledby="intensity-label">
              <div className="mini-control-header">
                <div className="mini-control-title">
                  <svg
                    className="mini-control-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="3.4" />
                    <path d="M12 3.4 V5.6 M12 18.4 V20.6 M3.4 12 H5.6 M18.4 12 H20.6 M5.95 5.95 L7.5 7.5 M16.5 16.5 L18.05 18.05 M18.05 5.95 L16.5 7.5 M7.5 16.5 L5.95 18.05" />
                  </svg>
                  <h3 id="intensity-label">Intensity</h3>
                </div>
                <span>{intensity}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={intensity}
                className="slider"
                aria-label="Intensity"
                onChange={handleIntensityChange}
              />
            </section>

            <section className="mini-control" aria-labelledby="breath-label">
              <div className="mini-control-header">
                <div className="mini-control-title">
                  <svg
                    className="mini-control-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 8.5 C6.2 5.3, 9 5.3, 12 8.5 S17.8 11.7, 21 8.5" />
                    <path d="M3 15.5 C6.2 12.3, 9 12.3, 12 15.5 S17.8 18.7, 21 15.5" />
                  </svg>
                  <h3 id="breath-label">Breath</h3>
                </div>
                <span>{breath}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={breath}
                className="slider"
                aria-label="Breath"
                onPointerDown={handleBreathPointerDown}
                onPointerUp={handleBreathPointerUp}
                onPointerCancel={handleBreathPointerUp}
                onChange={handleBreathChange}
              />
            </section>
          </div>

          <div className="utility-bar">
            <div className="volume-mini">
              <svg className="volume-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 9 H7 L11.5 5 V19 L7 15 H4 Z"
                  fill="currentColor"
                />
                <path
                  d="M15 9 C16.5 10.5 16.5 13.5 15 15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={volume}
                className="slider slider-mini"
                aria-label="Master volume"
                onChange={handleVolumeChange}
              />
              <span className="utility-value">{volume}%</span>
            </div>

            <div className="tuning-stepper" role="group" aria-label="Reference tuning pitch">
              <button
                type="button"
                className="stepper-button"
                aria-label="Lower tuning"
                disabled={referenceA <= MIN_REFERENCE_A_HZ}
                onClick={() => applyTuning(referenceA - 1)}
              >
                −
              </button>
              <span className="stepper-value" aria-live="polite">A={referenceA}</span>
              <button
                type="button"
                className="stepper-button"
                aria-label="Raise tuning"
                disabled={referenceA >= MAX_REFERENCE_A_HZ}
                onClick={() => applyTuning(referenceA + 1)}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {infoScreen ? (
        <InfoModal
          screen={infoScreen}
          onClose={() => setInfoScreen(null)}
          onScreenChange={setInfoScreen}
        />
      ) : null}

      {DevOutputMeter ? (
        <Suspense fallback={null}>
          <DevOutputMeter />
        </Suspense>
      ) : null}
    </main>
  )
}

export default App
