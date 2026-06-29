import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_REFERENCE_A_HZ,
  MAX_MASTER_VOLUME_NORMALIZED,
  droneEngine,
} from './droneEngine'
import {
  DEFAULT_METRONOME_METER,
  DEFAULT_METRONOME_SOUND_MODE,
  METRONOME_STRAIGHT_METER,
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
import { addNativeAudioSessionListeners, configureNativePlaybackSession } from './nativeAudioSession'
import { ensurePrimerPlaying, getPrimerDebugState, isIosNative, isPrimerPlaying, pausePrimer } from './iosMediaPrimer'
import {
  beginMediaPrimerStartup,
  endMediaPrimerStartup,
  isMediaPrimerStartupActive,
} from './mediaPrimerStartupGuard'
import {
  beginMetronomeOperation,
  isMetronomeOperationCurrent,
} from './metronomeOperationControl'
import { AudioDebugPanel } from './AudioDebugPanel'
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
const DEFAULT_MASTER_VOLUME = 100
const MIN_REFERENCE_A_HZ = 415
const MAX_REFERENCE_A_HZ = 445
// Reverb is no longer user-controlled — kept as a fixed subtle background space.
// 20% maps through the engine wetness curve to a gentle ~0.09 wet signal.
const FIXED_REVERB_PERCENT = 20
const ATMOSPHERE_STORAGE_KEY = 'moondrone.atmosphere'
// Mood = slow motion/behavior layer for non-binaural moons. Persisted per session.
const MOOD_STORAGE_KEY = 'moondrone.mood'

function toEngineVolume(uiPercent) {
  return (uiPercent / 100) * MAX_MASTER_VOLUME_NORMALIZED
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
  const [metronomeSoundMode, setMetronomeSoundMode] = useState(DEFAULT_METRONOME_SOUND_MODE)
  const [metronomeMeter, setMetronomeMeter] = useState(DEFAULT_METRONOME_METER)
  const [isMetronomePlaying, setIsMetronomePlaying] = useState(false)
  const [metronomePulse, setMetronomePulse] = useState({ tick: 0, downbeat: false })
  const [infoScreen, setInfoScreen] = useState(null)
  const [atmosphereId, setAtmosphereId] = useState(readStoredAtmosphere)
  const [moodId, setMoodId] = useState(readStoredMood)
  const isStartingRef = useRef(false)
  const metronomeStartPendingRef = useRef(false)

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
    await configureNativePlaybackSession('media-primer-before')
    await ensurePrimerPlaying(reason)
    audioDiag('media-primer', `primeForPlayback END (${reason})`, getPrimerDebugState())
  }

  function isMetronomeEngineReady() {
    const diag = droneEngine.getMetronomeDiagnostics?.() ?? {}
    const primerOk = !isIosNative() || diag.primerPlaying === true || getPrimerDebugState().playing === true
    return diag.metronomePlaying === true
      && diag.schedulerActive === true
      && (diag.beatsScheduled ?? 0) > 0
      && diag.contextState === 'running'
      && primerOk
  }

  function handlePlayPointerDown() {
    if (isPlaying || isDroneStarting || isStartingRef.current) {
      return
    }

    setIsDroneStarting(true)
  }

  async function handlePlay() {
    if (isPlaying || isStartingRef.current) {
      setIsDroneStarting(false)
      return
    }

    setIsDroneStarting(true)
    isStartingRef.current = true
    beginMediaPrimerStartup('drone-play')
    let guardEnded = false

    try {
      audioDiag('drone', 'handlePlay ENTER')
      await primeForPlayback('drone-play')
      applyBinauralBeatToEngine()
      await droneEngine.start(selectedKey, toEngineVolume(volume), selectedOctave, intensity, breath, FIXED_REVERB_PERCENT)

      const contextOk = await ensureContextRunningAfterStart('drone-play')
      if (!contextOk) {
        throw new Error('AudioContext not running after drone start')
      }

      setIsPlaying(true)
      setIsDroneStarting(false)
      endMediaPrimerStartup('drone-play-success')
      guardEnded = true
    } catch (error) {
      audioDiag('drone', 'handlePlay failed', { message: error?.message ?? String(error) })
      setIsPlaying(false)
      setIsDroneStarting(false)
      endMediaPrimerStartup('drone-play-failed', { immediate: true })
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

    setIsDroneStarting(false)
    droneEngine.stop()
    setIsPlaying(false)

    // Keep the primer alive if the metronome is still playing; otherwise we are now idle.
    if (!isMetronomePlaying) {
      pausePrimer('drone-stop')
    }
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

    isStartingRef.current = true
    beginMediaPrimerStartup('drone-key-change-start')
    let guardEnded = false

    try {
      await primeForPlayback('drone-key-change-start')
      applyBinauralBeatToEngine()
      await droneEngine.start(key, toEngineVolume(volume), selectedOctave, intensity, breath, FIXED_REVERB_PERCENT)

      const contextOk = await ensureContextRunningAfterStart('drone-key-change-start')
      if (!contextOk) {
        throw new Error('AudioContext not running after drone start')
      }

      setIsPlaying(true)
      endMediaPrimerStartup('drone-key-change-start-success')
      guardEnded = true
    } catch (error) {
      audioDiag('drone', 'handleKeyChange start failed', { message: error?.message ?? String(error) })
      setIsPlaying(false)
      endMediaPrimerStartup('drone-key-change-failed', { immediate: true })
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

    // If the drone is already playing on a running context (primer already alive on iOS), start the
    // metronome against that live session: do NOT re-prime media or reconfigure the native session,
    // which can emit an interruption that disrupts the drone.
    const droneAlreadyRunning = isPlaying
      && droneEngine.getContextState?.() === 'running'
      && (!isIosNative() || isPrimerPlaying())

    if (!droneAlreadyRunning) {
      beginMediaPrimerStartup('metronome-play')
    }
    let guardEnded = droneAlreadyRunning

    try {
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

      droneEngine.setMetronomeSoundMode(metronomeSoundMode)
      droneEngine.setMetronomeMeter(metronomeMeter)
      await droneEngine.startMetronome(metronomeBpm, {
        operationToken,
        skipNativeReconfigure: droneAlreadyRunning,
      })

      if (!isMetronomeOperationCurrent(operationToken)) {
        audioDiag('metronome', 'stale metronome operation ignored', { phase: 'after-startMetronome' })
        droneEngine.stopMetronome()
        return
      }

      if (!isMetronomeEngineReady()) {
        droneEngine.stopMetronome()
        throw new Error('Metronome failed — context, scheduler, beats, or primer not ready after start')
      }

      audioDiag('metronome', 'startMetronome resolved — setting UI isMetronomePlaying=true', {
        uiIsMetronomePlayingBefore: isMetronomePlaying,
        operationToken,
        droneAlreadyRunning,
        ...droneEngine.getMetronomeDiagnostics?.(),
        primer: getPrimerDebugState(),
      })
      setIsMetronomePlaying(true)
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
        uiIsMetronomePlaying,
        operationToken,
        shouldCleanup,
        droneAlreadyRunning,
        ...droneEngine.getMetronomeDiagnostics?.(),
        primer: getPrimerDebugState(),
      })
      console.error('[Moondrone metronome] start failed', error)
      droneEngine.stopMetronome()
      setIsMetronomePlaying(false)
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
    beginMetronomeOperation('stop')
    metronomeStartPendingRef.current = false

    droneEngine.stopMetronome()
    setIsMetronomePlaying(false)

    // Keep the primer alive if the drone is still playing; otherwise we are now idle.
    if (!isPlaying) {
      pausePrimer('metronome-stop', { force: true })
    }
  }

  function handleMetronomeBpmChange(event) {
    const nextBpm = Number(event.target.value)
    setMetronomeBpm(nextBpm)
    droneEngine.setMetronomeBpm(nextBpm)
  }

  function handleMetronomeSoundChange(event) {
    const nextSoundMode = event.target.value
    setMetronomeSoundMode(nextSoundMode)
    droneEngine.setMetronomeSoundMode(nextSoundMode)
  }

  function handleMetronomeMeterChange(event) {
    const nextMeter = event.target.value === METRONOME_STRAIGHT_METER
      ? METRONOME_STRAIGHT_METER
      : Number(event.target.value)
    setMetronomeMeter(nextMeter)
    droneEngine.setMetronomeMeter(nextMeter)
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
              soundMode={metronomeSoundMode}
              onSoundChange={handleMetronomeSoundChange}
              meter={metronomeMeter}
              onMeterChange={handleMetronomeMeterChange}
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

      <AudioDebugPanel uiIsMetronomePlaying={isMetronomePlaying} />
    </main>
  )
}

export default App
