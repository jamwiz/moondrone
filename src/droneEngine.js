import * as Tone from 'tone'
import { audioDiag } from './audioDiagnostics'
import { configureNativePlaybackSession, isNativePlaybackActive, isNativePlaybackRecentlyConfigured, wasLastNativeConfigureClean } from './nativeAudioSession'
import { ensurePrimerPlaying, getPrimerDebugState, isIosNative, isPrimerPlaying } from './iosMediaPrimer'
import { isMediaPrimerStartupActive } from './mediaPrimerStartupGuard'
import { AudioHealth, setAudioHealth, scheduleAudioStable } from './audioHealth'
import {
  DEFAULT_METRONOME_METER,
  DEFAULT_METRONOME_SOUND_MODE,
  METRONOME_SAMPLE_IDS,
  METRONOME_SAMPLE_URLS,
  METRONOME_STRAIGHT_METER,
  TRIANGLE_OPEN_PLAYER_POOL_SIZE,
  resolveMetronomeSampleUrl as resolveMetronomeAssetUrl,
} from './metronomeSamples'

import {
  DEFAULT_MOOD_ID,
  MOOD_BLOOM_SHELF_FREQUENCY,
  MOOD_BLOOM_SHELF_Q,
  MOOD_BLOOM_WEIGHTS,
  MOOD_DUAL_BEATS,
  MOOD_ECLIPSE_FREQUENCY_MAX,
  MOOD_ECLIPSE_FREQUENCY_MIN,
  MOOD_ECLIPSE_PEAK_Q,
  MOOD_LOOP_TUNING,
  MOOD_ROOT_DETUNE_CAP_CENTS,
  MOOD_ROOT_DETUNE_SCALE,
  MOOD_TRUE_ORBIT,
  MOOD_TUNING,
} from './moods'

import {
  AIR_SHIMMER_TUNING,
  BINAURAL_MODES,
  BINAURAL_PAN_AMOUNT,
  MOON_AUX_LAYER_CROSSFADE,
  MOON_CHANGE_DEBUG,
  MOON_TRANSITION,
  MOON_TRANSITION_ISOLATION,
  MOON_VOICE_CROSSFADE,
  PRESET_TRANSITION_DEBUG,
  BINAURAL_UNDERTONE_GAIN,
  BREATH_TUNING,
  CHOIR_TUNING,
  COSMOS_EXTENSION_GAINS,
  COSMOS_TUNING,
  DEFAULT_BINAURAL_MODE_ID,
  DEFAULT_PRESET,
  DEFAULT_REFERENCE_A_HZ,
  FOUNDATION_PRESENCE,
  FOUNDATION_ROOT_GAIN,
  PRESET_FOUNDATION_ROOT_GAIN,
  INTENSITY_TUNING,
  HIGH_VH_CLEAN_VOICING,
  STERILE_DIAGNOSTIC_MODE,
  STRINGS_ISOLATION_MODE,
  STRINGS_HIGH_REGISTER_AIR_DEBUG,
  STRINGS_TUNING,
  MASTER_TUNING,
  MAX_REFERENCE_A_HZ,
  METRONOME_TUNING,
  MIN_REFERENCE_A_HZ,
  OUTPUT_TUNING,
  PRESET_AIR_SHIMMER_GAIN_SCALE,
  PRESET_HIGH_BREATH_AIR_GAIN_SCALE,
  PRESET_BALANCE_TRIM_DB,
  PRESET_BREATH_AMOUNT_SCALE,
  PRESET_BREATH_VOICE_GAIN_SCALE,
  PRESET_INTENSITY_TUNING,
  PRESET_MOON_PHASE_HARMONICS_GAIN_SCALE,
  PRESET_PROJECTION_TUNING,
  PRESET_REGISTER_BALANCE_TRIM_DB,
  PRESET_REGISTER_BREATH_VOICE_GAIN_SCALE,
  PRESET_REGISTER_VOICE_GAIN_SCALE,
  PRESET_REGISTER_VOICE_PRESENCE_MULTIPLIER,
  PRESET_REVERB_WET_SCALE,
  PROJECTION_TUNING,
  PRESET_BODY_MID_EQ,
  PRESET_BUS_EQ_INTENSITY_START,
  PRESET_BUS_EQ_PROFILES,
  PRESET_BUS_EQ_REGISTER_BLEND,
  PRESET_BUS_EQ_ALWAYS_ON_BLEND,
  PRESET_REGISTER_BUS_EQ,
  PRESET_MEDIUM_BODY_NOTCH,
  PRESET_MEDIUM_BODY_NOTCH_FREQUENCY_RANGE,
  PRESET_MEDIUM_BODY_HARMONIC_SOFTENING,
  PRESET_LOW_MID_REGISTER_VOICING,
  PRESET_VOICE_OSCILLATOR_TYPES,
  PRESET_VOICE_PRESENCE_MULTIPLIER,
  presetUsesCustomOscillatorProfile,
  REGISTER_BALANCE_TRIM_DB,
  REGISTER_OCTAVES,
  REVERB_TUNING,
  SHRUTI_REGISTER_DAMPING,
  SHRUTI_BUS_EQ,
  SPEAKER_SAFETY_TUNING,
  TRANSITION_TUNING,
  TUNING_RAMP_SECONDS,
  VOICE_ARCHITECTURE,
  VOICE_LAYER_PRESENCE,
} from './soundTuning'

import {
  TONE_LAB_TUNING,
  applyMoonPhaseHarmonicBloomBrightness,
  computeBreathAirEnvelope,
  getToneLabBreathFilterEndpoints,
  getToneLabCompressorSettings,
  resolveToneLabMasterTone,
  resolveToneLabBusEqTargets,
  TONE_LAB_BUS_EQ_NEUTRAL,
  TONE_LAB_DYNAMICS_NEUTRAL,
  scaleMoonPhaseHarmonicMotion,
  scaleMoonPhaseHarmonicOrbitCents,
} from './toneLab'

const {
  intervals: VOICE_INTERVALS,
  foundationRootIndex: FOUNDATION_ROOT_VOICE_INDEX,
  binauralRightIndex: BINAURAL_RIGHT_VOICE_INDEX,
  cosmosCelestialIndex: COSMOS_CELESTIAL_VOICE_INDEX,
  cosmosCelestialInterval: COSMOS_CELESTIAL_INTERVAL,
  cosmosSkyRootIndex: COSMOS_SKY_ROOT_VOICE_INDEX,
  cosmosSkyRootInterval: COSMOS_SKY_ROOT_INTERVAL,
  cosmosSkyOctaveIndex: COSMOS_SKY_OCTAVE_VOICE_INDEX,
  cosmosSkyOctaveInterval: COSMOS_SKY_OCTAVE_INTERVAL,
} = VOICE_ARCHITECTURE

const COSMOS_CELESTIAL_GAIN = COSMOS_EXTENSION_GAINS.celestial
const COSMOS_SKY_ROOT_GAIN = COSMOS_EXTENSION_GAINS.skyRoot
const COSMOS_SKY_OCTAVE_GAIN = COSMOS_EXTENSION_GAINS.skyOctave
const VOICE_COUNT = COSMOS_SKY_OCTAVE_VOICE_INDEX + 1
const LOW_REGISTER_OCTAVE = REGISTER_OCTAVES.LOW
const MEDIUM_REGISTER_OCTAVE = REGISTER_OCTAVES.MEDIUM
const HIGH_REGISTER_OCTAVE = REGISTER_OCTAVES.HIGH
const VERY_HIGH_REGISTER_OCTAVE = REGISTER_OCTAVES.VERY_HIGH

const SHRUTI_HIGH_OCTAVE_LAYER_DAMPING = SHRUTI_REGISTER_DAMPING.high.octaveBodyLayers
const SHRUTI_HIGH_UPPER_OCTAVE_DAMPING = SHRUTI_REGISTER_DAMPING.high.upperOctaveLayer
const SHRUTI_VERY_HIGH_OCTAVE_LAYER_DAMPING = SHRUTI_REGISTER_DAMPING.veryHigh.octaveBodyLayers
const SHRUTI_VERY_HIGH_UPPER_OCTAVE_DAMPING = SHRUTI_REGISTER_DAMPING.veryHigh.upperOctaveLayer
const SHRUTI_VERY_HIGH_FOUNDATION_VOICING_DAMPING = SHRUTI_REGISTER_DAMPING.veryHigh.foundationVoicing
const SHRUTI_VERY_HIGH_STRESS_INTENSITY = SHRUTI_REGISTER_DAMPING.veryHighStressIntensity
const SHRUTI_VERY_HIGH_FILTER_FOCUS_DAMPING = SHRUTI_REGISTER_DAMPING.veryHighStress.filterFocus
const SHRUTI_VERY_HIGH_FIFTH_DAMPING = SHRUTI_REGISTER_DAMPING.veryHighStress.fifth
const SHRUTI_VERY_HIGH_FOUNDATION_DAMPING = SHRUTI_REGISTER_DAMPING.veryHighStress.foundation
const SHRUTI_VERY_HIGH_UPPER_LAYER_DAMPING = SHRUTI_REGISTER_DAMPING.veryHighStress.upperLayers

const DEFAULT_BINAURAL_BEAT_HZ = BINAURAL_MODES.find((mode) => mode.id === DEFAULT_BINAURAL_MODE_ID).beatHz
const DEFAULT_INTENSITY = INTENSITY_TUNING.defaultUi
const DEFAULT_BREATH = BREATH_TUNING.defaultUi
const INTENSITY_NEUTRAL_UI = INTENSITY_TUNING.neutralUi
const INTENSITY_USEFUL_RANGE = INTENSITY_TUNING.usefulRange
const INTENSITY_FILTER_FREQUENCY_MIN = INTENSITY_TUNING.filterFrequencyMin
const INTENSITY_FILTER_FREQUENCY_MAX = INTENSITY_TUNING.filterFrequencyMax
const INTENSITY_CURVE_POWER_DARK = INTENSITY_TUNING.curvePowerDark
const INTENSITY_CURVE_POWER_BRIGHT = INTENSITY_TUNING.curvePowerBright
const INTENSITY_Q_GENTLE_MAX = INTENSITY_TUNING.qGentleMax
const INTENSITY_Q_STRONG_MAX = INTENSITY_TUNING.qStrongMax
const INTENSITY_Q_FOCUS_DAMPING = INTENSITY_TUNING.qFocusDamping
const INTENSITY_Q_RAMP_START_UI = INTENSITY_TUNING.qRampStartUi
const INTENSITY_LOW_END_RAMP_START_UI = INTENSITY_TUNING.lowEndRampStartUi
const INTENSITY_LOW_OCTAVE_MAX_REDUCTION = INTENSITY_TUNING.lowOctaveMaxReduction
const INTENSITY_FOUNDATION_MAX_REDUCTION = INTENSITY_TUNING.foundationMaxReduction
const INTENSITY_RAMP_SECONDS = INTENSITY_TUNING.rampSeconds

const SPEAKER_LOW_LAYER_SCALE_BY_REGISTER = SPEAKER_SAFETY_TUNING.lowLayerScaleByRegister
const SPEAKER_UPPER_HARMONIC_SCALE = SPEAKER_SAFETY_TUNING.upperHarmonicScale
const SPEAKER_COSMOS_EXTENSION_SCALE = SPEAKER_SAFETY_TUNING.cosmosExtensionScale
const SPEAKER_CHOIR_UPPER_HARMONIC_MULTIPLIER = SPEAKER_SAFETY_TUNING.choirUpperHarmonicMultiplier
const SPEAKER_STRINGS_UPPER_HARMONIC_MULTIPLIER = SPEAKER_SAFETY_TUNING.stringsUpperHarmonicMultiplier
const SPEAKER_PURE_UPPER_HARMONIC_MULTIPLIER = SPEAKER_SAFETY_TUNING.pureUpperHarmonicMultiplier

const OUTPUT_BOOST_DB = OUTPUT_TUNING.outputBoostDb
const MIN_VOLUME_DB = OUTPUT_TUNING.minVolumeDb
const NOTE_FADE_OUT_SECONDS = TRANSITION_TUNING.noteFadeOutSeconds
const NOTE_FADE_IN_DELAY_SECONDS = TRANSITION_TUNING.noteFadeInDelaySeconds
const NOTE_FADE_IN_SECONDS = TRANSITION_TUNING.noteFadeInSeconds
const BREATH_REANCHOR_DELAY_SECONDS = TRANSITION_TUNING.breathReanchorDelaySeconds
const BREATH_REANCHOR_RAMP_SECONDS = TRANSITION_TUNING.breathReanchorRampSeconds
const START_FADE_SECONDS = TRANSITION_TUNING.startFadeSeconds
const STOP_FADE_SECONDS = TRANSITION_TUNING.stopFadeSeconds
const STOP_FADE_QUICK_SECONDS = TRANSITION_TUNING.stopFadeQuickSeconds
const STOP_FADE_QUICK_LEVEL = TRANSITION_TUNING.stopFadeQuickLevel
const PRESET_GAIN_RAMP_SECONDS = TRANSITION_TUNING.presetGainRampSeconds
const PRESET_LAYER_FADE_OUT_SECONDS = TRANSITION_TUNING.presetLayerFadeOutSeconds
const PRESET_LAYER_FADE_IN_SECONDS = TRANSITION_TUNING.presetLayerFadeInSeconds
const MOOD_LIVE_TRANSITION_SECONDS = TRANSITION_TUNING.moodLiveTransitionSeconds
const BINAURAL_UNDERTONE_FADE_IN_DELAY_SECONDS = TRANSITION_TUNING.binauralUndertoneFadeInDelaySeconds
const BINAURAL_UNDERTONE_POST_TRANSITION_SETTLE_SECONDS = TRANSITION_TUNING.binauralUndertonePostTransitionSettleSeconds
const BINAURAL_UNDERTONE_POST_TRANSITION_FADE_IN_SECONDS = TRANSITION_TUNING.binauralUndertonePostTransitionFadeInSeconds
const BINAURAL_UNDERTONE_EXIT_FADE_OUT_SECONDS = TRANSITION_TUNING.binauralUndertoneExitFadeOutSeconds
const STRINGS_SWITCH_HEADROOM = TRANSITION_TUNING.stringsSwitchHeadroom
const BREATH_CYCLE_SECONDS = BREATH_TUNING.cycleSeconds
const BREATH_UPDATE_SECONDS = BREATH_TUNING.updateSeconds
const BREATH_OFFSET_DEPTH = BREATH_TUNING.offsetDepth
const BREATH_VOICE_MOTION_DEPTH = BREATH_TUNING.voiceMotionDepth
const BREATH_EXHALE_SOFTENING = BREATH_TUNING.exhaleSoftening

const STRINGS_PARTIAL_COUNT = STRINGS_TUNING.partialCount
const STRINGS_SAW_AMOUNT_BODY = STRINGS_TUNING.sawAmountBody
const STRINGS_SAW_AMOUNT_MID = STRINGS_TUNING.sawAmountMid
const STRINGS_SAW_AMOUNT_UPPER = STRINGS_TUNING.sawAmountUpper
const STRINGS_ENSEMBLE_DETUNE_CENTS = STRINGS_TUNING.ensembleDetuneCents
const STRINGS_DRIFT_CENTS = STRINGS_TUNING.driftCents
const STRINGS_DRIFT_RAMP_MIN_SECONDS = STRINGS_TUNING.driftRampMinSeconds
const STRINGS_DRIFT_RAMP_MAX_SECONDS = STRINGS_TUNING.driftRampMaxSeconds
const STRINGS_DRIFT_PAUSE_MIN_SECONDS = STRINGS_TUNING.driftPauseMinSeconds
const STRINGS_DRIFT_PAUSE_MAX_SECONDS = STRINGS_TUNING.driftPauseMaxSeconds
const STRINGS_HIGH_REGISTER_BREATH_RAMP_MULTIPLIER = STRINGS_TUNING.highRegisterBreathRampMultiplier
const STRINGS_HIGH_REGISTER_EXHALE_DIP_SLEW = STRINGS_TUNING.highRegisterExhaleDipSlew
const STRINGS_HIGH_REGISTER_TRANSITION_DECLICK = STRINGS_TUNING.highRegisterTransitionDeClick
const STRINGS_HIGH_REGISTER_AIR_TRANSITION = STRINGS_TUNING.highRegisterAirTransition

const CHOIR_ENSEMBLE_PAN_AMOUNT = CHOIR_TUNING.ensemblePanAmount
const CHOIR_ENSEMBLE_DETUNE_CENTS = CHOIR_TUNING.ensembleDetuneCents
const CHOIR_ENSEMBLE_PANS = [0, -CHOIR_ENSEMBLE_PAN_AMOUNT, CHOIR_ENSEMBLE_PAN_AMOUNT]

const DEFAULT_METRONOME_BPM = METRONOME_TUNING.defaultBpm
const MIN_METRONOME_BPM = METRONOME_TUNING.minBpm
const MAX_METRONOME_BPM = METRONOME_TUNING.maxBpm
const METRONOME_LOOKAHEAD_SECONDS = METRONOME_TUNING.lookaheadSeconds
const METRONOME_TRANSITION_PRIME_SECONDS = METRONOME_TUNING.transitionPrimeSeconds
const METRONOME_SCHEDULE_INTERVAL_MS = METRONOME_TUNING.scheduleIntervalMs
const METRONOME_LATE_TOLERANCE_SECONDS = METRONOME_TUNING.lateToleranceSeconds
const METRONOME_MAX_BEATS_PER_SCHEDULE_TICK = METRONOME_TUNING.maxBeatsPerScheduleTick
const METRONOME_CREATE_VOICES_PRIME_INTERVAL = METRONOME_TUNING.createVoicesPrimeInterval
const METRONOME_TRIM_DB = METRONOME_TUNING.trimDb
const METRONOME_OUTPUT_DB = METRONOME_TUNING.outputDb
const METRONOME_ACCENT_DB = METRONOME_TUNING.accentDb
const METRONOME_REGULAR_DB = METRONOME_TUNING.regularDb
const METRONOME_ATTACK_SOFTENING_DB = METRONOME_TUNING.attackSofteningDb
const METRONOME_ATTACK_RAMP_SECONDS = METRONOME_TUNING.attackRampSeconds
const METRONOME_SOFT_CLIP_DRIVE = METRONOME_TUNING.softClipDrive
const METRONOME_SOFT_CLIP_SCALE = METRONOME_TUNING.softClipScale
const METRONOME_PRESENCE_FREQUENCY = METRONOME_TUNING.presenceFrequency
const METRONOME_PRESENCE_GAIN_DB = METRONOME_TUNING.presenceGainDb
const METRONOME_PRESENCE_Q = METRONOME_TUNING.presenceQ
const METRONOME_CLICK_FREQUENCY = METRONOME_TUNING.clickFrequency
const METRONOME_CLICK_GAIN_DB = METRONOME_TUNING.clickGainDb
const METRONOME_CLICK_Q = METRONOME_TUNING.clickQ
const METRONOME_TRIANGLE_OPEN_SAMPLE_DB = METRONOME_TUNING.triangleOpenSampleDb

const DRONE_BASS_SHELF_FREQUENCY = SPEAKER_SAFETY_TUNING.bassShelfFrequency
const DRONE_BASS_SHELF_GAIN_DB = SPEAKER_SAFETY_TUNING.bassShelfGainDb
const DRONE_BASS_SHELF_Q = SPEAKER_SAFETY_TUNING.bassShelfQ
const DRONE_MID_VOICING_EQ_FREQUENCY = SPEAKER_SAFETY_TUNING.midVoicingEqFrequency
const DRONE_MID_VOICING_EQ_Q = SPEAKER_SAFETY_TUNING.midVoicingEqQ
const DRONE_MID_VOICING_EQ_GAIN_DB = SPEAKER_SAFETY_TUNING.midVoicingEqGainDb
const AMBIENT_BODY_VOICING_SCALE = SPEAKER_SAFETY_TUNING.ambientBodyVoicingScale

const DRONE_OUTPUT_TRIM_DB = OUTPUT_TUNING.droneOutputTrimDb
const LEGACY_MASTER_LIMITER_DB = OUTPUT_TUNING.masterLimiterDb
const DRONE_METRONOME_HEADROOM_DB = OUTPUT_TUNING.droneMetronomeHeadroomDb
const DRONE_METRONOME_HEADROOM_RAMP_SECONDS = OUTPUT_TUNING.droneMetronomeHeadroomRampSeconds
const MAX_MASTER_VOLUME_NORMALIZED = OUTPUT_TUNING.maxMasterVolumeNormalized

export class DroneEngine {
  constructor() {
    this.output = null
    this.droneBusEq = null
    this.droneMidVoicingEq = null
    this.presetLowMidEq = null
    this.presetMediumBodyEq = null
    this.presetBodyMidEq = null
    this.presetUpperMidEq = null
    // Master output stage (mobile mastering). Drone bus runs through the full
    // chain; the metronome bus joins only at the final limiter (see ensureMasterOutput).
    this.masterChainReady = false
    this.masterPreLowShelf = null
    this.masterInput = null
    this.masterCompressor = null
    this.masterSaturator = null
    this.masterMakeup = null
    this.masterLimiter = null
    this.masterFinalOutputTrim = null
    this.devOutputGain = null
    this.devOutputGainDb = 0
    this.devOutputMeterPeak = null
    this.devOutputMeterRms = null
    this.devOutputAnalyser = null
    this.masterMeter = null
    this.masterMeterPre = null
    this.masterMeterPostCompressor = null
    this.masterMeterPostSaturation = null
    this.masterLevelLogTimer = null
    this.masterDiagnosticsTimer = null
    this.stereoWidener = null
    this.filter = null
    this.reverb = null
    // Projection Mode (experimental phone-speaker translation). Transparent when off.
    this.projectionMode = PROJECTION_TUNING.enabledByDefault
    this.projectionDryNarrower = null
    this.projectionLowMidCut = null
    this.projectionPresenceEqs = []
    // Mood: slow motion/behavior layer for non-binaural moons. Drives detune,
    // harmonic redistribution, eclipse masking, and stereo drift via a slow loop.
    this.mood = DEFAULT_MOOD_ID
    this.moodFrame = null
    this.moodStartTime = null
    this.lastMoodUpdateTime = 0
    // Dedicated mood spectral nodes (transparent at 0 dB when no mood is active).
    this.moodBloomEq = null
    this.moodEclipseEq = null
    // True Orbit: a dedicated symmetric oscillator pair (separate from the voices)
    // whose two partners sweep in opposite directions around a center pitch, so the
    // beat between them swells and eases. Silent (busGain 0) unless the active mood
    // defines a trueOrbit block. Oscillators run continuously once started.
    this.orbitPair = null
    this.orbitStarted = false
    // True dual beats (Super only): two hard-panned stereo oscillator pairs whose
    // L/R frequency difference IS the beat. Routed straight to the drone output so
    // their stereo split survives intact. Silent (pairGain 0) unless Super is active.
    this.dualBeats = null
    this.dualBeatsStarted = false
    this.airLowMidScoop = null
    this.airShelfEq = null
    this.airBreathNoise = null
    this.airBreathHighpass = null
    this.airBreathLowpass = null
    this.airBreathGain = null
    this.airBreathStarted = false
    this.toneLabHighpass = null
    this.toneLabLowpass = null
    this.toneLabLowMid = null
    this.toneLabSpeakerPresence = null
    this.toneLabHighMid = null
    this.toneLabAir = null
    this.toneLabUpperAir = null
    this.voices = []
    this.breathFrame = null
    this.breathStartTime = null
    this.lastBreathUpdateTime = 0
    this.currentKey = 'C'
    this.currentOctave = 3
    this.currentPreset = DEFAULT_PRESET
    this.currentReverbWet = DEFAULT_PRESET.reverb.wet
    this.intensity = DEFAULT_INTENSITY
    this.breath = DEFAULT_BREATH
    this.volume = MAX_MASTER_VOLUME_NORMALIZED
    this.binauralBeatHz = DEFAULT_BINAURAL_BEAT_HZ
    this.referenceA = DEFAULT_REFERENCE_A_HZ
    this.isReady = false
    this.hasStarted = false
    this.isPlaying = false
    this.isStarting = false
    // Last key/register requested while start() is still async (Play gesture → IR ready).
    this.pendingStartupNote = null
    // During full-chain crossfade, hold breath-driven voice ramps so the silent-settled
    // targets stay locked until the new deck is fully audible.
    this.fullChainCrossfadeVoiceHoldUntil = 0
    this.presetTransitionEndsAt = 0
    this.startupFadeEndsAt = 0
    this.stopFadeEndsAt = 0
    // Monotonic token bumped on every drone start AND stop. Delayed fade/teardown/dispose/startup
    // callbacks capture the token and bail if a newer start/stop has superseded them — this is what
    // makes Stop → quick Play safe (no stale fade or teardown bleeding into the fresh start).
    this.droneOpGeneration = 0
    // Explicit-stop intent gate (separate from graph readiness). After a user Stop, isReady /
    // masterChainReady / running context are NOT enough to qualify a lightweight drone start — the
    // next Play must take the safe startup path. Cleared on a clean start().
    this.droneExplicitlyStopped = false
    this.lastDroneStopAt = 0
    // Set when a background/lifecycle stop occurs so the next start() logs that it is taking the
    // normal safe foreground startup path (background audio is intentionally not kept alive).
    this.lifecycleStopPendingPlay = false
    // Guards the graceful lifecycle stop so duplicate inactive/hidden/pagehide events do not
    // double-teardown. Reset after the deferred teardown completes.
    this.lifecycleStopInProgress = false
    this.noteCrossfadeEndsAt = 0
    this.noteCrossfadeTimeoutIds = []
    // Each in-flight crossfade's outgoing voices get their own dispose timer here
    // so a later crossfade can never orphan them (root cause of the rapid
    // note-switch glitch: stuck tones + accumulating oscillators).
    this.outgoingNoteCrossfadeVoiceSets = []
    this.metronomeBpm = DEFAULT_METRONOME_BPM
    this.metronomeSoundMode = DEFAULT_METRONOME_SOUND_MODE
    this.metronomeMeter = DEFAULT_METRONOME_METER
    this.metronomeActiveMeter = DEFAULT_METRONOME_METER
    this.metronomePendingMeter = null
    this.metronomeMeasureBeatIndex = 0
    this.metronomePlaying = false
    this.metronomeTimer = null
    this.metronomeUsesInterval = false
    this.metronomeStartOperationToken = null
    this.metronomePrimerWatchdogTimer = null
    this.metronomeContextRecoveryDeadline = 0
    this.metronomeNeedsResync = false
    this.metronomeContextStallLogged = false
    // Single-owner recovery for the metronome STARTUP window: bumped per startMetronome so a stale
    // startup recovery (from a superseded start) is ignored, and so watchdog/statechange/native
    // interruption do not each independently resync the same startup interruption.
    this.metronomeStartupGeneration = 0
    this.metronomeStartupRecoveryPending = false
    // Optional visual-only hook, invoked via Tone.Draw (synced to the audio
    // clock) on each audible beat so the UI can pulse. Never affects audio.
    this.onMetronomeBeat = null
    // Optional hook fired when iOS interrupts audio (call / other app / Siri) and the
    // Web Audio context enters "interrupted". The UI uses it to clear playing state so it
    // never pretends to be playing while silent. Set by App; never affects audio scheduling.
    this.onPlaybackInterrupted = null
    this.contextStateWatcherAttached = false
    this.contextInterruptDebounceTimer = null
    this.contextInterruptRecoveryInFlight = false
    this.nextMetronomeBeatTime = 0
    this.metronomePlayerPools = null
    this.metronomeTrim = null
    this.metronomeSoftClip = null
    this.metronomePresenceEq = null
    this.metronomeClickEq = null
    this.metronomeGain = null
    this.metronomeChainReady = null
    this.metronomeUsesSampleFallback = false
    this.metronomeFallbackOsc = null
    this.metronomeFallbackVolume = null
    this.droneMetronomeHeadroomDb = 0
    this.transitionDiagnosticsEnabled = false
    this.pendingBinauralTransitionRamp = null
    this.presetTransitionDebugContext = null
    this.presetTransitionDebugProbeIds = []
    this.presetTransitionDebugLastCanRamp = false
    this.moonChangeDebugProbeIds = []
    this.moonChangeDebugContext = null
    this.moonHarmonicEntryTargetSnapshot = null
    this.binauralUndertonesHeldSilent = false
    this.binauralUndertoneDeferredTimeout = null
    this.binauralUndertonesHeldSilentClearTimeout = null
    this.stringsTransitionBreathRampUntil = 0
    this.stringsDriftResumeTimeoutId = null
    this.stringsHighRegisterAirReanchorTimeoutId = null
    this.pendingStringsHighRegisterAirReanchor = false
    this.stringsHighRegisterAirDeclickUntil = 0
    this.stringsHighRegisterAirShelfLockedUntil = 0
    this.stringsHighRegisterAirFilterLockedUntil = 0
    this.moonTransitionBreathSnapshot = null
    this.moonEntryContinuity = null
    this.moonEntryBreathMorphUntil = 0
    this.moonEntryMorphCompletionTimeoutId = null
    this.pendingMoonVoiceRebuildCrossfade = false
    this.moonTransitionBusSnapshot = null
    this.moonVoiceCrossfadePlan = null
    this.moonVoiceCrossfadeMorphUntil = 0
    this.moonAuxLayerCrossfadeActive = false
    this.moonAuxLayerCrossfadeUntil = 0
    this.moonAuxMorphStart = 0
    this.moonReanchorTimeline = []
    this.moonTransitionContext = null
    this.moonTransitionAuxHandoffUntil = 0
    this.moonTransitionIsolationProbeIds = []
    // Simple Moon-change transition: one group gain on the whole drone bus + the timer
    // that performs the silent rebuild at the fade-out's silent point.
    this.moonTransitionGain = null
    this.simpleMoonTransitionTimeoutId = null
    // Separate transition reverb bloom bus (dry send → HP sweep → long reverb → master).
    // Bypasses moonTransitionGain so the wash sustains while the main drone ducks.
    this.moonTransitionSendGain = null
    this.moonTransitionHighpass = null
    this.moonTransitionDampLowpass = null
    this.moonTransitionReverb = null
    this.moonTransitionBloomGain = null
    this.moonTransitionBloomResetTimeoutId = null
    // Moon-change transition mode ('masked' = stable fallback, 'fullChainCrossfade' =
    // experimental dual-complete-chain output crossfade). Selectable at runtime; persisted
    // (dev) so HMR full-page reloads do not silently revert to 'masked' mid-testing.
    this.moonTransitionMode = this.readPersistedMoonTransitionMode()
    // Old drone chains captured during a full-chain crossfade, fading out and awaiting
    // disposal. Each entry: { deck, fadeGain, disposeTimeoutId }. Tracked so rapid Moon
    // changes never strand a chain (stuck volume / accumulating oscillators).
    this.fullChainCrossfadeDecks = []
    // Verbose probe logging for full-chain transitions (moondroneDebug.setFullChainCrossfadeDebug).
    this.fullChainCrossfadeDebug = false
    this.fullChainTransitionContext = null
    // Verbose probe logging for note/key crossfades (moondroneDebug.setNoteChangeDebug).
    this.noteChangeDebug = false
    this.noteChangeDebugContext = null
    this.fullChainTransitionNumber = 0
  }

  readPersistedMoonTransitionMode() {
    try {
      const stored = window?.localStorage?.getItem('moondrone.moonTransitionMode')
      if (stored === 'masked' || stored === 'fullChainCrossfade') {
        return stored
      }
    } catch {
      // localStorage unavailable (SSR / privacy mode) — fall back to config.
    }

    return MOON_TRANSITION.mode ?? 'masked'
  }

  async start(
    key,
    volume = this.volume,
    octave = this.currentOctave,
    intensity = this.intensity,
    breath = this.breath,
    reverbWetPercent = this.currentReverbWet * 100,
    { skipNativeReconfigure = false } = {},
  ) {
    if (this.isPlaying) {
      if (key != null) {
        this.setKey(key)
      }

      if (octave != null && octave !== this.currentOctave) {
        this.setOctave(octave)
      }

      return
    }

    if (this.isStarting) {
      this.queueStartupNoteIntent({ key, octave })
      return
    }

    this.isStarting = true
    // A clean Play clears the explicit-stop gate so lightweight paths qualify again once stable.
    this.droneExplicitlyStopped = false

    if (this.lifecycleStopPendingPlay) {
      this.lifecycleStopPendingPlay = false
      audioDiag('lifecycle', 'next foreground play after background stop — safe startup', {
        contextState: this.getContextState(),
      })
    }

    const opToken = this.bumpDroneOpGeneration('start')

    // Restart-during-shutdown: Play arrived while a Stop fade-out / teardown is still pending.
    // Silence the old graph NOW so it cannot bleed through during this start's async work.
    if (this.isReady && this.isStopFadeActive(Tone.now())) {
      audioDiag('drone-lifecycle', 'restart during stop fade/startup detected', {
        generation: this.droneOpGeneration,
        contextState: this.getContextState(),
      })
      this.forceSilenceStoppingDroneGraph('restart-during-stop-fade')
    }

    const isStaleStartup = (phase) => {
      if (!this.isStarting || !this.isDroneOpCurrent(opToken)) {
        audioDiag('drone-lifecycle', 'stale drone startup callback ignored', {
          phase,
          opToken,
          generation: this.droneOpGeneration,
          isStarting: this.isStarting,
        })
        return true
      }
      return false
    }

    try {
      this.currentKey = key
      this.currentOctave = octave

      // Browsers require Tone.start() to run from the Play button gesture before nodes are created.
      // Do it FIRST (iOS): awaiting the native bridge before Tone.start() can consume the user
      // gesture's activation window and leave the context suspended.
      audioDiag('drone-engine', 'drone Play pressed — before Tone.start()', {
        contextState: this.getContextState(),
      })
      await Tone.start()
      await this.resumeContextIfNeeded()
      this.ensureContextStateWatcher()

      if (isStaleStartup('after-tone-start')) {
        return
      }

      // Now that the context exists, re-assert AVAudioSession `.playback` natively so audio ignores
      // the Ring/Silent switch (WKWebView can reset the session on context init). No-op off iOS.
      // When audio is already live (metronome running / chain ready on a running context), skip this
      // — reconfiguring can emit an interruption that disrupts the live metronome. Otherwise call it
      // throttled so it does not duplicate a media-primer-before / prewarm configure done moments ago.
      if (skipNativeReconfigure) {
        audioDiag('drone-engine', 'skipping native session reconfigure (audio already live)', {
          contextState: this.getContextState(),
        })
      } else {
        await configureNativePlaybackSession('drone-post-context', { throttle: true })
      }
      audioDiag('drone-engine', 'context state after post-context native session call', {
        contextState: this.getContextState(),
        skipNativeReconfigure,
      })

      if (isStaleStartup('after-native-session')) {
        return
      }

      this.volume = volume
      this.intensity = intensity
      this.breath = breath
      this.currentReverbWet = reverbWetPercent / 100
      this.ensureSignalChain()
      // A prior Moon-change fade may have been interrupted by Stop; make sure the whole
      // drone bus starts at unity so Play is audible.
      this.clearSimpleMoonTransitionTimeout()
      this.clearMoonTransitionBloomResetTimeout()
      this.resetMoonTransitionBloom()
      this.resetMoonTransitionGroupGain()
      // Tone.Reverb renders its impulse response asynchronously; if audio starts before the
      // convolver buffer is assigned, the later buffer swap produces a click/pop. Wait for it.
      await this.reverb.ready
      await this.moonTransitionReverb?.ready

      if (isStaleStartup('after-reverb-ready')) {
        return
      }

      // Re-verify after async IR generation — iOS can suspend the context during the gap
      // between Tone.start() and the first scheduled sample.
      await this.resumeContextIfNeeded()

      if (isStaleStartup('after-resume-context')) {
        return
      }

      this.applyPendingStartupNoteIntent()
      this.updateFrequencies()

      this.applyIntensity()
      this.applyReverbWet()
      this.applyVolume()
      this.applyProjectionNodes(PROJECTION_TUNING.rampSeconds)

      const holdStopFade = this.isStopFadeActive(Tone.now())
      // Small scheduling cushion after async setup so the first sample lands on a running context.
      const startTime = Tone.now() + 0.02
      this.stopFadeEndsAt = 0
      this.startupFadeEndsAt = startTime + START_FADE_SECONDS
      this.noteCrossfadeEndsAt = 0
      this.presetTransitionEndsAt = 0

      this.applyPendingStartupNoteIntent()
      this.updateFrequencies()

      const scheduledKey = this.currentKey
      const scheduledOctave = this.currentOctave

      this.voices.forEach((voice, index) => {
        voice.targetGain = this.getVoiceTargetGain(index)
        this.prepareVoiceGainForStart(voice, startTime, holdStopFade)
      })

      this.voices.forEach((voice) => {
        if (!this.hasStarted) {
          this.startVoiceOscillators(voice, startTime)
        }

        this.rampParam(voice.gain.gain, voice.targetGain, START_FADE_SECONDS, startTime)
      })
      this.hasStarted = true
      this.isPlaying = true
      this.startStringsDrift()
      // Mood auxiliary oscillators (orbit + Super dual beats): snap silent, start
      // running at zero gain, then fade in over the same startup window as voices.
      // Without this, the mood loop's 1.4 s ramp hit full level while voices were
      // still on the 4 s Play fade — the audible "layer jumping in" on Super Moon.
      this.prepareMoodAuxiliaryLayersForStart(startTime, holdStopFade)
      this.updateOrbitPairFrequency(0)
      this.startOrbitOscillators(startTime)
      this.updateDualBeatsFrequency(0)
      this.startDualBeatsOscillators(startTime)

      if (this.isMoodActive()) {
        this.rampMoodAuxiliaryLayersToTarget(START_FADE_SECONDS, startTime)
      }

      this.startAirBreathNoise(startTime, holdStopFade)
      // Fresh phase so the mood emerges over ~30–60 s rather than on the first note.
      this.moodStartTime = window.performance.now()
      this.lastMoodUpdateTime = 0
      this.startMoodLoop()
      if (import.meta.env.DEV) {
        this.logDiagnosticState('play')
      }

      // A note queued via start() while isStarting may still be pending after voices schedule.
      this.commitPendingStartupNoteAfterPlay(scheduledKey, scheduledOctave)
    } finally {
      this.isStarting = false
      this.pendingStartupNote = null
    }
  }

  stop() {
    if (!this.isReady) {
      return
    }

    this.bumpDroneOpGeneration('stop')

    // Explicit user Stop: drop the "drone is live/recently safe" qualification immediately so the
    // next Play takes the safe startup path (warm graph + running context is NOT enough after a
    // deliberate stop). Quick-restart-during-active-fade is handled separately in start().
    this.droneExplicitlyStopped = true
    this.lastDroneStopAt = Date.now()

    const stopTime = Tone.now()

    this.clearSimpleMoonTransitionTimeout()
    this.clearMoonTransitionBloomResetTimeout()
    this.abandonInFlightFullChainTransition()
    this.resetMoonTransitionBloom(stopTime)
    this.resetMoonTransitionGroupGain(stopTime)
    this.stopStringsDrift()
    this.stopMoodLoop()
    this.pauseBreathLoop()
    this.stopAirBreathNoise()
    // Fade the orbit pair + dual beats out alongside the drone (oscillators keep running silent).
    this.neutralizeOrbitPair(STOP_FADE_SECONDS)
    this.neutralizeDualBeats(STOP_FADE_SECONDS)
    this.voices.forEach((voice) => {
      this.rampVoiceGainForStop(voice, stopTime)
    })
    this.stopFadeEndsAt = stopTime + STOP_FADE_SECONDS + 0.01
    this.isPlaying = false
    this.isStarting = false
    this.pendingStartupNote = null
    this.fullChainCrossfadeVoiceHoldUntil = 0
    this.startupFadeEndsAt = 0
    this.noteCrossfadeEndsAt = 0
    this.clearNoteCrossfadeTimeouts()
    this.clearBinauralUndertoneDeferredTimeouts()
    this.binauralUndertonesHeldSilent = false
    this.presetTransitionEndsAt = 0
    // Any in-flight crossfade voices keep their own fade-out + dispose timers,
    // so they retire cleanly without a click on Stop.
    audioDiag('drone-lifecycle', 'drone stop completed — lightweight drone start disabled until clean play', {
      stopFadeSeconds: STOP_FADE_SECONDS,
      generation: this.droneOpGeneration,
    })
  }

  stopForLifecycle() {
    const wasPlaying = this.isPlaying
    const wasMetronomePlaying = this.metronomePlaying

    this.isStarting = false
    this.pendingStartupNote = null
    this.fullChainCrossfadeVoiceHoldUntil = 0
    this.stopMetronome()
    this.stopStringsDrift()
    this.clearStringsDriftResumeTimeout()
    this.clearStringsHighRegisterAirReanchorTimeout()
    this.pendingStringsHighRegisterAirReanchor = false
    this.stringsHighRegisterAirDeclickUntil = 0
    this.stringsHighRegisterAirShelfLockedUntil = 0
    this.stringsHighRegisterAirFilterLockedUntil = 0
    this.moonTransitionBreathSnapshot = null
    this.moonEntryContinuity = null
    this.moonEntryBreathMorphUntil = 0
    this.clearMoonEntryMorphCompletionTimeout()
    this.pendingMoonVoiceRebuildCrossfade = false
    this.moonTransitionBusSnapshot = null
    this.moonVoiceCrossfadePlan = null
    this.moonVoiceCrossfadeMorphUntil = 0
    this.moonAuxLayerCrossfadeActive = false
    this.moonAuxLayerCrossfadeUntil = 0
    this.moonAuxMorphStart = 0
    this.moonReanchorTimeline = []
    this.moonTransitionContext = null
    this.moonTransitionAuxHandoffUntil = 0
    this.clearMoonTransitionIsolationProbes()
    this.clearSimpleMoonTransitionTimeout()
    this.clearMoonTransitionBloomResetTimeout()
    this.abandonInFlightFullChainTransition()
    this.resetMoonTransitionBloom()
    this.resetMoonTransitionGroupGain()
    this.stopMoodLoop()
    this.stopBreathLoop()
    this.stopAirBreathNoise(0)
    this.clearNoteCrossfadeTimeouts()
    this.startupFadeEndsAt = 0
    this.stopFadeEndsAt = 0
    this.presetTransitionEndsAt = 0
    this.noteCrossfadeEndsAt = 0
    this.pendingBinauralTransitionRamp = null
    this.clearPresetTransitionDebugProbes()
    this.presetTransitionDebugContext = null
    this.presetTransitionDebugLastCanRamp = false
    this.clearMoonChangeDebugProbes()
    this.moonChangeDebugContext = null
    this.moonHarmonicEntryTargetSnapshot = null
    this.clearBinauralUndertoneDeferredTimeouts()
    this.binauralUndertonesHeldSilent = false

    this.isPlaying = false

    if (this.isReady) {
      const now = Tone.now()

      this.voices.forEach((voice) => {
        voice.gain.gain.cancelScheduledValues(now)
        voice.gain.gain.setValueAtTime(0, now)
      })

      // Interruption → silence the orbit pair + dual beats immediately too (no audible tail).
      this.neutralizeOrbitPair(0, true)
      this.neutralizeDualBeats(0, true)
    }

    // Interruption (background/lock) → silence immediately, including any
    // mid-crossfade outgoing voices, so nothing resumes audibly on foreground.
    this.disposeAllOutgoingVoiceSets()

    return { wasPlaying, wasMetronomePlaying }
  }

  queueStartupNoteIntent({ key, octave } = {}) {
    if (!this.pendingStartupNote) {
      this.pendingStartupNote = {}
    }

    if (key != null) {
      this.pendingStartupNote.key = key
      this.currentKey = key
    }

    if (octave != null) {
      this.pendingStartupNote.octave = octave
      this.currentOctave = octave
    }
  }

  applyPendingStartupNoteIntent() {
    if (!this.pendingStartupNote) {
      return false
    }

    if (this.pendingStartupNote.key != null) {
      this.currentKey = this.pendingStartupNote.key
    }

    if (this.pendingStartupNote.octave != null) {
      this.currentOctave = this.pendingStartupNote.octave
    }

    this.pendingStartupNote = null
    return true
  }

  commitPendingStartupNoteAfterPlay(scheduledKey, scheduledOctave) {
    if (!this.pendingStartupNote) {
      return
    }

    const targetKey = this.pendingStartupNote.key ?? scheduledKey
    const targetOctave = this.pendingStartupNote.octave ?? scheduledOctave
    this.pendingStartupNote = null

    if (targetKey === scheduledKey && targetOctave === scheduledOctave) {
      this.currentKey = targetKey
      this.currentOctave = targetOctave
      return
    }

    if (!this.isPlaying || !this.isReady) {
      this.currentKey = targetKey
      this.currentOctave = targetOctave
      return
    }

    this.pendingNoteChangeFrom = { key: scheduledKey, octave: scheduledOctave }
    this.currentKey = targetKey
    this.currentOctave = targetOctave
    this.updateFrequencies()
  }

  setKey(key) {
    if (this.isStarting && !this.isPlaying) {
      this.queueStartupNoteIntent({ key })
      return
    }

    this.pendingNoteChangeFrom = { key: this.currentKey, octave: this.currentOctave }
    this.currentKey = key
    this.updateFrequencies()
  }

  setOctave(octave) {
    if (this.isStarting && !this.isPlaying) {
      this.queueStartupNoteIntent({ octave })
      return
    }

    const previousOctave = this.currentOctave
    this.pendingNoteChangeFrom = { key: this.currentKey, octave: previousOctave }
    this.currentOctave = octave
    const wasPlaying = this.isPlaying

    if (
      wasPlaying
      && this.isStringsPreset()
      && previousOctave >= HIGH_REGISTER_OCTAVE
      && octave >= HIGH_REGISTER_OCTAVE
      && previousOctave !== octave
    ) {
      this.pendingStringsHighRegisterAirReanchor = true

      if (this.isReady && this.airBreathHighpass && this.airBreathLowpass) {
        this.holdAirBreathNoiseParamsAtTime(Tone.now())
      }
    }

    this.updateFrequencies()

    if (this.isReady) {
      this.applySterileDiagnosticRefresh()

      if (wasPlaying) {
        // Register output trim + bus EQ wait until the crossfade finishes so
        // High/VH lifts never step on audible outgoing Titan layers.
        return
      }

      this.applyAirShimmerBusEq(INTENSITY_RAMP_SECONDS)
      this.applyToneLabBusEq(INTENSITY_RAMP_SECONDS)
      this.applyVolume()
      this.applyPresetBusEq(this.getBaseTonalAmount())
      this.reanchorBreathAfterContextChange()
    }
  }

  setReferenceA(referenceA) {
    const clamped = Math.max(
      MIN_REFERENCE_A_HZ,
      Math.min(MAX_REFERENCE_A_HZ, Math.round(referenceA)),
    )

    if (this.referenceA === clamped) {
      return
    }

    this.referenceA = clamped

    if (!this.isReady) {
      return
    }

    this.applyReferenceAChange()
  }

  updateFrequencies() {
    if (!this.isReady) {
      return
    }

    // Keep the orbit center + dual-beat carriers tracking the key/register
    // (ramp while playing, snap when stopped). Beat splits stay fixed in Hz.
    this.updateOrbitPairFrequency(this.isPlaying ? NOTE_FADE_IN_SECONDS : 0)
    this.updateDualBeatsFrequency(this.isPlaying ? NOTE_FADE_IN_SECONDS : 0)

    if (this.isPlaying) {
      if (this.metronomePlaying) {
        this.primeMetronomeSchedule(METRONOME_LOOKAHEAD_SECONDS)
      }

      this.crossfadeToCurrentPitch()
      return
    }

    this.voices.forEach((voice, index) => {
      this.setVoiceFrequency(voice, this.getVoiceFrequency(index), Tone.now())
    })
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(MAX_MASTER_VOLUME_NORMALIZED, volume))

    if (!this.isReady) {
      return
    }

    this.applyVolume()
  }

  setIntensity(intensity) {
    this.intensity = intensity

    if (!this.isReady) {
      return
    }

    this.applyIntensity()
  }

  getIntensityUiAmount() {
    return this.clamp(this.intensity / 100, 0, 1)
  }

  getIntensityAmount() {
    let ui = this.getIntensityUiAmount()
    const presetIntensity = PRESET_INTENSITY_TUNING[this.currentPreset.name]

    if (presetIntensity?.upperKneeUi != null && this.intensity > presetIntensity.upperKneeUi) {
      const knee = presetIntensity.upperKneeUi / 100
      const maxUi = (presetIntensity.upperMaxEffectiveUi ?? 67) / 100
      const power = presetIntensity.upperCompressionPower ?? 2.4
      const normalized = (ui - knee) / (1 - knee)

      ui = knee + (normalized ** power) * (maxUi - knee)
    } else if (presetIntensity?.softCeilingUi != null && this.intensity > presetIntensity.softCeilingUi) {
      const ceiling = presetIntensity.softCeilingUi / 100
      const contribution = presetIntensity.aboveCeilingContribution ?? 0.25
      const excess = ui - ceiling

      ui = ceiling + excess * contribution
    }

    let amount

    if (ui <= INTENSITY_USEFUL_RANGE) {
      amount = (ui / INTENSITY_USEFUL_RANGE) ** INTENSITY_TUNING.amountLowerExponent
    } else {
      amount = 1 + ((ui - INTENSITY_USEFUL_RANGE) / (1 - INTENSITY_USEFUL_RANGE)) ** INTENSITY_TUNING.amountUpperExponent * INTENSITY_TUNING.amountUpperBoost
    }

    return amount * (presetIntensity?.amountScale ?? 1)
  }

  getEffectiveIntensityUi() {
    const presetIntensity = PRESET_INTENSITY_TUNING[this.currentPreset.name]

    if (!presetIntensity?.upperKneeUi || this.intensity <= presetIntensity.upperKneeUi) {
      return this.intensity
    }

    const knee = presetIntensity.upperKneeUi
    const maxUi = presetIntensity.upperMaxEffectiveUi ?? 67
    const power = presetIntensity.upperCompressionPower ?? 2.4
    const normalized = (this.intensity - knee) / (100 - knee)

    return knee + (normalized ** power) * (maxUi - knee)
  }

  getEffectiveIntensityUiForBright() {
    const presetIntensity = PRESET_INTENSITY_TUNING[this.currentPreset.name]
    const kneeUi = presetIntensity?.brightUpperKneeUi ?? presetIntensity?.upperKneeUi

    if (kneeUi == null || this.intensity <= kneeUi) {
      return this.intensity
    }

    const maxUi = presetIntensity.brightUpperMaxEffectiveUi ?? presetIntensity.upperMaxEffectiveUi ?? 58
    const power = presetIntensity.brightUpperCompressionPower ?? presetIntensity.upperCompressionPower ?? 2.8
    const normalized = (this.intensity - kneeUi) / (100 - kneeUi)

    return kneeUi + (normalized ** power) * (maxUi - kneeUi)
  }

  getIntensityDarkAmount() {
    if (this.intensity >= INTENSITY_NEUTRAL_UI) {
      return 0
    }

    const amount = (INTENSITY_NEUTRAL_UI - this.intensity) / INTENSITY_NEUTRAL_UI

    return amount ** INTENSITY_CURVE_POWER_DARK
  }

  getIntensityBrightAmount() {
    const effectiveIntensity = this.getEffectiveIntensityUiForBright()

    if (effectiveIntensity <= INTENSITY_NEUTRAL_UI) {
      return 0
    }

    const amount = ((effectiveIntensity - INTENSITY_NEUTRAL_UI) / (100 - INTENSITY_NEUTRAL_UI)) ** INTENSITY_CURVE_POWER_BRIGHT
    const presetIntensity = PRESET_INTENSITY_TUNING[this.currentPreset.name]

    return amount * (presetIntensity?.brightAmountScale ?? 1)
  }

  getIntensityFrequencyMultiplier() {
    const darkAmount = this.getIntensityDarkAmount()

    if (darkAmount > 0) {
      return 1 - darkAmount * (1 - INTENSITY_FILTER_FREQUENCY_MIN)
    }

    const brightAmount = this.getIntensityBrightAmount()

    if (brightAmount > 0) {
      return 1 + brightAmount * (INTENSITY_FILTER_FREQUENCY_MAX - 1)
    }

    return 1
  }

  getIntensityResonanceBoost(tonalAmount = this.getBaseTonalAmount()) {
    const effectiveIntensity = this.getEffectiveIntensityUi()

    if (effectiveIntensity <= INTENSITY_NEUTRAL_UI) {
      return 0
    }

    let boost

    if (effectiveIntensity < INTENSITY_Q_RAMP_START_UI) {
      const gentle = ((effectiveIntensity - INTENSITY_NEUTRAL_UI) / (INTENSITY_Q_RAMP_START_UI - INTENSITY_NEUTRAL_UI)) ** INTENSITY_TUNING.qGentleExponent

      boost = gentle * INTENSITY_Q_GENTLE_MAX
    } else {
      const strong = ((effectiveIntensity - INTENSITY_Q_RAMP_START_UI) / (100 - INTENSITY_Q_RAMP_START_UI)) ** INTENSITY_TUNING.qStrongExponent

      boost = INTENSITY_Q_GENTLE_MAX + strong * (INTENSITY_Q_STRONG_MAX - INTENSITY_Q_GENTLE_MAX)
    }

    const intensityFocus = this.getHighIntensityFocus(tonalAmount)
    const stressDamping = this.isShrutiPreset() && this.currentOctave === VERY_HIGH_REGISTER_OCTAVE
      ? 1 - this.getShrutiVeryHighStressAmount(tonalAmount) * INTENSITY_TUNING.shrutiVeryHighStressQDamping
      : 1
    const presetIntensity = PRESET_INTENSITY_TUNING[this.currentPreset.name]

    return boost * (1 - intensityFocus * INTENSITY_Q_FOCUS_DAMPING) * stressDamping
      * (presetIntensity?.resonanceScale ?? 1)
  }

  isIntensityLowEndLayer(index) {
    if (index === 0 || index === 2) {
      return true
    }

    if (index !== FOUNDATION_ROOT_VOICE_INDEX || this.isBinauralUndertoneVoice(index)) {
      return false
    }

    return this.usesFoundationRoot() || this.usesCosmosConstantRoot()
  }

  isSpeakerEfficiencyLowLayer(index) {
    if (index === 0 || index === 2) {
      return true
    }

    if (index === FOUNDATION_ROOT_VOICE_INDEX) {
      return this.usesFoundationRoot() || this.usesCosmosConstantRoot()
    }

    return false
  }

  getSpeakerEfficiencyLowLayerScale(index) {
    if (!this.isSpeakerEfficiencyLowLayer(index)) {
      return 1
    }

    return SPEAKER_LOW_LAYER_SCALE_BY_REGISTER[this.currentOctave] ?? 1
  }

  isSpeakerEfficiencyUpperHarmonicLayer(index) {
    return index >= 3 && index <= 5
  }

  isSpeakerEfficiencyCosmosExtension(index) {
    return index >= COSMOS_CELESTIAL_VOICE_INDEX && index <= COSMOS_SKY_OCTAVE_VOICE_INDEX
  }

  getSpeakerEfficiencyUpperHarmonicScale(index) {
    if (this.currentOctave < HIGH_REGISTER_OCTAVE || !this.isSpeakerEfficiencyUpperHarmonicLayer(index)) {
      return 1
    }

    const registerScales = SPEAKER_UPPER_HARMONIC_SCALE[this.currentOctave]

    if (!registerScales) {
      return 1
    }

    let scale = registerScales[index] ?? 1

    if (this.currentPreset.name === 'Choir') {
      scale *= SPEAKER_CHOIR_UPPER_HARMONIC_MULTIPLIER[this.currentOctave] ?? 1
    }

    if (this.isStringsPreset() && index >= 3) {
      scale *= SPEAKER_STRINGS_UPPER_HARMONIC_MULTIPLIER[this.currentOctave] ?? 1
    }

    if (this.currentPreset.name === 'Pure' && index >= 3) {
      scale *= SPEAKER_PURE_UPPER_HARMONIC_MULTIPLIER[this.currentOctave]?.[index] ?? 1
    }

    return scale
  }

  getSpeakerEfficiencyCosmosExtensionScale() {
    if (this.currentOctave < HIGH_REGISTER_OCTAVE) {
      return 1
    }

    return SPEAKER_COSMOS_EXTENSION_SCALE[this.currentOctave] ?? 1
  }

  isSterileDiagnosticActive() {
    return STERILE_DIAGNOSTIC_MODE.enabled
      && this.currentPreset.name === STERILE_DIAGNOSTIC_MODE.presetName
      && this.currentOctave >= STERILE_DIAGNOSTIC_MODE.minRegisterOctave
  }

  isHighVhCleanVoicingActive() {
    return !this.isSterileDiagnosticActive()
      && HIGH_VH_CLEAN_VOICING.enabled
      && this.currentOctave >= HIGH_REGISTER_OCTAVE
  }

  applySterileDiagnosticRefresh() {
    if (!this.isReady || !STERILE_DIAGNOSTIC_MODE.enabled) {
      return
    }

    if (this.isSterileDiagnosticActive()) {
      this.neutralizeMoodModulation(this.isPlaying ? INTENSITY_RAMP_SECONDS : 0)
      this.pauseBreathLoop()
      this.applyBaseTonalState()
      return
    }

    if (this.currentPreset.name === STERILE_DIAGNOSTIC_MODE.presetName) {
      if (this.isMoodActive()) {
        this.reanchorMood()
      }

      if (this.getBreathAmount() > 0) {
        this.startBreathLoop()
      }

      this.applyBaseTonalState()
    }
  }

  setSterileDiagnosticModeEnabled(enabled) {
    if (STERILE_DIAGNOSTIC_MODE.enabled === enabled) {
      return
    }

    STERILE_DIAGNOSTIC_MODE.enabled = enabled
    this.applySterileDiagnosticRefresh()
  }

  isStringsIsolationActive() {
    return STRINGS_ISOLATION_MODE.enabled
      && this.isStringsPreset()
      && this.currentOctave >= STRINGS_ISOLATION_MODE.minRegisterOctave
  }

  getStringsIsolationMode() {
    return this.isStringsIsolationActive() ? STRINGS_ISOLATION_MODE.mode : 'off'
  }

  isStringsIsolationPrinciplesOnly() {
    const mode = this.getStringsIsolationMode()

    return mode === 'principles-only' || mode === 'principles-breath'
  }

  isStringsIsolationBreathDisabled() {
    return this.getStringsIsolationMode() === 'principles-only'
  }

  isStringsIsolationPhaseDisabled() {
    const mode = this.getStringsIsolationMode()

    return mode === 'principles-only'
      || mode === 'principles-breath'
      || mode === 'no-phase'
  }

  isStringsIsolationAirDisabled() {
    const mode = this.getStringsIsolationMode()

    return mode === 'principles-only'
      || mode === 'principles-breath'
      || mode === 'no-phase'
      || mode === 'no-air'
  }

  setStringsIsolationMode(flags = {}) {
    Object.assign(STRINGS_ISOLATION_MODE, flags)

    if (!this.isReady) {
      console.log('[Moondrone strings-isolation]', { ...STRINGS_ISOLATION_MODE })
      return
    }

    if (this.isStringsIsolationPhaseDisabled() && this.isMoodActive()) {
      this.neutralizeMoodModulation(this.isPlaying ? INTENSITY_RAMP_SECONDS : 0)
    }

    if (this.isPlaying) {
      this.voices.forEach((voice, index) => {
        voice.targetGain = this.getVoiceTargetGain(index)

        if (this.canRampVoiceGainsFromBreathOrIntensity()) {
          this.rampParam(voice.gain.gain, voice.targetGain, INTENSITY_RAMP_SECONDS)
        }
      })
    }

    this.applyAirShimmerBusEq(INTENSITY_RAMP_SECONDS)

    if (this.isPlaying && this.getBreathAmount() > 0 && !this.isStringsIsolationAirDisabled()) {
      this.applyAirBreathNoiseModulation(INTENSITY_RAMP_SECONDS)
    }

    console.log('[Moondrone strings-isolation]', { ...STRINGS_ISOLATION_MODE })
  }

  setStringsHighRegisterAirDebug(flags = {}) {
    Object.assign(STRINGS_HIGH_REGISTER_AIR_DEBUG, flags)
    console.log('[Moondrone strings-high-register-air-debug]', { ...STRINGS_HIGH_REGISTER_AIR_DEBUG })
  }

  getHighVhCleanVoicingLayerScale(index) {
    if (!this.isHighVhCleanVoicingActive()) {
      return 1
    }

    const registerScales = HIGH_VH_CLEAN_VOICING.layerScale[this.currentOctave]

    if (!registerScales) {
      return 1
    }

    return registerScales[index] ?? 1
  }

  getHighVhCleanVoicingIntensityFocusScale(index) {
    if (!this.isHighVhCleanVoicingActive() || index < 3) {
      return 1
    }

    return HIGH_VH_CLEAN_VOICING.intensityUpperFocusScale
  }

  setHighVhCleanVoicingEnabled(enabled) {
    if (HIGH_VH_CLEAN_VOICING.enabled === enabled) {
      return
    }

    HIGH_VH_CLEAN_VOICING.enabled = enabled

    if (!this.isReady) {
      return
    }

    this.applyIntensity()

    if (this.isPlaying) {
      this.syncMoodModulation()
    }
  }

  getIntensityLowEndScale(index, tonalAmount = this.getBaseTonalAmount()) {
    if (!this.isIntensityLowEndLayer(index)) {
      return 1
    }

    const darkAmount = this.getIntensityDarkAmount()

    if (darkAmount > 0) {
      const maxBoost = index === FOUNDATION_ROOT_VOICE_INDEX
        ? INTENSITY_TUNING.foundationDarkBoostMax
        : INTENSITY_TUNING.lowOctaveDarkBoostMax

      return 1 + darkAmount * maxBoost
    }

    if (this.intensity <= INTENSITY_NEUTRAL_UI) {
      return 1
    }

    let reductionStrength

    if (this.intensity < INTENSITY_LOW_END_RAMP_START_UI) {
      reductionStrength = ((this.intensity - INTENSITY_NEUTRAL_UI) / (INTENSITY_LOW_END_RAMP_START_UI - INTENSITY_NEUTRAL_UI)) ** INTENSITY_TUNING.lowEndGentleExponent * INTENSITY_TUNING.lowEndGentleScale
    } else {
      const strong = ((this.intensity - INTENSITY_LOW_END_RAMP_START_UI) / (100 - INTENSITY_LOW_END_RAMP_START_UI)) ** INTENSITY_TUNING.lowEndStrongExponent

      reductionStrength = INTENSITY_TUNING.lowEndGentleScale + strong * (1 - INTENSITY_TUNING.lowEndGentleScale)
    }

    if (this.currentOctave >= HIGH_REGISTER_OCTAVE && tonalAmount >= INTENSITY_TUNING.highRegisterTonalStart) {
      reductionStrength *= 1 + (tonalAmount - INTENSITY_TUNING.highRegisterTonalStart) * INTENSITY_TUNING.highRegisterTonalScale
    }

    reductionStrength = this.clamp(reductionStrength, 0, 1)

    const maxReduction = index === 0 || index === 2
      ? INTENSITY_LOW_OCTAVE_MAX_REDUCTION
      : INTENSITY_FOUNDATION_MAX_REDUCTION

    return 1 - reductionStrength * maxReduction
  }

  applyTonalFilter(tonalAmount = this.getBaseTonalAmount()) {
    if (!this.isReady || !this.filter) {
      return
    }

    this.rampParam(this.filter.frequency, this.getTonalFilterFrequency(tonalAmount), INTENSITY_RAMP_SECONDS)
    this.rampParam(this.filter.Q, this.getTonalFilterQ(tonalAmount), INTENSITY_RAMP_SECONDS)
  }

  setBreath(breath) {
    this.breath = breath

    if (!this.isReady) {
      return
    }

    this.applyBreath()
  }

  setReverbWetPercent(reverbWetPercent) {
    this.currentReverbWet = reverbWetPercent / 100

    if (!this.isReady) {
      return
    }

    this.applyReverbWet()
  }

  setProjectionMode(enabled) {
    const next = Boolean(enabled)

    if (this.projectionMode === next) {
      return
    }

    this.projectionMode = next

    if (!this.isReady) {
      return
    }

    this.applyProjectionNodes(PROJECTION_TUNING.rampSeconds)
    // Foundation/low-octave projection trims live in getVoiceTargetGain, so
    // recompute targets. applyBaseTonalState ramps them (respecting startup /
    // crossfade guards); when stopped it just refreshes targetGain for next Play.
    this.applyBaseTonalState()
  }

  getProjectionDryWidthTarget() {
    // Binaural is exempt: narrowing the dry body would collapse the L/R beat.
    if (!this.projectionMode || this.isBinauralPreset()) {
      return 0.5
    }

    const presetProjection = PRESET_PROJECTION_TUNING[this.currentPreset.name]

    if (presetProjection?.dryWidth != null) {
      return presetProjection.dryWidth
    }

    return PROJECTION_TUNING.dryWidth
  }

  applyProjectionNodes(rampSeconds = PROJECTION_TUNING.rampSeconds) {
    if (!this.isReady || !this.projectionDryNarrower || !this.projectionLowMidCut) {
      return
    }

    const on = this.projectionMode

    this.rampParam(this.projectionDryNarrower.width, this.getProjectionDryWidthTarget(), rampSeconds)
    const presetProjection = PRESET_PROJECTION_TUNING[this.currentPreset.name]
    const lowMidCutGain = on
      ? (presetProjection?.lowMidCutGainDb ?? PROJECTION_TUNING.lowMidCut.gainDb)
      : 0
    this.rampParam(this.projectionLowMidCut.gain, lowMidCutGain, rampSeconds)

    const presenceGainScale = presetProjection?.presenceGainScale ?? 1

    this.projectionPresenceEqs.forEach((presenceEq, index) => {
      const targetGain = on ? PROJECTION_TUNING.presence[index].gainDb * presenceGainScale : 0
      this.rampParam(presenceEq.gain, targetGain, rampSeconds)
    })
  }

  getProjectionVoiceScale(index) {
    if (!this.projectionMode) {
      return 1
    }

    if (index === 0) {
      return PROJECTION_TUNING.lowOctaveScale
    }

    if (index === FOUNDATION_ROOT_VOICE_INDEX
      && !this.isBinauralUndertoneVoice(index)
      && (this.usesFoundationRoot() || this.usesCosmosConstantRoot())) {
      return PROJECTION_TUNING.foundationRootScale
    }

    return 1
  }

  // ---- Mood: slow motion layer (Orbit / Bloom / Eclipse / Epsilon / nested rates) ----

  setMood(moodId) {
    if (this.mood === moodId) {
      return
    }

    this.mood = moodId

    if (!this.isReady) {
      return
    }

    this.logTransitionDiagnostic('setMood', { moodId, playing: this.isPlaying })
    this.reanchorMood()
  }

  getMoodConfig() {
    return MOOD_TUNING[this.mood] ?? MOOD_TUNING[DEFAULT_MOOD_ID]
  }

  // Moods never apply to Binaural (its beat controls own the motion) and only
  // move while playing. When inactive every mood contribution is neutral.
  isMoodActive() {
    return this.isReady && this.isPlaying && !this.isBinauralPreset()
  }

  getMoodElapsedSeconds() {
    if (!this.moodStartTime) {
      return 0
    }

    return (window.performance.now() - this.moodStartTime) / 1000
  }

  moodWave(periodSeconds, phaseOffset = 0) {
    if (!periodSeconds) {
      return 0
    }

    const t = this.getMoodElapsedSeconds()

    return Math.sin((t / periodSeconds + phaseOffset) * Math.PI * 2)
  }

  // Two summed slow rates → "waves within waves" (Tides / Nested) without any
  // literal low-frequency beat or amplitude pulsing.
  moodNestedWave(periodA, periodB, nestedWeight = 0, phaseOffset = 0) {
    const primary = this.moodWave(periodA, phaseOffset)

    if (!periodB || !nestedWeight) {
      return primary
    }

    const secondary = this.moodWave(periodB, phaseOffset * 0.5 + 0.21)

    return (1 - nestedWeight) * primary + nestedWeight * secondary
  }

  getMoodDetuneCents(index) {
    if (!this.isMoodActive() || this.isSterileDiagnosticActive()) {
      return 0
    }

    if (this.isHighVhCleanVoicingActive() && HIGH_VH_CLEAN_VOICING.disableMoodDetune) {
      return 0
    }

    const config = this.getMoodConfig()
    const isRoot = index === 1
    const isFifth = index === 2
    let cents = 0

    if (config.epsilonCents) {
      // Each layer drifts on its own phase → gentle analog "life", never unison wobble.
      // The root is scaled way down so the perceived pitch center holds for practice.
      const epsilonScale = isRoot ? MOOD_ROOT_DETUNE_SCALE : 1
      cents += config.epsilonCents * epsilonScale * this.moodWave(config.epsilonPeriod, index * 0.27)
    }

    if (config.orbitCents && !isRoot && !isFifth) {
      // Orbit only on octave/upper layers (not root or fifth). These beat slowly
      // against the root's harmonics → an audible "orbiting" without moving the
      // fundamental pitch or muddying the core interval.
      const orbitWave = this.moodNestedWave(
        config.orbitPeriod,
        config.orbitPeriod2,
        config.nestedWeight,
        index * 0.41 + 0.13,
      )
      const orbitCents = config.orbitCents
        * this.scaleMoonPhaseHarmonicMotionValue(orbitWave)
        * this.getToneLabMoonPhaseHarmonicsGain()
      cents += scaleMoonPhaseHarmonicOrbitCents(
        orbitCents,
        this.getToneLabMoonPhaseHarmonicsBrightness(),
      )
    }

    if (isRoot) {
      // Hard cap on the root so a tuner always reads true.
      return this.clamp(cents, -MOOD_ROOT_DETUNE_CAP_CENTS, MOOD_ROOT_DETUNE_CAP_CENTS)
    }

    return cents
  }

  getMoodBloomGainDb() {
    if (!this.isMoodActive()) {
      return 0
    }

    const config = this.getMoodConfig()

    if (!config.bloomDb) {
      return 0
    }

    // Bipolar high-shelf swing → the spectrum's "air" opens and recedes (bloom).
    const bloomWave = this.moodNestedWave(config.bloomPeriod, config.bloomPeriod2, config.nestedWeight, 0)
    const bloomGainDb = config.bloomDb
      * this.scaleMoonPhaseHarmonicMotionValue(bloomWave)
      * this.getToneLabMoonPhaseHarmonicsGain()

    return applyMoonPhaseHarmonicBloomBrightness(
      bloomGainDb,
      this.getToneLabMoonPhaseHarmonicsBrightness(),
    )
  }

  getMoodEclipseGainDb() {
    if (!this.isMoodActive()) {
      return 0
    }

    const config = this.getMoodConfig()

    if (!config.eclipseDb) {
      return 0
    }

    // One-sided dip → a band is concealed and revealed (shadow), body stays present.
    const masking = Math.max(0, this.scaleMoonPhaseHarmonicMotionValue(this.moodWave(config.eclipsePeriod, 0.5)))

    return -config.eclipseDb * masking * this.getToneLabMoonPhaseHarmonicsGain()
  }

  getMoodEclipseFrequency() {
    const config = this.getMoodConfig()

    if (!config.eclipseDb) {
      return MOOD_ECLIPSE_FREQUENCY_MIN
    }

    // Slow, independent sweep so the concealed band "passes behind" the drone.
    const mid = (MOOD_ECLIPSE_FREQUENCY_MIN + MOOD_ECLIPSE_FREQUENCY_MAX) / 2
    const half = (MOOD_ECLIPSE_FREQUENCY_MAX - MOOD_ECLIPSE_FREQUENCY_MIN) / 2

    return mid + half * this.scaleMoonPhaseHarmonicMotionValue(this.moodWave(config.eclipsePeriod * 1.3, 0.12))
  }

  applyMoodToneNodes(rampSeconds = MOOD_LOOP_TUNING.rampSeconds, startTime = Tone.now()) {
    if (this.isSterileDiagnosticActive()) {
      if (this.moodBloomEq) {
        this.rampParam(this.moodBloomEq.gain, 0, rampSeconds, startTime)
      }

      if (this.moodEclipseEq) {
        this.rampParam(this.moodEclipseEq.gain, 0, rampSeconds, startTime)
      }

      return
    }

    if (this.moodBloomEq) {
      this.rampParam(this.moodBloomEq.gain, this.getMoodBloomGainDb(), rampSeconds, startTime)
    }

    if (this.moodEclipseEq) {
      this.rampParam(this.moodEclipseEq.frequency, this.getMoodEclipseFrequency(), rampSeconds, startTime)
      this.rampParam(this.moodEclipseEq.gain, this.getMoodEclipseGainDb(), rampSeconds, startTime)
    }
  }

  getMoodWidthOffset() {
    if (!this.isMoodActive() || this.isSterileDiagnosticActive()) {
      return 0
    }

    const config = this.getMoodConfig()

    if (!config.widthDepth) {
      return 0
    }

    return config.widthDepth * this.moodNestedWave(
      config.widthPeriod,
      config.widthPeriod2,
      config.nestedWeight,
      0.2,
    )
  }

  getMoodGainScale(index) {
    if (!this.isMoodActive() || this.isSterileDiagnosticActive() || this.isStringsIsolationPhaseDisabled()) {
      return 1
    }

    if (this.isHighVhCleanVoicingActive() && HIGH_VH_CLEAN_VOICING.disableMoodGainRedistribution) {
      return 1
    }

    const config = this.getMoodConfig()

    if (!config.gainBloomDepth) {
      return 1
    }

    const weight = MOOD_BLOOM_WEIGHTS[index] ?? 0

    if (weight === 0) {
      return 1
    }

    // Small secondary body motion (opposing phase, ~constant sum). The audible
    // bloom is the high-shelf EQ; this just adds a touch of harmonic "breathing".
    const bloomWave = this.moodNestedWave(
      config.bloomPeriod,
      config.bloomPeriod2,
      config.nestedWeight,
      index * 0.19,
    )
    const deviation = config.gainBloomDepth
      * weight
      * this.scaleMoonPhaseHarmonicMotionValue(bloomWave)
      * this.getToneLabMoonPhaseHarmonicsGain()
    const scale = 1 + deviation

    return this.clamp(scale, 0.4, 1.6)
  }

  applyMoodDetune(rampSeconds = MOOD_LOOP_TUNING.rampSeconds) {
    // Freeze the per-voice detune writer during startup, note/register crossfades,
    // and preset transitions (same guard the breath/intensity gain writers use), so
    // it never fights freshly created voices mid-fade or a voice retune in progress.
    // Bus-level mood motion (orbit pair, dual beats, bloom/eclipse EQ, stereo width)
    // is unaffected and keeps flowing. The loop resumes detune once the guard clears.
    if (this.isPlaying && !this.canRampVoiceGainsFromBreathOrIntensity()) {
      return
    }

    this.voices.forEach((voice, index) => {
      // Strings/Choir own their oscillator detune (ensemble + drift); Binaural
      // undertones are frequency-based. Mood detune drives only standard voices.
      if (this.isStringsLayer(index) || this.isChoirLayer(index) || this.isBinauralUndertoneVoice(index)) {
        return
      }

      const oscillator = this.getPrimaryOscillator(voice)

      if (oscillator?.detune) {
        oscillator.detune.rampTo(this.getMoodDetuneCents(index), rampSeconds)
      }
    })
  }

  syncMoodModulation() {
    if (!this.isReady) {
      return
    }

    const rampSeconds = MOOD_LOOP_TUNING.rampSeconds

    if (this.isSterileDiagnosticActive()) {
      this.neutralizeMoodModulation(rampSeconds)

      if (this.getBreathAmount() === 0 && this.isPlaying && this.canRampVoiceGainsFromBreathOrIntensity()) {
        this.voices.forEach((voice, index) => {
          voice.targetGain = this.getVoiceTargetGain(index)
          this.rampParam(voice.gain.gain, voice.targetGain, rampSeconds)
        })
      }

      return
    }

    if (this.isStringsIsolationPhaseDisabled()) {
      this.neutralizeMoodModulation(rampSeconds)
      return
    }

    this.applyMoodDetune(rampSeconds)

    if (!this.isMoonTransitionAuxHandoffActive() && !this.isMoonAuxLayerCrossfadeActive()) {
      this.applyMoodToneNodes(rampSeconds)
    }

    // Orbit + dual-beat gains follow the same startup/crossfade guards as voices so
    // the mood loop never cancels a Play fade-in with a short 1.4 s re-ramp to full.
    if (!this.isMoonTransitionAuxHandoffActive() && this.canRampMoodAuxiliaryLayers()) {
      this.applyOrbitPair(rampSeconds)
      this.applyDualBeats(rampSeconds)
    }

    if (this.stereoWidener) {
      this.rampParam(this.stereoWidener.width, this.getStereoWidth(), rampSeconds)
    }

    // Gain redistribution: when Breath is running it already re-evaluates
    // getVoiceTargetGain (which folds in the mood scale) every tick, so we leave
    // gains to it. With Breath at 0 the mood loop owns the slow redistribution.
    if (this.getBreathAmount() === 0 && this.isPlaying && this.canRampVoiceGainsFromBreathOrIntensity()) {
      this.voices.forEach((voice, index) => {
        voice.targetGain = this.getVoiceTargetGain(index)
        this.rampParam(voice.gain.gain, voice.targetGain, rampSeconds)
      })
    }
  }

  startMoodLoop(options = {}) {
    const { skipInitialSync = false } = options

    if (!this.isMoodActive()) {
      return
    }

    if (!this.moodStartTime) {
      this.moodStartTime = window.performance.now()
    }

    if (this.moodFrame) {
      return
    }

    // Apply once immediately so the mood's spectral/width state is correct from
    // the start of playback (the rAF cadence then evolves it slowly).
    this.lastMoodUpdateTime = window.performance.now()

    if (!skipInitialSync) {
      this.syncMoodModulation()
    }

    const tick = () => {
      this.moodFrame = null

      if (!this.isMoodActive()) {
        return
      }

      const now = window.performance.now()

      if (now - this.lastMoodUpdateTime >= MOOD_LOOP_TUNING.updateSeconds * 1000) {
        this.lastMoodUpdateTime = now
        this.syncMoodModulation()
      }

      this.moodFrame = window.requestAnimationFrame(tick)
    }

    this.moodFrame = window.requestAnimationFrame(tick)
  }

  stopMoodLoop() {
    if (this.moodFrame) {
      window.cancelAnimationFrame(this.moodFrame)
      this.moodFrame = null
    }

    this.moodStartTime = null
    this.lastMoodUpdateTime = 0
  }

  // Gently return mood-owned params to neutral (detune 0, base width). Used when
  // a mood becomes inactive (e.g. switching to Binaural) without a hard snap.
  neutralizeMoodModulation(rampSeconds = MOOD_LOOP_TUNING.rampSeconds) {
    if (!this.isReady) {
      return
    }

    this.voices.forEach((voice, index) => {
      if (this.isStringsLayer(index) || this.isChoirLayer(index) || this.isBinauralUndertoneVoice(index)) {
        return
      }

      const oscillator = this.getPrimaryOscillator(voice)

      if (oscillator?.detune) {
        oscillator.detune.rampTo(0, rampSeconds)
      }
    })

    if (this.stereoWidener) {
      this.rampParam(this.stereoWidener.width, OUTPUT_TUNING.stereoWidth, rampSeconds)
    }

    if (this.moodBloomEq) {
      this.rampParam(this.moodBloomEq.gain, 0, rampSeconds)
    }

    if (this.moodEclipseEq) {
      this.rampParam(this.moodEclipseEq.gain, 0, rampSeconds)
    }

    this.neutralizeOrbitPair(rampSeconds)
    this.neutralizeDualBeats(rampSeconds)
  }

  // Reset the mood phase so the effect "emerges" fresh (felt after ~30–60 s,
  // never announced on selection), then (re)start or stop the loop to match state.
  reanchorMood() {
    const wasPlaying = this.isPlaying
    const savedMoodStartTime = this.moodStartTime
    this.stopMoodLoop()

    const liveRamp = MOOD_LIVE_TRANSITION_SECONDS
    const frequencyRamp = wasPlaying ? liveRamp : 0

    this.logMoonReanchorTimeline('phase-orbit-reanchor-begin', {
      mood: this.mood,
      moonAuxLayerCrossfadeActive: this.moonAuxLayerCrossfadeActive,
      rampSeconds: liveRamp,
    })

    // The orbit center pitch is mood-dependent (Blue = octave, Blood = fifth), so
    // re-point it whenever the mood changes; ramp while playing, snap when stopped.
    this.updateOrbitPairFrequency(frequencyRamp)
    this.updateDualBeatsFrequency(frequencyRamp)

    if (this.isMoodActive()) {
      if (wasPlaying) {
        if (savedMoodStartTime) {
          this.moodStartTime = savedMoodStartTime
        }

        this.applyLiveMoodTransition(liveRamp)
        this.logTransitionDiagnostic('reanchorMood-live', {
          mood: this.mood,
          rampSeconds: liveRamp,
          orbitLevel: this.getOrbitLevel(),
          dualBeatsActive: this.isDualBeatsActive(),
        })
        this.logMoonReanchorTimeline('phase-orbit-reanchor-live', {
          mood: this.mood,
          skippedAuxGainRamps: this.moonAuxLayerCrossfadeActive,
        })
      }

      this.startMoodLoop()
      return
    }

    if (wasPlaying) {
      const neutralizeRamp = this.getBinauralMoodNeutralizeRampSeconds(liveRamp)
      this.applyLiveMoodNeutralization(neutralizeRamp)
      this.logTransitionDiagnostic('reanchorMood-neutralize', {
        mood: this.mood,
        rampSeconds: neutralizeRamp,
        preset: this.currentPreset.name,
      })
      return
    }

    this.neutralizeMoodModulation(0)
  }

  applyLiveMoodTransition(rampSeconds = MOOD_LIVE_TRANSITION_SECONDS, startTime = Tone.now()) {
    if (!this.isReady) {
      return
    }

    const skipAuxGainRamps = this.moonAuxLayerCrossfadeActive

    this.applyMoodToneNodes(skipAuxGainRamps ? 0 : rampSeconds, startTime)
    this.applyOrbitPair(rampSeconds, startTime, { skipBusGain: skipAuxGainRamps })
    this.applyDualBeats(rampSeconds, startTime, { skipGainRamp: skipAuxGainRamps })
    this.rampParam(this.stereoWidener.width, this.getStereoWidth(), rampSeconds, startTime)
    this.applyMoodDetuneImmediate(rampSeconds, startTime)
  }

  applyLiveMoodNeutralization(rampSeconds = MOOD_LIVE_TRANSITION_SECONDS, startTime = Tone.now()) {
    if (!this.isReady) {
      return
    }

    this.voices.forEach((voice, index) => {
      if (this.isStringsLayer(index) || this.isChoirLayer(index) || this.isBinauralUndertoneVoice(index)) {
        return
      }

      const oscillator = this.getPrimaryOscillator(voice)

      if (oscillator?.detune) {
        oscillator.detune.rampTo(0, rampSeconds, startTime)
      }
    })

    if (this.stereoWidener) {
      this.rampParam(this.stereoWidener.width, this.getStereoWidth(), rampSeconds, startTime)
    }

    if (this.moodBloomEq) {
      this.rampParam(this.moodBloomEq.gain, 0, rampSeconds, startTime)
    }

    if (this.moodEclipseEq) {
      this.rampParam(this.moodEclipseEq.gain, 0, rampSeconds, startTime)
    }

    this.neutralizeOrbitPair(rampSeconds, false, startTime)
    this.neutralizeDualBeats(rampSeconds, false, startTime)
  }

  applyMoodDetuneImmediate(rampSeconds = MOOD_LOOP_TUNING.rampSeconds, startTime = Tone.now()) {
    this.voices.forEach((voice, index) => {
      if (this.isStringsLayer(index) || this.isChoirLayer(index) || this.isBinauralUndertoneVoice(index)) {
        return
      }

      const oscillator = this.getPrimaryOscillator(voice)

      if (oscillator?.detune) {
        oscillator.detune.rampTo(this.getMoodDetuneCents(index), rampSeconds, startTime)
      }
    })
  }

  getPresetTransitionRampSeconds() {
    return PRESET_LAYER_FADE_OUT_SECONDS + PRESET_LAYER_FADE_IN_SECONDS
  }

  setTransitionDiagnosticsEnabled(enabled) {
    this.transitionDiagnosticsEnabled = Boolean(enabled)
  }

  logTransitionDiagnostic(label, details = {}) {
    if (!this.transitionDiagnosticsEnabled) {
      return
    }

    console.log(`[Moondrone transition:${label}]`, details)
  }

  setPresetTransitionDebug(flags = {}) {
    Object.assign(PRESET_TRANSITION_DEBUG, flags)

    if (!PRESET_TRANSITION_DEBUG.enabled) {
      this.clearPresetTransitionDebugProbes()
      this.presetTransitionDebugContext = null
      this.presetTransitionDebugLastCanRamp = false
    }

    console.log('[Moondrone preset-transition-debug]', { ...PRESET_TRANSITION_DEBUG })
  }

  setMoonChangeDebug(flags = {}) {
    Object.assign(MOON_CHANGE_DEBUG, flags)

    if (!MOON_CHANGE_DEBUG.enabled) {
      this.clearMoonChangeDebugProbes()
      this.moonChangeDebugContext = null
      this.moonHarmonicEntryTargetSnapshot = null
    }

    console.log('[Moondrone moon-change-debug]', { ...MOON_CHANGE_DEBUG })
  }

  // Switch the Moon-change transition mode at runtime. 'masked' is the stable fallback;
  // 'fullChainCrossfade' is the experimental dual-complete-chain output crossfade.
  setMoonTransitionMode(mode) {
    if (mode !== 'masked' && mode !== 'fullChainCrossfade') {
      console.warn('[Moondrone moon-transition-mode] invalid mode (use "masked" or "fullChainCrossfade"):', mode)
      return
    }

    this.moonTransitionMode = mode

    try {
      window?.localStorage?.setItem('moondrone.moonTransitionMode', mode)
    } catch {
      // Ignore persistence failures.
    }

    console.log('[Moondrone moon-transition-mode]', mode, '(selected)')
  }

  setFullChainCrossfadeDebug(enabled = true) {
    this.fullChainCrossfadeDebug = enabled === true
    console.log('[Moondrone full-chain-crossfade-debug]', this.fullChainCrossfadeDebug ? 'on' : 'off')
  }

  setNoteChangeDebug(enabled = true) {
    this.noteChangeDebug = enabled === true
    console.log('[Moondrone note-change-debug]', this.noteChangeDebug ? 'on' : 'off')
  }

  logNoteChangeProbe(label, extra = {}, ctx = this.noteChangeDebugContext) {
    if (!this.noteChangeDebug) {
      return
    }

    const c = ctx || {}
    const readVal = (param) => (param && typeof param.value === 'number' ? Number(param.value.toFixed(4)) : null)
    const voiceGains = this.voices?.slice(0, 11).map((voice, index) => ({
      index,
      gain: readVal(voice.gain?.gain),
      entryTarget: c.entryTargets?.[index] ?? null,
      settledTarget: Number(this.getVoiceTargetGain(index).toFixed(5)),
    })) ?? []

    console.log(`[Moondrone note-change:${label}]`, {
      oldNote: c.oldKey != null ? `${c.oldKey}${c.oldOctave}` : null,
      newNote: c.newKey != null ? `${c.newKey}${c.newOctave}` : null,
      preset: this.currentPreset?.name,
      register: this.currentOctave,
      intensity: this.intensity,
      breath: this.breath,
      mood: this.mood,
      entryTonalAmount: c.entryTonalAmount ?? null,
      nextBreathSyncTonal: Number(this.getEffectiveTonalAmount().toFixed(4)),
      filterFrequency: readVal(this.filter?.frequency),
      filterQ: readVal(this.filter?.Q),
      outputTrimDb: readVal(this.output?.volume),
      registerTrimDb: Number(this.getDroneBalanceTrimDb().toFixed(2)),
      noteCrossfadeGuardActive: this.isNoteCrossfadeActive(),
      syncBreathWithin500ms: c.syncBreathScheduled ?? null,
      outgoingVoiceSetCount: this.outgoingNoteCrossfadeVoiceSets.length,
      voiceGains,
      audioNow: Number(Tone.now().toFixed(4)),
      ...extra,
    })
  }

  // Direct probe for full-chain transitions: mode/path, deck connection + actual gain values,
  // reverb-ready state, exact ramp start times (and whether they are identical), and whether
  // any masked/simple fade timer is still active.
  logFullChainProbe(label, extra = {}, ctx = this.fullChainTransitionContext) {
    if (!this.fullChainCrossfadeDebug) {
      return
    }

    const c = ctx || {}
    const oldGainParam = c.oldDeck?.fadeGain?.gain
    const newGainParam = c.newFadeGain?.gain
    const readVal = (param) => (param && typeof param.value === 'number' ? Number(param.value.toFixed(4)) : null)
    const isLive = (node) => {
      if (!node) {
        return false
      }

      if (typeof node.disposed === 'boolean') {
        return !node.disposed
      }

      return true
    }

    console.log(`[Moondrone full-chain:${label}]`, {
      mode: this.moonTransitionMode,
      maskedSimpleBypassed: this.moonTransitionMode === 'fullChainCrossfade',
      oldDeckConnectedToMaster: c.oldDeck ? (isLive(c.oldDeck.fadeGain) && c.oldConnected !== false) : null,
      newDeckConnectedToMaster: c.newFadeGain ? (isLive(c.newFadeGain) && c.newConnected === true) : null,
      oldDeckGain: readVal(oldGainParam),
      newDeckGain: readVal(newGainParam),
      moonTransitionGain: readVal(this.moonTransitionGain?.gain),
      reverbReady: c.reverbReady ?? null,
      oldRampStartTime: c.oldRampStartTime ?? null,
      newRampStartTime: c.newRampStartTime ?? null,
      rampStartTimesIdentical: c.oldRampStartTime != null && c.oldRampStartTime === c.newRampStartTime,
      simpleFadeTimerActive: this.simpleMoonTransitionTimeoutId != null,
      audioNow: Number(Tone.now().toFixed(4)),
      ...extra,
    })
  }

  countDeckOscillators(deck) {
    if (!deck) {
      return 0
    }

    let count = 0

    deck.voices?.forEach((voice) => {
      count += voice.oscillators?.length ?? 0
    })

    if (deck.orbitPair) {
      count += 2
    }

    if (deck.dualBeats) {
      count += (deck.dualBeats.pairs?.length ?? 0) * 2
    }

    if (deck.airBreathNoise) {
      count += 1
    }

    return count
  }

  countFullChainLiveResources() {
    const pendingDecks = this.fullChainCrossfadeDecks.map((entry) => entry.deck).filter(Boolean)
    const limboDeck = this.fullChainTransitionContext?.oldDeck
    const allDecks = [...pendingDecks]

    if (limboDeck && !allDecks.includes(limboDeck)) {
      allDecks.push(limboDeck)
    }

    const currentDeckOsc = this.countDeckOscillators({
      voices: this.voices,
      orbitPair: this.orbitPair,
      dualBeats: this.dualBeats,
      airBreathNoise: this.airBreathNoise,
    })

    return {
      activeDeckCount: 1 + allDecks.length,
      pendingDisposalCount: this.fullChainCrossfadeDecks.length,
      limboDeckTracked: Boolean(limboDeck),
      outgoingVoiceSetCount: this.outgoingNoteCrossfadeVoiceSets.length,
      liveOscillatorCount: currentDeckOsc + allDecks.reduce((sum, deck) => sum + this.countDeckOscillators(deck), 0),
      liveReverbCount: (this.reverb ? 1 : 0) + allDecks.filter((deck) => deck.reverb).length,
      transitionTailCount: allDecks.filter((deck) => deck.moonTransitionReverb).length,
      activeTimerCount: this.fullChainCrossfadeDecks.filter((entry) => entry.disposeTimeoutId != null || entry.fastRetireTimeoutId != null).length
        + (this.fullChainTransitionContext?.reverbReadyTimeoutId != null ? 1 : 0),
    }
  }

  logFullChainResourceDiagnostics(label, extra = {}, ctx = this.fullChainTransitionContext) {
    if (!this.fullChainCrossfadeDebug) {
      return
    }

    const resources = this.countFullChainLiveResources()
    const c = ctx || {}
    const isLive = (node) => node && (typeof node.disposed !== 'boolean' || !node.disposed)

    console.log(`[Moondrone full-chain-resources:${label}]`, {
      transitionNumber: this.fullChainTransitionNumber,
      from: c.from ?? null,
      to: c.to ?? null,
      mode: this.moonTransitionMode,
      oldDeckDisposed: c.oldConnected === false,
      ...resources,
      oldOutputStillConnected: c.oldDeck ? isLive(c.oldDeck.fadeGain) : null,
      audioContextState: Tone.getContext().state,
      ...extra,
    })
  }

  setMoonTransitionIsolation(flags = {}) {
    Object.assign(MOON_TRANSITION_ISOLATION, flags)

    if (!MOON_TRANSITION_ISOLATION.enabled) {
      this.clearMoonTransitionIsolationProbes()
    }

    console.log('[Moondrone moon-transition-isolation]', { ...MOON_TRANSITION_ISOLATION })
  }

  clearMoonTransitionIsolationProbes() {
    this.moonTransitionIsolationProbeIds.forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    this.moonTransitionIsolationProbeIds = []
  }

  isMoonTransitionIsolationActive() {
    if (!MOON_TRANSITION_ISOLATION.enabled) {
      return false
    }

    return MOON_TRANSITION_ISOLATION.voicesOnly
      || MOON_TRANSITION_ISOLATION.muteIncomingExtensions
      || MOON_TRANSITION_ISOLATION.muteAirShimmer
      || MOON_TRANSITION_ISOLATION.muteMoodAux
      || MOON_TRANSITION_ISOLATION.muteOutgoingAfterSeconds != null
      || MOON_TRANSITION_ISOLATION.transitionOverlapScale !== 1
  }

  shouldSkipMoonTransitionAirShimmer() {
    if (!this.pendingMoonVoiceRebuildCrossfade) {
      return false
    }

    if (!MOON_TRANSITION_ISOLATION.enabled) {
      return false
    }

    return MOON_TRANSITION_ISOLATION.voicesOnly || MOON_TRANSITION_ISOLATION.muteAirShimmer
  }

  shouldSkipMoonTransitionMoodAux() {
    if (!this.pendingMoonVoiceRebuildCrossfade) {
      return false
    }

    if (!MOON_TRANSITION_ISOLATION.enabled) {
      return false
    }

    return MOON_TRANSITION_ISOLATION.voicesOnly || MOON_TRANSITION_ISOLATION.muteMoodAux
  }

  shouldMuteMoonTransitionIncomingExtension(index) {
    if (!this.isMoonCrossfadeExtensionVoice(index)) {
      return false
    }

    if (!MOON_TRANSITION_ISOLATION.enabled || !MOON_TRANSITION_ISOLATION.muteIncomingExtensions) {
      return false
    }

    return this.pendingMoonVoiceRebuildCrossfade
  }

  isMoonTransitionAuxHandoffActive(time = Tone.now()) {
    return time < this.moonTransitionAuxHandoffUntil
  }

  getMoonTransitionIncomingOverlapStartScale(index) {
    const headroom = MOON_TRANSITION.overlapHeadroom

    if (!headroom?.enabled || !this.pendingMoonVoiceRebuildCrossfade) {
      return 1
    }

    const fromPreset = this.moonTransitionContext?.fromPreset
      ?? this.moonVoiceCrossfadePlan?.fromPreset

    if (!fromPreset || !headroom.cosmosEnterFromPresets?.includes(fromPreset)) {
      return 1
    }

    if (!this.isCosmosPreset()) {
      return 1
    }

    const baseScale = headroom.cosmosIncomingVoiceScale?.[index] ?? 1
    const debugScale = MOON_TRANSITION_ISOLATION.enabled
      ? MOON_TRANSITION_ISOLATION.transitionOverlapScale
      : 1

    if (debugScale === 1) {
      return baseScale
    }

    return 1 + (baseScale - 1) * debugScale
  }

  getMoonTransitionOutgoingBodyFadeScale(previousPresetName) {
    const overlap = MOON_TRANSITION.overlapCompensation
    const headroom = MOON_TRANSITION.overlapHeadroom

    if (this.isCosmosPreset()
      && headroom?.enabled
      && headroom.cosmosEnterFromPresets?.includes(previousPresetName)) {
      return headroom.cosmosEnterOutgoingBodyFadeScale ?? overlap.bodyVoiceOutgoingFadeScale
    }

    return overlap?.bodyVoiceOutgoingFadeScale ?? 0.35
  }

  getMoonTransitionVoiceEnergyWeight(index) {
    return MOON_TRANSITION.overlapHeadroom?.voiceEnergyWeights?.[index] ?? 1
  }

  sumWeightedVoiceGains(voices) {
    return Number(voices.reduce((sum, voice, index) => (
      sum + voice.gain.gain.value * this.getMoonTransitionVoiceEnergyWeight(index)
    ), 0).toFixed(5))
  }

  buildMoonTransitionEnergyProbe() {
    const outputLinear = Tone.dbToGain(this.output?.volume.value ?? -60)
    const incomingWeightedSum = this.sumWeightedVoiceGains(this.voices)
    const outgoingSets = this.outgoingNoteCrossfadeVoiceSets.map((entry) => ({
      setIndex: this.outgoingNoteCrossfadeVoiceSets.indexOf(entry),
      weightedSum: this.sumWeightedVoiceGains(entry.voices),
    }))
    const outgoingWeightedSum = Number(outgoingSets.reduce(
      (sum, entry) => sum + entry.weightedSum,
      0,
    ).toFixed(5))
    const combinedWeightedSum = Number((incomingWeightedSum + outgoingWeightedSum).toFixed(5))
    const extensionIndices = [6, 8, 9, 10]
    const incomingExtensionSum = Number(extensionIndices.reduce(
      (sum, index) => sum + (this.voices[index]?.gain.gain.value ?? 0),
      0,
    ).toFixed(5))
    const outgoingExtensionSum = Number(this.outgoingNoteCrossfadeVoiceSets.reduce(
      (sum, entry) => sum + extensionIndices.reduce(
        (layerSum, index) => layerSum + (entry.voices[index]?.gain.gain.value ?? 0),
        0,
      ),
      0,
    ).toFixed(5))
    const airBreathGain = this.airBreathGain?.gain.value ?? 0
    const airShelfLinear = Tone.dbToGain(this.airShelfEq?.gain.value ?? 0)
    const scoopLinear = Tone.dbToGain(this.airLowMidScoop?.gain.value ?? 0)
    const airShimmerSum = Number((airBreathGain + airShelfLinear * 0.04 + scoopLinear * 0.02).toFixed(5))
    const orbitGain = this.orbitPair?.busGain.gain.value ?? 0
    const dualBeatSum = this.dualBeats?.pairs.reduce(
      (sum, pair) => sum + pair.pairGain.gain.value,
      0,
    ) ?? 0
    const moodBloomLinear = Tone.dbToGain(this.moodBloomEq?.gain.value ?? 0)
    const moodEclipseLinear = Tone.dbToGain(this.moodEclipseEq?.gain.value ?? 0)
    const moodAuxSum = Number((
      orbitGain + dualBeatSum + Math.max(0, moodBloomLinear - 1) * 0.05 + Math.max(0, 1 - moodEclipseLinear) * 0.03
    ).toFixed(5))
    const presetLowMidEqGain = this.presetLowMidEq?.gain.value ?? 0
    const presetUpperMidEqGain = this.presetUpperMidEq?.gain.value ?? 0

    return {
      incomingWeightedSum,
      outgoingWeightedSum,
      combinedWeightedSum,
      incomingExtensionSum,
      outgoingExtensionSum,
      airShimmerSum,
      moodAuxSum,
      outputLinear: Number(outputLinear.toFixed(5)),
      balanceTrimDb: Number(this.getDroneBalanceTrimDb().toFixed(2)),
      presetLowMidEqGainDb: Number(presetLowMidEqGain.toFixed(2)),
      presetUpperMidEqGainDb: Number(presetUpperMidEqGain.toFixed(2)),
      estimatedTonalBusLinear: Number((combinedWeightedSum * outputLinear).toFixed(5)),
      estimatedWithAirLinear: Number(((combinedWeightedSum + airShimmerSum) * outputLinear).toFixed(5)),
      estimatedWithAuxLinear: Number((
        (combinedWeightedSum + airShimmerSum + moodAuxSum) * outputLinear
      ).toFixed(5)),
      outgoingSets,
    }
  }

  scheduleMoonTransitionIsolationOutgoingMute(startNow, afterSeconds) {
    if (!MOON_TRANSITION_ISOLATION.enabled || afterSeconds == null) {
      return
    }

    const delayMs = Math.max(0, afterSeconds * 1000)
    const timeoutId = window.setTimeout(() => {
      const muteTime = Tone.now()

      this.outgoingNoteCrossfadeVoiceSets.forEach((entry) => {
        entry.voices.forEach((voice) => {
          this.snapParam(voice.gain.gain, 0, muteTime)
        })
      })

      if (MOON_CHANGE_DEBUG.enabled) {
        console.log('[Moondrone moon-transition-isolation:outgoing-muted]', {
          afterSeconds,
          outgoingSets: this.outgoingNoteCrossfadeVoiceSets.length,
        })
      }
    }, delayMs)

    this.moonTransitionIsolationProbeIds.push(timeoutId)
  }

  applyMoonTransitionIsolationAtStart(now) {
    if (!MOON_TRANSITION_ISOLATION.enabled) {
      return
    }

    if (this.shouldSkipMoonTransitionAirShimmer()) {
      if (this.airBreathGain) {
        this.snapParam(this.airBreathGain.gain, 0, now)
      }
    }

    if (this.shouldSkipMoonTransitionMoodAux()) {
      if (this.orbitPair) {
        this.snapParam(this.orbitPair.busGain.gain, 0, now)
      }

      if (this.dualBeats) {
        this.dualBeats.pairs.forEach((pair) => {
          this.snapParam(pair.pairGain.gain, 0, now)
        })
      }

      if (this.moodBloomEq) {
        this.snapParam(this.moodBloomEq.gain, 0, now)
      }

      if (this.moodEclipseEq) {
        this.snapParam(this.moodEclipseEq.gain, 0, now)
      }
    }
  }

  captureMoonTransitionBusSnapshot() {
    this.moonTransitionBusSnapshot = {
      capturedAtAudio: Tone.now(),
      outputVolumeDb: Number((this.output?.volume.value ?? -60).toFixed(2)),
      outputLinear: Number(Tone.dbToGain(this.output?.volume.value ?? -60).toFixed(5)),
      reverbWet: Number((this.reverb?.wet.value ?? 0).toFixed(4)),
      airBreathGain: Number((this.airBreathGain?.gain.value ?? 0).toFixed(5)),
      airShelfGainDb: Number((this.airShelfEq?.gain.value ?? 0).toFixed(2)),
      moodBloomGainDb: Number((this.moodBloomEq?.gain.value ?? 0).toFixed(2)),
      moodEclipseGainDb: Number((this.moodEclipseEq?.gain.value ?? 0).toFixed(2)),
      orbitBusGain: Number((this.orbitPair?.busGain.gain.value ?? 0).toFixed(5)),
      dualBeatGains: this.dualBeats?.pairs.map((pair, index) => ({
        index,
        gain: Number(pair.pairGain.gain.value.toFixed(5)),
      })) ?? [],
      filterFrequency: Number((this.filter?.frequency.value ?? 0).toFixed(1)),
      filterQ: Number((this.filter?.Q.value ?? 0).toFixed(3)),
      voiceGainSum: Number(this.voices.reduce((sum, voice) => sum + voice.gain.gain.value, 0).toFixed(5)),
      voiceGains: this.voices.map((voice, index) => ({
        index,
        gain: Number(voice.gain.gain.value.toFixed(5)),
      })),
    }
  }

  isMoonAuxLayerCrossfadeActive() {
    return this.moonAuxLayerCrossfadeActive && Tone.now() < this.moonAuxLayerCrossfadeUntil
  }

  getMoonAuxLayerAirBreathEntryTarget() {
    return this.getMoonTransitionAirBreathTargetGain()
  }

  // Breath phase used for moon-transition air targets. When the switch happens near an
  // inhale swell peak, use the neutral reanchor phase so air does not hold the outgoing
  // moon's peak until the breath loop resumes.
  resolveMoonTransitionAirBreathCyclePosition(capturedPhase) {
    const neutralPhase = BREATH_TUNING.reanchorCyclePosition
    const swellAtPhase = this.getAirBreathNoiseSwellAmountAtCyclePosition(capturedPhase)
    const swellAtNeutral = this.getAirBreathNoiseSwellAmountAtCyclePosition(neutralPhase)

    if (swellAtNeutral <= 0) {
      return capturedPhase
    }

    const peakRatio = swellAtPhase / swellAtNeutral
    const threshold = MOON_TRANSITION.airIdentity?.peakSwellRatioThreshold ?? 1.08

    if (peakRatio > threshold) {
      return neutralPhase
    }

    return capturedPhase
  }

  getMoonTransitionAirBreathCyclePosition() {
    return this.moonTransitionBreathSnapshot?.airBreathCyclePosition
      ?? this.moonTransitionBreathSnapshot?.breathCyclePosition
      ?? this.getBreathCyclePosition()
  }

  getMoonTransitionAirBreathTargetGain() {
    const cyclePosition = this.getMoonTransitionAirBreathCyclePosition()

    return this.getAirBreathNoiseTargetGainAtCyclePosition(cyclePosition)
  }

  getMoonTransitionAirBreathFilterTargets() {
    const cyclePosition = this.getMoonTransitionAirBreathCyclePosition()

    return this.getAirBreathNoiseFilterTargetsAtCyclePosition(cyclePosition)
  }

  getMoonAuxLayerSnapshot() {
    const dualBeatGains = this.dualBeats?.pairs.map((pair, index) => ({
      index,
      gain: Number(pair.pairGain.gain.value.toFixed(5)),
      target: Number(((this.isDualBeatsActive() ? (pair.config.gain ?? 0) : 0) * this.getToneLabMoonPhaseHarmonicsGain()).toFixed(5)),
    })) ?? []

    return {
      voiceGainSum: Number(this.voices.reduce((sum, voice) => sum + voice.gain.gain.value, 0).toFixed(5)),
      airBreathGain: Number((this.airBreathGain?.gain.value ?? 0).toFixed(5)),
      airBreathTarget: Number(this.getAirBreathNoiseTargetGain().toFixed(5)),
      airShelfGainDb: Number((this.airShelfEq?.gain.value ?? 0).toFixed(2)),
      airShelfTargetDb: Number(this.getAirShimmerShelfGainDb().toFixed(2)),
      moodBloomGainDb: Number((this.moodBloomEq?.gain.value ?? 0).toFixed(2)),
      moodBloomTargetDb: Number(this.getMoodBloomGainDb().toFixed(2)),
      moodEclipseGainDb: Number((this.moodEclipseEq?.gain.value ?? 0).toFixed(2)),
      moodEclipseTargetDb: Number(this.getMoodEclipseGainDb().toFixed(2)),
      orbitBusGain: Number((this.orbitPair?.busGain.gain.value ?? 0).toFixed(5)),
      orbitTargetLevel: Number(this.getOrbitLevel().toFixed(5)),
      dualBeatGains,
      dualBeatGainSum: Number(dualBeatGains.reduce((sum, layer) => sum + layer.gain, 0).toFixed(5)),
      moonAuxLayerCrossfadeActive: this.moonAuxLayerCrossfadeActive,
      moonAuxLayerCrossfadeUntil: Number(this.moonAuxLayerCrossfadeUntil.toFixed(3)),
    }
  }

  logMoonReanchorTimeline(event, details = {}) {
    const entry = {
      event,
      audioNow: Number(Tone.now().toFixed(3)),
      elapsedFromTransitionStart: this.moonChangeDebugContext
        ? Number((Tone.now() - this.moonChangeDebugContext.startedAtAudio).toFixed(3))
        : null,
      auxLayers: this.getMoonAuxLayerSnapshot(),
      ...details,
    }

    this.moonReanchorTimeline.push(entry)

    if (MOON_CHANGE_DEBUG.enabled) {
      console.log('[Moondrone moon-change:reanchor-timeline]', entry)
    }
  }

  scheduleAuxParamCurvedCrossfade(param, outgoingValue, incomingValue, now, startTime, endTime, options = {}) {
    if (!param || endTime <= startTime) {
      return
    }

    const {
      curve = MOON_TRANSITION.curve,
      curvePower = 1.4,
    } = typeof options === 'number'
      ? { curvePower: options }
      : options
    const steps = MOON_AUX_LAYER_CROSSFADE.curveSteps
    const delta = incomingValue - outgoingValue

    this.holdAudioParamAtTime(param, now)
    param.setValueAtTime(outgoingValue, now)
    param.setValueAtTime(outgoingValue, startTime)

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps
      const curvedProgress = this.resolveMoonAuxCurveProgress(progress, curve, curvePower)
      const value = outgoingValue + delta * curvedProgress

      param.linearRampToValueAtTime(value, startTime + (endTime - startTime) * progress)
    }
  }

  // Transition-only delta slew cap for high-energy auxiliary layers. Limits how far a
  // layer is allowed to travel DURING the guarded morph window so Titan<->Io does not
  // surge; the continuously-running mood/breath loops then settle the small remainder to
  // the true `incoming` target after the guard (gentle, no second event). Returns
  // `incoming` unchanged when slew is disabled or the move is already within the cap, so
  // ordinary moon pairs and the settled steady-state sound are untouched.
  capMoonTransitionAuxDelta(outgoing, incoming, cap) {
    const slew = MOON_TRANSITION.deltaSlew
    if (!slew?.enabled || cap == null || !Number.isFinite(cap)) {
      return incoming
    }

    // Only cap when the destination has a continuously-running mood loop to settle the
    // remainder (every non-binaural preset while playing). Otherwise the capped value
    // would never reach the live target and steady-state would drift.
    if (!this.isMoodActive()) {
      return incoming
    }

    const delta = incoming - outgoing
    if (Math.abs(delta) <= cap) {
      return incoming
    }

    return outgoing + Math.sign(delta) * cap
  }

  resolveMoonAuxCurveProgress(progress, curve = MOON_TRANSITION.curve, curvePower = 1.4) {
    if (curve === 'linear') {
      return progress
    }

    if (curve === 'easeOutSine') {
      return Math.sin(progress * Math.PI / 2)
    }

    if (curve === 'smoothstep') {
      return progress * progress * (3 - 2 * progress)
    }

    return progress ** curvePower
  }

  // Voice-coupled body/air identity window: body resonance/EQ and the moon-specific
  // breath/shimmer/air layers land with the voices (never lag), clamped to the aux
  // window so it can never run longer than the overall gesture.
  getMoonBodyMorphSeconds() {
    return Math.min(MOON_TRANSITION.bodyMorphSeconds, MOON_TRANSITION.auxMorphSeconds)
  }

  getMoonAirIdentityMorphSeconds(outgoingGain = 0, incomingGain = 0) {
    const airCfg = MOON_TRANSITION.airIdentity
    const base = airCfg?.morphSeconds ?? MOON_TRANSITION.voiceCrossfadeSeconds
    const capped = Math.min(base, MOON_TRANSITION.auxMorphSeconds)

    if (outgoingGain > incomingGain * 1.02 && airCfg?.outgoingFadeScale) {
      return Math.max(capped * airCfg.outgoingFadeScale, 0.35)
    }

    return capped
  }

  getAirBreathNoiseFilterTargetsAtCyclePosition(cyclePosition) {
    const swellAmount = this.getAirBreathNoiseSwellAmountAtCyclePosition(cyclePosition)
    const endpoints = this.isToneLabActive()
      ? getToneLabBreathFilterEndpoints(TONE_LAB_TUNING.breathAir.tone)
      : {
        highpassMinHz: AIR_SHIMMER_TUNING.breathNoise.highpassMinHz,
        highpassMaxHz: AIR_SHIMMER_TUNING.breathNoise.highpassMaxHz,
        lowpassMinHz: AIR_SHIMMER_TUNING.breathNoise.lowpassMinHz,
        lowpassMaxHz: AIR_SHIMMER_TUNING.breathNoise.lowpassMaxHz,
      }
    const {
      highpassMinHz,
      highpassMaxHz,
      lowpassMinHz,
      lowpassMaxHz,
    } = endpoints

    return {
      highpassHz: highpassMinHz + (highpassMaxHz - highpassMinHz) * swellAmount,
      lowpassHz: lowpassMinHz + (lowpassMaxHz - lowpassMinHz) * swellAmount,
    }
  }

  scheduleMoonAirIdentityCrossfade(now) {
    if (this.isStringsIsolationAirDisabled() || this.shouldSkipMoonTransitionAirShimmer()) {
      return
    }

    const incomingBreathGain = this.getMoonTransitionAirBreathTargetGain()
    const currentBreathGain = this.airBreathGain?.gain.value ?? incomingBreathGain
    const airMorphSeconds = this.getMoonAirIdentityMorphSeconds(currentBreathGain, incomingBreathGain)
    const timing = this.getMoonAuxLayerEntryTiming(airMorphSeconds)
    const curveOpts = {
      curve: MOON_TRANSITION.airIdentity?.curve ?? 'linear',
      curvePower: MOON_TRANSITION.airIdentity?.curvePower ?? 1,
    }

    if (this.airBreathGain) {
      // Ramp from the live physical gain (outgoing moon's breath peak if mid-swell) toward
      // the incoming moon's target at the safe transition breath phase — never snap back to
      // a bus snapshot that would re-hold the outgoing peak.
      this.scheduleAuxParamCurvedCrossfade(
        this.airBreathGain.gain,
        currentBreathGain,
        incomingBreathGain,
        now,
        timing.start,
        timing.end,
        curveOpts,
      )

      if (this.airBreathHighpass && this.airBreathLowpass) {
        const filterTargets = this.getMoonTransitionAirBreathFilterTargets()

        this.scheduleAuxParamCurvedCrossfade(
          this.airBreathHighpass.frequency,
          this.airBreathHighpass.frequency.value,
          filterTargets.highpassHz,
          now,
          timing.start,
          timing.end,
          curveOpts,
        )
        this.scheduleAuxParamCurvedCrossfade(
          this.airBreathLowpass.frequency,
          this.airBreathLowpass.frequency.value,
          filterTargets.lowpassHz,
          now,
          timing.start,
          timing.end,
          curveOpts,
        )
      }
    }

    if (this.airShelfEq) {
      const currentShelf = this.airShelfEq.gain.value
      const incomingShelf = this.getAirShimmerShelfGainDb()

      this.scheduleAuxParamCurvedCrossfade(
        this.airShelfEq.gain,
        currentShelf,
        incomingShelf,
        now,
        timing.start,
        timing.end,
        curveOpts,
      )

      if (this.airLowMidScoop) {
        const scoop = AIR_SHIMMER_TUNING.presetLowMidScoop?.[this.currentPreset.name]
          ?? AIR_SHIMMER_TUNING.lowMidScoop
        const airEnabled = incomingShelf !== 0 || AIR_SHIMMER_TUNING.enabled
        const incomingScoop = airEnabled ? scoop.gainDb : 0

        this.scheduleAuxParamCurvedCrossfade(
          this.airLowMidScoop.frequency,
          this.airLowMidScoop.frequency.value,
          scoop.frequency,
          now,
          timing.start,
          timing.end,
          curveOpts,
        )
        this.scheduleAuxParamCurvedCrossfade(
          this.airLowMidScoop.Q,
          this.airLowMidScoop.Q.value,
          scoop.Q,
          now,
          timing.start,
          timing.end,
          curveOpts,
        )
        this.scheduleAuxParamCurvedCrossfade(
          this.airLowMidScoop.gain,
          this.airLowMidScoop.gain.value,
          incomingScoop,
          now,
          timing.start,
          timing.end,
          curveOpts,
        )
      }
    }

    return timing.end
  }

  // Morph window for a secondary layer (all moons, both directions): start at the voice
  // fade-in, reach the live target after `durationSeconds`, on the shared smoothstep
  // curve. Moon-identity layers (body/air) pass the short bodyMorphSeconds; decorative
  // motion layers use the default auxMorphSeconds. One coordinated gesture, no per-layer
  // delays or per-moon special-casing.
  getMoonAuxLayerEntryTiming(durationSeconds = MOON_TRANSITION.auxMorphSeconds) {
    const start = this.moonAuxMorphStart ?? Tone.now()

    return {
      start,
      end: start + durationSeconds,
      curve: MOON_TRANSITION.curve,
      curvePower: 1.4,
    }
  }

  scheduleMoonAuxLayerCrossfade(now, fadeInStart, fadeInEnd, previousPresetName = null) {
    const cfg = MOON_AUX_LAYER_CROSSFADE

    if (!cfg.enabled || !this.pendingMoonVoiceRebuildCrossfade) {
      return false
    }

    this.moonAuxMorphStart = fadeInStart
    const snapshot = this.moonTransitionBusSnapshot
    const scheduledLayers = []
    let maxAuxEnd = fadeInEnd
    const moodAuxSeconds = MOON_TRANSITION.moodAuxMorphSeconds ?? this.getMoonBodyMorphSeconds()
    const moodCurveOpts = {
      curve: MOON_TRANSITION.moodAuxCurve ?? 'linear',
      curvePower: MOON_TRANSITION.moodAuxCurvePower ?? 1,
    }
    const skipMoodAux = this.shouldSkipMoonTransitionMoodAux()

    // Decorative motion layers (bloom/eclipse/orbit/dual) keep the atmosphere window.
    // Moon air identity is scheduled separately on the voice-coupled window above.
    const scheduleLayer = (layerKey, label, scheduleFn, durationSeconds = moodAuxSeconds) => {
      const timing = this.getMoonAuxLayerEntryTiming(durationSeconds)

      scheduleFn(timing)
      scheduledLayers.push(label)
      maxAuxEnd = Math.max(maxAuxEnd, timing.end)
    }

    if (!this.isStringsIsolationAirDisabled()) {
      const airIdentityEnd = this.scheduleMoonAirIdentityCrossfade(now)

      if (airIdentityEnd != null) {
        scheduledLayers.push('airIdentity')
        maxAuxEnd = Math.max(maxAuxEnd, airIdentityEnd)
      }
    }

    if (!skipMoodAux && (this.moodBloomEq || this.moodEclipseEq)) {
      if (this.moodBloomEq) {
        scheduleLayer('moodBloom', 'moodBloom', (timing) => {
          const outgoing = snapshot?.moodBloomGainDb ?? this.moodBloomEq.gain.value
          const incoming = this.getMoodBloomGainDb()

          this.scheduleAuxParamCurvedCrossfade(
            this.moodBloomEq.gain,
            outgoing,
            incoming,
            now,
            timing.start,
            timing.end,
            moodCurveOpts,
          )
        })
      }

      if (this.moodEclipseEq) {
        scheduleLayer('moodEclipse', 'moodEclipse', (timing) => {
          const outgoing = snapshot?.moodEclipseGainDb ?? this.moodEclipseEq.gain.value
          const incoming = this.getMoodEclipseGainDb()

          this.scheduleAuxParamCurvedCrossfade(
            this.moodEclipseEq.gain,
            outgoing,
            incoming,
            now,
            timing.start,
            timing.end,
            moodCurveOpts,
          )
          this.scheduleAuxParamCurvedCrossfade(
            this.moodEclipseEq.frequency,
            this.moodEclipseEq.frequency.value,
            this.getMoodEclipseFrequency(),
            now,
            timing.start,
            timing.end,
            moodCurveOpts,
          )
        })
      }
    }

    if (!skipMoodAux && (this.orbitPair || this.dualBeats)) {
      if (this.orbitPair) {
        scheduleLayer('orbit', 'orbit', (timing) => {
          const outgoing = snapshot?.orbitBusGain ?? this.orbitPair.busGain.gain.value
          const incoming = this.getOrbitLevel()

          this.scheduleAuxParamCurvedCrossfade(
            this.orbitPair.busGain.gain,
            outgoing,
            incoming,
            now,
            timing.start,
            timing.end,
            moodCurveOpts,
          )
          this.applyOrbitPair(timing.end - timing.start, timing.start, { skipBusGain: true })
        })
      }

      if (this.dualBeats) {
        scheduleLayer('dualBeats', 'dualBeats', (timing) => {
          const active = this.isDualBeatsActive()

          this.dualBeats.pairs.forEach((pair, index) => {
            const outgoing = snapshot?.dualBeatGains?.[index]?.gain ?? pair.pairGain.gain.value
            const liveIncoming = active ? (pair.config.gain ?? 0) * this.getToneLabMoonPhaseHarmonicsGain() : 0

            this.scheduleAuxParamCurvedCrossfade(
              pair.pairGain.gain,
              outgoing,
              liveIncoming,
              now,
              timing.start,
              timing.end,
              moodCurveOpts,
            )
          })
          this.applyDualBeats(timing.end - timing.start, timing.start, { skipGainRamp: true })
        })
      }
    }

    if (scheduledLayers.length === 0) {
      return false
    }

    this.moonAuxLayerCrossfadeActive = true
    this.moonAuxLayerCrossfadeUntil = maxAuxEnd + 0.04

    this.logMoonReanchorTimeline('aux-crossfade-scheduled', {
      fromPreset: previousPresetName,
      toPreset: this.currentPreset.name,
      enteringTitan: this.isStringsPreset(),
      enteringCosmos: this.isCosmosPreset(),
      maxAuxEnd: Number(maxAuxEnd.toFixed(3)),
      scheduledLayers,
    })

    return true
  }

  scheduleMoonAuxLayerTimelineProbes() {
    if (!MOON_CHANGE_DEBUG.enabled || !MOON_CHANGE_DEBUG.auxLayerTimeline) {
      return
    }

    MOON_CHANGE_DEBUG.auxLayerMarkSeconds.forEach((markSeconds) => {
      const timeoutId = window.setTimeout(() => {
        this.logMoonChangeDiagnostic(`aux-timeline+${markSeconds}s`, {
          auxLayers: this.getMoonAuxLayerSnapshot(),
          reanchorTimeline: [...this.moonReanchorTimeline],
        })
      }, markSeconds * 1000)

      this.moonChangeDebugProbeIds.push(timeoutId)
    })
  }

  getMoonChangeActualGainSnapshot() {
    const voiceGains = this.voices.map((voice, index) => ({
      index,
      gain: Number(voice.gain.gain.value.toFixed(5)),
    }))
    const voiceGainSum = voiceGains.reduce((sum, layer) => sum + layer.gain, 0)
    const outputVolumeDb = this.output?.volume.value ?? -60
    const outputLinear = Tone.dbToGain(outputVolumeDb)
    const dualBeatGains = this.dualBeats?.pairs.map((pair, index) => ({
      index,
      gain: Number(pair.pairGain.gain.value.toFixed(5)),
    })) ?? []
    const dualBeatGainSum = dualBeatGains.reduce((sum, layer) => sum + layer.gain, 0)

    return {
      voiceGains,
      voiceGainSum: Number(voiceGainSum.toFixed(5)),
      outputVolumeDb: Number(outputVolumeDb.toFixed(2)),
      outputLinear: Number(outputLinear.toFixed(5)),
      balanceTrimDb: Number(this.getDroneBalanceTrimDb().toFixed(2)),
      reverbWet: Number((this.reverb?.wet.value ?? 0).toFixed(4)),
      airBreathGain: Number((this.airBreathGain?.gain.value ?? 0).toFixed(5)),
      airShelfGainDb: Number((this.airShelfEq?.gain.value ?? 0).toFixed(2)),
      orbitBusGain: Number((this.orbitPair?.busGain.gain.value ?? 0).toFixed(5)),
      dualBeatGains,
      dualBeatGainSum: Number(dualBeatGainSum.toFixed(5)),
      filterFrequency: Number((this.filter?.frequency.value ?? 0).toFixed(1)),
      filterQ: Number((this.filter?.Q.value ?? 0).toFixed(3)),
      masterLimiterThresholdDb: Number((this.masterLimiter?.threshold.value ?? 0).toFixed(2)),
      estimatedTonalBusLinear: Number((voiceGainSum * outputLinear).toFixed(5)),
      estimatedWithAirLinear: Number(((voiceGainSum + (this.airBreathGain?.gain.value ?? 0)) * outputLinear).toFixed(5)),
      estimatedWithAuxLinear: Number((
        (voiceGainSum + (this.airBreathGain?.gain.value ?? 0) + (this.orbitPair?.busGain.gain.value ?? 0) + dualBeatGainSum)
        * outputLinear
      ).toFixed(5)),
      pendingMoonVoiceRebuildCrossfade: this.pendingMoonVoiceRebuildCrossfade,
    }
  }

  scheduleMoonChangeGainPathProbes() {
    if (!MOON_CHANGE_DEBUG.enabled || !MOON_CHANGE_DEBUG.gainPathProbes) {
      return
    }

    MOON_CHANGE_DEBUG.gainPathMarkSeconds.forEach((markSeconds) => {
      const timeoutId = window.setTimeout(() => {
        this.logMoonChangeDiagnostic(`gain-path+${markSeconds}s`, {
          actualGains: this.getMoonChangeActualGainSnapshot(),
          auxLayers: this.getMoonAuxLayerSnapshot(),
          busSnapshotAtStart: this.moonTransitionBusSnapshot,
        })
      }, markSeconds * 1000)

      this.moonChangeDebugProbeIds.push(timeoutId)
    })
  }

  setClickDiagnostics(flags = {}) {
    Object.assign(TRANSITION_TUNING, flags)

    console.log('[Moondrone click-diagnostics]', {
      clickDiagnosticsEnabled: TRANSITION_TUNING.clickDiagnosticsEnabled,
    })
  }

  clearMoonChangeDebugProbes() {
    this.moonChangeDebugProbeIds.forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    this.moonChangeDebugProbeIds = []
  }

  getBreathCyclePosition() {
    if (!this.breathStartTime || this.getBreathAmount() === 0) {
      return 0
    }

    const elapsedSeconds = (window.performance.now() - this.breathStartTime) / 1000

    return (elapsedSeconds % BREATH_CYCLE_SECONDS) / BREATH_CYCLE_SECONDS
  }

  getMoonChangeDiagnosticSnapshot() {
    const voiceLayers = this.voices.map((voice, index) => ({
      index,
      gain: Number(voice.gain.gain.value.toFixed(5)),
      targetGainNeutralBreath: Number(this.getVoiceTargetGain(index, this.getBaseTonalAmount(), false).toFixed(5)),
      targetGainWithBreath: Number(this.getVoiceTargetGain(index).toFixed(5)),
    }))

    return {
      register: this.currentOctave,
      breathCyclePosition: Number(this.getBreathCyclePosition().toFixed(3)),
      breathAmount: Number(this.getBreathAmount().toFixed(4)),
      breathOffset: Number(this.getBreathOffset().toFixed(4)),
      intensityUi: this.intensity,
      effectiveIntensityUi: Number(this.getEffectiveIntensityUi().toFixed(2)),
      baseTonalAmount: Number(this.getBaseTonalAmount().toFixed(4)),
      effectiveTonalAmount: Number(this.getEffectiveTonalAmount().toFixed(4)),
      voiceLayers,
      airBreathGain: Number((this.airBreathGain?.gain.value ?? 0).toFixed(5)),
      airBreathTargetGain: Number(this.getAirBreathNoiseTargetGain().toFixed(5)),
      airBreathSwellAmount: Number(this.getAirBreathNoiseSwellAmount().toFixed(4)),
      airShelfGainDb: Number((this.airShelfEq?.gain.value ?? 0).toFixed(2)),
      airShelfTargetDb: Number(this.getAirShimmerShelfGainDb().toFixed(2)),
      moodBloomGainDb: Number((this.moodBloomEq?.gain.value ?? 0).toFixed(2)),
      moodBloomTargetDb: Number(this.getMoodBloomGainDb().toFixed(2)),
      moodEclipseGainDb: Number((this.moodEclipseEq?.gain.value ?? 0).toFixed(2)),
      moodEclipseTargetDb: Number(this.getMoodEclipseGainDb().toFixed(2)),
      orbitGain: Number((this.orbitPair?.busGain.gain.value ?? 0).toFixed(5)),
      orbitTargetLevel: Number(this.getOrbitLevel().toFixed(5)),
      dualBeatGains: this.dualBeats?.pairs.map((pair, index) => ({
        index,
        gain: Number(pair.pairGain.gain.value.toFixed(5)),
      })) ?? [],
      outputVolumeDb: Number((this.output?.volume.value ?? 0).toFixed(2)),
      reverbWet: Number((this.reverb?.wet.value ?? 0).toFixed(4)),
      presetTransitionEndsAt: this.presetTransitionEndsAt,
      canRampVoiceGains: this.canRampVoiceGainsFromBreathOrIntensity(),
    }
  }

  logMoonChangeDiagnostic(event, details = {}) {
    if (!MOON_CHANGE_DEBUG.enabled || !this.moonChangeDebugContext) {
      return
    }

    const elapsedAudioSec = Tone.now() - this.moonChangeDebugContext.startedAtAudio

    console.log(`[Moondrone moon-change:${event}]`, {
      ...this.moonChangeDebugContext,
      elapsedAudioSec: Number(elapsedAudioSec.toFixed(3)),
      ...this.getMoonChangeDiagnosticSnapshot(),
      ...details,
    })
  }

  shouldLogMoonTransitionProbes() {
    return MOON_CHANGE_DEBUG.enabled
      && MOON_CHANGE_DEBUG.transitionProbes
      && this.moonChangeDebugContext?.path === 'voice-rebuild-crossfade'
  }

  buildMoonTransitionProbePayload(stage) {
    const snapshot = this.moonTransitionBreathSnapshot
    const plan = this.moonVoiceCrossfadePlan
    const voiceBreathPhase = this.getMoonTransitionVoicePlanningBreathCyclePosition()
    const planningTonalAmount = this.getMoonTransitionVoicePlanningTonalAmount()
    const dualBeatGains = this.dualBeats?.pairs.map((pair, index) => ({
      index,
      gain: Number(pair.pairGain.gain.value.toFixed(5)),
      target: Number(((this.isDualBeatsActive() ? (pair.config.gain ?? 0) : 0) * this.getToneLabMoonPhaseHarmonicsGain()).toFixed(5)),
    })) ?? []
    const scoop = this.airLowMidScoop

    const voices = Array.from({ length: VOICE_COUNT }, (_, index) => {
      const planEntry = plan?.voiceEntries?.[index]
      const entryTargetGain = planEntry?.entryTarget ?? null
      const settledLiveTarget = Number(this.getVoiceTargetGain(index).toFixed(5))
      const plannedSettledTarget = Number(this.getVoiceTargetGain(
        index,
        planningTonalAmount,
        true,
        voiceBreathPhase,
      ).toFixed(5))
      const actualGain = Number((this.voices[index]?.gain.gain.value ?? 0).toFixed(5))

      return {
        index,
        entryTargetGain,
        plannedSettledTarget,
        settledLiveTarget,
        actualGain,
        entryMinusSettled: entryTargetGain != null
          ? Number((entryTargetGain - settledLiveTarget).toFixed(5))
          : null,
        actualMinusSettled: Number((actualGain - settledLiveTarget).toFixed(5)),
      }
    })

    const outgoingVoiceGains = this.outgoingNoteCrossfadeVoiceSets.flatMap((entry, setIndex) => (
      entry.voices.map((voice, index) => ({
        setIndex,
        index,
        gain: Number(voice.gain.gain.value.toFixed(5)),
      }))
    ))

    return {
      stage,
      elapsedAudioSec: this.moonChangeDebugContext
        ? Number((Tone.now() - this.moonChangeDebugContext.startedAtAudio).toFixed(3))
        : null,
      from: this.moonChangeDebugContext?.from ?? null,
      to: this.moonChangeDebugContext?.to ?? null,
      register: this.currentOctave,
      key: this.currentKey,
      mood: this.mood,
      intensity: this.intensity,
      breath: this.breath,
      breathCyclePosition: Number(this.getBreathCyclePosition().toFixed(5)),
      pinnedBreathPhase: snapshot?.breathCyclePosition ?? null,
      airBreathPhase: snapshot?.airBreathCyclePosition ?? null,
      breathPaused: this.getBreathAmount() > 0 && !this.breathFrame,
      baseTonalAmount: Number(this.getBaseTonalAmount().toFixed(5)),
      effectiveTonalAmount: Number(this.getEffectiveTonalAmount().toFixed(5)),
      planningTonalAmount: Number(planningTonalAmount.toFixed(5)),
      canRampVoiceGains: this.canRampVoiceGainsFromBreathOrIntensity(),
      canRampMoodAuxiliaryLayers: this.canRampMoodAuxiliaryLayers(),
      tonalBusGuarded: this.isTonalBusTransitionGuarded(),
      outputVolumeDb: Number((this.output?.volume.value ?? -60).toFixed(2)),
      presetTrimDb: Number(this.getPresetBalanceTrimDb().toFixed(2)),
      registerTrimDb: Number(this.getRegisterBalanceTrimDb().toFixed(2)),
      presetRegisterTrimDb: Number(this.getPresetRegisterBalanceTrimDb().toFixed(2)),
      balanceTrimDb: Number(this.getDroneBalanceTrimDb().toFixed(2)),
      filterFrequency: Number((this.filter?.frequency.value ?? 0).toFixed(1)),
      filterQ: Number((this.filter?.Q.value ?? 0).toFixed(3)),
      airBreathGain: Number((this.airBreathGain?.gain.value ?? 0).toFixed(5)),
      airBreathTarget: Number(this.getAirBreathNoiseTargetGain().toFixed(5)),
      airShelfGainDb: Number((this.airShelfEq?.gain.value ?? 0).toFixed(2)),
      airShelfTargetDb: Number(this.getAirShimmerShelfGainDb().toFixed(2)),
      scoopGainDb: Number((scoop?.gain.value ?? 0).toFixed(2)),
      scoopFrequencyHz: Number((scoop?.frequency.value ?? 0).toFixed(1)),
      presetAirShimmerScale: Number(this.getPresetAirShimmerGainScale().toFixed(3)),
      moodBloomGainDb: Number((this.moodBloomEq?.gain.value ?? 0).toFixed(2)),
      moodBloomTargetDb: Number(this.getMoodBloomGainDb().toFixed(2)),
      moodEclipseGainDb: Number((this.moodEclipseEq?.gain.value ?? 0).toFixed(2)),
      moodEclipseTargetDb: Number(this.getMoodEclipseGainDb().toFixed(2)),
      moodEclipseFrequencyHz: Number((this.moodEclipseEq?.frequency.value ?? 0).toFixed(1)),
      orbitBusGain: Number((this.orbitPair?.busGain.gain.value ?? 0).toFixed(5)),
      orbitTarget: Number(this.getOrbitLevel().toFixed(5)),
      dualBeatGains,
      voices,
      outgoingVoiceGains,
      energy: this.buildMoonTransitionEnergyProbe(),
    }
  }

  logMoonTransitionProbeTable(stage) {
    if (!this.shouldLogMoonTransitionProbes()) {
      return
    }

    const payload = this.buildMoonTransitionProbePayload(stage)

    console.log(`[Moondrone moon-change:probe:${stage}]`, {
      from: payload.from,
      to: payload.to,
      register: payload.register,
      key: payload.key,
      mood: payload.mood,
      intensity: payload.intensity,
      breath: payload.breath,
      elapsedAudioSec: payload.elapsedAudioSec,
      breathCyclePosition: payload.breathCyclePosition,
      pinnedBreathPhase: payload.pinnedBreathPhase,
      breathPaused: payload.breathPaused,
      planningTonalAmount: payload.planningTonalAmount,
      effectiveTonalAmount: payload.effectiveTonalAmount,
      canRampVoiceGains: payload.canRampVoiceGains,
      canRampMoodAuxiliaryLayers: payload.canRampMoodAuxiliaryLayers,
      tonalBusGuarded: payload.tonalBusGuarded,
      outputVolumeDb: payload.outputVolumeDb,
      balanceTrimDb: payload.balanceTrimDb,
      filterFrequency: payload.filterFrequency,
      filterQ: payload.filterQ,
      airBreathGain: payload.airBreathGain,
      airShelfGainDb: payload.airShelfGainDb,
      scoopGainDb: payload.scoopGainDb,
      moodBloomGainDb: payload.moodBloomGainDb,
      orbitBusGain: payload.orbitBusGain,
      energy: payload.energy,
    })
    console.table(payload.voices)

    if (payload.outgoingVoiceGains.length > 0) {
      console.log(`[Moondrone moon-change:probe:${stage}:outgoing]`)
      console.table(payload.outgoingVoiceGains)
    }
  }

  scheduleMoonTransitionTimedProbes(transitionStartAudio) {
    if (!this.shouldLogMoonTransitionProbes()) {
      return
    }

    const marks = MOON_CHANGE_DEBUG.transitionProbeMarkSeconds ?? []

    marks.forEach((markSeconds) => {
      const delayMs = Math.max(0, (markSeconds - (Tone.now() - transitionStartAudio)) * 1000)
      const timeoutId = window.setTimeout(() => {
        this.logMoonTransitionProbeTable(`t+${markSeconds}s`)
      }, delayMs)

      this.moonChangeDebugProbeIds.push(timeoutId)
    })
  }

  scheduleMoonTransitionCompletionProbes(completionDelayMs) {
    if (!this.shouldLogMoonTransitionProbes()) {
      return
    }

    const postCompleteSeconds = MOON_CHANGE_DEBUG.transitionProbePostCompleteSeconds ?? [0.5]

    postCompleteSeconds.forEach((markSeconds) => {
      const delayMs = completionDelayMs + markSeconds * 1000
      const timeoutId = window.setTimeout(() => {
        this.logMoonTransitionProbeTable(`complete+${markSeconds}s`)

        if (markSeconds === Math.max(...postCompleteSeconds)) {
          this.moonChangeDebugContext = null
          this.moonHarmonicEntryTargetSnapshot = null
        }
      }, delayMs)

      this.moonChangeDebugProbeIds.push(timeoutId)
    })
  }

  beginMoonChangeDiagnostics(fromPreset, toPreset, transitionPath) {
    if (!MOON_CHANGE_DEBUG.enabled || !this.isPlaying) {
      return
    }

    this.clearMoonChangeDebugProbes()
    this.moonChangeDebugContext = {
      from: fromPreset,
      to: toPreset,
      path: transitionPath,
      register: this.currentOctave,
      startedAtAudio: Tone.now(),
    }

    this.moonReanchorTimeline = []
    this.moonAuxLayerCrossfadeActive = false
    this.moonAuxLayerCrossfadeUntil = 0

    this.logMoonChangeDiagnostic('begin', {
      breathSnapshot: this.moonTransitionBreathSnapshot
        ? { ...this.moonTransitionBreathSnapshot }
        : null,
      busSnapshotAtStart: this.moonTransitionBusSnapshot,
      actualGainsAtStart: this.getMoonChangeActualGainSnapshot(),
    })

    if (MOON_CHANGE_DEBUG.transitionProbes && transitionPath === 'voice-rebuild-crossfade') {
      this.scheduleMoonChangeGainPathProbes()
      this.scheduleMoonAuxLayerTimelineProbes()
      return
    }

    this.scheduleMoonChangeGainPathProbes()
    this.scheduleMoonAuxLayerTimelineProbes()

    const intervalMs = MOON_CHANGE_DEBUG.probeIntervalSeconds * 1000
    const probeCount = Math.ceil(MOON_CHANGE_DEBUG.probeDurationSeconds / MOON_CHANGE_DEBUG.probeIntervalSeconds)

    for (let probeIndex = 0; probeIndex <= probeCount; probeIndex += 1) {
      const delayMs = probeIndex * intervalMs
      const timeoutId = window.setTimeout(() => {
        this.logMoonChangeDiagnostic(`probe+${(delayMs / 1000).toFixed(2)}s`)

        if (probeIndex === probeCount) {
          this.clearMoonChangeDebugProbes()
          this.moonChangeDebugContext = null
          this.moonHarmonicEntryTargetSnapshot = null
        }
      }, delayMs)

      this.moonChangeDebugProbeIds.push(timeoutId)
    }

    if (toPreset === 'Cosmos') {
      MOON_CHANGE_DEBUG.ioEntryMarkSeconds.forEach((markSeconds) => {
        const timeoutId = window.setTimeout(() => {
          const voicePlan = this.moonVoiceCrossfadePlan
          const extensionIndices = [8, 9, 10]
          const mainVoiceSum = Number(this.voices
            .filter((_, index) => !extensionIndices.includes(index))
            .reduce((sum, voice) => sum + voice.gain.gain.value, 0)
            .toFixed(5))
          const extensionVoiceSum = Number(this.voices
            .filter((_, index) => extensionIndices.includes(index))
            .reduce((sum, voice) => sum + voice.gain.gain.value, 0)
            .toFixed(5))

          this.logMoonChangeDiagnostic(`io-entry+${markSeconds}s`, {
            mainVoiceSum,
            extensionVoiceSum,
            voiceEnergyPlan: voicePlan
              ? {
                deferredExtensionCount: voicePlan.deferredExtensionCount,
              }
              : null,
            incomingIoTargets: this.voices.map((voice, index) => ({
              index,
              gain: Number(voice.gain.gain.value.toFixed(5)),
              liveBreathTarget: Number(this.getVoiceTargetGain(index).toFixed(5)),
              isExtension: extensionIndices.includes(index),
            })),
            auxLayers: this.getMoonAuxLayerSnapshot(),
            outgoingVoiceGainsAtStart: this.moonTransitionBreathSnapshot?.outgoingVoiceGains ?? null,
          })
        }, markSeconds * 1000)

        this.moonChangeDebugProbeIds.push(timeoutId)
      })
    }

    if (fromPreset === 'Cosmos' && toPreset === 'Strings') {
      MOON_CHANGE_DEBUG.titanAuxMarkSeconds.forEach((markSeconds) => {
        const timeoutId = window.setTimeout(() => {
          this.logMoonChangeDiagnostic(`titan-aux+${markSeconds}s`, {
            auxLayers: this.getMoonAuxLayerSnapshot(),
            reanchorTimeline: [...this.moonReanchorTimeline],
          })
        }, markSeconds * 1000)

        this.moonChangeDebugProbeIds.push(timeoutId)
      })
    }
  }

  shouldDelayCosmosVoiceEnter(index, previousPresetName) {
    if (!this.isCosmosPreset() || previousPresetName === 'Cosmos') {
      return false
    }

    if (this.isSpeakerEfficiencyCosmosExtension(index)) {
      return true
    }

    return index === FOUNDATION_ROOT_VOICE_INDEX && this.usesCosmosConstantRoot()
  }

  clearPresetTransitionDebugProbes() {
    this.presetTransitionDebugProbeIds.forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    this.presetTransitionDebugProbeIds = []
  }

  isPresetTransitionDebugWatchPair(fromPreset, toPreset) {
    if (!PRESET_TRANSITION_DEBUG.enabled) {
      return false
    }

    return PRESET_TRANSITION_DEBUG.watchPresetPairs.some(([left, right]) => (
      (fromPreset === left && toPreset === right)
      || (fromPreset === right && toPreset === left)
    ))
  }

  shouldLogPresetTransition(fromPreset, toPreset) {
    if (!this.isPresetTransitionDebugWatchPair(fromPreset, toPreset)) {
      return false
    }

    if (PRESET_TRANSITION_DEBUG.highRegistersOnly && this.currentOctave < HIGH_REGISTER_OCTAVE) {
      return false
    }

    return true
  }

  beginPresetTransitionDebug(fromPreset, toPreset, path, extra = {}) {
    if (!this.shouldLogPresetTransition(fromPreset, toPreset)) {
      return
    }

    this.clearPresetTransitionDebugProbes()
    this.presetTransitionDebugLastCanRamp = this.canRampVoiceGainsFromBreathOrIntensity()
    this.presetTransitionDebugContext = {
      from: fromPreset,
      to: toPreset,
      path,
      register: this.currentOctave,
      startedAtAudio: Tone.now(),
      ...extra,
    }

    this.logPresetTransitionDebug('begin', {
      guards: this.getPresetTransitionGuardSnapshot(),
    })
    this.logVoiceSetSnapshot('begin:voices')
  }

  endPresetTransitionDebug(reason = 'complete') {
    if (!this.presetTransitionDebugContext) {
      return
    }

    this.logPresetTransitionDebug('end', { reason })
    this.clearPresetTransitionDebugProbes()
    this.presetTransitionDebugContext = null
    this.presetTransitionDebugLastCanRamp = false
  }

  logPresetTransitionDebug(event, details = {}) {
    if (!PRESET_TRANSITION_DEBUG.enabled || !this.presetTransitionDebugContext) {
      return
    }

    const elapsedAudioSec = Tone.now() - this.presetTransitionDebugContext.startedAtAudio

    console.log(`[Moondrone preset-transition:${event}]`, {
      ...this.presetTransitionDebugContext,
      elapsedAudioSec: Number(elapsedAudioSec.toFixed(3)),
      ...details,
    })
  }

  getPresetTransitionGuardSnapshot() {
    return {
      presetTransitionEndsAt: this.presetTransitionEndsAt,
      noteCrossfadeEndsAt: this.noteCrossfadeEndsAt,
      startupFadeEndsAt: this.startupFadeEndsAt,
      canRampVoiceGains: this.canRampVoiceGainsFromBreathOrIntensity(),
      breathAmount: this.getBreathAmount(),
    }
  }

  getSharedTonalDiagnosticSnapshot() {
    if (!this.isReady) {
      return null
    }

    return {
      filterFrequency: this.filter?.frequency.value,
      filterQ: this.filter?.Q.value,
      stereoWidth: this.stereoWidener?.width.value,
      presetLowMidGainDb: this.presetLowMidEq?.gain.value,
      presetUpperMidGainDb: this.presetUpperMidEq?.gain.value,
      outputVolumeDb: this.output?.volume.value,
      limiterThresholdDb: this.masterLimiter?.threshold.value,
    }
  }

  getVoiceStructureLabel(index) {
    if (this.isStringsLayer(index)) {
      return 'strings'
    }

    if (this.isChoirLayer(index)) {
      return 'choir'
    }

    if (this.isBinauralUndertoneVoice(index)) {
      return 'binaural-undertone'
    }

    return 'standard'
  }

  getVoiceDiagnosticSnapshot(voice, index) {
    const oscillators = this.getVoiceOscillators(voice)

    return {
      index,
      structure: this.getVoiceStructureLabel(index),
      gain: Number(voice.gain.gain.value.toFixed(5)),
      targetGain: voice.targetGain ?? null,
      pan: Number(voice.panner.pan.value.toFixed(4)),
      frequencyHz: Number(this.getPrimaryOscillator(voice).frequency.value.toFixed(2)),
      detunePrimaryCents: oscillators[0]?.detune?.value ?? null,
      detunesCents: oscillators.map((oscillator) => oscillator.detune?.value ?? null),
      oscillatorCount: oscillators.length,
    }
  }

  logVoiceSetSnapshot(event, voices = this.voices, extra = {}) {
    this.logPresetTransitionDebug(event, {
      voices: voices.map((voice, index) => this.getVoiceDiagnosticSnapshot(voice, index)),
      shared: this.getSharedTonalDiagnosticSnapshot(),
      guards: this.getPresetTransitionGuardSnapshot(),
      ...extra,
    })
  }

  schedulePresetTransitionProbe(label, delayMs, extra = {}) {
    if (!PRESET_TRANSITION_DEBUG.logCompletionProbes || !this.presetTransitionDebugContext) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      this.logVoiceSetSnapshot(`probe:${label}`, this.voices, {
        audioNow: Tone.now(),
        ...extra,
      })

      if (label === 'transition-settled') {
        this.endPresetTransitionDebug('probe-settled')
      }
    }, Math.max(0, delayMs))

    this.presetTransitionDebugProbeIds.push(timeoutId)
  }

  schedulePresetTransitionAudioProbe(label, audioTime, extra = {}) {
    const delayMs = Math.max(0, (audioTime - Tone.now()) * 1000 + 15)
    this.schedulePresetTransitionProbe(label, delayMs, extra)
  }

  identifySnapParam(param) {
    if (!this.isReady) {
      return null
    }

    if (param === this.filter?.frequency) {
      return 'filter.frequency'
    }

    if (param === this.filter?.Q) {
      return 'filter.Q'
    }

    if (param === this.stereoWidener?.width) {
      return 'stereoWidener.width'
    }

    if (param === this.presetLowMidEq?.gain) {
      return 'presetLowMidEq.gain'
    }

    if (param === this.presetUpperMidEq?.gain) {
      return 'presetUpperMidEq.gain'
    }

    if (param === this.presetLowMidEq?.frequency) {
      return 'presetLowMidEq.frequency'
    }

    if (param === this.presetUpperMidEq?.frequency) {
      return 'presetUpperMidEq.frequency'
    }

    if (param === this.output?.volume) {
      return 'output.volume'
    }

    if (param === this.masterLimiter?.threshold) {
      return 'masterLimiter.threshold'
    }

    for (let index = 0; index < this.voices.length; index += 1) {
      const voice = this.voices[index]

      if (param === voice.gain.gain) {
        return `voice[${index}].gain`
      }

      if (param === voice.panner.pan) {
        return `voice[${index}].pan`
      }

      const oscillators = this.getVoiceOscillators(voice)

      for (let oscIndex = 0; oscIndex < oscillators.length; oscIndex += 1) {
        const oscillator = oscillators[oscIndex]

        if (param === oscillator.detune) {
          return `voice[${index}].osc[${oscIndex}].detune`
        }

        if (param === oscillator.frequency) {
          return `voice[${index}].osc[${oscIndex}].frequency`
        }
      }
    }

    return null
  }

  logPresetTransitionSnap(label, param, value, time = Tone.now(), extra = {}) {
    if (!PRESET_TRANSITION_DEBUG.logSnapCalls || !this.presetTransitionDebugContext) {
      return
    }

    const paramLabel = this.identifySnapParam(param)
      ?? (typeof label === 'string' ? label : 'unknown-param')

    this.logPresetTransitionDebug('snap', {
      param: paramLabel,
      value,
      time,
      ...extra,
    })
  }

  isBinauralUndertoneLiveTransition(previousPresetName) {
    if (!this.isPlaying) {
      return false
    }

    const enteringBinaural = this.isBinauralPreset() && previousPresetName !== 'Binaural'
    const leavingBinaural = previousPresetName === 'Binaural' && !this.isBinauralPreset()

    return enteringBinaural || leavingBinaural
  }

  shouldDeferBinauralUndertoneVoice(index, previousPresetName) {
    return this.isBinauralUndertoneIndex(index)
      && this.isBinauralUndertoneLiveTransition(previousPresetName)
  }

  clearBinauralUndertoneDeferredTimeouts() {
    if (this.binauralUndertoneDeferredTimeout) {
      window.clearTimeout(this.binauralUndertoneDeferredTimeout)
      this.binauralUndertoneDeferredTimeout = null
    }

    if (this.binauralUndertonesHeldSilentClearTimeout) {
      window.clearTimeout(this.binauralUndertonesHeldSilentClearTimeout)
      this.binauralUndertonesHeldSilentClearTimeout = null
    }
  }

  scheduleBinauralUndertonesHeldSilentClear(delaySeconds) {
    if (this.binauralUndertonesHeldSilentClearTimeout) {
      window.clearTimeout(this.binauralUndertonesHeldSilentClearTimeout)
    }

    this.binauralUndertonesHeldSilentClearTimeout = window.setTimeout(() => {
      this.binauralUndertonesHeldSilentClearTimeout = null
      this.binauralUndertonesHeldSilent = false
    }, Math.max(0, delaySeconds * 1000))
  }

  getBinauralUndertoneDeferredDelayMs() {
    return (this.getPresetTransitionRampSeconds() + BINAURAL_UNDERTONE_POST_TRANSITION_SETTLE_SECONDS) * 1000
  }

  fadeBinauralUndertoneSilentAtTransitionStart(voice, index, now = Tone.now()) {
    const gainParam = voice.gain.gain

    gainParam.cancelAndHoldAtTime(now)
    voice.targetGain = 0

    const currentGain = Math.max(gainParam.value, 0)

    if (currentGain > 0.0005) {
      const fadeOutEnd = now + BINAURAL_UNDERTONE_EXIT_FADE_OUT_SECONDS

      gainParam.setValueAtTime(currentGain, now)
      gainParam.exponentialRampToValueAtTime(0.0001, fadeOutEnd)
      gainParam.setValueAtTime(0, fadeOutEnd)
      return
    }

    gainParam.setValueAtTime(0, now)
  }

  repointBinauralUndertoneVoiceSilent(voice, index, now = Tone.now()) {
    this.setVoiceFrequency(voice, this.getVoiceFrequency(index), now)
    this.snapParam(voice.panner.pan, this.getVoicePan(index), now)
    this.snapVoiceDetune(voice, index, now)
  }

  repointVoiceAfterBinauralExit(voice, index, now = Tone.now()) {
    const nextTargetGain = this.getVoiceTargetGain(index)

    this.setVoiceFrequency(voice, this.getVoiceFrequency(index), now)
    this.snapParam(voice.panner.pan, this.getVoicePan(index), now)
    this.resetVoiceDetune(voice, index, PRESET_GAIN_RAMP_SECONDS)

    voice.targetGain = nextTargetGain
    voice.gain.gain.cancelAndHoldAtTime(now)

    if (nextTargetGain > 0.0005) {
      voice.gain.gain.setValueAtTime(0, now)
      voice.gain.gain.linearRampToValueAtTime(nextTargetGain, now + PRESET_GAIN_RAMP_SECONDS)
      return
    }

    voice.gain.gain.setValueAtTime(0, now)
  }

  completeDeferredBinauralUndertoneEnter() {
    if (!this.isReady || !this.isPlaying || !this.isBinauralPreset()) {
      return
    }

    const now = Tone.now()
    const fadeInSeconds = BINAURAL_UNDERTONE_POST_TRANSITION_FADE_IN_SECONDS

    ;[FOUNDATION_ROOT_VOICE_INDEX, BINAURAL_RIGHT_VOICE_INDEX].forEach((index) => {
      const voice = this.voices[index]
      const nextTargetGain = BINAURAL_UNDERTONE_GAIN

      this.repointBinauralUndertoneVoiceSilent(voice, index, now)
      voice.targetGain = nextTargetGain
      voice.gain.gain.cancelAndHoldAtTime(now)
      voice.gain.gain.setValueAtTime(0, now)
      voice.gain.gain.linearRampToValueAtTime(nextTargetGain, now + fadeInSeconds)
    })

    this.logTransitionDiagnostic('binaural-undertone-deferred-enter', {
      fadeInSeconds,
      settleDelaySeconds: this.getPresetTransitionRampSeconds() + BINAURAL_UNDERTONE_POST_TRANSITION_SETTLE_SECONDS,
    })

    this.scheduleBinauralUndertonesHeldSilentClear(fadeInSeconds)
  }

  completeDeferredBinauralUndertoneExit() {
    if (!this.isReady || !this.isPlaying || this.isBinauralPreset()) {
      return
    }

    const now = Tone.now()

    this.binauralUndertonesHeldSilent = false

    ;[FOUNDATION_ROOT_VOICE_INDEX, BINAURAL_RIGHT_VOICE_INDEX].forEach((index) => {
      this.repointVoiceAfterBinauralExit(this.voices[index], index, now)
    })

    this.logTransitionDiagnostic('binaural-undertone-deferred-exit', {
      settleDelaySeconds: this.getPresetTransitionRampSeconds() + BINAURAL_UNDERTONE_POST_TRANSITION_SETTLE_SECONDS,
    })
  }

  scheduleDeferredBinauralUndertoneCompletion(previousPresetName) {
    this.clearBinauralUndertoneDeferredTimeouts()

    const enteringBinaural = this.isBinauralPreset() && previousPresetName !== 'Binaural'
    const delayMs = this.getBinauralUndertoneDeferredDelayMs()

    this.binauralUndertoneDeferredTimeout = window.setTimeout(() => {
      this.binauralUndertoneDeferredTimeout = null

      if (enteringBinaural) {
        this.completeDeferredBinauralUndertoneEnter()
        return
      }

      this.completeDeferredBinauralUndertoneExit()
    }, delayMs)
  }

  getBinauralMoodNeutralizeRampSeconds(defaultRampSeconds = MOOD_LIVE_TRANSITION_SECONDS) {
    if (this.pendingBinauralTransitionRamp) {
      return this.pendingBinauralTransitionRamp
    }

    return defaultRampSeconds
  }

  // ---- True Orbit: dedicated symmetric oscillator pair ----

  getMoodTrueOrbitConfig() {
    return MOOD_TRUE_ORBIT[this.mood] ?? null
  }

  // Active only while a mood is running (never Binaural) AND that mood defines a
  // trueOrbit block. New Moon and Harvest Moon have none → no true orbit at all.
  isTrueOrbitActive() {
    if (this.isSterileDiagnosticActive()) {
      return false
    }

    if (this.isHighVhCleanVoicingActive() && HIGH_VH_CLEAN_VOICING.disableMoodOrbit) {
      return false
    }

    return this.isMoodActive() && !!this.getMoodTrueOrbitConfig()
  }

  // Center pitch the pair orbits around: current root + the mood's semitone offset
  // (octave for shimmer, fifth for Blood's darker beat). Falls back to the octave
  // so a silent pair still tracks a musical frequency between active moods.
  getOrbitCenterFrequency() {
    const config = this.getMoodTrueOrbitConfig()
    const semitoneOffset = config?.semitoneOffset ?? 12
    const rootMidi = this.getMidiNote(this.currentKey, this.currentOctave)

    return this.midiToFrequency(rootMidi + semitoneOffset)
  }

  // Slow nested sweep, ±maxCents. Reuses the mood's nestedWeight so orbit breathes
  // in step with the rest of the mood's "waves within waves". Bipolar: the partners
  // cross at unison (beat → 0) and diverge to the extremes (beat at its fastest).
  getOrbitSweepCents() {
    const config = this.getMoodTrueOrbitConfig()

    if (!config) {
      return 0
    }

    const nestedWeight = this.getMoodConfig().nestedWeight ?? 0

    return config.maxCents * scaleMoonPhaseHarmonicOrbitCents(
      this.scaleMoonPhaseHarmonicMotionValue(this.moodNestedWave(
        config.sweepPeriod,
        config.sweepPeriod2,
        nestedWeight,
        0,
      )),
      this.getToneLabMoonPhaseHarmonicsBrightness(),
    )
  }

  getOrbitLevel() {
    return this.isTrueOrbitActive()
      ? (this.getMoodTrueOrbitConfig().gain ?? 0) * this.getToneLabMoonPhaseHarmonicsGain()
      : 0
  }

  startOrbitOscillators(time = Tone.now()) {
    if (this.orbitStarted || !this.orbitPair) {
      return
    }

    // Started once and left running for the engine's lifetime; audibility is gated
    // entirely by busGain. This sidesteps Tone.Oscillator's start-once limitation
    // (a stopped oscillator cannot restart) across stop/lifecycle/play cycles.
    this.snapParam(this.orbitPair.busGain.gain, 0, time)
    this.orbitPair.oscA.start(time)
    this.orbitPair.oscB.start(time)
    this.orbitStarted = true
  }

  // Re-point both partners at the center pitch. Detune (the ± sweep) rides on top
  // via applyOrbitPair, so frequency changes (key/register/reference A/mood offset)
  // stay cleanly separated from the orbit motion itself.
  updateOrbitPairFrequency(rampSeconds = 0) {
    if (!this.orbitPair) {
      return
    }

    const frequency = this.getOrbitCenterFrequency()
    const now = Tone.now()
    const oscillators = [this.orbitPair.oscA, this.orbitPair.oscB]

    oscillators.forEach((oscillator) => {
      this.holdAudioParamAtTime(oscillator.frequency, now)

      if (rampSeconds > 0 && this.isPlaying && this.orbitStarted) {
        const currentFrequency = Math.max(oscillator.frequency.value, 1)
        oscillator.frequency.setValueAtTime(currentFrequency, now)
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(frequency, 1), now + rampSeconds)
        return
      }

      oscillator.frequency.setValueAtTime(frequency, now)
    })
  }

  // Drive the pair toward its current target: busGain to the mood's level, the
  // partners to ±sweepCents (one up, one down → centered), and the stereo spread.
  // When the mood has no orbit (New/Harvest) or orbit is inactive, every target is
  // neutral (silent, unison, centered) so this is also the safe "off" path.
  applyOrbitPair(rampSeconds = MOOD_LOOP_TUNING.rampSeconds, startTime = Tone.now(), options = {}) {
    if (!this.orbitPair) {
      return
    }

    const { skipBusGain = false } = options
    const active = this.isTrueOrbitActive()
    const config = this.getMoodTrueOrbitConfig()
    const cents = active ? this.getOrbitSweepCents() : 0
    const pan = active ? (config?.pan ?? 0) : 0

    if (!skipBusGain) {
      this.rampParam(this.orbitPair.busGain.gain, this.getOrbitLevel(), rampSeconds, startTime)
    }

    this.orbitPair.oscA.detune.rampTo(cents, rampSeconds, startTime)
    this.orbitPair.oscB.detune.rampTo(-cents, rampSeconds, startTime)
    this.rampParam(this.orbitPair.pannerA.pan, -pan, rampSeconds, startTime)
    this.rampParam(this.orbitPair.pannerB.pan, pan, rampSeconds, startTime)
  }

  // Fade the pair fully out (silent, unison, centered) without stopping the
  // oscillators. Used on stop, lifecycle interruption, and when a mood drops orbit.
  neutralizeOrbitPair(rampSeconds = MOOD_LOOP_TUNING.rampSeconds, snap = false, startTime = Tone.now()) {
    if (!this.orbitPair) {
      return
    }

    if (snap) {
      this.snapParam(this.orbitPair.busGain.gain, 0, startTime)
    } else {
      this.rampParam(this.orbitPair.busGain.gain, 0, rampSeconds, startTime)
    }

    this.orbitPair.oscA.detune.rampTo(0, rampSeconds, startTime)
    this.orbitPair.oscB.detune.rampTo(0, rampSeconds, startTime)
    this.rampParam(this.orbitPair.pannerA.pan, 0, rampSeconds, startTime)
    this.rampParam(this.orbitPair.pannerB.pan, 0, rampSeconds, startTime)
  }

  // ---- True dual beats (Super only): paired hard-panned stereo oscillators ----

  getMoodDualBeatsConfig() {
    return MOOD_DUAL_BEATS[this.mood] ?? null
  }

  // Active only while a mood is running (never Binaural) AND that mood defines a
  // dual-beats block. Only Super does → no other mood produces true dual beats.
  isDualBeatsActive() {
    if (this.isSterileDiagnosticActive()) {
      return false
    }

    return this.isMoodActive() && !!this.getMoodDualBeatsConfig()
  }

  // Carrier the pair beats around: current root + the pair's semitone offset
  // (0 = root for the deep beat, 12 = octave for the bright beat).
  getDualBeatCarrierFrequency(semitoneOffset) {
    const rootMidi = this.getMidiNote(this.currentKey, this.currentOctave)

    return this.midiToFrequency(rootMidi + semitoneOffset)
  }

  startDualBeatsOscillators(time = Tone.now()) {
    if (this.dualBeatsStarted || !this.dualBeats) {
      return
    }

    // Started once and left running for the engine's lifetime; audibility is gated
    // entirely by the per-pair gains (same pattern as the orbit pair) so play/stop/
    // lifecycle cycles never hit Tone.Oscillator's start-once limitation.
    this.dualBeats.pairs.forEach((pair) => {
      this.snapParam(pair.pairGain.gain, 0, time)
      pair.oscL.start(time)
      pair.oscR.start(time)
    })
    this.dualBeatsStarted = true
  }

  // Re-point both partners of each pair around their carrier. The fixed beatHz is
  // the L/R split, so the beat rate stays constant while the carrier tracks pitch.
  updateDualBeatsFrequency(rampSeconds = 0) {
    if (!this.dualBeats) {
      return
    }

    const now = Tone.now()

    this.dualBeats.pairs.forEach((pair) => {
      const carrier = this.getDualBeatCarrierFrequency(pair.config.semitoneOffset)
      const half = pair.config.beatHz / 2
      const targets = [
        { oscillator: pair.oscL, frequency: carrier - half },
        { oscillator: pair.oscR, frequency: carrier + half },
      ]

      targets.forEach(({ oscillator, frequency }) => {
        this.holdAudioParamAtTime(oscillator.frequency, now)

        if (rampSeconds > 0 && this.isPlaying && this.dualBeatsStarted) {
          const currentFrequency = Math.max(oscillator.frequency.value, 1)
          oscillator.frequency.setValueAtTime(currentFrequency, now)
          oscillator.frequency.exponentialRampToValueAtTime(Math.max(frequency, 1), now + rampSeconds)
          return
        }

        oscillator.frequency.setValueAtTime(Math.max(frequency, 1), now)
      })
    })
  }

  // Ramp each pair's gain toward its target (its tuned level when Super is active,
  // 0 otherwise). Carriers/beats are handled by updateDualBeatsFrequency.
  applyDualBeats(rampSeconds = MOOD_LOOP_TUNING.rampSeconds, startTime = Tone.now(), options = {}) {
    if (!this.dualBeats) {
      return
    }

    const { skipGainRamp = false } = options
    const active = this.isDualBeatsActive()

    this.dualBeats.pairs.forEach((pair) => {
      if (skipGainRamp) {
        return
      }

      const level = active ? (pair.config.gain ?? 0) * this.getToneLabMoonPhaseHarmonicsGain() : 0
      this.rampParam(pair.pairGain.gain, level, rampSeconds, startTime)
    })
  }

  neutralizeDualBeats(rampSeconds = MOOD_LOOP_TUNING.rampSeconds, snap = false, startTime = Tone.now()) {
    if (!this.dualBeats) {
      return
    }

    this.dualBeats.pairs.forEach((pair) => {
      if (snap) {
        this.snapParam(pair.pairGain.gain, 0, startTime)
        return
      }

      this.rampParam(pair.pairGain.gain, 0, rampSeconds, startTime)
    })
  }

  setPreset(preset) {
    const previousPresetName = this.currentPreset.name

    this.currentPreset = preset

    if (!this.isReady) {
      return
    }

    this.logTransitionDiagnostic('setPreset', {
      from: previousPresetName,
      to: preset.name,
      playing: this.isPlaying,
      mood: this.mood,
    })
    this.applyPreset(previousPresetName)
  }

  setBinauralBeatHz(beatHz) {
    this.binauralBeatHz = beatHz

    if (!this.isReady || !this.isBinauralPreset()) {
      return
    }

    this.updateBinauralFrequencies()
  }

  getBinauralBeatOffsetHz() {
    return this.binauralBeatHz / 2
  }

  updateBinauralFrequencies() {
    const now = Tone.now()

    this.voices.forEach((voice, index) => {
      if (!this.isBinauralUndertoneVoice(index)) {
        return
      }

      this.setVoiceFrequency(voice, this.getVoiceFrequency(index), now)
    })
  }

  applyVolume(rampSeconds = TRANSITION_TUNING.volumeRampSeconds) {
    const userDecibels = this.volume === 0 ? -60 : MIN_VOLUME_DB + this.volume * (OUTPUT_BOOST_DB - MIN_VOLUME_DB)
    const decibels = userDecibels + this.droneMetronomeHeadroomDb + this.getDroneBalanceTrimDb() + this.getToneLabOutputTrimDb()
    this.rampParam(this.output.volume, decibels, rampSeconds)
    this.applyMasterLimiterCeiling(rampSeconds)
    this.applyMasterFinalOutputTrim(rampSeconds)
  }

  applyDroneMetronomeHeadroom() {
    this.droneMetronomeHeadroomDb = this.metronomePlaying ? DRONE_METRONOME_HEADROOM_DB : 0

    if (!this.isReady || !this.output) {
      return
    }

    const userDecibels = this.volume === 0 ? -60 : MIN_VOLUME_DB + this.volume * (OUTPUT_BOOST_DB - MIN_VOLUME_DB)
    const decibels = userDecibels + this.droneMetronomeHeadroomDb + this.getDroneBalanceTrimDb() + this.getToneLabOutputTrimDb()
    this.rampParam(this.output.volume, decibels, DRONE_METRONOME_HEADROOM_RAMP_SECONDS)
  }

  getPresetBalanceTrimDb() {
    return PRESET_BALANCE_TRIM_DB[this.currentPreset.name] ?? 0
  }

  getPresetRegisterBalanceTrimDb() {
    const presetTrims = PRESET_REGISTER_BALANCE_TRIM_DB[this.currentPreset.name]

    if (!presetTrims) {
      return 0
    }

    return presetTrims[this.currentOctave] ?? 0
  }

  getRegisterBalanceTrimDb() {
    return REGISTER_BALANCE_TRIM_DB[this.currentOctave] ?? 0
  }

  getPresetAirShimmerGainScale() {
    const presetScale = PRESET_AIR_SHIMMER_GAIN_SCALE[this.currentPreset.name]

    if (!presetScale) {
      return 1
    }

    return presetScale.register?.[this.currentOctave] ?? presetScale.default ?? 1
  }

  // Mimas/Europa only: trim AIR breath-noise + harmonic shimmer when Breath slider is high.
  getPresetHighBreathAirGainScale() {
    const profile = PRESET_HIGH_BREATH_AIR_GAIN_SCALE[this.currentPreset.name]

    if (!profile) {
      return 1
    }

    const breathUi = this.breath

    if (breathUi <= profile.breathUiKnee) {
      return 1
    }

    const travel = (100 - profile.breathUiKnee) || 1
    const normalized = (breathUi - profile.breathUiKnee) / travel
    const compressed = normalized ** profile.curvePower

    return 1 - compressed * (1 - profile.minScale)
  }

  getPresetMoonPhaseHarmonicsGainScale() {
    const presetScale = PRESET_MOON_PHASE_HARMONICS_GAIN_SCALE[this.currentPreset.name]

    if (!presetScale) {
      return 1
    }

    return presetScale.register?.[this.currentOctave] ?? presetScale.default ?? 1
  }

  getPresetRegisterVoiceGainScale(index) {
    const presetProfile = PRESET_REGISTER_VOICE_GAIN_SCALE[this.currentPreset.name]

    if (!presetProfile) {
      return 1
    }

    const registerProfile = presetProfile[this.currentOctave]

    if (!registerProfile) {
      return 1
    }

    return registerProfile[index] ?? 1
  }

  getPresetBreathVoiceGainScale(index) {
    const registerBreath = PRESET_REGISTER_BREATH_VOICE_GAIN_SCALE[this.currentPreset.name]?.[this.currentOctave]?.[index]

    if (registerBreath != null) {
      return registerBreath
    }

    const presetBreath = PRESET_BREATH_VOICE_GAIN_SCALE[this.currentPreset.name]

    if (presetBreath?.[index] != null) {
      return presetBreath[index]
    }

    if (this.isStringsPreset()) {
      const registerScale = STRINGS_TUNING.breathVoiceGainScaleRegister?.[this.currentOctave]?.[index]

      if (registerScale != null) {
        return registerScale
      }

      return STRINGS_TUNING.breathVoiceGainScale?.[index] ?? 1
    }

    return 1
  }

  getStringsHighRegisterVoicing() {
    if (!this.isStringsPreset() || this.currentOctave < HIGH_REGISTER_OCTAVE) {
      return null
    }

    return STRINGS_TUNING.highRegisterVoicing?.[this.currentOctave] ?? null
  }

  getStringsBreathCoreMotionConfig() {
    const base = STRINGS_TUNING.breathCoreMotion ?? {}

    if (!this.isStringsPreset() || this.currentOctave < HIGH_REGISTER_OCTAVE) {
      return base
    }

    return {
      ...base,
      ...(base.register?.[this.currentOctave] ?? {}),
    }
  }

  getStringsBreathMotionTravel() {
    const cfg = this.getStringsBreathCoreMotionConfig()

    if (!cfg || this.breath <= 0) {
      return 0
    }

    return (this.breath / 100) ** (cfg.sliderMotionCurve ?? 1.12)
  }

  isStringsPrincipleBreathLayer(index) {
    const principleIndices = STRINGS_TUNING.breathCoreMotion?.principleIndices ?? [0, 1, 2]

    return principleIndices.includes(index)
  }

  isStringsCoreBreathLayer(index) {
    return this.isStringsPrincipleBreathLayer(index)
  }

  getBreathVoicePresenceOffset(layerIndex, layerBreathScale, breathMotion) {
    let scale = breathMotion * BREATH_VOICE_MOTION_DEPTH * layerBreathScale
      * this.getPresetBreathVoiceGainScale(layerIndex)

    if (!this.isStringsPreset() || !this.isStringsPrincipleBreathLayer(layerIndex)) {
      return scale
    }

    const cfg = this.getStringsBreathCoreMotionConfig()

    if (!cfg) {
      return scale
    }

    const travel = this.getStringsBreathMotionTravel()

    if (travel === 0) {
      return scale
    }

    scale *= 1 + travel * ((cfg.sliderMotionScale ?? 1) - 1)

    if (breathMotion > 0 && cfg.principleInhaleScale != null) {
      scale *= cfg.principleInhaleScale + (1 - cfg.principleInhaleScale) * (1 - travel)
    }

    if (breathMotion < 0) {
      if (cfg.principleTroughExtra > 1) {
        scale *= 1 + travel * (cfg.principleTroughExtra - 1)
      }

      if (cfg.exhaleDipDepth) {
        const dipSlew = this.currentOctave >= HIGH_REGISTER_OCTAVE
          ? STRINGS_HIGH_REGISTER_EXHALE_DIP_SLEW
          : 1
        scale += breathMotion * cfg.exhaleDipDepth * travel * dipSlew
      }
    }

    return scale
  }

  getVoiceExhaleSoftening(index, exhaleAmount) {
    const base = 1 - exhaleAmount * BREATH_EXHALE_SOFTENING

    if (!this.isStringsPreset() || !this.isStringsPrincipleBreathLayer(index)) {
      return base
    }

    const cfg = this.getStringsBreathCoreMotionConfig()
    const travel = this.getStringsBreathMotionTravel()

    if (!cfg || travel === 0 || !cfg.exhaleSofteningBoost) {
      return base
    }

    return 1 - exhaleAmount * (BREATH_EXHALE_SOFTENING + cfg.exhaleSofteningBoost * travel)
  }

  getBreathVoiceRampSeconds(voiceIndex = null) {
    const base = BREATH_UPDATE_SECONDS * BREATH_TUNING.breathRampMultiplier

    if (
      voiceIndex != null
      && this.isStringsPreset()
      && this.isStringsPrincipleBreathLayer(voiceIndex)
      && this.currentOctave >= HIGH_REGISTER_OCTAVE
    ) {
      let ramp = base * STRINGS_HIGH_REGISTER_BREATH_RAMP_MULTIPLIER

      if (this.isStringsHighRegisterTransitionBreathRampActive()) {
        ramp *= STRINGS_HIGH_REGISTER_TRANSITION_DECLICK.transitionBreathRampMultiplier
      }

      return ramp
    }

    return base
  }

  isStringsVoice(voice) {
    return Boolean(voice?.stringsBaseDetunes?.length)
  }

  isStringsHighRegisterTransitionBreathRampActive() {
    return Tone.now() < this.stringsTransitionBreathRampUntil
  }

  shouldArmStringsHighRegisterTransitionDeClick(presetChange = false, previousPresetName = null) {
    if (this.isStringsPreset() && this.currentOctave >= HIGH_REGISTER_OCTAVE) {
      return true
    }

    return presetChange && previousPresetName === 'Strings'
  }

  armStringsHighRegisterTransitionDeClick(durationSeconds) {
    if (durationSeconds <= 0) {
      return
    }

    this.stringsTransitionBreathRampUntil = Math.max(
      this.stringsTransitionBreathRampUntil,
      Tone.now() + durationSeconds,
    )
  }

  clearStringsDriftResumeTimeout() {
    if (this.stringsDriftResumeTimeoutId) {
      window.clearTimeout(this.stringsDriftResumeTimeoutId)
      this.stringsDriftResumeTimeoutId = null
    }
  }

  clearStringsHighRegisterAirReanchorTimeout() {
    if (this.stringsHighRegisterAirReanchorTimeoutId) {
      window.clearTimeout(this.stringsHighRegisterAirReanchorTimeoutId)
      this.stringsHighRegisterAirReanchorTimeoutId = null
    }
  }

  holdAirBreathNoiseParamsAtTime(time = Tone.now()) {
    if (!this.airBreathGain) {
      return
    }

    this.holdAudioParamAtTime(this.airBreathGain.gain, time)

    if (this.airBreathHighpass) {
      this.holdAudioParamAtTime(this.airBreathHighpass.frequency, time)
    }

    if (this.airBreathLowpass) {
      this.holdAudioParamAtTime(this.airBreathLowpass.frequency, time)
    }
  }

  scheduleStringsHighRegisterAirReanchor() {
    if (!this.pendingStringsHighRegisterAirReanchor || !this.isStringsPreset()) {
      return
    }

    this.clearStringsHighRegisterAirReanchorTimeout()

    const delayMs = STRINGS_HIGH_REGISTER_AIR_TRANSITION.reanchorDelaySeconds * 1000

    this.stringsHighRegisterAirReanchorTimeoutId = window.setTimeout(() => {
      this.stringsHighRegisterAirReanchorTimeoutId = null
      this.applyStringsHighRegisterAirDeclickEnvelope()
    }, delayMs)
  }

  isStringsHighRegisterAirDeclickActive() {
    return Tone.now() < this.stringsHighRegisterAirDeclickUntil
  }

  isStringsHighRegisterAirFilterLocked() {
    if (!this.isStringsPreset() || this.currentOctave < HIGH_REGISTER_OCTAVE) {
      return false
    }

    return this.pendingStringsHighRegisterAirReanchor
      || Tone.now() < this.stringsHighRegisterAirFilterLockedUntil
  }

  applyStringsHighRegisterAirFilterRetargetAt(time, highpassHz, lowpassHz) {
    if (!this.airBreathHighpass || !this.airBreathLowpass) {
      return
    }

    this.holdAudioParamAtTime(this.airBreathHighpass.frequency, time)
    this.holdAudioParamAtTime(this.airBreathLowpass.frequency, time)
    this.airBreathHighpass.frequency.setValueAtTime(highpassHz, time)
    this.airBreathLowpass.frequency.setValueAtTime(lowpassHz, time)
  }

  getAirShimmerShelfGainDb() {
    if (!this.airShelfEq) {
      return 0
    }

    const airEnabled = AIR_SHIMMER_TUNING.enabled && !this.isStringsIsolationAirDisabled()

    if (!airEnabled) {
      return 0
    }

    const shelfScale = (AIR_SHIMMER_TUNING.airShelfRegisterScale[this.currentOctave] ?? 1)
      * this.getPresetAirShimmerGainScale()

    return AIR_SHIMMER_TUNING.airShelf.gainDb * shelfScale
  }

  applyStringsHighRegisterAirDeclickEnvelope() {
    if (!this.isReady || !this.isStringsPreset() || this.currentOctave < HIGH_REGISTER_OCTAVE) {
      this.pendingStringsHighRegisterAirReanchor = false
      return
    }

    const cfg = STRINGS_HIGH_REGISTER_AIR_TRANSITION
    const debug = STRINGS_HIGH_REGISTER_AIR_DEBUG
    const now = Tone.now()
    const fadeDownEnd = now + cfg.noiseFadeDownSeconds
    const retargetTime = fadeDownEnd + cfg.noiseRetargetGapSeconds
    const fadeInEnd = retargetTime + cfg.noiseFadeInSeconds
    const targetBreathGain = this.getAirBreathNoiseTargetGain()
    const { highpassHz, lowpassHz } = this.getAirBreathNoiseFilterTargets()
    const shelfTargetDb = this.getAirShimmerShelfGainDb()
    const breathGainBefore = this.airBreathGain?.gain.value ?? 0

    this.stringsHighRegisterAirDeclickUntil = fadeInEnd + 0.04
    this.stringsHighRegisterAirFilterLockedUntil = retargetTime + 0.02
    this.stringsHighRegisterAirShelfLockedUntil = debug.freezeShelf
      ? 0
      : now + cfg.shelfRampSeconds + 0.04

    this.logStringsIsolationAutomation('air-declick-start', {
      debug: { ...debug },
      breathGainBefore: Number(breathGainBefore.toFixed(5)),
      targetBreathGain: Number(targetBreathGain.toFixed(5)),
      shelfTargetDb: Number(shelfTargetDb.toFixed(3)),
      filterTargets: { highpassHz, lowpassHz },
      fadeDownEnd,
      retargetTime,
      fadeInEnd,
      declickUntil: this.stringsHighRegisterAirDeclickUntil,
    })

    if (this.airShelfEq && !debug.freezeShelf) {
      this.holdAudioParamAtTime(this.airShelfEq.gain, now)
      this.rampParam(this.airShelfEq.gain, shelfTargetDb, cfg.shelfRampSeconds, now)
    }

    if (!this.airBreathGain || this.isStringsIsolationAirDisabled()) {
      this.pendingStringsHighRegisterAirReanchor = false
      return
    }

    const gainParam = this.airBreathGain.gain

    this.holdAirBreathNoiseParamsAtTime(now)

    if (debug.freezeNoiseGain) {
      if (!debug.freezeFilters) {
        this.applyStringsHighRegisterAirFilterRetargetAt(retargetTime, highpassHz, lowpassHz)
      }

      this.pendingStringsHighRegisterAirReanchor = false
      return
    }

    const startGain = Math.max(breathGainBefore, 0)

    gainParam.setValueAtTime(startGain, now)
    gainParam.linearRampToValueAtTime(0, fadeDownEnd)
    gainParam.setValueAtTime(0, retargetTime)
    gainParam.setValueAtTime(0, fadeInEnd)

    if (!debug.freezeFilters) {
      this.applyStringsHighRegisterAirFilterRetargetAt(retargetTime, highpassHz, lowpassHz)
    }

    gainParam.linearRampToValueAtTime(targetBreathGain, fadeInEnd)

    this.pendingStringsHighRegisterAirReanchor = false

    this.logStringsIsolationAutomation('air-declick-scheduled', {
      fadeDownSeconds: cfg.noiseFadeDownSeconds,
      retargetGapSeconds: cfg.noiseRetargetGapSeconds,
      fadeInSeconds: cfg.noiseFadeInSeconds,
      filterRetargetTime: retargetTime,
      shelfRampSeconds: debug.freezeShelf ? null : cfg.shelfRampSeconds,
    })
  }

  logStringsIsolationAutomation(event, details = {}) {
    if (!STRINGS_ISOLATION_MODE.logAutomationEvents || !this.isStringsIsolationActive()) {
      return
    }

    console.log(`[Moondrone strings-isolation:${event}]`, {
      mode: this.getStringsIsolationMode(),
      audioNow: Tone.now(),
      register: this.currentOctave,
      ...details,
    })
  }

  resumeStringsDriftAfterTransition() {
    if (!this.isStringsPreset() || !this.isPlaying) {
      return
    }

    this.clearStringsDriftResumeTimeout()

    const delayMs = this.currentOctave >= HIGH_REGISTER_OCTAVE
      ? STRINGS_HIGH_REGISTER_TRANSITION_DECLICK.driftResumeDelaySeconds * 1000
      : 0

    this.stringsDriftResumeTimeoutId = window.setTimeout(() => {
      this.stringsDriftResumeTimeoutId = null

      if (this.isStringsPreset() && this.isPlaying && !this.isTonalBusTransitionGuarded()) {
        this.startStringsDrift({ transitionEntry: this.currentOctave >= HIGH_REGISTER_OCTAVE })
      }
    }, delayMs)
  }

  getAirShimmerRegisterTrimDb() {
    if (!this.isAirShimmerEnabled()) {
      return 0
    }

    return AIR_SHIMMER_TUNING.highRegisterOutputTrimDb[this.currentOctave] ?? 0
  }

  getDroneBalanceTrimDb() {
    return this.getPresetBalanceTrimDb()
      + this.getRegisterBalanceTrimDb()
      + this.getPresetRegisterBalanceTrimDb()
      + this.getAirShimmerRegisterTrimDb()
  }

  canRampVoiceGainsFromBreathOrIntensity() {
    const now = Tone.now()

    return now >= this.presetTransitionEndsAt
      && now >= this.startupFadeEndsAt
      && now >= this.noteCrossfadeEndsAt
      && now >= this.fullChainCrossfadeVoiceHoldUntil
  }

  canRampMoodAuxiliaryLayers() {
    if (this.isStringsIsolationPhaseDisabled()) {
      return false
    }

    return this.canRampVoiceGainsFromBreathOrIntensity()
  }

  isStopFadeActive(time = Tone.now()) {
    return time < this.stopFadeEndsAt
  }

  // Bump the drone operation generation. Called on start and stop so any delayed callback can
  // detect that it has been superseded.
  bumpDroneOpGeneration(reason) {
    this.droneOpGeneration += 1
    audioDiag('drone-lifecycle', `drone ${reason} generation bumped`, {
      generation: this.droneOpGeneration,
    })
    return this.droneOpGeneration
  }

  isDroneOpCurrent(token) {
    return token === this.droneOpGeneration
  }

  // Transition audio health to `stable` only after the context has stayed running for a short
  // settle window. Used after a successful start or recovery so lightweight paths re-enable only
  // once the shared session is genuinely healthy.
  markAudioHealthStableSoon(reason, delayMs = 600) {
    // Honesty gate: only mark stable if BOTH the context survives the settle window AND the native
    // Playback session is clean (no "Session activation failed"). A recovery that ran while
    // backgrounded/locked can resolve with a partial native failure — never call that stable.
    scheduleAudioStable(delayMs, () => {
      if (this.getContextState() !== 'running') {
        return false
      }
      if (isIosNative() && !wasLastNativeConfigureClean()) {
        audioDiag('audio-health', 'audio health stable denied — native session error', {
          reason,
          contextState: this.getContextState(),
        })
        return false
      }
      return true
    }, reason)
  }

  // Restart-during-shutdown safety: a Stop schedules a multi-second fade-out on the live voices
  // (and may leave outgoing crossfade voice sets fading). If Play happens before that finishes,
  // the old graph is still connected to master and audible during the new start's async work
  // (Tone.start / primer / reverb IR). Force the stopping graph silent NOW so the fresh startup
  // begins from a clean, inaudible state — no stale ramp, no old deck bleeding through.
  forceSilenceStoppingDroneGraph(reason = 'restart') {
    const now = Tone.now()
    const declick = 0.012

    // Stale stop fade is being discarded — cancel the scheduled downward ramps on every voice gain.
    audioDiag('drone-lifecycle', 'stale drone stop fade ignored', { reason, contextState: this.getContextState() })

    this.voices.forEach((voice) => {
      const param = voice?.gain?.gain
      if (!param) {
        return
      }

      try {
        if (typeof param.cancelAndHoldAtTime === 'function') {
          param.cancelAndHoldAtTime(now)
        } else {
          param.cancelScheduledValues(now)
        }
        param.setValueAtTime(Math.max(param.value, 0.0001), now)
        param.linearRampToValueAtTime(0, now + declick)
      } catch {
        // Param may already be torn down; the fresh start rebuilds/ramps from zero regardless.
      }
    })

    // Mood auxiliary layers (orbit pair + dual beats) snap silent so no remnant survives the gap.
    try {
      this.snapMoodAuxiliaryLayersSilent(now + declick)
    } catch {
      // Non-fatal — these are re-prepared by the startup cycle.
    }

    // Retire any outgoing note/moon crossfade voice sets immediately (their own dispose timers
    // would otherwise keep them connected to master, audible, during the new startup).
    try {
      this.disposeAllOutgoingVoiceSets()
    } catch {
      // Non-fatal.
    }

    // Cancel the pending stop-fade window + any in-flight transition timers that could re-expose
    // old audio against the fresh start.
    this.stopFadeEndsAt = 0
    this.clearNoteCrossfadeTimeouts()
    this.clearSimpleMoonTransitionTimeout()
    this.clearMoonTransitionBloomResetTimeout()
    this.abandonInFlightFullChainTransition()

    audioDiag('drone-lifecycle', 'old stopping graph force-silenced before restart', {
      reason,
      contextState: this.getContextState(),
    })
  }

  holdAudioParamAtTime(param, time = Tone.now()) {
    if (!param) {
      return
    }

    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(time)
      return
    }

    const currentValue = param.value

    if (typeof param.cancelScheduledValues === 'function') {
      param.cancelScheduledValues(time)
    }

    if (Number.isFinite(currentValue)) {
      param.setValueAtTime(currentValue, time)
    }
  }

  prepareVoiceGainForStart(voice, startTime, holdStopFade = false) {
    const param = voice.gain.gain

    this.holdAudioParamAtTime(param, startTime)

    if (!holdStopFade) {
      param.setValueAtTime(0, startTime)
    }
  }

  snapMoodAuxiliaryLayersSilent(time = Tone.now()) {
    if (this.orbitPair) {
      this.snapParam(this.orbitPair.busGain.gain, 0, time)
    }

    if (this.dualBeats) {
      this.dualBeats.pairs.forEach((pair) => {
        this.snapParam(pair.pairGain.gain, 0, time)
      })
    }
  }

  prepareMoodAuxiliaryLayersForStart(time = Tone.now(), holdStopFade = false) {
    if (this.orbitPair) {
      if (holdStopFade) {
        this.holdAudioParamAtTime(this.orbitPair.busGain.gain, time)
      } else {
        this.snapParam(this.orbitPair.busGain.gain, 0, time)
      }
    }

    if (this.dualBeats) {
      this.dualBeats.pairs.forEach((pair) => {
        if (holdStopFade) {
          this.holdAudioParamAtTime(pair.pairGain.gain, time)
        } else {
          this.snapParam(pair.pairGain.gain, 0, time)
        }
      })
    }
  }

  rampMoodAuxiliaryLayersToTarget(rampSeconds = START_FADE_SECONDS, startTime = Tone.now()) {
    if (!this.isMoodActive()) {
      return
    }

    this.applyOrbitPair(rampSeconds, startTime)
    this.applyDualBeats(rampSeconds, startTime)
  }

  isNoteCrossfadeActive() {
    return Tone.now() < this.noteCrossfadeEndsAt
  }

  isPresetTransitionActive() {
    return Tone.now() < this.presetTransitionEndsAt
  }

  isTonalBusTransitionGuarded() {
    return this.isPlaying && (this.isNoteCrossfadeActive() || this.isPresetTransitionActive())
  }

  getPresetTransitionGuardEstimateSeconds(requiresVoiceRebuild) {
    if (!requiresVoiceRebuild) {
      return PRESET_LAYER_FADE_OUT_SECONDS + PRESET_LAYER_FADE_IN_SECONDS + 0.12
    }

    // Voice-rebuild moon change: the whole gesture (voices + every secondary layer)
    // completes after the unified aux morph window. One guard, one expiry.
    return MOON_TRANSITION.auxMorphSeconds + 0.05
  }

  armPresetTransitionGuard(requiresVoiceRebuild) {
    this.presetTransitionEndsAt = Tone.now() + this.getPresetTransitionGuardEstimateSeconds(
      requiresVoiceRebuild,
    )
  }

  logClickDiagnostic(event, details = {}) {
    if (!TRANSITION_TUNING.clickDiagnosticsEnabled) {
      return
    }

    console.log(`[Moondrone click:${event}]`, {
      audioNow: Tone.now(),
      ...details,
    })
  }

  applyBaseTonalState(skipVoiceGains = false, tonalRampSeconds = INTENSITY_RAMP_SECONDS) {
    if (!this.isReady) {
      return
    }

    if (this.isTonalBusTransitionGuarded()) {
      return
    }

    const baseTonalAmount = this.getBaseTonalAmount()

    this.rampParam(this.filter.frequency, this.getTonalFilterFrequency(baseTonalAmount), tonalRampSeconds)
    this.rampParam(this.filter.Q, this.getTonalFilterQ(baseTonalAmount), tonalRampSeconds)
    this.rampParam(this.stereoWidener.width, this.getStereoWidth(), tonalRampSeconds)

    if (!skipVoiceGains) {
      this.voices.forEach((voice, index) => {
        voice.targetGain = this.getVoiceTargetGain(index, baseTonalAmount)

        if (this.isPlaying && this.canRampVoiceGainsFromBreathOrIntensity()) {
          this.rampParam(voice.gain.gain, voice.targetGain, tonalRampSeconds)
        }
      })
    }

    this.applyChoirEnsembleMix(baseTonalAmount, tonalRampSeconds)
    this.applyPresetBusEq(baseTonalAmount, tonalRampSeconds)
    this.applyAirShimmerBusEq(tonalRampSeconds)
    this.applyToneLabBusEq(tonalRampSeconds)

    if (!this.isStarting) {
      this.applyAirBreathNoiseModulation(tonalRampSeconds)
    }
  }

  resetBreathPhaseToAnchor(cyclePosition = BREATH_TUNING.reanchorCyclePosition) {
    const elapsedMs = cyclePosition * BREATH_CYCLE_SECONDS * 1000
    this.breathStartTime = window.performance.now() - elapsedMs
    this.lastBreathUpdateTime = 0
  }

  pauseBreathLoop() {
    if (this.breathFrame) {
      window.cancelAnimationFrame(this.breathFrame)
      this.breathFrame = null
    }
  }

  snapParam(param, value, time = Tone.now()) {
    this.logPresetTransitionSnap('snapParam', param, value, time)

    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(time)
    } else if (typeof param.cancelScheduledValues === 'function') {
      param.cancelScheduledValues(time)
    }

    param.setValueAtTime(value, time)
  }

  snapSharedTonalState() {
    if (!this.isReady) {
      return
    }

    const now = Tone.now()
    const baseTonalAmount = this.getBaseTonalAmount()

    this.snapParam(this.filter.frequency, this.getTonalFilterFrequency(baseTonalAmount), now)
    this.snapParam(this.filter.Q, this.getTonalFilterQ(baseTonalAmount), now)
    this.snapParam(this.stereoWidener.width, this.getStereoWidth(), now)

    const {
      lowMidGain,
      upperMidGain,
      lowMidFrequency,
      lowMidQ,
      upperMidFrequency,
      upperMidQ,
    } = this.getPresetBusEqSettings(baseTonalAmount)
    const {
      gain: bodyMidGain,
      frequency: bodyMidFrequency,
      Q: bodyMidQ,
    } = this.getPresetBodyMidEqSettings(baseTonalAmount)

    this.snapParam(this.presetLowMidEq.frequency, lowMidFrequency, now)
    this.snapParam(this.presetLowMidEq.Q, lowMidQ, now)
    this.snapParam(this.presetLowMidEq.gain, lowMidGain, now)

    if (this.presetMediumBodyEq) {
      const {
        gain: mediumBodyGain,
        frequency: mediumBodyFrequency,
        Q: mediumBodyQ,
      } = this.getPresetMediumBodyNotchSettings()

      this.snapParam(this.presetMediumBodyEq.frequency, mediumBodyFrequency, now)
      this.snapParam(this.presetMediumBodyEq.Q, mediumBodyQ, now)
      this.snapParam(this.presetMediumBodyEq.gain, mediumBodyGain, now)
    }

    if (this.presetBodyMidEq) {
      this.snapParam(this.presetBodyMidEq.frequency, bodyMidFrequency, now)
      this.snapParam(this.presetBodyMidEq.Q, bodyMidQ, now)
      this.snapParam(this.presetBodyMidEq.gain, bodyMidGain, now)
    }

    this.snapParam(this.presetUpperMidEq.frequency, upperMidFrequency, now)
    this.snapParam(this.presetUpperMidEq.Q, upperMidQ, now)
    this.snapParam(this.presetUpperMidEq.gain, upperMidGain, now)
  }

  rampSharedTonalStateToBase(rampSeconds = BREATH_REANCHOR_RAMP_SECONDS) {
    if (!this.isReady) {
      return
    }

    const baseTonalAmount = this.getBaseTonalAmount()

    this.rampParam(this.filter.frequency, this.getTonalFilterFrequency(baseTonalAmount), rampSeconds)
    this.rampParam(this.filter.Q, this.getTonalFilterQ(baseTonalAmount), rampSeconds)
    this.rampParam(this.stereoWidener.width, this.getStereoWidth(), rampSeconds)
    this.applyPresetBusEq(baseTonalAmount, rampSeconds)
    this.applyChoirEnsembleMix(baseTonalAmount, rampSeconds)
  }

  clearNoteCrossfadeTimeouts() {
    this.noteCrossfadeTimeoutIds.forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    this.noteCrossfadeTimeoutIds = []
  }

  scheduleNoteCrossfadeTimeout(callback, delayMs) {
    const timeoutId = window.setTimeout(callback, delayMs)

    this.noteCrossfadeTimeoutIds.push(timeoutId)
    return timeoutId
  }

  // Register a faded-out voice set with its own dispose timer. This timer is
  // independent of clearNoteCrossfadeTimeouts(), so interrupting one crossfade
  // with another never cancels a previous set's cleanup — each set always fades
  // fully and then disposes, preventing orphaned oscillators on rapid taps.
  registerOutgoingVoiceSet(voices, disposeDelayMs) {
    const entry = { voices, timeoutId: null }

    entry.timeoutId = window.setTimeout(() => {
      // If a Stop/restart already retired this set (disposeAllOutgoingVoiceSets), do not dispose
      // its voices a second time — that stale teardown would touch already-freed nodes.
      if (!this.outgoingNoteCrossfadeVoiceSets.includes(entry)) {
        audioDiag('drone-lifecycle', 'stale drone teardown ignored', {
          reason: 'outgoing voice set already retired',
        })
        return
      }

      this.removeOutgoingVoiceSet(entry)
    }, disposeDelayMs)

    this.outgoingNoteCrossfadeVoiceSets.push(entry)
  }

  removeOutgoingVoiceSet(entry) {
    const index = this.outgoingNoteCrossfadeVoiceSets.indexOf(entry)

    if (index !== -1) {
      this.outgoingNoteCrossfadeVoiceSets.splice(index, 1)
    }

    if (this.presetTransitionDebugContext) {
      this.logVoiceSetSnapshot('outgoing-dispose:before', entry.voices, {
        outgoingVoiceCount: entry.voices.length,
      })
    }

    entry.voices.forEach((voice, voiceIndex) => {
      this.logPresetTransitionDebug('voice-dispose', {
        outgoingVoiceIndex: voiceIndex,
        snapshot: this.getVoiceDiagnosticSnapshot(voice, voiceIndex),
      })
      this.disposeVoice(voice)
    })
  }

  disposeAllOutgoingVoiceSets() {
    this.outgoingNoteCrossfadeVoiceSets.forEach((entry) => {
      window.clearTimeout(entry.timeoutId)
      entry.voices.forEach((voice) => {
        this.disposeVoice(voice)
      })
    })
    this.outgoingNoteCrossfadeVoiceSets = []
  }

  beginNoteCrossfadeBreathReanchor(options = {}) {
    if (!this.isReady) {
      return
    }

    const {
      skipVolume = false,
      skipBreathReanchor = false,
      skipAirLayers = false,
    } = options

    if (this.presetTransitionDebugContext) {
      this.logVoiceSetSnapshot('crossfade-breath-reanchor:before')
    }

    // The incoming voices have finished fading in at the live breath voicing. End
    // the crossfade guard and resume the SAME breath cycle (phase never reset) so
    // the swell continues unbroken; its next sync gently reconciles the small phase
    // advance that elapsed during the fade. With Breath at 0 there is no cycle to
    // continue, so just settle the shared tonal state to base.
    this.noteCrossfadeEndsAt = 0

    if (this.presetTransitionDebugContext) {
      this.logPresetTransitionDebug('crossfade-guard-cleared', {
        guards: this.getPresetTransitionGuardSnapshot(),
      })
    }

    const rampSeconds = BREATH_REANCHOR_RAMP_SECONDS
    const airDeferred = !skipAirLayers
      && this.pendingStringsHighRegisterAirReanchor
      && this.isStringsPreset()
    const volumeRamp = airDeferred
      ? STRINGS_HIGH_REGISTER_AIR_TRANSITION.outputTrimRampSeconds
      : rampSeconds

    if (!skipVolume) {
      this.applyVolume(volumeRamp)
    }

    if (!skipBreathReanchor) {
      this.applyToneLabBusEq(rampSeconds)

      if (!airDeferred && !this.moonAuxLayerCrossfadeActive) {
        this.applyAirShimmerBusEq(rampSeconds)
      } else if (airDeferred) {
        this.scheduleStringsHighRegisterAirReanchor()
      }
    }

    this.logMoonReanchorTimeline('breath-reanchor', {
      skipVolume,
      skipBreathReanchor,
      skipAirLayers,
      airDeferred,
      moonAuxLayerCrossfadeActive: this.moonAuxLayerCrossfadeActive,
    })

    if (this.getBreathAmount() > 0) {
      if (skipBreathReanchor) {
        this.resumeStringsDriftAfterTransition()
        return
      }

      this.startBreathLoop()
      if (this.noteChangeDebugContext) {
        this.noteChangeDebugContext.syncBreathScheduled = true
      }
      this.syncBreathModulation({ skipAirLayers: airDeferred })

      if (this.presetTransitionDebugContext) {
        this.logVoiceSetSnapshot('crossfade-breath-reanchor:after-syncBreath')
      }

      this.logStringsIsolationAutomation('breath-reanchor', {
        airDeferred,
        principleGains: this.voices.slice(0, 3).map((voice, index) => ({
          index,
          gain: Number(voice.gain.gain.value.toFixed(5)),
          target: Number(this.getVoiceTargetGain(index).toFixed(5)),
          rampSeconds: Number(this.getBreathVoiceRampSeconds(index).toFixed(3)),
        })),
      })

      this.resumeStringsDriftAfterTransition()
      return
    }

    if (!skipBreathReanchor) {
      this.rampSharedTonalStateToBase(BREATH_REANCHOR_RAMP_SECONDS)
    }

    this.resumeStringsDriftAfterTransition()

    if (this.presetTransitionDebugContext) {
      this.logVoiceSetSnapshot('crossfade-breath-reanchor:after-rampSharedTonalStateToBase')
    }

    this.clearMoonTransitionBreathSnapshot()
  }

  reanchorBreathAfterContextChange(tonalRampSeconds = INTENSITY_RAMP_SECONDS) {
    if (!this.isReady) {
      return
    }

    const skipVoiceGains = this.isPlaying && this.isNoteCrossfadeActive()

    this.pauseBreathLoop()

    if (this.isPlaying) {
      // While playing, NEVER snap the shared tonal state or reset the breath phase
      // — an instantaneous filter/EQ jump was the audible "harmonic kick" on a Moon
      // change. Instead ramp tonal state to base (applyBaseTonalState) and resume
      // the same breath cycle, which then glides to the live value. Voice gains stay
      // owned by the preset/note transition via the canRamp guard.
      this.applyBaseTonalState(skipVoiceGains, tonalRampSeconds)

      if (this.getBreathAmount() > 0 && !skipVoiceGains) {
        this.startBreathLoop()
      }

      return
    }

    // Stopped: a snap is inaudible and gives the next Play a clean starting state.
    this.resetBreathPhaseToAnchor()
    this.snapSharedTonalState()
    this.applyBaseTonalState(skipVoiceGains, tonalRampSeconds)

    if (this.getBreathAmount() > 0 && !skipVoiceGains) {
      this.startBreathLoop()
    }
  }

  applyIntensity(skipVoiceGains = false, tonalRampSeconds = INTENSITY_RAMP_SECONDS) {
    this.applyBaseTonalState(skipVoiceGains, tonalRampSeconds)
    this.applyBreath(skipVoiceGains)
  }

  getPresetBusEqProfile() {
    return PRESET_BUS_EQ_PROFILES[this.currentPreset.name] ?? null
  }

  getPresetRegisterBusEq() {
    return PRESET_REGISTER_BUS_EQ[this.currentPreset.name]?.[this.currentOctave] ?? null
  }

  getPresetBusEqBlend(tonalAmount = this.getBaseTonalAmount()) {
    if (this.isSterileDiagnosticActive()) {
      return 0
    }

    if (!this.getPresetBusEqProfile()) {
      return 0
    }

    const registerEq = this.getPresetRegisterBusEq()
    const alwaysOn = registerEq?.alwaysOnBlend ?? PRESET_BUS_EQ_ALWAYS_ON_BLEND[this.currentPreset.name] ?? 0
    const intensityBlend = this.clamp(
      (tonalAmount - PRESET_BUS_EQ_INTENSITY_START) / (1 - PRESET_BUS_EQ_INTENSITY_START),
      0,
      1,
    )
    const intensityMix = PRESET_BUS_EQ_REGISTER_BLEND.intensityBlendBase + intensityBlend * PRESET_BUS_EQ_REGISTER_BLEND.intensityBlendRange

    if (this.currentOctave < HIGH_REGISTER_OCTAVE) {
      let blend = alwaysOn * intensityMix

      if (registerEq?.minBlend != null) {
        blend = Math.max(blend, registerEq.minBlend)
      }

      return blend
    }

    const registerBlend = this.currentOctave === VERY_HIGH_REGISTER_OCTAVE
      ? PRESET_BUS_EQ_REGISTER_BLEND.veryHighRegisterBlend
      : PRESET_BUS_EQ_REGISTER_BLEND.highRegisterBlend

    return Math.max(alwaysOn * intensityMix, registerBlend * intensityMix)
  }

  getPresetBodyMidEqSettings(tonalAmount = this.getBaseTonalAmount()) {
    const registerEq = this.getPresetRegisterBusEq()
    const config = registerEq?.bodyMid ?? PRESET_BODY_MID_EQ[this.currentPreset.name]
    const blend = this.getPresetBusEqBlend(tonalAmount)

    if (!config || blend === 0) {
      return {
        gain: 0,
        frequency: config?.frequency ?? 820,
        Q: config?.Q ?? 0.5,
      }
    }

    return {
      gain: config.maxGainDb * blend,
      frequency: config.frequency,
      Q: config.Q,
    }
  }

  // Medium-register-only, key-following body notch. Returns a transparent (0 dB)
  // setting outside Medium register, for unlisted presets, or during sterile
  // diagnostics. The center frequency tracks the index-0 (−12 low octave) body
  // fundamental of the current key so the dip follows every key, clamped to a safe
  // range. Independent of the bus-EQ blend system so it also works for Strings
  // (Titan), which has no PRESET_BUS_EQ_PROFILES entry.
  getPresetMediumBodyNotchSettings() {
    const config = PRESET_MEDIUM_BODY_NOTCH[this.currentPreset.name]
    const fallbackFrequency = this.presetMediumBodyEq?.frequency.value ?? 110

    if (
      !config
      || this.currentOctave !== MEDIUM_REGISTER_OCTAVE
      || this.isSterileDiagnosticActive()
    ) {
      return { gain: 0, frequency: fallbackFrequency, Q: config?.Q ?? 1.2 }
    }

    const range = PRESET_MEDIUM_BODY_NOTCH_FREQUENCY_RANGE
    const bodyFrequency = this.getVoiceFrequency(0) * (config.frequencyScale ?? 1)
    const frequency = this.clamp(bodyFrequency, range.min, range.max)

    return { gain: config.gainDb, frequency, Q: config.Q }
  }

  getPresetBusEqSettings(tonalAmount = this.getBaseTonalAmount()) {
    const profile = this.getPresetBusEqProfile()
    const blend = this.getPresetBusEqBlend(tonalAmount)
    const registerEq = this.getPresetRegisterBusEq()

    if (!profile || blend === 0) {
      return {
        lowMidGain: 0,
        upperMidGain: 0,
        lowMidFrequency: SHRUTI_BUS_EQ.lowMidFrequency,
        lowMidQ: SHRUTI_BUS_EQ.lowMidQ,
        upperMidFrequency: SHRUTI_BUS_EQ.upperMidFrequency,
        upperMidQ: SHRUTI_BUS_EQ.upperMidQ,
      }
    }

    const upperRegisterScale = this.currentOctave === VERY_HIGH_REGISTER_OCTAVE
      ? PRESET_BUS_EQ_REGISTER_BLEND.upperMidScaleVeryHigh
      : PRESET_BUS_EQ_REGISTER_BLEND.upperMidScaleHigh
    const lowMidProfile = registerEq?.lowMid ?? profile.lowMid

    return {
      lowMidGain: lowMidProfile.maxGainDb * blend,
      upperMidGain: profile.upperMid.maxGainDb * blend * upperRegisterScale,
      lowMidFrequency: lowMidProfile.frequency,
      lowMidQ: lowMidProfile.Q,
      upperMidFrequency: profile.upperMid.frequency,
      upperMidQ: profile.upperMid.Q,
    }
  }

  applyPresetBusEq(tonalAmount = this.getBaseTonalAmount(), rampSeconds = INTENSITY_RAMP_SECONDS) {
    if (!this.isReady || !this.presetLowMidEq || !this.presetUpperMidEq) {
      return
    }

    const {
      lowMidGain,
      upperMidGain,
      lowMidFrequency,
      lowMidQ,
      upperMidFrequency,
      upperMidQ,
    } = this.getPresetBusEqSettings(tonalAmount)
    const {
      gain: bodyMidGain,
      frequency: bodyMidFrequency,
      Q: bodyMidQ,
    } = this.getPresetBodyMidEqSettings(tonalAmount)

    this.rampParam(this.presetLowMidEq.frequency, lowMidFrequency, rampSeconds)
    this.rampParam(this.presetLowMidEq.Q, lowMidQ, rampSeconds)
    this.rampParam(this.presetLowMidEq.gain, lowMidGain, rampSeconds)

    if (this.presetMediumBodyEq) {
      const {
        gain: mediumBodyGain,
        frequency: mediumBodyFrequency,
        Q: mediumBodyQ,
      } = this.getPresetMediumBodyNotchSettings()

      this.rampParam(this.presetMediumBodyEq.frequency, mediumBodyFrequency, rampSeconds)
      this.rampParam(this.presetMediumBodyEq.Q, mediumBodyQ, rampSeconds)
      this.rampParam(this.presetMediumBodyEq.gain, mediumBodyGain, rampSeconds)
    }

    if (this.presetBodyMidEq) {
      this.rampParam(this.presetBodyMidEq.frequency, bodyMidFrequency, rampSeconds)
      this.rampParam(this.presetBodyMidEq.Q, bodyMidQ, rampSeconds)
      this.rampParam(this.presetBodyMidEq.gain, bodyMidGain, rampSeconds)
    }

    this.rampParam(this.presetUpperMidEq.frequency, upperMidFrequency, rampSeconds)
    this.rampParam(this.presetUpperMidEq.Q, upperMidQ, rampSeconds)
    this.rampParam(this.presetUpperMidEq.gain, upperMidGain, rampSeconds)
  }

  syncBreathModulation(options = {}) {
    const { skipAirLayers = false, skipVoiceLayers = false } = options

    if (!this.isReady || !this.filter || this.getBreathAmount() === 0 || this.isSterileDiagnosticActive()) {
      return
    }

    if (this.isTonalBusTransitionGuarded()) {
      return
    }

    const canRampVoiceGains = this.canRampVoiceGainsFromBreathOrIntensity()
      && !skipVoiceLayers
      && !this.isMoonEntryBreathMorphActive()
      && !this.isMoonVoiceCrossfadeMorphActive()

    if (this.presetTransitionDebugContext && canRampVoiceGains && !this.presetTransitionDebugLastCanRamp) {
      this.logVoiceSetSnapshot('breath-canRamp-opened')
    }

    this.presetTransitionDebugLastCanRamp = canRampVoiceGains

    const effectiveTonalAmount = this.getEffectiveTonalAmount()
    const rampSeconds = BREATH_UPDATE_SECONDS * BREATH_TUNING.breathRampMultiplier

    this.rampBreathParam(this.filter.frequency, this.getTonalFilterFrequency(effectiveTonalAmount), rampSeconds)
    this.rampBreathParam(this.filter.Q, this.getTonalFilterQ(effectiveTonalAmount), rampSeconds)

    if (this.isPlaying && canRampVoiceGains) {
      this.voices.forEach((voice, index) => {
        voice.targetGain = this.getVoiceTargetGain(index, effectiveTonalAmount)
        this.rampBreathParam(
          voice.gain.gain,
          voice.targetGain,
          this.getBreathVoiceRampSeconds(index),
        )
      })
    }

    this.applyChoirEnsembleMix(effectiveTonalAmount, rampSeconds)

    // AIR breath modulation must respect the same transition guard as voice gains. During a
    // note/register crossfade, startup fade, preset transition, or full-chain crossfade hold,
    // the breath loop must NOT re-ramp the AIR gain/filters — otherwise it cancels/fights the
    // scheduled crossfade-entry and deferred-AIR ramps (audible intensity stutter on note
    // changes; re-charged AIR tail on Io entry).
    if (
      this.isPlaying
      && this.canRampVoiceGainsFromBreathOrIntensity()
      && !skipAirLayers
      && !this.isStringsIsolationAirDisabled()
      && !this.isStringsHighRegisterAirDeclickActive()
      && !this.isMoonEntryBreathMorphActive()
      && !this.isMoonTransitionAuxHandoffActive()
    ) {
      this.applyAirBreathNoiseModulation(rampSeconds)
    }
  }

  applyBreath(skipVoiceGains = false) {
    if (this.getBreathAmount() === 0) {
      this.stopBreathLoop()
      this.applyBaseTonalState(skipVoiceGains)
      this.rampParam(this.reverb.wet, this.getReverbWet(), INTENSITY_RAMP_SECONDS)
      return
    }

    this.startBreathLoop()
  }

  applyReverbWet(rampSeconds = REVERB_TUNING.sliderRampSeconds) {
    this.rampParam(this.reverb.wet, this.getReverbWet(), rampSeconds)
  }

  getTonalCharacterAmount(tonalAmount) {
    return tonalAmount ** INTENSITY_TUNING.characterCurvePower
  }

  getHighIntensityFocus(tonalAmount) {
    return Math.max(0, (tonalAmount - INTENSITY_TUNING.highFocusStart) / INTENSITY_TUNING.highFocusRange) ** INTENSITY_TUNING.highFocusCurvePower
  }

  getLowFrequencySettling(tonalAmount) {
    return Math.max(0, (tonalAmount - INTENSITY_TUNING.lowSettlingStart) / INTENSITY_TUNING.lowSettlingRange) ** INTENSITY_TUNING.lowSettlingCurvePower
  }

  isCosmosPreset() {
    return this.currentPreset.name === 'Cosmos'
  }

  isShrutiPreset() {
    return this.currentPreset.name === 'Shruti'
  }

  getShrutiVeryHighStressAmount(tonalAmount = this.getBaseTonalAmount()) {
    if (this.isSterileDiagnosticActive()) {
      return 0
    }

    if (!this.isShrutiPreset() || this.currentOctave !== VERY_HIGH_REGISTER_OCTAVE) {
      return 0
    }

    if (tonalAmount <= SHRUTI_VERY_HIGH_STRESS_INTENSITY) {
      return 0
    }

    return (tonalAmount - SHRUTI_VERY_HIGH_STRESS_INTENSITY) / (1 - SHRUTI_VERY_HIGH_STRESS_INTENSITY)
  }

  getShrutiVeryHighHarmonicDamping(index, tonalAmount = this.getBaseTonalAmount()) {
    const stress = this.getShrutiVeryHighStressAmount(tonalAmount)

    if (stress === 0) {
      return 1
    }

    if (index === FOUNDATION_ROOT_VOICE_INDEX) {
      return 1 - stress * SHRUTI_VERY_HIGH_FOUNDATION_DAMPING
    }

    if (index === 2) {
      return 1 - stress * SHRUTI_VERY_HIGH_FIFTH_DAMPING
    }

    if (index === 4 || index === 5) {
      return 1 - stress * SHRUTI_VERY_HIGH_UPPER_LAYER_DAMPING
    }

    return 1
  }

  getShrutiVoiceGainScale(index, tonalAmount = this.getBaseTonalAmount()) {
    return this.getShrutiRegisterVoicingScale(index) * this.getShrutiVeryHighHarmonicDamping(index, tonalAmount)
  }

  getShrutiRegisterVoicingScale(index) {
    if (!this.isShrutiPreset()) {
      return 1
    }

    // Shruti keeps voiceGains[3] at 0, so index 0 (−12 low octave) carries the audible octave body.
    const shrutiOctaveBodyIndices = [0, 3]

    if (this.currentOctave === HIGH_REGISTER_OCTAVE) {
      if (shrutiOctaveBodyIndices.includes(index)) {
        return 1 - SHRUTI_HIGH_OCTAVE_LAYER_DAMPING
      }

      if (index === 4) {
        return 1 - SHRUTI_HIGH_UPPER_OCTAVE_DAMPING
      }

      if (index === 5) {
        return 1 - SHRUTI_HIGH_UPPER_OCTAVE_DAMPING * 0.75
      }
    }

    if (this.currentOctave === VERY_HIGH_REGISTER_OCTAVE) {
      if (shrutiOctaveBodyIndices.includes(index)) {
        return 1 - SHRUTI_VERY_HIGH_OCTAVE_LAYER_DAMPING
      }

      if (index === 4) {
        return 1 - SHRUTI_VERY_HIGH_UPPER_OCTAVE_DAMPING
      }

      if (index === 5) {
        return 1 - SHRUTI_VERY_HIGH_UPPER_OCTAVE_DAMPING * 0.85
      }

      if (index === FOUNDATION_ROOT_VOICE_INDEX) {
        return 1 - SHRUTI_VERY_HIGH_FOUNDATION_VOICING_DAMPING
      }
    }

    return 1
  }

  getCosmosHighIntensitySoftening(tonalAmount) {
    return Math.max(0, (tonalAmount - COSMOS_TUNING.highIntensityStart) / COSMOS_TUNING.highIntensityRange) ** COSMOS_TUNING.highIntensityCurvePower
  }

  getCosmosUpperLayerSoftening(tonalAmount, index) {
    const softening = this.getCosmosHighIntensitySoftening(tonalAmount)
    const layerConfig = COSMOS_TUNING.upperLayerSoftening
    let layerAmount = layerConfig.basePerIndex + (index - 3) * layerConfig.indexStep

    if (index === COSMOS_CELESTIAL_VOICE_INDEX) {
      layerAmount = layerConfig.celestial
    }

    if (index === COSMOS_SKY_ROOT_VOICE_INDEX) {
      layerAmount = layerConfig.skyRoot
    }

    if (index === COSMOS_SKY_OCTAVE_VOICE_INDEX) {
      layerAmount = layerConfig.skyOctave
    }

    return 1 - softening * layerAmount
  }

  getCosmosExtensionGain(index, tonalAmount, baseGain, includeBreath = true) {
    if (!this.isCosmosPreset()) {
      return 0
    }

    const characterAmount = this.getTonalCharacterAmount(tonalAmount)
    const focusAmount = this.getHighIntensityFocus(tonalAmount)
    const exhaleAmount = includeBreath ? this.getBreathExhaleAmount() : 0
    const cosmosFocusDamping = 1 - this.getCosmosHighIntensitySoftening(tonalAmount) * COSMOS_TUNING.extensionFocusDamping
    const extensionPresence = COSMOS_TUNING.extensionPresenceBase + characterAmount * COSMOS_TUNING.extensionCharacterScale + focusAmount * COSMOS_TUNING.extensionFocusScale * cosmosFocusDamping
    const exhaleSoftening = 1 - exhaleAmount * BREATH_EXHALE_SOFTENING

    return baseGain * extensionPresence * exhaleSoftening * this.getCosmosUpperLayerSoftening(tonalAmount, index)
  }

  getBreathAmount() {
    const base = (this.breath / 100) ** BREATH_TUNING.sliderCurvePower

    return base * (PRESET_BREATH_AMOUNT_SCALE[this.currentPreset.name] ?? 1)
  }

  getBaseTonalAmount() {
    return this.getIntensityAmount()
  }

  getEffectiveTonalAmount() {
    return this.clamp(this.getBaseTonalAmount() + this.getBreathModulationOffset(), 0, BREATH_TUNING.effectiveTonalMax)
  }

  getBreathModulationOffset() {
    if (this.isSterileDiagnosticActive() || this.getBreathAmount() === 0) {
      return 0
    }

    return this.getBreathOffset()
  }

  getRawBreathCurve() {
    if (!this.breathStartTime || this.getBreathAmount() === 0) {
      return 0
    }

    const elapsedSeconds = (window.performance.now() - this.breathStartTime) / 1000
    const cyclePosition = (elapsedSeconds % BREATH_CYCLE_SECONDS) / BREATH_CYCLE_SECONDS

    return Math.sin(cyclePosition * Math.PI * 2)
  }

  getBreathOffset() {
    if (this.isSterileDiagnosticActive()) {
      return 0
    }

    const breathCurve = this.getRawBreathCurve()
    const shapedCurve = breathCurve >= 0 ? breathCurve : breathCurve * BREATH_TUNING.exhaleAsymmetry

    return shapedCurve * this.getBreathAmount() * BREATH_OFFSET_DEPTH
  }

  getBreathExhaleAmount() {
    if (this.isSterileDiagnosticActive()) {
      return 0
    }

    const breathCurve = this.getRawBreathCurve()

    if (breathCurve >= 0) {
      return 0
    }

    return -breathCurve * this.getBreathAmount()
  }

  getBreathOffsetAtCyclePosition(cyclePosition) {
    if (this.isSterileDiagnosticActive()) {
      return 0
    }

    const breathCurve = Math.sin(cyclePosition * Math.PI * 2)
    const shapedCurve = breathCurve >= 0 ? breathCurve : breathCurve * BREATH_TUNING.exhaleAsymmetry

    return shapedCurve * this.getBreathAmount() * BREATH_OFFSET_DEPTH
  }

  getBreathExhaleAmountAtCyclePosition(cyclePosition) {
    if (this.isSterileDiagnosticActive()) {
      return 0
    }

    const breathCurve = Math.sin(cyclePosition * Math.PI * 2)

    if (breathCurve >= 0) {
      return 0
    }

    return -breathCurve * this.getBreathAmount()
  }

  getEffectiveTonalAmountAtCyclePosition(cyclePosition) {
    return this.clamp(
      this.getBaseTonalAmount() + this.getBreathOffsetAtCyclePosition(cyclePosition),
      0,
      BREATH_TUNING.effectiveTonalMax,
    )
  }

  captureMoonTransitionBreathSnapshot() {
    const rawBreathCyclePosition = this.getBreathCyclePosition()
    const airBreathCyclePosition = this.resolveMoonTransitionAirBreathCyclePosition(rawBreathCyclePosition)

    // Freeze breath phase for the guard window so tonal offset and air targets do not
    // drift while the breath loop is paused. Voices keep the raw captured phase; air
    // morph uses airBreathCyclePosition (neutral-safe when the switch was near a swell).
    this.pauseBreathLoop()
    this.resetBreathPhaseToAnchor(rawBreathCyclePosition)

    const baseTonalAmount = this.getBaseTonalAmount()
    const effectiveTonalAmount = this.getEffectiveTonalAmount()

    this.moonTransitionBreathSnapshot = {
      capturedAtAudio: Tone.now(),
      breathCyclePosition: rawBreathCyclePosition,
      airBreathCyclePosition,
      breathOffset: this.getBreathOffset(),
      breathExhaleAmount: this.getBreathExhaleAmount(),
      breathAmount: this.getBreathAmount(),
      baseTonalAmount,
      effectiveTonalAmount,
      outgoingAirBreathGain: Number((this.airBreathGain?.gain.value ?? 0).toFixed(5)),
      outgoingAirBreathTarget: Number(this.getAirBreathNoiseTargetGainAtCyclePosition(rawBreathCyclePosition).toFixed(5)),
      transitionAirBreathTarget: Number(this.getAirBreathNoiseTargetGainAtCyclePosition(airBreathCyclePosition).toFixed(5)),
      outgoingVoiceGains: this.voices.map((voice) => Number(voice.gain.gain.value.toFixed(5))),
    }
  }

  restoreMoonTransitionOutgoingAirLevel(time = Tone.now()) {
    const outgoingAir = this.moonTransitionBreathSnapshot?.outgoingAirBreathGain

    if (outgoingAir == null || !this.airBreathGain) {
      return
    }

    this.holdAudioParamAtTime(this.airBreathGain.gain, time)
    this.airBreathGain.gain.setValueAtTime(outgoingAir, time)
  }

  clearMoonTransitionBreathSnapshot() {
    this.moonTransitionBreathSnapshot = null
  }

  clearMoonEntryMorphCompletionTimeout() {
    if (this.moonEntryMorphCompletionTimeoutId) {
      window.clearTimeout(this.moonEntryMorphCompletionTimeoutId)
      this.moonEntryMorphCompletionTimeoutId = null
    }
  }

  isMoonEntryBreathMorphActive() {
    return Tone.now() < this.moonEntryBreathMorphUntil
  }

  getAirBreathNoiseSwellAmountAtCyclePosition(cyclePosition) {
    if (!this.isAirShimmerEnabled() || !AIR_SHIMMER_TUNING.breathNoise.enabled) {
      return 0
    }

    if (this.getToneLabBreathAirGainMultiplier() === 0) {
      return 0
    }

    const breathAmount = this.getBreathAmount()

    if (breathAmount === 0) {
      return 0
    }

    const rawCurve = Math.sin(cyclePosition * Math.PI * 2)
    const shapedCurve = rawCurve >= 0
      ? rawCurve
      : rawCurve * BREATH_TUNING.exhaleAsymmetry

    return computeBreathAirEnvelope(
      shapedCurve,
      breathAmount,
      this.getBreathAirEnvelopeSettings(),
    ) * this.getPresetHighBreathAirGainScale()
  }

  getAirBreathNoiseTargetGainAtCyclePosition(cyclePosition) {
    if (!this.isAirShimmerEnabled() || !AIR_SHIMMER_TUNING.breathNoise.enabled || !this.airBreathGain) {
      return 0
    }

    const breathGain = this.getToneLabBreathAirGainMultiplier()

    if (breathGain === 0) {
      return 0
    }

    const presetScale = AIR_SHIMMER_TUNING.breathNoise.presetScale[this.currentPreset.name] ?? 1

    if (presetScale === 0) {
      return 0
    }

    const swellAmount = this.getAirBreathNoiseSwellAmountAtCyclePosition(cyclePosition)
    const airTrim = this.getPresetAirShimmerGainScale()

    return AIR_SHIMMER_TUNING.breathNoise.gain * presetScale * swellAmount * breathGain * airTrim
  }

  getMoonTransitionBreathCyclePosition() {
    return this.moonTransitionBreathSnapshot?.breathCyclePosition ?? this.getBreathCyclePosition()
  }

  // Voice crossfade planning uses the same model as syncBreathModulation(): effective tonal
  // amount at the pinned raw breath phase (not the air-neutral phase used for air identity).
  getMoonTransitionVoicePlanningTonalAmount() {
    const cyclePosition = this.getMoonTransitionVoicePlanningBreathCyclePosition()

    return this.getEffectiveTonalAmountAtCyclePosition(cyclePosition)
  }

  getMoonTransitionVoicePlanningBreathCyclePosition() {
    return this.moonTransitionBreathSnapshot?.breathCyclePosition
      ?? this.getBreathCyclePosition()
  }

  shouldLogMoonHarmonicVoiceProbe(fromPreset, toPreset) {
    if (!MOON_CHANGE_DEBUG.enabled) {
      return false
    }

    const voiceRebuildPresets = ['Strings', 'Cosmos', 'Shruti']

    if (voiceRebuildPresets.includes(fromPreset)
      && voiceRebuildPresets.includes(toPreset)
      && fromPreset !== toPreset) {
      return true
    }

    if (!MOON_CHANGE_DEBUG.harmonicVoiceProbe) {
      return false
    }

    const allPairs = [
      ['Strings', 'Shruti'],
      ['Shruti', 'Strings'],
      ['Strings', 'Cosmos'],
      ['Cosmos', 'Strings'],
    ]

    return allPairs.some(([from, to]) => fromPreset === from && toPreset === to)
  }

  logMoonHarmonicVoiceTransitionProbe(stage, context = {}) {
    const fromPreset = context.fromPreset
      ?? this.moonChangeDebugContext?.from
      ?? null
    const toPreset = context.toPreset
      ?? this.moonChangeDebugContext?.to
      ?? null

    if (!fromPreset || !toPreset || !this.shouldLogMoonHarmonicVoiceProbe(fromPreset, toPreset)) {
      return
    }

    const harmonicIndices = [3, 4, 5, 8, 9, 10]
    const snapshot = this.moonTransitionBreathSnapshot
    const voiceBreathPhase = this.getMoonTransitionVoicePlanningBreathCyclePosition()
    const planningTonal = this.getMoonTransitionVoicePlanningTonalAmount()
    const baseTonalAmount = snapshot?.baseTonalAmount ?? this.getBaseTonalAmount()
    const effectiveTonalAmount = snapshot?.effectiveTonalAmount ?? this.getEffectiveTonalAmount()
    const breathCyclePosition = snapshot?.breathCyclePosition ?? this.getBreathCyclePosition()

    const voices = harmonicIndices.map((index) => {
      const planEntry = this.moonVoiceCrossfadePlan?.voiceEntries?.[index]
      const outgoingGain = snapshot?.outgoingVoiceGains?.[index] ?? 0
      const settledLiveTarget = this.getVoiceTargetGain(index, planningTonal, true, voiceBreathPhase)
      const entryTargetGain = planEntry?.entryTarget
        ?? this.moonHarmonicEntryTargetSnapshot?.[index]
        ?? null
      const settledNum = Number(settledLiveTarget.toFixed(5))
      const entryTargetNum = entryTargetGain != null ? Number(entryTargetGain) : null

      return {
        index,
        outgoingGain: Number(outgoingGain.toFixed(5)),
        settledLiveTarget: settledNum,
        entryTargetGain: entryTargetNum,
        baseTonalAmount: Number(baseTonalAmount.toFixed(5)),
        effectiveTonalAmount: Number(effectiveTonalAmount.toFixed(5)),
        planningTonalAmount: Number(planningTonal.toFixed(5)),
        breathCyclePosition: Number(breathCyclePosition.toFixed(5)),
        voiceBreathPhase: Number(voiceBreathPhase.toFixed(5)),
        entryMinusSettled: entryTargetNum != null
          ? Number((entryTargetNum - settledNum).toFixed(5))
          : null,
      }
    })

    const payload = {
      stage,
      transition: `${fromPreset}→${toPreset}`,
      baseTonalAmount: Number(baseTonalAmount.toFixed(5)),
      effectiveTonalAmount: Number(effectiveTonalAmount.toFixed(5)),
      planningTonalAmount: Number(planningTonal.toFixed(5)),
      breathCyclePosition: Number(breathCyclePosition.toFixed(5)),
      voiceBreathPhase: Number(voiceBreathPhase.toFixed(5)),
      voices,
    }

    console.log('[Moondrone moon-change:harmonic-targets]', JSON.stringify(payload, null, 2))
    console.table(voices)
  }

  isMoonCrossfadeExtensionVoice(index) {
    return index >= MOON_VOICE_CROSSFADE.cosmosExtensionMinIndex
  }

  shouldDeferMoonCrossfadeExtensionVoice(index) {
    if (!this.isMoonCrossfadeExtensionVoice(index)) {
      return false
    }

    return this.isCosmosPreset() && MOON_VOICE_CROSSFADE.deferExtensionsOnCosmosEnter
  }

  isMoonVoiceCrossfadeMorphActive() {
    return Tone.now() < this.moonVoiceCrossfadeMorphUntil
  }

  planMoonVoiceCrossfadeEntry(previousVoices, tonalAmount, breathCyclePosition, options = {}) {
    const {
      previousPresetName = null,
    } = options
    const cfg = MOON_VOICE_CROSSFADE
    const threshold = cfg.audibleGainThreshold
    const outgoingVoiceGains = previousVoices.map((voice) => voice.gain.gain.value)
    const voiceEntries = []
    const voiceBreathPhase = breathCyclePosition ?? this.getMoonTransitionVoicePlanningBreathCyclePosition()
    const voiceTonalAmount = tonalAmount ?? this.getMoonTransitionVoicePlanningTonalAmount()

    for (let index = 0; index < VOICE_COUNT; index += 1) {
      const settledTarget = this.getVoiceTargetGain(index, voiceTonalAmount, true, voiceBreathPhase)
      const neutralTarget = this.getVoiceTargetGain(index, voiceTonalAmount, false, voiceBreathPhase)
      const deferExtension = this.shouldDeferMoonCrossfadeExtensionVoice(index)
      const entryTarget = deferExtension ? 0 : Number(settledTarget.toFixed(5))

      voiceEntries.push({
        index,
        liveTarget: Number(settledTarget.toFixed(5)),
        neutralTarget: Number(neutralTarget.toFixed(5)),
        deferExtension,
        entryTarget,
      })
    }

    const deferredExtensionCount = voiceEntries.filter((entry) => entry.deferExtension && entry.liveTarget > threshold).length

    this.moonVoiceCrossfadePlan = {
      fromPreset: previousPresetName,
      toPreset: this.currentPreset.name,
      deferredExtensionCount,
      voiceEntries,
    }

    this.moonHarmonicEntryTargetSnapshot = Object.fromEntries(
      [3, 4, 5, 8, 9, 10].map((index) => [index, voiceEntries[index]?.entryTarget ?? null]),
    )

    if (MOON_CHANGE_DEBUG.enabled && (MOON_CHANGE_DEBUG.compareEntryLevels || MOON_CHANGE_DEBUG.gainPathProbes)) {
      console.log('[Moondrone moon-change:voice-energy]', {
        from: previousPresetName,
        to: this.currentPreset.name,
        deferredExtensionCount,
        perVoice: voiceEntries.map((entry) => ({
          index: entry.index,
          outgoingGain: Number((outgoingVoiceGains[entry.index] ?? 0).toFixed(5)),
          entryTarget: entry.entryTarget,
          liveTarget: entry.liveTarget,
          deferExtension: entry.deferExtension,
        })),
      })
    }

    this.logMoonHarmonicVoiceTransitionProbe('plan', {
      fromPreset: previousPresetName,
      toPreset: this.currentPreset.name,
      tonalAmount: voiceTonalAmount,
      breathCyclePosition: voiceBreathPhase,
    })

    this.logMoonTransitionProbeTable('plan')

    return this.moonVoiceCrossfadePlan
  }

  // Deferred Io sky extensions (indices 8-10) ride the aux window; reach full settled
  // target by extensionEnd with optional overlap headroom at the start of the morph.
  scheduleDeferredMoonCrossfadeExtensionGain(voice, entry, fadeInStart, now) {
    if (this.shouldMuteMoonTransitionIncomingExtension(entry.index)) {
      this.holdAudioParamAtTime(voice.gain.gain, now)
      voice.gain.gain.setValueAtTime(0, now)
      return fadeInStart
    }

    const extensionStart = fadeInStart
    const extensionEnd = extensionStart + MOON_TRANSITION.auxMorphSeconds
    const targetGain = entry.liveTarget
    const startScale = this.getMoonTransitionIncomingOverlapStartScale(entry.index)
    const duration = extensionEnd - extensionStart

    this.holdAudioParamAtTime(voice.gain.gain, now)
    voice.gain.gain.setValueAtTime(0, now)
    voice.gain.gain.setValueAtTime(0, extensionStart)

    if (targetGain <= 0 || duration <= 0) {
      return extensionEnd
    }

    const steps = MOON_TRANSITION.curveSteps

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps
      const curved = this.resolveMoonAuxCurveProgress(progress, MOON_TRANSITION.curve)
      const overlapScale = startScale + (1 - startScale) * progress

      voice.gain.gain.linearRampToValueAtTime(
        targetGain * curved * overlapScale,
        extensionStart + duration * progress,
      )
    }

    return extensionEnd
  }

  getCrossfadeEntryTargetGain(index, tonalAmount = this.getMoonTransitionVoicePlanningTonalAmount()) {
    const planEntry = this.moonVoiceCrossfadePlan?.voiceEntries[index]

    if (planEntry) {
      return planEntry.entryTarget
    }

    const breathCyclePosition = this.getMoonTransitionVoicePlanningBreathCyclePosition()

    return this.getVoiceTargetGain(index, tonalAmount, true, breathCyclePosition)
  }

  getTonalFilterFrequency(tonalAmount) {
    const presetFilter = this.currentPreset.filter

    if (this.isSterileDiagnosticActive()) {
      return presetFilter.frequency
    }

    const baseFrequency = presetFilter.frequency
    const characterAmount = this.getTonalCharacterAmount(tonalAmount)
    const focusAmount = this.getHighIntensityFocus(tonalAmount)
    let frequency = baseFrequency * (
      INTENSITY_TUNING.filterFrequencyBaseWeight
      + characterAmount * INTENSITY_TUNING.filterFrequencyCharacterScale
      + focusAmount * INTENSITY_TUNING.filterFrequencyFocusScale
    )

    if (this.isCosmosPreset()) {
      frequency *= 1 - this.getCosmosHighIntensitySoftening(tonalAmount) * COSMOS_TUNING.filterFocusDamping
    }

    frequency *= this.getIntensityFrequencyMultiplier()

    if (this.isAirShimmerEnabled()) {
      frequency *= AIR_SHIMMER_TUNING.presetFilterOpenness[this.currentPreset.name] ?? 1
    }

    return frequency
  }

  getTonalFilterQ(tonalAmount) {
    const presetFilter = this.currentPreset.filter

    if (this.isSterileDiagnosticActive()) {
      return Math.max(INTENSITY_TUNING.filterQMinimum, presetFilter.Q)
    }

    const characterAmount = this.getTonalCharacterAmount(tonalAmount)
    const focusAmount = this.getHighIntensityFocus(tonalAmount)
    const cosmosFocusDamping = this.isCosmosPreset()
      ? 1 - this.getCosmosHighIntensitySoftening(tonalAmount) * COSMOS_TUNING.layerFocusDamping
      : 1
    const shrutiFocusDamping = 1 - this.getShrutiVeryHighStressAmount(this.getBaseTonalAmount()) * SHRUTI_VERY_HIGH_FILTER_FOCUS_DAMPING
    const intensityResonance = 1 + this.getIntensityResonanceBoost(this.getBaseTonalAmount())

    return Math.max(
      INTENSITY_TUNING.filterQMinimum,
      presetFilter.Q * (
        INTENSITY_TUNING.filterQBaseWeight
        + characterAmount * INTENSITY_TUNING.filterQCharacterScale
        + focusAmount * INTENSITY_TUNING.filterQFocusScale * cosmosFocusDamping * shrutiFocusDamping
      ) * intensityResonance,
    )
  }

  getStereoWidth() {
    let width = OUTPUT_TUNING.stereoWidth + this.getMoodWidthOffset()

    if (this.isAirShimmerEnabled()) {
      width = (AIR_SHIMMER_TUNING.presetStereoWidth[this.currentPreset.name] ?? width)
        + AIR_SHIMMER_TUNING.stereoWidthBoost
    }

    if (this.isToneLabActive()) {
      width *= TONE_LAB_TUNING.stereo.width
    }

    return this.clamp(width, 0, 1)
  }

  // Tone Lab character (bus EQ, harmonic macros, stereo width multiplier).
  // Same path for all Moons including Binaural — Binaural differs only in Mood/Phase
  // (off) and Beat/undertones, not in Tone Lab bypass.
  isToneLabActive() {
    return TONE_LAB_TUNING.enabled
  }

  getToneLabOutputTrimDb() {
    if (TONE_LAB_TUNING.enabled) {
      return TONE_LAB_TUNING.dynamics.outputTrimDb
    }

    return this.isAirShimmerEnabled() ? AIR_SHIMMER_TUNING.overallLoudnessTrimDb : 0
  }

  getToneLabFinalOutputTrimDb() {
    if (TONE_LAB_TUNING.enabled) {
      const trimDb = TONE_LAB_TUNING.dynamics.finalOutputTrimDb ?? TONE_LAB_DYNAMICS_NEUTRAL.finalOutputTrimDb

      return Number.isFinite(trimDb) ? trimDb : 0
    }

    return TONE_LAB_DYNAMICS_NEUTRAL.finalOutputTrimDb
  }

  getEffectiveLimiterCeilingDb() {
    if (TONE_LAB_TUNING.enabled) {
      return TONE_LAB_TUNING.dynamics.limiterCeilingDb
    }

    return MASTER_TUNING.ceilingDb
  }

  applyMasterLimiterCeiling(rampSeconds = TRANSITION_TUNING.volumeRampSeconds) {
    if (!this.masterLimiter) {
      return
    }

    this.rampParam(this.masterLimiter.threshold, this.getEffectiveLimiterCeilingDb(), rampSeconds)
  }

  applyMasterFinalOutputTrim(rampSeconds = TRANSITION_TUNING.volumeRampSeconds) {
    if (!this.masterFinalOutputTrim) {
      return
    }

    this.rampParam(
      this.masterFinalOutputTrim.volume,
      this.getToneLabFinalOutputTrimDb(),
      rampSeconds,
      Tone.now(),
      'masterFinalOutputTrim.volume',
    )
  }

  applyBinauralSafetyLimiting(rampSeconds = TRANSITION_TUNING.volumeRampSeconds) {
    this.applyMasterLimiterCeiling(rampSeconds)
  }

  getToneLabHarmonicLayerGain() {
    if (!this.isToneLabActive()) {
      return 1
    }

    return Math.max(0, TONE_LAB_TUNING.harmonicLayer.gain)
  }

  getToneLabBreathAirGainMultiplier() {
    if (!this.isToneLabActive()) {
      return 1
    }

    return Math.max(0, TONE_LAB_TUNING.breathAir.gain)
  }

  getToneLabBreathMotionDepth() {
    if (!this.isToneLabActive()) {
      return 1
    }

    return Math.max(0, TONE_LAB_TUNING.breathAir.motionDepth)
  }

  getToneLabMoonPhaseHarmonicsGain() {
    const presetScale = this.getPresetMoonPhaseHarmonicsGainScale()

    if (!this.isToneLabActive()) {
      return presetScale
    }

    return Math.max(0, TONE_LAB_TUNING.moonPhaseHarmonics.gain) * presetScale
  }

  getToneLabMoonPhaseHarmonicsBrightness() {
    if (!this.isToneLabActive()) {
      return 1
    }

    return Math.max(0, TONE_LAB_TUNING.moonPhaseHarmonics.brightness)
  }

  getToneLabMoonPhaseHarmonicsMotionDepth() {
    if (!this.isToneLabActive()) {
      return 1
    }

    return Math.max(0, TONE_LAB_TUNING.moonPhaseHarmonics.motionDepth)
  }

  scaleMoonPhaseHarmonicMotionValue(value) {
    if (!this.isToneLabActive()) {
      return value
    }

    return scaleMoonPhaseHarmonicMotion(value, this.getToneLabMoonPhaseHarmonicsMotionDepth())
  }

  getToneLabBusEqTargets() {
    const active = this.isToneLabActive()

    return {
      active,
      ...resolveToneLabBusEqTargets({
        active,
        masterTone: TONE_LAB_TUNING.masterTone,
      }),
    }
  }

  coerceFiniteToneLabValue(value, fallback, label = '') {
    const numeric = typeof value === 'number' ? value : Number(value)

    if (Number.isFinite(numeric)) {
      return numeric
    }

    if (value !== undefined && value !== null) {
      console.warn('[Moondrone tone-lab-bus-eq] non-finite target, using fallback', {
        label,
        value,
        fallback,
      })
    }

    return fallback
  }

  applyToneLabBusEq(rampSeconds = INTENSITY_RAMP_SECONDS) {
    if (!this.toneLabHighpass) {
      return
    }

    const targets = this.getToneLabBusEqTargets()
    const neutral = TONE_LAB_BUS_EQ_NEUTRAL
    const rampFields = [
      ['highpass.frequency', this.toneLabHighpass.frequency, targets.lowCutHz, neutral.lowCutHz],
      ['lowpass.frequency', this.toneLabLowpass.frequency, targets.highCutHz, neutral.highCutHz],
      ['lowMid.gain', this.toneLabLowMid.gain, targets.lowMidGainDb, neutral.lowMidGainDb],
      ['lowMid.frequency', this.toneLabLowMid.frequency, targets.lowMidFrequencyHz, neutral.lowMidFrequencyHz],
      ['lowMid.Q', this.toneLabLowMid.Q, targets.lowMidQ, neutral.lowMidQ],
      ['speakerPresence.gain', this.toneLabSpeakerPresence.gain, targets.speakerPresenceGainDb, neutral.speakerPresenceGainDb],
      ['speakerPresence.frequency', this.toneLabSpeakerPresence.frequency, targets.speakerPresenceFrequencyHz, neutral.speakerPresenceFrequencyHz],
      ['speakerPresence.Q', this.toneLabSpeakerPresence.Q, targets.speakerPresenceQ, neutral.speakerPresenceQ],
      ['highMid.gain', this.toneLabHighMid.gain, targets.highMidGainDb, neutral.highMidGainDb],
      ['highMid.frequency', this.toneLabHighMid.frequency, targets.highMidFrequencyHz, neutral.highMidFrequencyHz],
      ['highMid.Q', this.toneLabHighMid.Q, targets.highMidQ, neutral.highMidQ],
      ['air.gain', this.toneLabAir.gain, targets.airGainDb, neutral.airGainDb],
      ['air.frequency', this.toneLabAir.frequency, targets.airFrequencyHz, neutral.airFrequencyHz],
      ['air.Q', this.toneLabAir.Q, targets.airQ, neutral.airQ],
      ['upperAir.gain', this.toneLabUpperAir.gain, targets.upperAirGainDb, neutral.upperAirGainDb],
      ['upperAir.frequency', this.toneLabUpperAir.frequency, targets.upperAirFrequencyHz, neutral.upperAirFrequencyHz],
      ['upperAir.Q', this.toneLabUpperAir.Q, targets.upperAirQ, neutral.upperAirQ],
    ]
    const resolvedTargets = {}

    rampFields.forEach(([label, param, rawValue, fallback]) => {
      const rawNumeric = typeof rawValue === 'number' ? rawValue : Number(rawValue)

      if (!Number.isFinite(rawNumeric)) {
        console.warn('[Moondrone tone-lab-bus-eq] non-finite target before ramp', {
          label,
          rawValue,
          fallback,
          active: targets.active,
        })
      }

      const value = this.coerceFiniteToneLabValue(rawValue, fallback, label)

      if (!Number.isFinite(value)) {
        console.warn('[Moondrone tone-lab-bus-eq] invalid target after fallback', {
          label,
          rawValue,
          fallback,
          value,
          active: targets.active,
        })
        return
      }

      if (!param || typeof param.rampTo !== 'function') {
        console.warn('[Moondrone tone-lab-bus-eq] missing audio param', { label, param })
        return
      }

      resolvedTargets[label] = value
      this.rampParam(param, value, rampSeconds, Tone.now(), `toneLabBusEq:${label}`)
    })
  }

  isAirShimmerEnabled() {
    return AIR_SHIMMER_TUNING.enabled
  }

  getAirShimmerHarmonicPartials(index) {
    if (!this.isAirShimmerEnabled() || this.isStringsLayer(index)) {
      return null
    }

    const harmonicGain = this.getToneLabHarmonicLayerGain()
      * this.getPresetAirShimmerGainScale()
      * this.getPresetHighBreathAirGainScale()

    if (harmonicGain === 0) {
      return null
    }

    const presetOscillatorType = PRESET_VOICE_OSCILLATOR_TYPES[this.currentPreset.name]?.[index]

    if (presetOscillatorType && presetOscillatorType !== 'custom') {
      return null
    }

    const presetPartials = AIR_SHIMMER_TUNING.presetHarmonicPartials[this.currentPreset.name]
    const partials = presetPartials?.[index]

    if (!partials) {
      return null
    }

    const registerScale = AIR_SHIMMER_TUNING.harmonicPartialRegisterScale[this.currentOctave] ?? 1

    return partials.map((amplitude, harmonicIndex) => {
      if (harmonicIndex === 0) {
        return amplitude
      }

      return amplitude * registerScale * harmonicGain
    })
  }

  // Medium-register-only darker body waveform for the lowest layer (index 0). Returns
  // a softened custom partial set (fundamental preserved, upper harmonics reduced) for
  // the listed standard-voice presets so the low body reads as bass support, not a
  // forward principal note. Null everywhere else, leaving the normal oscillator type.
  getMediumBodyHarmonicSofteningPartials(index) {
    if (index !== 0 || this.currentOctave !== MEDIUM_REGISTER_OCTAVE) {
      return null
    }

    if (this.isStringsLayer(index)) {
      return null
    }

    return PRESET_MEDIUM_BODY_HARMONIC_SOFTENING[this.currentPreset.name]?.partials ?? null
  }

  getVoiceOscillatorOptions(index) {
    const frequency = this.getVoiceFrequency(index)
    const softBodyPartials = this.getMediumBodyHarmonicSofteningPartials(index)

    if (softBodyPartials) {
      return {
        frequency,
        type: 'custom',
        partials: softBodyPartials,
        partialCount: softBodyPartials.length,
      }
    }

    const partials = this.getAirShimmerHarmonicPartials(index)

    if (partials) {
      return {
        frequency,
        type: 'custom',
        partials,
        partialCount: partials.length,
      }
    }

    return {
      frequency,
      type: this.getVoiceOscillatorType(index),
    }
  }

  getBreathAirEnvelopeSettings() {
    const motionDepth = this.getToneLabBreathMotionDepth()

    if (this.isToneLabActive()) {
      return {
        floorLevel: TONE_LAB_TUNING.breathAir.floorLevel,
        swellSoftness: TONE_LAB_TUNING.breathAir.swellSoftness,
        swellShape: TONE_LAB_TUNING.breathAir.swellShape,
        motionDepth,
      }
    }

    const { breathNoise } = AIR_SHIMMER_TUNING
    const presetBreathNoise = breathNoise.presetBreathNoise?.[this.currentPreset.name]

    return {
      floorLevel: presetBreathNoise?.floorLevel ?? breathNoise.floorLevel,
      swellSoftness: presetBreathNoise?.swellSoftness ?? breathNoise.swellSoftness,
      swellShape: presetBreathNoise?.swellShape ?? breathNoise.swellShape,
      motionDepth,
    }
  }

  getAirBreathNoiseRampMultiplier() {
    const presetBreathNoise = AIR_SHIMMER_TUNING.breathNoise.presetBreathNoise?.[this.currentPreset.name]

    return presetBreathNoise?.rampMultiplier ?? AIR_SHIMMER_TUNING.breathNoise.rampMultiplier ?? 1.5
  }

  getAirBreathNoiseSwellAmount() {
    if (!this.isAirShimmerEnabled() || !AIR_SHIMMER_TUNING.breathNoise.enabled) {
      return 0
    }

    if (this.getToneLabBreathAirGainMultiplier() === 0) {
      return 0
    }

    const breathAmount = this.getBreathAmount()

    if (breathAmount === 0) {
      return 0
    }

    const rawCurve = this.getRawBreathCurve()
    const shapedCurve = rawCurve >= 0
      ? rawCurve
      : rawCurve * BREATH_TUNING.exhaleAsymmetry

    return computeBreathAirEnvelope(
      shapedCurve,
      breathAmount,
      this.getBreathAirEnvelopeSettings(),
    ) * this.getPresetHighBreathAirGainScale()
  }

  getAirBreathNoiseTargetGain() {
    if (!this.isAirShimmerEnabled() || !AIR_SHIMMER_TUNING.breathNoise.enabled || !this.airBreathGain) {
      return 0
    }

    const breathGain = this.getToneLabBreathAirGainMultiplier()

    if (breathGain === 0) {
      return 0
    }

    const presetScale = AIR_SHIMMER_TUNING.breathNoise.presetScale[this.currentPreset.name] ?? 1

    if (presetScale === 0) {
      return 0
    }

    const swellAmount = this.getAirBreathNoiseSwellAmount()
    const airTrim = this.getPresetAirShimmerGainScale()

    return AIR_SHIMMER_TUNING.breathNoise.gain * presetScale * swellAmount * breathGain * airTrim
  }

  getAirBreathNoiseFilterTargets() {
    const swellAmount = this.getAirBreathNoiseSwellAmount()
    const endpoints = this.isToneLabActive()
      ? getToneLabBreathFilterEndpoints(TONE_LAB_TUNING.breathAir.tone)
      : {
        highpassMinHz: AIR_SHIMMER_TUNING.breathNoise.highpassMinHz,
        highpassMaxHz: AIR_SHIMMER_TUNING.breathNoise.highpassMaxHz,
        lowpassMinHz: AIR_SHIMMER_TUNING.breathNoise.lowpassMinHz,
        lowpassMaxHz: AIR_SHIMMER_TUNING.breathNoise.lowpassMaxHz,
      }
    const {
      highpassMinHz,
      highpassMaxHz,
      lowpassMinHz,
      lowpassMaxHz,
    } = endpoints

    return {
      highpassHz: highpassMinHz + (highpassMaxHz - highpassMinHz) * swellAmount,
      lowpassHz: lowpassMinHz + (lowpassMaxHz - lowpassMinHz) * swellAmount,
    }
  }

  applyAirShimmerBusEq(rampSeconds = INTENSITY_RAMP_SECONDS) {
    if (!this.airShelfEq) {
      return
    }

    if (Tone.now() < this.stringsHighRegisterAirShelfLockedUntil) {
      return
    }

    // Moon-rebuild crossfade owns shelf/scoop/filter identity during the transition.
    if (this.pendingMoonVoiceRebuildCrossfade || this.isMoonAuxLayerCrossfadeActive()) {
      return
    }

    const shelfGain = this.getAirShimmerShelfGainDb()
    const airEnabled = shelfGain !== 0 || (
      AIR_SHIMMER_TUNING.enabled && !this.isStringsIsolationAirDisabled()
    )

    this.rampParam(this.airShelfEq.gain, shelfGain, rampSeconds)

    if (this.airLowMidScoop) {
      const scoop = AIR_SHIMMER_TUNING.presetLowMidScoop?.[this.currentPreset.name]
        ?? AIR_SHIMMER_TUNING.lowMidScoop
      const scoopGain = airEnabled ? scoop.gainDb : 0

      this.rampParam(this.airLowMidScoop.frequency, scoop.frequency, rampSeconds)
      this.rampParam(this.airLowMidScoop.Q, scoop.Q, rampSeconds)
      this.rampParam(this.airLowMidScoop.gain, scoopGain, rampSeconds)
    }
  }

  applyAirBreathNoiseModulation(
    rampSeconds = BREATH_UPDATE_SECONDS * BREATH_TUNING.breathRampMultiplier,
    startTime = Tone.now(),
  ) {
    if (!this.airBreathGain || this.isStringsHighRegisterAirDeclickActive() || this.isMoonEntryBreathMorphActive()) {
      return
    }

    if (this.pendingStringsHighRegisterAirReanchor && this.isStringsPreset()) {
      return
    }

    if (this.isMoonAuxLayerCrossfadeActive()) {
      return
    }

    const airRampMultiplier = this.getAirBreathNoiseRampMultiplier()
    const smoothRampSeconds = rampSeconds * airRampMultiplier

    this.rampParam(
      this.airBreathGain.gain,
      this.getAirBreathNoiseTargetGain(),
      smoothRampSeconds,
      startTime,
    )

    if (this.isStringsHighRegisterAirFilterLocked()) {
      return
    }

    if (this.airBreathHighpass && this.airBreathLowpass) {
      const { highpassHz, lowpassHz } = this.getAirBreathNoiseFilterTargets()

      this.rampBreathParam(this.airBreathHighpass.frequency, highpassHz, smoothRampSeconds, startTime)
      this.rampBreathParam(this.airBreathLowpass.frequency, lowpassHz, smoothRampSeconds, startTime)
    }
  }

  buildAirBreathLayer() {
    if (!this.isAirShimmerEnabled() || !AIR_SHIMMER_TUNING.breathNoise.enabled || !this.filter) {
      return
    }

    const endpoints = this.isToneLabActive()
      ? getToneLabBreathFilterEndpoints(TONE_LAB_TUNING.breathAir.tone)
      : {
        highpassMinHz: AIR_SHIMMER_TUNING.breathNoise.highpassMinHz,
        lowpassMinHz: AIR_SHIMMER_TUNING.breathNoise.lowpassMinHz,
      }

    this.airBreathGain = new Tone.Gain(0).connect(this.filter)
    this.airBreathLowpass = new Tone.Filter({
      type: 'lowpass',
      frequency: endpoints.lowpassMinHz,
      Q: 0.7,
    }).connect(this.airBreathGain)
    this.airBreathHighpass = new Tone.Filter({
      type: 'highpass',
      frequency: endpoints.highpassMinHz,
      Q: 0.7,
    }).connect(this.airBreathLowpass)
    this.airBreathNoise = new Tone.Noise('pink').connect(this.airBreathHighpass)
    this.airBreathStarted = false
  }

  startAirBreathNoise(time = Tone.now(), holdStopFade = false) {
    if (!this.airBreathNoise || !this.isAirShimmerEnabled()) {
      return
    }

    if (holdStopFade) {
      this.holdAudioParamAtTime(this.airBreathGain.gain, time)
    } else {
      this.snapParam(this.airBreathGain.gain, 0, time)
    }

    if (!this.airBreathStarted) {
      this.airBreathNoise.start(time)
      this.airBreathStarted = true
    }

    const airRampMultiplier = this.getAirBreathNoiseRampMultiplier()
    this.applyAirBreathNoiseModulation(START_FADE_SECONDS / airRampMultiplier, time)
  }

  stopAirBreathNoise(rampSeconds = STOP_FADE_SECONDS) {
    if (!this.airBreathGain) {
      return
    }

    const now = Tone.now()

    if (rampSeconds <= 0) {
      this.snapParam(this.airBreathGain.gain, 0, now)
      return
    }

    this.rampParam(this.airBreathGain.gain, 0, rampSeconds, now)
  }

  isStringsPreset() {
    return this.currentPreset.name === 'Strings'
  }

  isStringsLayer(index) {
    return this.isStringsPreset() && index <= 5
  }

  presetRequiresVoiceRebuild(previousPresetName) {
    const nextPresetName = this.currentPreset.name

    return previousPresetName !== nextPresetName
      && (presetUsesCustomOscillatorProfile(previousPresetName)
        || presetUsesCustomOscillatorProfile(nextPresetName))
  }

  isChoirPreset() {
    return this.currentPreset.name === 'Choir'
  }

  isChoirLayer(index) {
    return this.isChoirPreset() && index <= 5
  }

  getChoirEnsembleGains(tonalAmount) {
    const characterAmount = this.getTonalCharacterAmount(tonalAmount)
    const sideGain = CHOIR_TUNING.sideGainBase + characterAmount * CHOIR_TUNING.sideGainCharacterScale
    const mainGain = 1 - sideGain * 2

    return { main: mainGain, side: sideGain }
  }

  applyChoirEnsembleMix(tonalAmount = this.getBaseTonalAmount(), rampSeconds = INTENSITY_RAMP_SECONDS) {
    if (!this.isChoirPreset() || !this.isReady) {
      return
    }

    const { main, side } = this.getChoirEnsembleGains(tonalAmount)

    this.voices.forEach((voice, index) => {
      if (!this.isChoirLayer(index) || !voice.choirMemberGains) {
        return
      }

      this.rampParam(voice.choirMemberGains[0].gain, main, rampSeconds)

      voice.choirMemberGains.slice(1).forEach((memberGain) => {
        this.rampParam(memberGain.gain, side, rampSeconds)
      })
    })
  }

  buildStringsSineSawPartials(index) {
    let sawAmount = STRINGS_SAW_AMOUNT_UPPER
    const registerVoicing = index <= 2 ? this.getStringsHighRegisterVoicing() : null
    // Medium-register-only softening for the lowest body layer (index 0): trim the saw
    // bite + roll off upper partials so Titan's low octave sits under the bow as
    // foundation instead of a forward principal note. Low/High/VH and other layers
    // keep their normal saw partials.
    const mediumBodySoftening = (
      index === 0 && this.currentOctave === MEDIUM_REGISTER_OCTAVE
        ? STRINGS_TUNING.mediumBodySoftening
        : null
    )

    if (index <= 2) {
      sawAmount = STRINGS_SAW_AMOUNT_BODY

      if (registerVoicing?.principleSawScale != null) {
        sawAmount *= registerVoicing.principleSawScale
      }
    } else if (index <= 4) {
      sawAmount = STRINGS_SAW_AMOUNT_MID
    }

    if (mediumBodySoftening?.sawScale != null) {
      sawAmount *= mediumBodySoftening.sawScale
    }

    const partials = [1]
    const harmonicRolloff = registerVoicing?.principleHarmonicRolloff ?? mediumBodySoftening?.harmonicRolloff ?? 0

    for (let harmonic = 2; harmonic <= STRINGS_PARTIAL_COUNT; harmonic += 1) {
      let amplitude = sawAmount / harmonic

      if (harmonic === 2 && registerVoicing?.principleSecondHarmonicScale != null) {
        amplitude *= registerVoicing.principleSecondHarmonicScale
      }

      if (harmonicRolloff > 0 && harmonic >= 3) {
        amplitude *= Math.max(0.1, 1 - harmonicRolloff * (harmonic - 2))
      }

      if (harmonic >= 4 && registerVoicing?.principleUpperMidHarmonicScale != null) {
        amplitude *= registerVoicing.principleUpperMidHarmonicScale
      }

      partials.push(amplitude)
    }

    return partials
  }

  getStringsOscillatorOptions(index) {
    return {
      frequency: this.getVoiceFrequency(index),
      type: 'custom',
      partials: this.buildStringsSineSawPartials(index),
      partialCount: STRINGS_PARTIAL_COUNT,
    }
  }

  getVoiceOscillators(voice) {
    return voice.oscillators ?? [voice.oscillator]
  }

  getPrimaryOscillator(voice) {
    return this.getVoiceOscillators(voice)[0]
  }

  startVoiceOscillators(voice, time = Tone.now(), voiceIndex = null) {
    this.snapParam(voice.gain.gain, 0, time)

    if (this.presetTransitionDebugContext) {
      this.logPresetTransitionDebug('oscillator-start', {
        voiceIndex,
        oscillatorCount: this.getVoiceOscillators(voice).length,
        time,
      })
    }

    this.getVoiceOscillators(voice).forEach((oscillator) => {
      oscillator.start(time)
    })
  }

  setVoiceFrequency(voice, frequency, time = Tone.now(), options = {}) {
    const safeFrequency = Math.max(frequency, 1)
    const audibleGain = voice.gain.gain.value
    const rampSeconds = options.rampSeconds ?? (audibleGain > 0.0005 ? 0.02 : 0)

    if (rampSeconds > 0) {
      this.rampVoiceFrequency(voice, safeFrequency, rampSeconds, time)
      return
    }

    this.getVoiceOscillators(voice).forEach((oscillator, oscIndex) => {
      this.holdAudioParamAtTime(oscillator.frequency, time)
      const currentFrequency = Math.max(oscillator.frequency.value, 1)

      if (this.presetTransitionDebugContext) {
        this.logPresetTransitionSnap(`setVoiceFrequency:osc[${oscIndex}]`, oscillator.frequency, safeFrequency, time)
      }

      this.logClickDiagnostic('frequency-set', {
        voiceGain: audibleGain,
        currentFrequency,
        targetFrequency: safeFrequency,
      })

      oscillator.frequency.setValueAtTime(currentFrequency, time)
      oscillator.frequency.setValueAtTime(safeFrequency, time)
    })
  }

  rampVoiceFrequency(voice, frequency, duration, time = Tone.now()) {
    const safeFrequency = Math.max(frequency, 1)

    this.getVoiceOscillators(voice).forEach((oscillator) => {
      this.holdAudioParamAtTime(oscillator.frequency, time)
      const currentFrequency = Math.max(oscillator.frequency.value, 1)
      oscillator.frequency.setValueAtTime(currentFrequency, time)
      oscillator.frequency.exponentialRampToValueAtTime(safeFrequency, time + duration)
    })
  }

  rampVoiceFrequencyTarget(voice, frequency, duration, time = Tone.now()) {
    const safeFrequency = Math.max(frequency, 1)
    const timeConstant = Math.max(duration / 4.5, 0.05)

    this.getVoiceOscillators(voice).forEach((oscillator) => {
      if (typeof oscillator.frequency.cancelAndHoldAtTime === 'function') {
        oscillator.frequency.cancelAndHoldAtTime(time)
      } else {
        oscillator.frequency.cancelScheduledValues(time)
      }

      oscillator.frequency.setTargetAtTime(safeFrequency, time, timeConstant)
    })
  }

  isBinauralUndertoneIndex(index) {
    return index === FOUNDATION_ROOT_VOICE_INDEX || index === BINAURAL_RIGHT_VOICE_INDEX
  }

  isBinauralVoiceRoleTransition(index, previousPresetName, transitionKind) {
    if (!this.isBinauralUndertoneIndex(index)) {
      return false
    }

    const wasBinaural = previousPresetName === 'Binaural'
    const isBinaural = this.isBinauralPreset()

    if (transitionKind === 'deactivating' && wasBinaural && !isBinaural) {
      return true
    }

    if (transitionKind === 'activating' && isBinaural && !wasBinaural) {
      return true
    }

    if (transitionKind === 'morphAudibleRetune' && index === FOUNDATION_ROOT_VOICE_INDEX) {
      if (isBinaural && (previousPresetName === 'Shruti' || previousPresetName === 'Cosmos')) {
        return true
      }

      if (wasBinaural && !isBinaural) {
        return true
      }
    }

    return false
  }

  snapVoiceDetune(voice, index, time = Tone.now()) {
    this.getVoiceOscillators(voice).forEach((oscillator) => {
      if (!oscillator.detune) {
        return
      }

      if (typeof oscillator.detune.cancelAndHoldAtTime === 'function') {
        oscillator.detune.cancelAndHoldAtTime(time)
      } else {
        oscillator.detune.cancelScheduledValues(time)
      }

      oscillator.detune.setValueAtTime(0, time)
    })
  }

  morphBinauralVoiceRole(voice, index, nextFrequency, nextTargetGain, nextPan, now, previousPresetName) {
    // Legacy path — live Binaural enter/exit uses deferred undertone handling instead.
    this.silentSwapBinauralVoiceRole(voice, index, nextFrequency, nextTargetGain, nextPan, now, previousPresetName)
  }

  silentSwapBinauralVoiceRole(voice, index, nextFrequency, nextTargetGain, nextPan, now, previousPresetName) {
    const gainParam = voice.gain.gain
    const panParam = voice.panner.pan
    const silenceThreshold = 0.0005
    const currentGain = Math.max(gainParam.value, 0)
    const fadeOutSeconds = currentGain > silenceThreshold
      ? PRESET_LAYER_FADE_OUT_SECONDS
      : 0
    const fadeOutEnd = now + fadeOutSeconds
    const repointTime = fadeOutEnd + 0.01
    const fadeInEnd = repointTime + PRESET_LAYER_FADE_IN_SECONDS

    gainParam.cancelAndHoldAtTime(now)
    panParam.cancelAndHoldAtTime(now)

    if (currentGain > silenceThreshold) {
      gainParam.setValueAtTime(currentGain, now)
      gainParam.exponentialRampToValueAtTime(0.0001, fadeOutEnd)
    } else {
      gainParam.setValueAtTime(0, now)
    }

    gainParam.setValueAtTime(0, repointTime)
    this.setVoiceFrequency(voice, nextFrequency, repointTime)
    panParam.setValueAtTime(nextPan, repointTime)
    this.snapVoiceDetune(voice, index, repointTime)
    gainParam.linearRampToValueAtTime(Math.max(nextTargetGain, 0.0001), fadeInEnd)

    this.logTransitionDiagnostic('binaural-role-silent-swap', {
      index,
      from: previousPresetName,
      to: this.currentPreset.name,
      fadeOutSeconds,
      repointTime,
      fadeInEnd,
      nextTargetGain,
      nextPan,
    })
  }

  activateBinauralUndertone(voice, index, nextFrequency, nextTargetGain, nextPan, now, previousPresetName) {
    const gainParam = voice.gain.gain
    const panParam = voice.panner.pan
    const fadeInStart = now + BINAURAL_UNDERTONE_FADE_IN_DELAY_SECONDS
    const fadeInEnd = fadeInStart + PRESET_LAYER_FADE_IN_SECONDS

    gainParam.cancelAndHoldAtTime(now)
    panParam.cancelAndHoldAtTime(now)
    this.setVoiceFrequency(voice, nextFrequency, now)
    panParam.setValueAtTime(nextPan, now)
    this.snapVoiceDetune(voice, index, now)
    gainParam.setValueAtTime(0, now)
    gainParam.setValueAtTime(0, fadeInStart)
    gainParam.linearRampToValueAtTime(nextTargetGain, fadeInEnd)

    this.logTransitionDiagnostic('binaural-undertone-activate', {
      index,
      from: previousPresetName,
      nextTargetGain,
      nextPan,
      fadeInStart,
      fadeInEnd,
    })
  }

  deactivateBinauralUndertone(voice, index, nextFrequency, now, previousPresetName) {
    const gainParam = voice.gain.gain
    const panParam = voice.panner.pan
    const fadeOutEnd = now + PRESET_LAYER_FADE_OUT_SECONDS
    const repointTime = fadeOutEnd + 0.02

    gainParam.cancelAndHoldAtTime(now)
    panParam.cancelAndHoldAtTime(now)

    const currentGain = Math.max(gainParam.value, 0.0001)
    gainParam.setValueAtTime(currentGain, now)
    gainParam.exponentialRampToValueAtTime(0.0001, fadeOutEnd)
    this.rampParam(panParam, 0, PRESET_LAYER_FADE_OUT_SECONDS, now)

    gainParam.setValueAtTime(0, repointTime)
    this.setVoiceFrequency(voice, nextFrequency, repointTime)
    panParam.setValueAtTime(0, repointTime)
    this.snapVoiceDetune(voice, index, repointTime)

    this.logTransitionDiagnostic('binaural-undertone-deactivate', {
      index,
      from: previousPresetName,
      to: this.currentPreset.name,
      fadeOutEnd,
      repointTime,
    })
  }

  getMidiNote(key, octave) {
    return Tone.Frequency(`${key}${octave}`).toMidi()
  }

  midiToFrequency(midiNote) {
    return this.referenceA * 2 ** ((midiNote - 69) / 12)
  }

  applyReferenceAChange() {
    const now = Tone.now()

    // The orbit center + dual-beat carriers derive from reference A too — glide them with the voices.
    this.updateOrbitPairFrequency(this.isPlaying ? TUNING_RAMP_SECONDS : 0)
    this.updateDualBeatsFrequency(this.isPlaying ? TUNING_RAMP_SECONDS : 0)

    this.voices.forEach((voice, index) => {
      const nextFrequency = this.getVoiceFrequency(index)

      if (this.isPlaying) {
        this.rampVoiceFrequency(voice, nextFrequency, TUNING_RAMP_SECONDS, now)
        return
      }

      this.setVoiceFrequency(voice, nextFrequency, now)
    })
  }

  resetVoiceDetune(voice, index, duration = 1.2) {
    if (this.presetTransitionDebugContext) {
      this.logPresetTransitionDebug('detune-reset', {
        index,
        structure: this.getVoiceStructureLabel(index),
        duration,
        beforeCents: this.getVoiceOscillators(voice).map((oscillator) => oscillator.detune?.value ?? null),
      })
    }

    if (this.isStringsLayer(index)) {
      voice.stringsBaseDetunes.forEach((baseDetune, oscIndex) => {
        this.rampParam(voice.oscillators[oscIndex].detune, baseDetune, duration)
      })
      return
    }

    if (this.isChoirLayer(index) && voice.choirBaseDetunes) {
      voice.choirBaseDetunes.forEach((baseDetune, oscIndex) => {
        this.rampParam(voice.oscillators[oscIndex].detune, baseDetune, duration)
      })
      return
    }

    this.rampParam(this.getPrimaryOscillator(voice).detune, 0, duration)
  }

  disposeVoice(voice) {
    const now = Tone.now()
    const deClick = STRINGS_HIGH_REGISTER_TRANSITION_DECLICK
    const silenceThreshold = deClick.disposeSilenceThreshold
    const gainParam = voice.gain.gain
    const isStringsVoice = this.isStringsVoice(voice)
    // Outgoing Strings fades are scheduled; param.value can lag on WebKit. Read the
    // true instantaneous level before preStop/stop (same idea as rampOutgoingVoiceGain).
    const accurateGain = isStringsVoice && typeof gainParam.getValueAtTime === 'function'
      ? gainParam.getValueAtTime(now)
      : null
    const currentGain = Math.max(accurateGain != null ? accurateGain : gainParam.value, 0)
    const useDeClickPath = isStringsVoice && currentGain > silenceThreshold
    let stopTime = now + deClick.stopDelaySeconds

    if (this.presetTransitionDebugContext) {
      const voiceIndex = this.voices.indexOf(voice)

      this.logPresetTransitionDebug('oscillator-stop-dispose', {
        voiceIndex,
        structure: voiceIndex >= 0 ? this.getVoiceStructureLabel(voiceIndex) : 'outgoing',
        oscillatorCount: this.getVoiceOscillators(voice).length,
        useDeClickPath,
        currentGain,
      })
    }

    this.logClickDiagnostic('voice-dispose', {
      gainBeforeStop: currentGain,
      stopTime,
      useDeClickPath,
    })

    this.logStringsIsolationAutomation('voice-dispose', {
      gainBeforeStop: Number(currentGain.toFixed(5)),
      useDeClickPath,
      stopTime,
    })

    if (voice.stringsDriftTimeouts) {
      voice.stringsDriftTimeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
    }

    this.getVoiceOscillators(voice).forEach((oscillator) => {
      if (oscillator.detune) {
        this.holdAudioParamAtTime(oscillator.detune, now)
      }
    })

    this.holdAudioParamAtTime(gainParam, now)

    if (useDeClickPath) {
      gainParam.setValueAtTime(currentGain, now)
      gainParam.linearRampToValueAtTime(0, now + deClick.preStopFadeSeconds)
      stopTime = now + deClick.preStopFadeSeconds + deClick.stopDelaySeconds
    } else {
      gainParam.setValueAtTime(0, now)
    }

    this.getVoiceOscillators(voice).forEach((oscillator) => {
      try {
        oscillator.stop(stopTime)
      } catch {
        // Oscillator may already be stopped on rapid transitions.
      }
    })

    const disposeNodes = () => {
      this.getVoiceOscillators(voice).forEach((oscillator) => {
        oscillator.dispose()
      })

      if (voice.ensembleGains) {
        voice.ensembleGains.forEach((ensembleGain) => {
          ensembleGain.dispose()
        })
      }

      if (voice.choirMemberGains) {
        voice.choirMemberGains.forEach((memberGain) => {
          memberGain.dispose()
        })
      }

      if (voice.choirMemberPanners) {
        voice.choirMemberPanners.forEach((memberPanner) => {
          memberPanner.dispose()
        })
      }

      voice.gain.dispose()
      voice.panner.dispose()
    }

    window.setTimeout(disposeNodes, Math.max(0, (stopTime - Tone.now()) * 1000) + 20)
  }

  stopStringsDrift() {
    this.stopStringsDriftOnVoices(this.voices)
  }

  stopStringsDriftOnVoices(voices = this.voices) {
    voices.forEach((voice) => {
      if (!voice.stringsDriftTimeouts) {
        return
      }

      voice.stringsDriftTimeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
      voice.stringsDriftTimeouts = []
    })
  }

  holdOutgoingStringsDetuneOnVoices(voices = []) {
    const now = Tone.now()

    voices.forEach((voice) => {
      this.getVoiceOscillators(voice).forEach((oscillator) => {
        if (!oscillator.detune) {
          return
        }

        this.holdAudioParamAtTime(oscillator.detune, now)
      })
    })
  }

  startStringsDrift(options = {}) {
    const { transitionEntry = false } = options

    if (!this.isStringsPreset() || !this.isPlaying || this.isTonalBusTransitionGuarded()) {
      return
    }

    this.stopStringsDrift()

    this.voices.forEach((voice, index) => {
      if (!this.isStringsLayer(index)) {
        return
      }

      voice.stringsDriftTimeouts = []

      voice.oscillators.forEach((oscillator, oscIndex) => {
        this.scheduleStringsDrift(voice, oscillator, oscIndex, { transitionEntry })
      })
    })
  }

  scheduleStringsDrift(voice, oscillator, oscIndex, options = {}) {
    const { transitionEntry = false } = options

    if (!this.isStringsPreset() || !this.isPlaying || this.isTonalBusTransitionGuarded()) {
      return
    }

    let rampSeconds = STRINGS_DRIFT_RAMP_MIN_SECONDS
      + Math.random() * (STRINGS_DRIFT_RAMP_MAX_SECONDS - STRINGS_DRIFT_RAMP_MIN_SECONDS)
    const pauseSeconds = STRINGS_DRIFT_PAUSE_MIN_SECONDS
      + Math.random() * (STRINGS_DRIFT_PAUSE_MAX_SECONDS - STRINGS_DRIFT_PAUSE_MIN_SECONDS)
    const baseDetune = voice.stringsBaseDetunes[oscIndex]
    let drift = (Math.random() * 2 - 1) * STRINGS_DRIFT_CENTS
    let targetDetune = baseDetune + drift

    if (transitionEntry && this.currentOctave >= HIGH_REGISTER_OCTAVE) {
      drift *= STRINGS_HIGH_REGISTER_TRANSITION_DECLICK.firstDriftScale
      targetDetune = baseDetune + drift
      rampSeconds = Math.max(rampSeconds, STRINGS_HIGH_REGISTER_TRANSITION_DECLICK.firstDriftRampMinSeconds)
    }

    if (this.presetTransitionDebugContext) {
      this.logPresetTransitionDebug('strings-drift-schedule', {
        oscIndex,
        currentDetune: oscillator.detune.value,
        targetDetune,
        rampSeconds,
        transitionEntry,
        nextDriftInSec: rampSeconds + pauseSeconds,
      })
    }

    this.logStringsIsolationAutomation('strings-drift-schedule', {
      oscIndex,
      transitionEntry,
      currentDetune: Number(oscillator.detune.value.toFixed(3)),
      targetDetune: Number(targetDetune.toFixed(3)),
      rampSeconds: Number(rampSeconds.toFixed(2)),
    })

    this.holdAudioParamAtTime(oscillator.detune, Tone.now())
    this.rampParam(oscillator.detune, targetDetune, rampSeconds)

    const timeoutId = window.setTimeout(() => {
      if (!this.isStringsPreset() || !this.isPlaying) {
        return
      }

      this.scheduleStringsDrift(voice, oscillator, oscIndex)
    }, (rampSeconds + pauseSeconds) * 1000)

    voice.stringsDriftTimeouts[oscIndex] = timeoutId
  }

  rebuildVoicesWhilePlaying(previousPresetName = null) {
    this.crossfadeToCurrentPitch({
      presetChange: previousPresetName != null,
      previousPresetName,
    })
  }

  rebuildVoicesWhileStopped() {
    this.stopStringsDrift()
    this.voices.forEach((voice) => {
      this.disposeVoice(voice)
    })
    this.voices = this.createVoices()
    this.hasStarted = false
  }

  clearSimpleMoonTransitionTimeout() {
    if (this.simpleMoonTransitionTimeoutId != null) {
      window.clearTimeout(this.simpleMoonTransitionTimeoutId)
      this.simpleMoonTransitionTimeoutId = null
    }
  }

  // Snap the whole-drone-bus group gain back to unity (1.0). Used on Play/Stop and when a
  // Moon-change fade is interrupted, so the drone is never left ducked.
  resetMoonTransitionGroupGain(time = Tone.now()) {
    if (!this.moonTransitionGain) {
      return
    }

    const param = this.moonTransitionGain.gain

    if (typeof param.cancelScheduledValues === 'function') {
      param.cancelScheduledValues(time)
    }

    param.setValueAtTime(1, time)
  }

  resolveMoonGroupGainCurve(progress, curve) {
    const p = this.clamp(progress, 0, 1)

    if (curve === 'equalPower') {
      return Math.sin((p * Math.PI) / 2)
    }

    if (curve === 'smootherstep') {
      // Perlin smootherstep: zero 1st + 2nd derivative at both ends — gentler than easeInOutSine.
      return p * p * p * (p * (p * 6 - 15) + 10)
    }

    // easeInOutSine: symmetric, flat at both ends.
    return 0.5 - 0.5 * Math.cos(Math.PI * p)
  }

  // Quiet trough for the simple Moon transition (linear gain). The whole drone fades here
  // instead of absolute zero so the curve stays continuous. Rebuild happens at/below this
  // level; rebuildSnapLinearGain can dip deeper for the rebuild instant only.
  getMoonTransitionTroughGain() {
    const simple = MOON_TRANSITION.simpleFade

    if (simple?.troughLinearGain != null) {
      return simple.troughLinearGain
    }

    if (simple?.fadeFloorLinear != null) {
      return simple.fadeFloorLinear
    }

    if (simple?.fadeFloorDb != null) {
      return 10 ** (simple.fadeFloorDb / 20)
    }

    return 0
  }

  getMoonTransitionRebuildSnapGain() {
    const simple = MOON_TRANSITION.simpleFade
    const trough = this.getMoonTransitionTroughGain()
    const rebuildSnap = simple?.rebuildSnapLinearGain

    if (rebuildSnap == null) {
      return trough
    }

    return Math.min(rebuildSnap, trough)
  }

  isMoonTransitionTailEnabled() {
    const tail = MOON_TRANSITION.simpleFade?.transitionTail

    return tail?.enabled === true && this.moonTransitionBloomGain != null
  }

  getMoonTransitionTiming() {
    const simple = MOON_TRANSITION.simpleFade
    const tail = simple.transitionTail

    if (this.isMoonTransitionTailEnabled() && tail) {
      const dryFadeLeadSeconds = tail.dryFadeLeadSeconds ?? 0.12

      return {
        dryFadeLeadSeconds,
        moonFadeOutSeconds: tail.dryFadeOutSeconds ?? 0.42,
        moonFadeInSeconds: tail.dryFadeInSeconds ?? 1,
        silentHoldSeconds: simple.silentHoldSeconds ?? 0.003,
        settleSnapSeconds: simple.settleSnapSeconds ?? 0.004,
        curve: simple.curve ?? 'smootherstep',
        tailSendFadeInSeconds: tail.tailSendFadeInSeconds ?? 0.15,
        tailSendCloseStartSeconds: tail.tailSendCloseStartSeconds ?? 0.5,
        tailSendCloseSeconds: tail.tailSendCloseSeconds ?? 0.14,
        tailOutputFadeOutSeconds: tail.tailOutputFadeOutSeconds ?? 2.4,
        highpassSweepSeconds: tail.highpassSweepSeconds ?? tail.tailOutputFadeOutSeconds ?? 2.4,
      }
    }

    return {
      dryFadeLeadSeconds: 0,
      moonFadeOutSeconds: simple.fadeOutSeconds ?? 0.28,
      silentHoldSeconds: simple.silentHoldSeconds ?? simple.rebuildHoldSeconds ?? 0.003,
      moonFadeInSeconds: simple.fadeInSeconds ?? 0.55,
      settleSnapSeconds: simple.settleSnapSeconds ?? 0.004,
      curve: simple.curve ?? 'smootherstep',
      tailSendFadeInSeconds: 0,
      tailSendCloseStartSeconds: 0,
      tailSendCloseSeconds: 0,
      tailOutputFadeOutSeconds: 0,
      highpassSweepSeconds: 0,
    }
  }

  getMoonTransitionTailConfig() {
    return MOON_TRANSITION.simpleFade?.transitionTail ?? {}
  }

  clearMoonTransitionBloomResetTimeout() {
    if (this.moonTransitionBloomResetTimeoutId != null) {
      window.clearTimeout(this.moonTransitionBloomResetTimeoutId)
      this.moonTransitionBloomResetTimeoutId = null
    }
  }

  scheduleMoonTransitionBloomReset(delayMs) {
    this.clearMoonTransitionBloomResetTimeout()

    this.moonTransitionBloomResetTimeoutId = window.setTimeout(() => {
      this.moonTransitionBloomResetTimeoutId = null
      this.resetMoonTransitionBloom()
    }, delayMs)
  }

  resetMoonTransitionBloom(time = Tone.now()) {
    this.clearMoonTransitionBloomResetTimeout()

    if (!this.moonTransitionBloomGain) {
      return
    }

    const tail = this.getMoonTransitionTailConfig()
    const startHz = tail.highpassStartHz ?? 100

    if (this.moonTransitionSendGain?.gain) {
      this.snapParam(this.moonTransitionSendGain.gain, 0, time)
    }

    if (this.moonTransitionBloomGain?.gain) {
      this.snapParam(this.moonTransitionBloomGain.gain, 0, time)
    }

    if (this.moonTransitionHighpass?.frequency) {
      this.snapParam(this.moonTransitionHighpass.frequency, startHz, time)
    }
  }

  scheduleMoonTransitionHighpassSweep(startTime, seconds, startHz, endHz, curve = 'smootherstep') {
    const param = this.moonTransitionHighpass?.frequency

    if (!param || seconds <= 0) {
      return
    }

    this.holdAudioParamAtTime(param, startTime)
    param.setValueAtTime(startHz, startTime)

    const steps = MOON_TRANSITION.simpleFade?.curveSteps ?? 48

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps
      const shaped = this.resolveMoonGroupGainCurve(progress, curve)
      const hz = startHz + (endHz - startHz) * shaped

      param.linearRampToValueAtTime(hz, startTime + seconds * progress)
    }
  }

  // Separate transition tail bus: dry send → HP → damp LP → fixed long reverb → output → master.
  // Built once at signal-chain init; idle at zero between Moon changes. Reverb decay/wet are
  // fixed at build time — never morphed during a transition (avoids pops).
  buildMoonTransitionBloomChain() {
    const tail = this.getMoonTransitionTailConfig()

    if (!tail.enabled || !this.projectionDryNarrower || !this.masterPreLowShelf) {
      return
    }

    if (this.moonTransitionBloomGain) {
      return
    }

    this.moonTransitionSendGain = new Tone.Gain(0)
    this.moonTransitionHighpass = new Tone.Filter({
      type: 'highpass',
      frequency: tail.highpassStartHz ?? 100,
      Q: 0.5,
    })
    this.moonTransitionDampLowpass = new Tone.Filter({
      type: 'lowpass',
      frequency: tail.dampLowpassHz ?? 5200,
      Q: 0.65,
    })
    this.moonTransitionReverb = new Tone.Reverb({
      decay: tail.reverbDecaySeconds ?? 8,
      preDelay: tail.reverbPreDelaySeconds ?? 0.04,
      wet: 1,
    })
    this.moonTransitionBloomGain = new Tone.Gain(0).connect(this.masterPreLowShelf)

    this.projectionDryNarrower.connect(this.moonTransitionSendGain)
    this.moonTransitionSendGain.connect(this.moonTransitionHighpass)
    this.moonTransitionHighpass.connect(this.moonTransitionDampLowpass)
    this.moonTransitionDampLowpass.connect(this.moonTransitionReverb)
    this.moonTransitionReverb.connect(this.moonTransitionBloomGain)
  }

  // Open the tail send while the old Moon is still sounding, then close it smoothly so the
  // long reverb sustains the melt — no burst/pop on the transition reverb node.
  beginMoonTransitionTail(now, timing) {
    if (!this.isMoonTransitionTailEnabled()) {
      return
    }

    const tail = this.getMoonTransitionTailConfig()
    const startHz = tail.highpassStartHz ?? 100
    const sendPeak = tail.sendPeakLinearGain ?? 0.28
    const outputPeak = tail.outputPeakLinearGain ?? 0.12
    const inputGain = this.moonTransitionSendGain?.gain
    const outputGain = this.moonTransitionBloomGain?.gain

    if (this.moonTransitionHighpass?.frequency) {
      this.holdAudioParamAtTime(this.moonTransitionHighpass.frequency, now)
      this.moonTransitionHighpass.frequency.setValueAtTime(startHz, now)
    }

    if (inputGain) {
      this.holdAudioParamAtTime(inputGain, now)
      inputGain.setValueAtTime(0, now)
      this.rampGainCurved(
        inputGain,
        sendPeak,
        timing.tailSendFadeInSeconds,
        timing.curve,
        now,
      )

      const sendCloseStart = now + timing.tailSendCloseStartSeconds

      this.rampGainCurved(
        inputGain,
        0,
        timing.tailSendCloseSeconds,
        timing.curve,
        sendCloseStart,
      )
    }

    if (outputGain) {
      this.holdAudioParamAtTime(outputGain, now)
      // Steady output level — only the send opens/closes so the wash builds naturally.
      outputGain.setValueAtTime(outputPeak, now)
    }
  }

  // Slow tail dissolve after the new Moon begins entering: output fades, HP sweeps upward.
  releaseMoonTransitionTail(fadeUpStart, timing) {
    if (!this.isMoonTransitionTailEnabled()) {
      return
    }

    const tail = this.getMoonTransitionTailConfig()
    const startHz = tail.highpassStartHz ?? 100
    const endHz = tail.highpassEndHz ?? 650
    const outputGain = this.moonTransitionBloomGain?.gain

    if (outputGain) {
      this.rampGainCurved(
        outputGain,
        0,
        timing.tailOutputFadeOutSeconds,
        timing.curve,
        fadeUpStart,
      )
    }

    this.scheduleMoonTransitionHighpassSweep(
      fadeUpStart,
      timing.highpassSweepSeconds,
      startHz,
      endHz,
      timing.curve,
    )
    this.scheduleMoonTransitionBloomReset((timing.tailOutputFadeOutSeconds + 0.12) * 1000)
  }

  // Curved ramp for any gain AudioParam (transition tail or moonTransitionGain).
  rampGainCurved(
    gainParam,
    targetValue,
    seconds,
    curve = 'smootherstep',
    startTime = Tone.now(),
    explicitStartValue = undefined,
  ) {
    if (!gainParam) {
      return
    }

    let startValue

    if (explicitStartValue !== undefined) {
      startValue = explicitStartValue
      this.holdAudioParamAtTime(gainParam, startTime)
      gainParam.setValueAtTime(startValue, startTime)
    } else if (startTime <= Tone.now() + 0.002) {
      startValue = gainParam.value
      this.holdAudioParamAtTime(gainParam, startTime)
      gainParam.setValueAtTime(startValue, startTime)
    } else {
      // Future ramp: capture the value already scheduled at startTime (e.g. send close).
      this.holdAudioParamAtTime(gainParam, startTime)
      startValue = gainParam.value
    }

    if (seconds <= 0) {
      gainParam.setValueAtTime(targetValue, startTime)
      return
    }

    const steps = MOON_TRANSITION.simpleFade?.curveSteps ?? 48

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps
      const shaped = this.resolveMoonGroupGainCurve(progress, curve)
      const value = startValue + (targetValue - startValue) * shaped

      gainParam.linearRampToValueAtTime(value, startTime + seconds * progress)
    }
  }

  // Curved ramp of the whole-drone-bus group gain (moonTransitionGain) from its current
  // value to `targetValue`. Drives the simple Moon-change fade-down and fade-up.
  rampMoonGroupGain(targetValue, seconds, curve = 'easeInOutSine', startTime = Tone.now()) {
    if (!this.moonTransitionGain) {
      return
    }

    this.rampGainCurved(this.moonTransitionGain.gain, targetValue, seconds, curve, startTime)
  }

  // True only for a high-intensity Titan/Strings note/register switch — the one case where
  // the outgoing + incoming voice sets (plus un-ducked aux layers) briefly sum hot enough to
  // tick through the master saturator/limiter. Excludes Moon changes (presetChange), which own
  // the group fader via the full-chain crossfade and must not be ducked here.
  shouldApplyStringsSwitchHeadroomDip() {
    return Boolean(
      STRINGS_SWITCH_HEADROOM?.enabled
      && this.isReady
      && this.isPlaying
      && this.moonTransitionGain
      && this.isStringsPreset()
      && this.intensity >= STRINGS_SWITCH_HEADROOM.intensityUiThreshold
      // Never fight an in-flight Moon transition for the shared group fader.
      && Tone.now() >= this.fullChainCrossfadeVoiceHoldUntil
      && this.presetTransitionEndsAt <= Tone.now(),
    )
  }

  // Microscopic, smooth headroom dip on the idle whole-drone-bus group fader, held across the
  // note/register crossfade overlap (startTime -> overlapEndTime, the outgoing-fade window where
  // both Titan voice sets are audible) and restored to unity as the new note settles. Pure
  // headroom: Titan's tone and the audible crossfade timing are unchanged.
  applyStringsSwitchHeadroomDip(startTime = Tone.now(), overlapEndTime = startTime) {
    if (!this.shouldApplyStringsSwitchHeadroomDip()) {
      return
    }

    const param = this.moonTransitionGain.gain
    const dipLinear = Tone.dbToGain(STRINGS_SWITCH_HEADROOM.dipDb)
    const dipInSeconds = STRINGS_SWITCH_HEADROOM.dipInSeconds
    const recoverSeconds = STRINGS_SWITCH_HEADROOM.recoverSeconds
    // Hold the dip until the outgoing voices have fully faded (overlap gone), with a floor so a
    // near-zero overlap still gets a clean minimum hold before recovering.
    const recoverStart = Math.max(
      overlapEndTime,
      startTime + dipInSeconds + STRINGS_SWITCH_HEADROOM.minHoldSeconds,
    )

    // Ramp down into the dip; it holds at dipLinear (no scheduled change in between), then anchors
    // explicitly at dipLinear and recovers to unity so the future ramp starts from the held value
    // rather than misreading the param's pre-schedule (unity) value.
    this.rampGainCurved(param, dipLinear, dipInSeconds, 'smootherstep', startTime)
    this.rampGainCurved(param, 1, recoverSeconds, 'smootherstep', recoverStart, dipLinear)
  }

  // Simple Moon transition: optional transition tail (old drone melts into long reverb while
  // dry/core ducks, rebuilds, and new Moon fades in underneath). No overlap, no bridge tone.
  performSimpleMoonTransition(previousPresetName) {
    if (!this.isReady) {
      return
    }

    const timing = this.getMoonTransitionTiming()
    const useTail = this.isMoonTransitionTailEnabled()
    const now = Tone.now()

    this.logTransitionDiagnostic('simple-moon-transition:begin', {
      from: previousPresetName,
      to: this.currentPreset.name,
      useTail,
      dryFadeLeadSeconds: timing.dryFadeLeadSeconds,
      moonFadeOutSeconds: timing.moonFadeOutSeconds,
      moonFadeInSeconds: timing.moonFadeInSeconds,
      tailOutputFadeOutSeconds: timing.tailOutputFadeOutSeconds,
    })

    // Tear down any leftover morph/guard state from the old transition system and from an
    // interrupted simple transition, so nothing fights this fade.
    this.clearSimpleMoonTransitionTimeout()
    this.clearMoonTransitionBloomResetTimeout()
    this.resetMoonTransitionBloom(now)
    this.clearNoteCrossfadeTimeouts()
    this.clearMoonTransitionIsolationProbes()
    this.clearBinauralUndertoneDeferredTimeouts()
    this.pendingMoonVoiceRebuildCrossfade = false
    this.moonTransitionBusSnapshot = null
    this.moonVoiceCrossfadePlan = null
    this.moonAuxLayerCrossfadeActive = false
    this.moonAuxLayerCrossfadeUntil = 0
    this.moonTransitionContext = null
    this.moonTransitionAuxHandoffUntil = 0
    this.moonEntryBreathMorphUntil = 0
    this.clearMoonEntryMorphCompletionTimeout()
    this.moonTransitionBreathSnapshot = null

    // Pause the modulation loops; they resume once the new Moon is settled and audible.
    this.pauseBreathLoop()
    this.stopMoodLoop()
    this.stopStringsDrift()
    this.clearStringsDriftResumeTimeout()
    this.clearStringsHighRegisterAirReanchorTimeout()

    const troughGain = this.getMoonTransitionTroughGain()
    const dryFadeStart = now + timing.dryFadeLeadSeconds
    const sendCloseEnd = timing.tailSendCloseStartSeconds + timing.tailSendCloseSeconds
    const dryFadeEnd = timing.dryFadeLeadSeconds + timing.moonFadeOutSeconds
    const rebuildDelaySeconds = useTail
      ? Math.max(dryFadeEnd + timing.silentHoldSeconds, sendCloseEnd + 0.02)
      : timing.moonFadeOutSeconds + timing.silentHoldSeconds
    const switchEnd = rebuildDelaySeconds + timing.moonFadeInSeconds
    const tailEnd = rebuildDelaySeconds + timing.tailOutputFadeOutSeconds
    const guardSeconds = Math.max(switchEnd, tailEnd) + 0.15

    this.presetTransitionEndsAt = now + guardSeconds
    this.noteCrossfadeEndsAt = now + guardSeconds

    if (this.metronomePlaying) {
      this.primeMetronomeSchedule()
    }

    if (useTail) {
      this.beginMoonTransitionTail(now, timing)
    }

    // Fade main dry/core after the tail send has opened on the still-sounding old Moon.
    this.rampMoonGroupGain(troughGain, timing.moonFadeOutSeconds, timing.curve, dryFadeStart)

    const rebuildAtMs = rebuildDelaySeconds * 1000

    this.simpleMoonTransitionTimeoutId = window.setTimeout(() => {
      this.simpleMoonTransitionTimeoutId = null
      this.rebuildMoonAtSettledStateWhileSilent(previousPresetName)
    }, rebuildAtMs)
  }

  // Silent-point step of the simple Moon transition: dispose the old Moon, build the new
  // one, snap every layer to its settled value (the bus is inaudible under moonTransition
  // Gain), then fade the bus back up and resume the modulation loops.
  rebuildMoonAtSettledStateWhileSilent(previousPresetName) {
    if (!this.isReady || !this.isPlaying) {
      // Stopped/disposed during the fade-out: restore unity so the next Play is audible.
      this.resetMoonTransitionGroupGain()
      this.resetMoonTransitionBloom()
      return
    }

    const timing = this.getMoonTransitionTiming()
    const useTail = this.isMoonTransitionTailEnabled()
    const snapRamp = timing.settleSnapSeconds
    const silentTime = Tone.now()
    const rebuildSnapGain = this.getMoonTransitionRebuildSnapGain()

    // Dip to the rebuild snap (deeper than trough if configured) for the rebuild instant
    // only — keeps the swap inaudible without a long silent hold.
    if (this.moonTransitionGain) {
      this.snapParam(this.moonTransitionGain.gain, rebuildSnapGain, silentTime)
    }

    // Clear guards so the settled apply* calls below are not short-circuited.
    this.presetTransitionEndsAt = 0
    this.noteCrossfadeEndsAt = 0
    this.startupFadeEndsAt = 0
    this.stopFadeEndsAt = 0
    this.moonAuxLayerCrossfadeActive = false
    this.moonAuxLayerCrossfadeUntil = 0
    this.moonTransitionAuxHandoffUntil = 0
    this.moonEntryBreathMorphUntil = 0
    this.binauralUndertonesHeldSilent = false

    // Dispose the old Moon's voices (current + any in-flight outgoing sets) and build fresh.
    this.disposeAllOutgoingVoiceSets()
    this.voices.forEach((voice) => {
      this.disposeVoice(voice)
    })
    this.voices = this.createVoices()
    this.hasStarted = false

    // Reset breath phase to its resting anchor so the new Moon breathes from a clean state.
    this.resetBreathPhaseToAnchor()

    // Ensure the air-breath noise source is running before its settled gain is applied.
    this.startAirBreathNoise(silentTime)

    // Settle the shared/bus identity instantly: intensity-filter tonal target, stereo width,
    // choir mix, preset + AIR/shimmer + Tone Lab bus EQ, air-breath noise, and breath. Voice
    // gains are skipped here and snapped explicitly below.
    this.applyIntensity(true, snapRamp)
    this.applyReverbWet(snapRamp)
    this.applyVolume(snapRamp)
    this.applyVoicePanning(snapRamp)
    this.applyProjectionNodes(snapRamp)

    // Voices: snap to settled target gains and start their oscillators (silent under the
    // group gain). Breath modulation resumes around these targets on fade-up.
    this.voices.forEach((voice, index) => {
      voice.targetGain = this.getVoiceTargetGain(index)
      this.setVoiceFrequency(voice, this.getVoiceFrequency(index), silentTime, { rampSeconds: 0 })
      this.startVoiceOscillators(voice, silentTime, index)
      this.snapParam(voice.gain.gain, voice.targetGain, silentTime)
    })
    this.hasStarted = true

    // Mood/phase aux (orbit + Super dual beats): start at the new Moon's settled level.
    this.prepareMoodAuxiliaryLayersForStart(silentTime)
    this.updateOrbitPairFrequency(0)
    this.startOrbitOscillators(silentTime)
    this.updateDualBeatsFrequency(0)
    this.startDualBeatsOscillators(silentTime)

    if (this.isMoodActive()) {
      this.rampMoodAuxiliaryLayersToTarget(snapRamp, silentTime)
    } else {
      this.neutralizeMoodModulation(0)
    }

    // Fade main dry/core back up; transition tail dissolves slowly underneath.
    const fadeUpStart = Tone.now()
    this.rampMoonGroupGain(1, timing.moonFadeInSeconds, timing.curve, fadeUpStart)

    if (useTail) {
      this.releaseMoonTransitionTail(fadeUpStart, timing)
    }

    // Fresh mood phase so the new Moon's mood emerges over ~30–60 s, like a fresh Play.
    this.moodStartTime = window.performance.now()
    this.lastMoodUpdateTime = 0
    this.startMoodLoop()

    if (this.getBreathAmount() > 0) {
      this.startBreathLoop()
    }

    this.startStringsDrift()

    this.logTransitionDiagnostic('simple-moon-transition:settled', {
      from: previousPresetName,
      to: this.currentPreset.name,
      breathCyclePosition: this.getBreathCyclePosition(),
      useTail,
    })
  }

  // =====================================================================================
  // Full-chain Moon crossfade (experimental, mode === 'fullChainCrossfade').
  //
  // True dual-chain crossfade: the ENTIRE current drone chain (voices, aux, filter, every
  // EQ, reverb, width, output trim, its own moonTransitionGain) is captured as a frozen
  // "old deck" and detached from `this.*`. A brand-new complete chain is built into `this.*`
  // (a fresh moonTransitionGain → masterPreLowShelf, new voices, new reverb with the new
  // Moon's IR, etc.), settled to the new Moon's normal sound while silent, then the two
  // complete chains are equal-power crossfaded at their output gains. The two decks share
  // ONLY the master stage (masterPreLowShelf onward) — never a moving bus/filter/EQ/reverb.
  // The old deck's modulation loops are stopped so it stays frozen while it fades, then it is
  // disposed after the crossfade.
  // =====================================================================================
  getFullChainCrossfadeConfig() {
    return MOON_TRANSITION.fullChainCrossfade ?? {}
  }

  snapCrossfadeDeckBloomSilent(deck, time = Tone.now()) {
    if (!deck) {
      return
    }

    if (deck.moonTransitionSendGain?.gain) {
      this.snapParam(deck.moonTransitionSendGain.gain, 0, time)
    }

    if (deck.moonTransitionBloomGain?.gain) {
      this.snapParam(deck.moonTransitionBloomGain.gain, 0, time)
    }
  }

  disconnectCrossfadeDeckMeterTap(deck) {
    if (!deck?.output || !this.masterMeterPre) {
      return
    }

    try {
      deck.output.disconnect(this.masterMeterPre)
    } catch {
      // Tap may already be disconnected.
    }
  }

  disconnectCrossfadeDeckOutputs(deck) {
    if (!deck) {
      return
    }

    ;[deck.fadeGain, deck.moonTransitionBloomGain, deck.output].forEach((node) => {
      try {
        node?.disconnect()
      } catch {
        // Node may already be disconnected.
      }
    })
  }

  prepareCapturedCrossfadeDeck(deck) {
    if (!deck) {
      return
    }

    const now = Tone.now()

    this.stopStringsDriftOnVoices(deck.voices)
    this.snapCrossfadeDeckBloomSilent(deck, now)
    this.disconnectCrossfadeDeckMeterTap(deck)

    if (deck.fadeGain?.gain) {
      this.holdAudioParamAtTime(deck.fadeGain.gain, now)
      deck.fadeGain.gain.setValueAtTime(1, now)
    }
  }

  registerLimboCrossfadeDeck(deck) {
    const entry = {
      deck,
      fadeGain: deck.fadeGain,
      limbo: true,
      disposeTimeoutId: null,
      fastRetireTimeoutId: null,
      probeTimeoutIds: [],
    }

    this.fullChainCrossfadeDecks.push(entry)
    return entry
  }

  clearFullChainTransitionContext(ctx = this.fullChainTransitionContext) {
    if (!ctx) {
      return
    }

    if (ctx.reverbReadyTimeoutId != null) {
      window.clearTimeout(ctx.reverbReadyTimeoutId)
      ctx.reverbReadyTimeoutId = null
    }

    ctx.probeTimeoutIds?.forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    ctx.probeTimeoutIds = []
  }

  abandonInFlightFullChainTransition() {
    const ctx = this.fullChainTransitionContext

    if (ctx?.reverbReadyTimeoutId != null) {
      window.clearTimeout(ctx.reverbReadyTimeoutId)
      ctx.reverbReadyTimeoutId = null
    }

    if (ctx?.oldDeck) {
      const tracked = ctx.limboEntry && this.fullChainCrossfadeDecks.includes(ctx.limboEntry)

      if (!tracked) {
        this.fullChainCrossfadeDecks.push({
          deck: ctx.oldDeck,
          fadeGain: ctx.oldDeck.fadeGain,
          limbo: true,
          disposeTimeoutId: null,
          fastRetireTimeoutId: null,
          probeTimeoutIds: [],
        })
      }
    }

    this.clearFullChainTransitionContext(ctx)
    this.fullChainTransitionContext = null
    this.fullChainCrossfadeVoiceHoldUntil = 0
    this.forceRetireAllCrossfadeDecks()
  }

  captureFullChainTransitionSnapshot() {
    return {
      presetName: this.currentPreset.name,
      key: this.currentKey,
      octave: this.currentOctave,
      intensity: this.intensity,
      breath: this.breath,
      moodId: this.mood,
      volume: this.volume,
      referenceA: this.referenceA,
      breathStartTime: this.breathStartTime,
      breathCyclePosition: this.getBreathCyclePosition(),
      effectiveTonalAmount: this.getEffectiveTonalAmount(),
      baseTonalAmount: this.getBaseTonalAmount(),
      moodStartTime: this.moodStartTime,
    }
  }

  logFullChainSettleDiagnostics(label, snapshot, ctx, silentTime = Tone.now()) {
    if (!this.fullChainCrossfadeDebug) {
      return
    }

    const effectiveTonal = snapshot?.effectiveTonalAmount ?? this.getEffectiveTonalAmount()
    const extensionGains = [8, 9, 10].map((index) => ({
      index,
      target: Number(this.getVoiceTargetGain(index, effectiveTonal).toFixed(5)),
      actual: Number((this.voices[index]?.gain.gain.value ?? 0).toFixed(5)),
    }))

    this.logFullChainProbe(label, {
      effectiveTonalAmount: Number(effectiveTonal.toFixed(4)),
      baseTonalAmount: Number((snapshot?.baseTonalAmount ?? this.getBaseTonalAmount()).toFixed(4)),
      breathCyclePosition: Number((snapshot?.breathCyclePosition ?? this.getBreathCyclePosition()).toFixed(3)),
      outputVolumeDb: Number((this.output?.volume.value ?? 0).toFixed(2)),
      outputTargetDb: Number(this.getDroneBalanceTrimDb().toFixed(2)),
      extensionGains,
      airShelfTargetDb: Number(this.getAirShimmerShelfGainDb().toFixed(2)),
      airShelfActualDb: Number((this.airShelfEq?.gain.value ?? 0).toFixed(2)),
      moodBloomTargetDb: Number(this.getMoodBloomGainDb().toFixed(2)),
      moodBloomActualDb: Number((this.moodBloomEq?.gain.value ?? 0).toFixed(2)),
      silentTime: Number(silentTime.toFixed(4)),
    }, ctx)
  }

  disposeCrossfadeVoice(voice, now = Tone.now()) {
    if (!voice) {
      return
    }

    if (voice.stringsDriftTimeouts?.length) {
      voice.stringsDriftTimeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
      voice.stringsDriftTimeouts = []
    }

    voice.oscillators?.forEach((osc) => {
      try {
        osc.stop(now)
        osc.dispose()
      } catch {
        // Oscillator may already be stopped.
      }
    })

    voice.ensembleGains?.forEach((ensembleGain) => {
      try {
        ensembleGain.dispose()
      } catch {
        // Ignore partial teardown.
      }
    })

    voice.choirMemberGains?.forEach((memberGain) => {
      try {
        memberGain.dispose()
      } catch {
        // Ignore partial teardown.
      }
    })

    voice.choirMemberPanners?.forEach((memberPanner) => {
      try {
        memberPanner.dispose()
      } catch {
        // Ignore partial teardown.
      }
    })

    try {
      voice.gain?.dispose()
      voice.panner?.dispose()
    } catch {
      // Ignore partial teardown.
    }
  }

  // Snapshot every node that constitutes "this Moon's chain" so it can fade out and be
  // disposed independently while a fresh chain is built into this.*.
  captureCurrentDroneDeck() {
    return {
      preset: this.currentPreset,
      fadeGain: this.moonTransitionGain,
      output: this.output,
      voices: this.voices,
      // Drone bus nodes (filter → … → output).
      filter: this.filter,
      projectionDryNarrower: this.projectionDryNarrower,
      reverb: this.reverb,
      stereoWidener: this.stereoWidener,
      moodBloomEq: this.moodBloomEq,
      moodEclipseEq: this.moodEclipseEq,
      projectionLowMidCut: this.projectionLowMidCut,
      projectionPresenceEqs: this.projectionPresenceEqs,
      presetLowMidEq: this.presetLowMidEq,
      presetMediumBodyEq: this.presetMediumBodyEq,
      presetBodyMidEq: this.presetBodyMidEq,
      presetUpperMidEq: this.presetUpperMidEq,
      airShelfEq: this.airShelfEq,
      airLowMidScoop: this.airLowMidScoop,
      droneMidVoicingEq: this.droneMidVoicingEq,
      droneBusEq: this.droneBusEq,
      toneLabHighpass: this.toneLabHighpass,
      toneLabLowpass: this.toneLabLowpass,
      toneLabLowMid: this.toneLabLowMid,
      toneLabSpeakerPresence: this.toneLabSpeakerPresence,
      toneLabHighMid: this.toneLabHighMid,
      toneLabAir: this.toneLabAir,
      toneLabUpperAir: this.toneLabUpperAir,
      // Auxiliary layers.
      airBreathNoise: this.airBreathNoise,
      airBreathHighpass: this.airBreathHighpass,
      airBreathLowpass: this.airBreathLowpass,
      airBreathGain: this.airBreathGain,
      orbitPair: this.orbitPair,
      dualBeats: this.dualBeats,
      // Idle transition-tail bus built alongside this chain (unused in this mode).
      moonTransitionSendGain: this.moonTransitionSendGain,
      moonTransitionHighpass: this.moonTransitionHighpass,
      moonTransitionDampLowpass: this.moonTransitionDampLowpass,
      moonTransitionReverb: this.moonTransitionReverb,
      moonTransitionBloomGain: this.moonTransitionBloomGain,
    }
  }

  // Dispose every node held by a captured deck (stop + dispose oscillators, then nodes).
  disposeCrossfadeDeck(deck) {
    if (!deck) {
      return
    }

    const now = Tone.now()

    deck.voices?.forEach((voice) => {
      this.disposeCrossfadeVoice(voice, now)
    })

    const stopAndDispose = (osc) => {
      try {
        osc?.stop(now)
      } catch {
        // Already stopped.
      }
      try {
        osc?.dispose()
      } catch {
        // Ignore.
      }
    }

    if (deck.orbitPair) {
      stopAndDispose(deck.orbitPair.oscA)
      stopAndDispose(deck.orbitPair.oscB)
    }

    if (deck.dualBeats) {
      deck.dualBeats.pairs?.forEach((pair) => {
        stopAndDispose(pair.oscL)
        stopAndDispose(pair.oscR)
      })
    }

    stopAndDispose(deck.airBreathNoise)

    this.disconnectCrossfadeDeckOutputs(deck)

    const nodes = [
      deck.filter,
      deck.projectionDryNarrower,
      deck.reverb,
      deck.stereoWidener,
      deck.moodBloomEq,
      deck.moodEclipseEq,
      deck.projectionLowMidCut,
      ...(deck.projectionPresenceEqs ?? []),
      deck.presetLowMidEq,
      deck.presetMediumBodyEq,
      deck.presetBodyMidEq,
      deck.presetUpperMidEq,
      deck.airShelfEq,
      deck.airLowMidScoop,
      deck.droneMidVoicingEq,
      deck.droneBusEq,
      deck.toneLabHighpass,
      deck.toneLabLowpass,
      deck.toneLabLowMid,
      deck.toneLabSpeakerPresence,
      deck.toneLabHighMid,
      deck.toneLabAir,
      deck.toneLabUpperAir,
      deck.airBreathHighpass,
      deck.airBreathLowpass,
      deck.airBreathGain,
      deck.orbitPair?.gainA,
      deck.orbitPair?.gainB,
      deck.orbitPair?.pannerA,
      deck.orbitPair?.pannerB,
      deck.orbitPair?.busGain,
      ...(deck.dualBeats?.pairs?.flatMap((pair) => [pair.pannerL, pair.pannerR, pair.pairGain]) ?? []),
      deck.dualBeats?.bus,
      deck.moonTransitionSendGain,
      deck.moonTransitionHighpass,
      deck.moonTransitionDampLowpass,
      deck.moonTransitionReverb,
      deck.moonTransitionBloomGain,
      deck.output,
      deck.fadeGain,
    ]

    nodes.forEach((node) => {
      try {
        node?.dispose()
      } catch {
        // Ignore partial teardown.
      }
    })
  }

  // Quickly retire a still-fading old deck (rapid Moon changes) so chains never stack.
  fastRetireCrossfadeDeck(entry) {
    if (!entry) {
      return
    }

    if (entry.disposeTimeoutId != null) {
      window.clearTimeout(entry.disposeTimeoutId)
      entry.disposeTimeoutId = null
    }

    if (entry.fastRetireTimeoutId != null) {
      window.clearTimeout(entry.fastRetireTimeoutId)
      entry.fastRetireTimeoutId = null
    }

    entry.probeTimeoutIds?.forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    entry.probeTimeoutIds = []

    const cfg = this.getFullChainCrossfadeConfig()
    const fastSeconds = cfg.fastRetireSeconds ?? 0.08
    const now = Tone.now()

    this.snapCrossfadeDeckBloomSilent(entry.deck, now)

    if (entry.fadeGain?.gain) {
      this.rampGainCurved(entry.fadeGain.gain, 0, fastSeconds, 'easeInOutSine', now)
    }

    entry.fastRetireTimeoutId = window.setTimeout(() => {
      entry.fastRetireTimeoutId = null
      this.disposeCrossfadeDeck(entry.deck)
    }, (fastSeconds + 0.05) * 1000)
  }

  // Immediately retire every pending old deck (Stop / lifecycle / new transition start).
  forceRetireAllCrossfadeDecks() {
    const pending = this.fullChainCrossfadeDecks
    this.fullChainCrossfadeDecks = []
    pending.forEach((entry) => {
      this.fastRetireCrossfadeDeck(entry)
    })
  }

  // Equal-power (or sine) crossfade between two deck output gains. Endpoints are exact
  // (old → 0, new → 1); an optional center-headroom dip attenuates the midpoint sum.
  rampFullChainCrossfade(oldGainParam, newGainParam, seconds, startTime) {
    const cfg = this.getFullChainCrossfadeConfig()
    const steps = cfg.curveSteps ?? 64
    const curve = cfg.curve ?? 'equalPower'
    const headroomDb = cfg.centerHeadroomDb ?? 0
    const headroomLinear = headroomDb ? 10 ** (headroomDb / 20) : 1

    const oldStart = oldGainParam ? oldGainParam.value : 1

    if (oldGainParam) {
      this.holdAudioParamAtTime(oldGainParam, startTime)
      oldGainParam.setValueAtTime(oldStart, startTime)
    }

    if (newGainParam) {
      this.holdAudioParamAtTime(newGainParam, startTime)
      newGainParam.setValueAtTime(0, startTime)
    }

    for (let step = 1; step <= steps; step += 1) {
      const p = step / steps
      let out
      let inV

      if (curve === 'equalPower') {
        out = Math.cos((p * Math.PI) / 2)
        inV = Math.sin((p * Math.PI) / 2)
      } else {
        const s = 0.5 - 0.5 * Math.cos(Math.PI * p)
        out = 1 - s
        inV = s
      }

      // sin(πp): 0 at both ends, 1 at center — so endpoints stay exact.
      const dip = 1 - (1 - headroomLinear) * Math.sin(Math.PI * p)
      const time = startTime + seconds * p

      if (oldGainParam) {
        oldGainParam.linearRampToValueAtTime(oldStart * out * dip, time)
      }

      if (newGainParam) {
        newGainParam.linearRampToValueAtTime(inV * dip, time)
      }
    }
  }

  // Settle a freshly-built chain (already created by ensureSignalChain) to the new Moon's
  // normal sound while it is silent under its (zeroed) moonTransitionGain. Mirrors the
  // settle portion of rebuildMoonAtSettledStateWhileSilent WITHOUT disposing/creating voices
  // (already fresh) and WITHOUT touching the group gain (the crossfade drives audibility).
  settleNewMoonDeckWhileSilent(silentTime, snapRamp, transitionSnapshot = null, options = {}) {
    const { deferDecorativeBuildup = false } = options
    const effectiveTonalAmount = transitionSnapshot?.effectiveTonalAmount ?? this.getEffectiveTonalAmount()

    if (transitionSnapshot?.breathStartTime != null) {
      this.breathStartTime = transitionSnapshot.breathStartTime
      this.lastBreathUpdateTime = 0
    } else {
      this.resetBreathPhaseToAnchor()
    }

    this.startAirBreathNoise(silentTime)

    this.applyIntensity(true, snapRamp)
    this.applyVolume(snapRamp)
    this.applyVoicePanning(snapRamp)
    this.applyProjectionNodes(snapRamp)
    this.snapParam(this.filter.frequency, this.getTonalFilterFrequency(effectiveTonalAmount), silentTime)
    this.snapParam(this.filter.Q, this.getTonalFilterQ(effectiveTonalAmount), silentTime)
    this.applyChoirEnsembleMix(effectiveTonalAmount, snapRamp)

    if (this.isMoodActive()) {
      this.applyMoodToneNodes(snapRamp, silentTime)
    } else {
      this.neutralizeMoodModulation(0)
    }

    // Decorative AIR breath noise + reverb wet are NOT settled to full while the deck is
    // silent: the convolver would accumulate a full-strength tail (especially Io's airy
    // shimmer) that is revealed as a "whoosh" the instant the output crossfade opens.
    // Hold them at 0 here; startFullChainCrossfade ramps them in from the shared crossfade
    // start so the tail builds with the audible signal instead of pre-charging.
    if (deferDecorativeBuildup) {
      this.snapParam(this.reverb.wet, 0, silentTime)

      if (this.airBreathGain) {
        this.snapParam(this.airBreathGain.gain, 0, silentTime)
      }
    } else {
      this.applyReverbWet(snapRamp)

      if (!this.isSterileDiagnosticActive()) {
        this.applyAirBreathNoiseModulation(snapRamp)
      }
    }

    this.voices.forEach((voice, index) => {
      voice.targetGain = this.getVoiceTargetGain(index, effectiveTonalAmount)
      this.setVoiceFrequency(voice, this.getVoiceFrequency(index), silentTime, { rampSeconds: 0 })
      this.startVoiceOscillators(voice, silentTime, index)
      this.snapParam(voice.gain.gain, voice.targetGain, silentTime)
    })
    this.hasStarted = true

    this.prepareMoodAuxiliaryLayersForStart(silentTime)
    this.updateOrbitPairFrequency(0)
    this.startOrbitOscillators(silentTime)
    this.updateDualBeatsFrequency(0)
    this.startDualBeatsOscillators(silentTime)

    if (this.isMoodActive()) {
      this.rampMoodAuxiliaryLayersToTarget(snapRamp, silentTime)
    }

    if (transitionSnapshot?.moodStartTime != null) {
      this.moodStartTime = transitionSnapshot.moodStartTime
    } else {
      this.moodStartTime = window.performance.now()
    }

    this.lastMoodUpdateTime = 0
    this.startMoodLoop({ skipInitialSync: transitionSnapshot?.moodStartTime != null })

    if (this.getBreathAmount() > 0) {
      this.startBreathLoop()
    }

    this.startStringsDrift()
  }

  performFullChainMoonCrossfade(previousPresetName) {
    if (!this.isReady || !this.isPlaying) {
      return
    }

    this.fullChainTransitionNumber += 1

    const cfg = this.getFullChainCrossfadeConfig()
    const totalSeconds = cfg.totalSeconds ?? 1.5
    const disposeGuardSeconds = cfg.disposeGuardSeconds ?? 0.25
    const reverbReadyMaxWaitSeconds = cfg.reverbReadyMaxWaitSeconds ?? 3
    const snapRamp = MOON_TRANSITION.simpleFade?.settleSnapSeconds ?? 0.004

    this.logTransitionDiagnostic('full-chain-crossfade:begin', {
      from: previousPresetName,
      to: this.currentPreset.name,
      totalSeconds,
      curve: cfg.curve ?? 'equalPower',
      centerHeadroomDb: cfg.centerHeadroomDb ?? 0,
      transitionNumber: this.fullChainTransitionNumber,
    })

    // Retire/dispose any in-flight old decks (including limbo decks waiting on reverb IR).
    this.abandonInFlightFullChainTransition()

    // Tear down leftover masked/morph state so nothing fights the crossfade. NOTE: we do NOT
    // touch moonTransitionGain here (no rampMoonGroupGain / resetMoonTransitionGroupGain) — in
    // full-chain mode the whole-drone fader must never duck the drone; the old deck holds at
    // unity until the new deck is ready, then the two decks crossfade against each other.
    this.clearSimpleMoonTransitionTimeout()
    this.clearMoonTransitionBloomResetTimeout()
    this.clearNoteCrossfadeTimeouts()
    this.clearMoonTransitionIsolationProbes()
    this.clearBinauralUndertoneDeferredTimeouts()
    this.clearStringsDriftResumeTimeout()
    this.clearStringsHighRegisterAirReanchorTimeout()
    this.clearMoonEntryMorphCompletionTimeout()
    this.pendingMoonVoiceRebuildCrossfade = false
    this.moonTransitionBusSnapshot = null
    this.moonVoiceCrossfadePlan = null
    this.moonAuxLayerCrossfadeActive = false
    this.moonAuxLayerCrossfadeUntil = 0
    this.moonTransitionContext = null
    this.moonTransitionAuxHandoffUntil = 0
    this.moonEntryBreathMorphUntil = 0
    this.moonTransitionBreathSnapshot = null

    // Capture live modulation state from the outgoing deck before freezing it.
    const transitionSnapshot = this.captureFullChainTransitionSnapshot()

    // 1) Freeze the current Moon's modulation so its frozen chain stays stable while audible.
    this.pauseBreathLoop()
    this.stopMoodLoop()
    this.stopStringsDrift()

    // 2) Capture the current chain as the old deck, silence its bloom bus, and register it
    //    immediately so rapid Moon changes cannot strand it outside the retire list.
    const oldDeck = this.captureCurrentDroneDeck()
    this.prepareCapturedCrossfadeDeck(oldDeck)

    const ctx = {
      oldDeck,
      limboEntry: null,
      newFadeGain: null,
      newReverb: null,
      oldConnected: true,
      newConnected: false,
      reverbReady: false,
      reverbReadyTimeoutId: null,
      probeTimeoutIds: [],
      oldRampStartTime: null,
      newRampStartTime: null,
      from: previousPresetName,
      to: this.currentPreset.name,
      transitionNumber: this.fullChainTransitionNumber,
      transitionSnapshot,
    }
    this.fullChainTransitionContext = ctx
    ctx.limboEntry = this.registerLimboCrossfadeDeck(oldDeck)
    this.logFullChainProbe('old-deck-captured', { from: ctx.from, to: ctx.to }, ctx)
    this.logFullChainResourceDiagnostics('old-deck-captured', {}, ctx)

    // 3) Detach this.* and rebuild a brand-new complete chain for the new Moon. Null the
    //    fields whose builders guard against an existing instance so they truly rebuild.
    this.isReady = false
    this.hasStarted = false
    this.orbitStarted = false
    this.dualBeatsStarted = false
    this.airBreathStarted = false
    this.orbitPair = null
    this.dualBeats = null
    this.airBreathGain = null
    this.airBreathNoise = null
    this.airBreathHighpass = null
    this.airBreathLowpass = null
    this.moonTransitionSendGain = null
    this.moonTransitionHighpass = null
    this.moonTransitionDampLowpass = null
    this.moonTransitionReverb = null
    this.moonTransitionBloomGain = null
    this.voices = []

    // Clear guards so the settle apply* calls below are not short-circuited.
    this.presetTransitionEndsAt = 0
    this.noteCrossfadeEndsAt = 0
    this.startupFadeEndsAt = 0
    this.stopFadeEndsAt = 0
    this.binauralUndertonesHeldSilent = false

    this.ensureSignalChain()

    // The fresh moonTransitionGain (created by ensureSignalChain) is the NEW deck's fade gain,
    // already connected to masterPreLowShelf. Snap it silent before settling.
    ctx.newFadeGain = this.moonTransitionGain
    ctx.newReverb = this.reverb
    ctx.newConnected = true

    const silentTime = Tone.now()
    if (this.moonTransitionGain) {
      this.snapParam(this.moonTransitionGain.gain, 0, silentTime)
    }

    // Hold breath/intensity off the new deck's voice gains AND deferred AIR until the
    // crossfade actually starts. ensureSignalChain → settle starts the breath loop, but the
    // reverb-IR wait below can last up to reverbReadyMaxWaitSeconds; without this provisional
    // guard the breath loop would re-charge the deferred AIR/reverb during that silent wait.
    // startFullChainCrossfade overwrites this with the exact (startAt + duration) value.
    ctx.deferDecorativeBuildup = true
    this.fullChainCrossfadeVoiceHoldUntil = Tone.now() + reverbReadyMaxWaitSeconds + totalSeconds + 0.1

    // 4) Settle the new chain (already built + connected) to the new Moon's normal sound while
    //    it is silent: voices started, aux running, EQ/width/trim at settled targets. Decorative
    //    AIR breath noise + reverb wet are held at 0 and ramped in from the crossfade start.
    this.settleNewMoonDeckWhileSilent(silentTime, snapRamp, transitionSnapshot, {
      deferDecorativeBuildup: true,
    })
    this.logFullChainSettleDiagnostics('settle-silent', transitionSnapshot, ctx, silentTime)
    this.logFullChainProbe('new-deck-built-muted', {}, ctx)

    // 5) Keep the old deck fully audible until the new reverb IR has rendered (a ConvolverNode
    //    with no buffer is silent), THEN crossfade both decks from one identical start time.
    const newReverb = this.reverb
    let started = false
    const begin = (reverbReady) => {
      if (started) {
        return
      }

      started = true

      if (ctx.reverbReadyTimeoutId != null) {
        window.clearTimeout(ctx.reverbReadyTimeoutId)
        ctx.reverbReadyTimeoutId = null
      }

      ctx.reverbReady = reverbReady
      this.logFullChainProbe('new-deck-ready', {}, ctx)
      this.logFullChainResourceDiagnostics('new-deck-ready', { reverbReady }, ctx)
      this.startFullChainCrossfade(oldDeck, ctx, totalSeconds, disposeGuardSeconds)
    }

    Promise.resolve(newReverb?.ready)
      .then(() => begin(true))
      .catch(() => begin(false))
    // Safety net: never strand the old deck at unity if .ready somehow never settles.
    ctx.reverbReadyTimeoutId = window.setTimeout(() => begin(false), reverbReadyMaxWaitSeconds * 1000)
  }

  // Begin the actual A/B crossfade: old deck 1 → 0 and new deck 0 → 1, scheduled from ONE
  // identical audioContext start time over the same duration. Only reached once the new deck
  // is fully built, connected at gain 0, and its reverb IR is ready.
  startFullChainCrossfade(oldDeck, ctx, totalSeconds, disposeGuardSeconds) {
    // Bail if a newer transition or Stop superseded this one during the ready wait.
    if (this.reverb !== ctx.newReverb || !this.isPlaying) {
      this.disposeCrossfadeDeck(oldDeck)
      ctx.oldConnected = false
      this.logFullChainProbe('crossfade-superseded', {}, ctx)
      this.logFullChainResourceDiagnostics('crossfade-superseded', {}, ctx)
      return
    }

    const entry = ctx.limboEntry
      ?? this.fullChainCrossfadeDecks.find((candidate) => candidate.deck === oldDeck)

    if (entry) {
      entry.limbo = false
    }

    // Single shared start time + duration for BOTH decks (no gap, true overlap).
    const startAt = Tone.now() + 0.02
    ctx.oldRampStartTime = startAt
    ctx.newRampStartTime = startAt
    this.fullChainCrossfadeVoiceHoldUntil = startAt + totalSeconds + 0.05

    this.rampFullChainCrossfade(oldDeck.fadeGain?.gain, this.moonTransitionGain?.gain, totalSeconds, startAt)

    // Ramp the deferred decorative energy (AIR breath noise + reverb wet) in from the SAME
    // shared start time over the crossfade window, so the new Moon's airy shimmer / reverb
    // tail builds with the audible signal instead of being revealed pre-charged. Voice hold
    // (above) keeps the breath loop from fighting these ramps until the crossfade completes.
    if (ctx.deferDecorativeBuildup) {
      if (this.reverb?.wet) {
        this.holdAudioParamAtTime(this.reverb.wet, startAt)
        this.reverb.wet.setValueAtTime(0, startAt)
        this.reverb.wet.linearRampToValueAtTime(this.getReverbWet(), startAt + totalSeconds)
      }

      if (this.airBreathGain && !this.isSterileDiagnosticActive()) {
        const airTarget = this.getAirBreathNoiseTargetGain()
        this.holdAudioParamAtTime(this.airBreathGain.gain, startAt)
        this.airBreathGain.gain.setValueAtTime(0, startAt)
        this.airBreathGain.gain.linearRampToValueAtTime(airTarget, startAt + totalSeconds)
      }
    }

    this.logFullChainSettleDiagnostics('crossfade-start', ctx.transitionSnapshot, ctx, startAt)
    this.logFullChainProbe('crossfade-start', {
      startAt: Number(startAt.toFixed(4)),
      totalSeconds,
    }, ctx)
    this.logFullChainResourceDiagnostics('crossfade-start', { startAt: Number(startAt.toFixed(4)) }, ctx)

    const scheduleProbe = (delaySeconds, label) => {
      const timeoutId = window.setTimeout(() => {
        this.logFullChainProbe(label, {}, ctx)
        if (label === 'crossfade-midpoint') {
          this.logFullChainResourceDiagnostics('crossfade-midpoint', {}, ctx)
        }

        if (label === 'crossfade-end') {
          this.logFullChainSettleDiagnostics('crossfade-end', ctx.transitionSnapshot, ctx)
        }
      }, delaySeconds * 1000)

      ctx.probeTimeoutIds.push(timeoutId)

      if (entry) {
        entry.probeTimeoutIds.push(timeoutId)
      }
    }

    scheduleProbe(0.02 + totalSeconds / 2, 'crossfade-midpoint')
    scheduleProbe(0.02 + totalSeconds + 0.02, 'crossfade-end')

    if (entry) {
      entry.disposeTimeoutId = window.setTimeout(() => {
        entry.disposeTimeoutId = null
        const idx = this.fullChainCrossfadeDecks.indexOf(entry)
        if (idx >= 0) {
          this.fullChainCrossfadeDecks.splice(idx, 1)
        }

        this.disposeCrossfadeDeck(oldDeck)
        ctx.oldConnected = false
        this.logFullChainProbe('old-deck-disposed', {}, ctx)
        this.logFullChainResourceDiagnostics('old-deck-disposed', { oldDeckDisposed: true }, ctx)

        if (this.fullChainTransitionContext === ctx) {
          this.clearFullChainTransitionContext(ctx)
          this.fullChainTransitionContext = null
        }
      }, (0.02 + totalSeconds + disposeGuardSeconds) * 1000)
      return
    }

    // Fallback if limbo entry was lost — still dispose, but log the anomaly.
    window.setTimeout(() => {
      this.disposeCrossfadeDeck(oldDeck)
      ctx.oldConnected = false
      this.logFullChainResourceDiagnostics('old-deck-disposed-fallback', { oldDeckDisposed: true }, ctx)
    }, (0.02 + totalSeconds + disposeGuardSeconds) * 1000)
  }

  isBinauralPreset() {
    return this.currentPreset.name === 'Binaural'
  }

  isBinauralUndertoneVoice(index) {
    return this.isBinauralPreset()
      && (index === FOUNDATION_ROOT_VOICE_INDEX || index === BINAURAL_RIGHT_VOICE_INDEX)
  }

  usesFoundationRoot() {
    if (this.isBinauralPreset()) {
      return false
    }

    return this.currentPreset.name === 'Shruti' && this.currentOctave >= 4
  }

  usesCosmosConstantRoot() {
    return this.isCosmosPreset() && this.currentOctave !== LOW_REGISTER_OCTAVE
  }

  getVoicePan(index) {
    if (this.isBinauralPreset()) {
      if (index === FOUNDATION_ROOT_VOICE_INDEX) {
        return -BINAURAL_PAN_AMOUNT
      }

      if (index === BINAURAL_RIGHT_VOICE_INDEX) {
        return BINAURAL_PAN_AMOUNT
      }
    }

    if (this.isAirShimmerEnabled()) {
      const presetPan = AIR_SHIMMER_TUNING.presetVoicePan[this.currentPreset.name]

      if (presetPan?.[index] !== undefined) {
        return presetPan[index]
      }
    }

    return 0
  }

  getVoiceOscillatorType(index) {
    if (this.isStringsLayer(index)) {
      return 'custom'
    }

    if (this.isBinauralUndertoneVoice(index)) {
      return 'triangle'
    }

    const presetType = PRESET_VOICE_OSCILLATOR_TYPES[this.currentPreset.name]?.[index]

    if (presetType) {
      return presetType
    }

    return index === 1 || index === FOUNDATION_ROOT_VOICE_INDEX || index >= 3 ? 'sine' : 'triangle'
  }

  getPresetVoicePresenceMultiplier(index) {
    const registerScale = PRESET_REGISTER_VOICE_PRESENCE_MULTIPLIER[this.currentPreset.name]?.[this.currentOctave]?.[index]

    if (registerScale != null) {
      return registerScale
    }

    return PRESET_VOICE_PRESENCE_MULTIPLIER[this.currentPreset.name]?.[index] ?? 1
  }

  getAmbientBodyVoicingScale(index) {
    return AMBIENT_BODY_VOICING_SCALE[index] ?? 1
  }

  // Per-preset low-mid relief for Low/Medium registers only (data in
  // PRESET_LOW_MID_REGISTER_VOICING). Returns 1 for any preset/register/index not
  // listed, so High/Very High and unlisted presets are completely unchanged.
  getPresetLowRegisterVoiceScale(index) {
    const presetProfile = PRESET_LOW_MID_REGISTER_VOICING[this.currentPreset.name]

    if (!presetProfile) {
      return 1
    }

    const registerProfile = presetProfile[this.currentOctave]

    if (!registerProfile) {
      return 1
    }

    return registerProfile[index] ?? 1
  }

  getFoundationRootOctave() {
    // Shruti foundation only activates at High and Very High registers.
    // Low register keeps the foundation one octave below the −12 layer (index 0)
    // instead of Medium, which duplicated index 0 at High register.
    if (this.currentOctave >= HIGH_REGISTER_OCTAVE) {
      return LOW_REGISTER_OCTAVE
    }

    return MEDIUM_REGISTER_OCTAVE
  }

  getVoiceTargetGain(index, tonalAmount = this.getBaseTonalAmount(), includeBreath = true, breathCyclePosition = null) {
    const sterileActive = this.isSterileDiagnosticActive()
    const motionActive = includeBreath && !sterileActive && !this.isStringsIsolationBreathDisabled()

    if (this.isStringsIsolationPrinciplesOnly() && index > 2) {
      return 0
    }

    const breathMotion = motionActive
      ? (breathCyclePosition != null
        ? this.getBreathOffsetAtCyclePosition(breathCyclePosition)
        : this.getBreathOffset())
      : 0
    const exhaleAmount = motionActive
      ? (breathCyclePosition != null
        ? this.getBreathExhaleAmountAtCyclePosition(breathCyclePosition)
        : this.getBreathExhaleAmount())
      : 0

    if (this.binauralUndertonesHeldSilent && this.isBinauralUndertoneIndex(index)) {
      return 0
    }

    if (this.isBinauralUndertoneVoice(index)) {
      return BINAURAL_UNDERTONE_GAIN * this.getPresetRegisterVoiceGainScale(index)
    }

    if (index === BINAURAL_RIGHT_VOICE_INDEX && !this.isBinauralPreset()) {
      return 0
    }

    if (index === COSMOS_CELESTIAL_VOICE_INDEX) {
      return this.getCosmosExtensionGain(index, tonalAmount, COSMOS_CELESTIAL_GAIN, includeBreath)
        * this.getSpeakerEfficiencyCosmosExtensionScale()
    }

    if (index === COSMOS_SKY_ROOT_VOICE_INDEX) {
      return this.getCosmosExtensionGain(index, tonalAmount, COSMOS_SKY_ROOT_GAIN, includeBreath)
        * this.getSpeakerEfficiencyCosmosExtensionScale()
    }

    if (index === COSMOS_SKY_OCTAVE_VOICE_INDEX) {
      return this.getCosmosExtensionGain(index, tonalAmount, COSMOS_SKY_OCTAVE_GAIN, includeBreath)
        * this.getSpeakerEfficiencyCosmosExtensionScale()
    }

    if (index === FOUNDATION_ROOT_VOICE_INDEX) {
      if (sterileActive || (!this.usesCosmosConstantRoot() && !this.usesFoundationRoot())) {
        return 0
      }

      const voiceGain = this.currentPreset.voiceGains[1]
        * (PRESET_FOUNDATION_ROOT_GAIN[this.currentPreset.name] ?? FOUNDATION_ROOT_GAIN)
      const lowSettling = this.getLowFrequencySettling(tonalAmount)
      const rootPresence = FOUNDATION_PRESENCE.rootBase - lowSettling * FOUNDATION_PRESENCE.lowSettlingScale + breathMotion * BREATH_VOICE_MOTION_DEPTH
      const exhaleSoftening = 1 - exhaleAmount * BREATH_EXHALE_SOFTENING

      return voiceGain * rootPresence * exhaleSoftening * this.getShrutiVoiceGainScale(index, tonalAmount)
        * this.getIntensityLowEndScale(index, tonalAmount)
        * this.getSpeakerEfficiencyLowLayerScale(index)
        * this.getPresetLowRegisterVoiceScale(index)
        * this.getProjectionVoiceScale(index)
        * this.getMoodGainScale(index)
        * this.getPresetRegisterVoiceGainScale(index)
    }

    if (sterileActive && index > 2) {
      return 0
    }

    const voiceGain = this.currentPreset.voiceGains[index]
    const characterAmount = sterileActive ? 0 : this.getTonalCharacterAmount(tonalAmount)
    const focusAmount = sterileActive ? 0 : this.getHighIntensityFocus(tonalAmount)
    const lowSettling = sterileActive ? 0 : this.getLowFrequencySettling(tonalAmount)
    const cleanVoicingFocusScale = this.getHighVhCleanVoicingIntensityFocusScale(index)

    const {
      lowOctave,
      root,
      fifth,
      octave: octaveLayer,
      upperOctave,
      upperFifth,
    } = VOICE_LAYER_PRESENCE

    const breathVoiceScale = (layerIndex, layerBreathScale) => (
      this.getBreathVoicePresenceOffset(layerIndex, layerBreathScale, breathMotion)
    )

    const upperLayerPresence = [
      lowOctave.base - lowSettling * lowOctave.lowSettlingScale + breathVoiceScale(0, lowOctave.breathScale),
      root.base - lowSettling * root.lowSettlingScale + breathVoiceScale(1, root.breathScale),
      fifth.base + characterAmount * fifth.characterScale + focusAmount * fifth.focusScale + breathVoiceScale(2, fifth.breathScale),
      octaveLayer.base + characterAmount * octaveLayer.characterScale + focusAmount * octaveLayer.focusScale * cleanVoicingFocusScale + breathVoiceScale(3, octaveLayer.breathScale),
      upperOctave.base + characterAmount * upperOctave.characterScale + focusAmount * upperOctave.focusScale * cleanVoicingFocusScale + breathVoiceScale(4, upperOctave.breathScale),
      upperFifth.base + characterAmount * upperFifth.characterScale + focusAmount * upperFifth.focusScale * cleanVoicingFocusScale + breathVoiceScale(5, upperFifth.breathScale),
    ]
    const exhaleSoftening = this.getVoiceExhaleSoftening(index, exhaleAmount)
    let gain = voiceGain * upperLayerPresence[index] * this.getPresetVoicePresenceMultiplier(index) * exhaleSoftening

    if (this.isCosmosPreset() && index >= 3) {
      const cosmosFocusDamping = 1 - this.getCosmosHighIntensitySoftening(tonalAmount) * COSMOS_TUNING.layerFocusDamping
      const softenedPresence = index >= 4
        ? upperLayerPresence[index] * cosmosFocusDamping + upperLayerPresence[index] * (1 - cosmosFocusDamping) * COSMOS_TUNING.softenedPresenceMix
        : upperLayerPresence[index]

      gain = voiceGain * softenedPresence * exhaleSoftening * this.getCosmosUpperLayerSoftening(tonalAmount, index)
    }

    return gain * this.getShrutiVoiceGainScale(index, tonalAmount) * this.getIntensityLowEndScale(index, tonalAmount)
      * this.getSpeakerEfficiencyLowLayerScale(index) * this.getSpeakerEfficiencyUpperHarmonicScale(index)
      * this.getAmbientBodyVoicingScale(index) * this.getProjectionVoiceScale(index)
      * this.getPresetLowRegisterVoiceScale(index)
      * this.getMoodGainScale(index)
      * this.getHighVhCleanVoicingLayerScale(index)
      * this.getPresetRegisterVoiceGainScale(index)
  }

  getVoiceFrequency(index) {
    const rootMidi = this.getMidiNote(this.currentKey, this.currentOctave)
    const rootFrequency = this.midiToFrequency(rootMidi)

    if (this.isBinauralUndertoneVoice(index)) {
      const beatOffset = this.getBinauralBeatOffsetHz()

      if (index === FOUNDATION_ROOT_VOICE_INDEX) {
        return rootFrequency - beatOffset
      }

      return rootFrequency + beatOffset
    }

    if (index === FOUNDATION_ROOT_VOICE_INDEX) {
      if (this.usesCosmosConstantRoot()) {
        return this.midiToFrequency(this.getMidiNote(this.currentKey, LOW_REGISTER_OCTAVE))
      }

      return this.midiToFrequency(this.getMidiNote(this.currentKey, this.getFoundationRootOctave()))
    }

    if (index === BINAURAL_RIGHT_VOICE_INDEX) {
      return rootFrequency
    }

    if (index === COSMOS_CELESTIAL_VOICE_INDEX) {
      return this.midiToFrequency(rootMidi + COSMOS_CELESTIAL_INTERVAL)
    }

    if (index === COSMOS_SKY_ROOT_VOICE_INDEX) {
      return this.midiToFrequency(rootMidi + COSMOS_SKY_ROOT_INTERVAL)
    }

    if (index === COSMOS_SKY_OCTAVE_VOICE_INDEX) {
      return this.midiToFrequency(rootMidi + COSMOS_SKY_OCTAVE_INTERVAL)
    }

    return this.midiToFrequency(rootMidi + VOICE_INTERVALS[index])
  }

  getReverbWet() {
    const wet = this.currentReverbWet
    const {
      wetLowThreshold,
      wetLowScale,
      wetMidThreshold,
      wetMidBase,
      wetMidRange,
      wetMidCurvePower,
      wetHighBase,
      wetHighRange,
      wetHighCurvePower,
    } = REVERB_TUNING

    let engineWet

    if (wet <= wetLowThreshold) {
      engineWet = wet * wetLowScale
    } else if (wet <= wetMidThreshold) {
      engineWet = wetMidBase + ((wet - wetLowThreshold) / (wetMidThreshold - wetLowThreshold)) ** wetMidCurvePower * wetMidRange
    } else {
      engineWet = wetHighBase + ((wet - wetMidThreshold) / (1 - wetMidThreshold)) ** wetHighCurvePower * wetHighRange
    }

    return engineWet * (PRESET_REVERB_WET_SCALE[this.currentPreset.name] ?? 1)
  }

  getReverbDecay() {
    const presetReverb = this.currentPreset.reverb

    return Math.min(REVERB_TUNING.decayMax, presetReverb.decay * REVERB_TUNING.decayMultiplier)
  }

  getReverbPreDelay() {
    const presetReverb = this.currentPreset.reverb

    return Math.min(REVERB_TUNING.preDelayMax, presetReverb.preDelay + REVERB_TUNING.preDelayOffset)
  }

  getContextState() {
    return Tone.getContext().rawContext.state
  }

  // Snapshot of metronome-relevant state for tap-time diagnostics (read from the UI handler).
  // metronomeChainReady is a Promise|null, so we report its type rather than the object itself.
  getMetronomeDiagnostics() {
    return {
      metronomePlaying: this.metronomePlaying === true,
      schedulerActive: Boolean(this.metronomeTimer),
      beatsScheduled: this.metronomeBeatsScheduledTotal ?? 0,
      primerPlaying: isPrimerPlaying(),
      contextState: this.getContextState(),
      metronomeChainReady: this.metronomeChainReady == null ? 'null' : typeof this.metronomeChainReady,
      metronomeChainReadyTruthy: !!this.metronomeChainReady,
      isReady: this.isReady === true,
      masterChainReady: this.masterChainReady === true,
      isStarting: this.isStarting === true,
    }
  }

  // Attach once. Watches the raw AudioContext for the iOS-only "interrupted" state
  // (phone call, another app taking audio focus, Siri). On a genuine interruption we
  // reset playback cleanly and notify the UI — we do NOT auto-resume or fight for focus.
  // Normal lock-screen backgrounding keeps the context "running" (UIBackgroundModes audio),
  // and ordinary "suspended" transitions are left to the existing lifecycle-resume path.
  ensureContextStateWatcher() {
    if (this.contextStateWatcherAttached) {
      return
    }

    const rawContext = Tone.getContext().rawContext

    if (!rawContext || typeof rawContext.addEventListener !== 'function') {
      return
    }

    rawContext.addEventListener('statechange', () => {
      this.handleContextStateChange(rawContext.state)
    })

    this.contextStateWatcherAttached = true
  }

  handleContextStateChange(state) {
    if (state !== 'interrupted') {
      return
    }

    if (this.shouldDeferContextInterruptHandling()) {
      this.scheduleContextInterruptRecovery('context-interrupted')
      return
    }

    this.handleNativeAudioInterruption('context-interrupted')
  }

  shouldDeferContextInterruptHandling() {
    return isMediaPrimerStartupActive() || this.metronomePlaying === true
  }

  // Called when the AudioContext is confirmed running again. Clears the metronome recovery
  // deadline and flags the scheduler to resync from "now" on its next tick (so we resume from
  // the next beat rather than replaying beats scheduled against the frozen/old clock).
  onMetronomeContextRecovered() {
    this.metronomeContextRecoveryDeadline = 0

    if (!this.metronomePlaying) {
      return
    }

    // Only resync if the scheduler ACTUALLY stalled (scheduleMetronomeBeats hit the paused branch
    // and set metronomeContextStallLogged). A stale/early recovery from the startup window fires
    // while the context is already running and the scheduler never paused — resyncing then resets
    // nextMetronomeBeatTime and produces the audible early/double click. Ignore it.
    if (!this.metronomeContextStallLogged) {
      audioDiag('metronome-engine', 'metronome recovery ignored — startup already stable', {
        contextState: this.getContextState(),
      })
      return
    }

    this.metronomeNeedsResync = true
    audioDiag('metronome-engine', 'metronome context recovered — scheduler will resync from next beat', {
      contextState: this.getContextState(),
    })
  }

  scheduleContextInterruptRecovery(reason) {
    // Recovery deadline applies whenever audio is active (drone OR metronome): retry recovery up to
    // the deadline before falling back to a hard reset, instead of hard-resetting on first failure.
    if ((this.metronomePlaying || this.isPlaying) && !this.metronomeContextRecoveryDeadline) {
      this.metronomeContextRecoveryDeadline = Date.now() + 5000
    }

    // Health: an interruption was observed and a (shared, debounced) recovery is queued. Lightweight
    // start paths must not be used until this settles back to stable.
    setAudioHealth(AudioHealth.INTERRUPTED, `interrupt:${reason}`)

    audioDiag('startup-guard', 'context-interrupted debounce begin', {
      reason,
      contextState: this.getContextState(),
      startupGuardActive: isMediaPrimerStartupActive(),
      metronomePlaying: this.metronomePlaying === true,
    })

    if (this.contextInterruptDebounceTimer) {
      window.clearTimeout(this.contextInterruptDebounceTimer)
    }

    this.contextInterruptDebounceTimer = window.setTimeout(() => {
      this.contextInterruptDebounceTimer = null
      void this.attemptContextInterruptRecovery(reason)
    }, 1000)
  }

  async attemptContextInterruptRecovery(reason = 'context-interrupted') {
    if (this.contextInterruptRecoveryInFlight) {
      return false
    }

    this.contextInterruptRecoveryInFlight = true
    setAudioHealth(AudioHealth.RECOVERING, `recover:${reason}`)

    try {
      const stateBefore = this.getContextState()

      if (stateBefore === 'running') {
        audioDiag('startup-guard', 'context-interrupted recovered', { reason, alreadyRunning: true })
        this.markAudioHealthStableSoon('recovered-already-running')
        this.onMetronomeContextRecovered()
        return true
      }

      // Backgrounded/locked with an interrupted context: do NOT run aggressive recovery loops here.
      // While hidden, native session activation routinely fails ("Session activation failed") and a
      // forced recovery would either churn or falsely mark stable. Defer until the app resumes — the
      // resume health check recovers once and verifies actual running state before stable. (Audio
      // that is genuinely still running already returned above.)
      if (typeof document !== 'undefined' && document.hidden) {
        audioDiag('startup-guard', 'background recovery deferred until resume', {
          reason,
          stateBefore,
        })
        return false
      }

      if (isMediaPrimerStartupActive()) {
        audioDiag('startup-guard', 'primer kept alive during startup', {
          reason,
          stateBefore,
          phase: 'recovery-attempt',
        })
      }

      await this.resumeContextIfNeeded()
      // Reassert native session, throttled — avoid configure spam during the recovery retry loop.
      await configureNativePlaybackSession('context-recovery', { throttle: true })

      const stateAfter = this.getContextState()

      if (stateAfter === 'running') {
        audioDiag('startup-guard', 'context-interrupted recovered', { reason, stateAfter })
        this.markAudioHealthStableSoon('recovered')
        this.onMetronomeContextRecovered()
        return true
      }

      if (isMediaPrimerStartupActive()) {
        audioDiag('startup-guard', 'context still interrupted during startup guard — deferring hard reset', {
          reason,
          stateAfter,
        })
        return false
      }

      // Audio active (drone OR metronome): debounce + retry recovery until the deadline. The
      // metronome scheduler pauses ticks (does not schedule against a frozen clock) until the
      // context is back. Only after the recovery window clearly fails do we hard-reset.
      if (this.metronomePlaying || this.isPlaying) {
        const now = Date.now()

        if (now < this.metronomeContextRecoveryDeadline) {
          audioDiag('metronome-engine', 'context still interrupted — audio recovery retry (no hard reset yet)', {
            reason,
            stateAfter,
            droneIsPlaying: this.isPlaying,
            metronomePlaying: this.metronomePlaying,
            msRemaining: this.metronomeContextRecoveryDeadline - now,
          })
          this.scheduleContextInterruptRecovery(reason)
          return false
        }

        audioDiag('metronome-engine', 'audio context recovery timed out — hard reset', { reason, stateAfter })
        this.metronomeContextRecoveryDeadline = 0
      }

      audioDiag('startup-guard', 'hard reset after failed recovery', {
        reason,
        stateAfter,
      })
      this.handleNativeAudioInterruptionConfirmed(reason)
      return false
    } finally {
      this.contextInterruptRecoveryInFlight = false
    }
  }

  isDeferredStartupInterruption(reason) {
    if (!isMediaPrimerStartupActive()) {
      return false
    }

    return reason === 'interruption-began'
      || reason === 'context-interrupted'
      || reason === 'native'
  }

  // Single entry point for "iOS took our audio focus" — reached from the AudioContext
  // 'interrupted' state watcher AND from the native AVAudioSession interruption plugin.
  handleNativeAudioInterruption(reason = 'native') {
    if (reason === 'media-services-reset') {
      this.handleNativeAudioInterruptionConfirmed(reason)
      return
    }

    if (this.isDeferredStartupInterruption(reason)) {
      if (reason === 'interruption-began') {
        audioDiag('startup-guard', 'interruption-began ignored/deferred during media-primer startup', { reason })
      } else {
        audioDiag('startup-guard', 'interruption ignored/deferred during media-primer startup', { reason })
      }
      this.scheduleContextInterruptRecovery(reason)
      return
    }

    // Audio active (drone OR metronome), after startup guard: do not hard-reset immediately.
    // Debounce and try to recover the AudioContext via the shared recovery path; the metronome
    // scheduler pauses ticks while interrupted and resyncs on recovery. This is what stops a
    // transient interruption (e.g. around metronome stop, or a background blip) from killing the
    // drone — only a recovery that fails past the deadline hard-resets.
    if ((this.metronomePlaying || this.isPlaying)
      && (reason === 'interruption-began' || reason === 'context-interrupted' || reason === 'native')) {
      audioDiag('metronome-engine', 'background interruption while audio active — recovery deferred, no hard reset', {
        reason,
        droneIsPlaying: this.isPlaying,
        metronomePlaying: this.metronomePlaying,
        contextState: this.getContextState(),
      })
      this.scheduleContextInterruptRecovery(reason)
      return
    }

    // Nothing is supposed to be playing (idle, between Stop and the next Play). A native prewarm /
    // session-assert can emit an interruption here — that must NOT hard-reset and dispose the graph
    // (doing so caused a clip/pop on the next Play). Leave the (silent) graph intact; the next Play
    // resumes the context via resumeContextIfNeeded(). media-services-reset is handled above and
    // still hard-resets because it genuinely invalidates the nodes.
    if (!this.isPlaying && !this.metronomePlaying && !this.isStarting) {
      // Context may now be interrupted/suspended even though we left the graph intact. Mark health
      // uncertain so the next Play uses a safe (non-lightweight) start path that re-verifies.
      setAudioHealth(AudioHealth.UNCERTAIN, `idle-interrupt:${reason}`)
      audioDiag('interruption', 'native interruption while idle — ignored (no hard reset)', {
        reason,
        contextState: this.getContextState(),
        isReady: this.isReady,
      })
      return
    }

    this.handleNativeAudioInterruptionConfirmed(reason)
  }

  handleNativeAudioInterruptionConfirmed(reason = 'native') {
    if (isMediaPrimerStartupActive()) {
      audioDiag('startup-guard', 'hard reset blocked during startup guard', { reason })
      return
    }

    const wasPlaying = this.isPlaying
    const wasMetronomePlaying = this.metronomePlaying

    if (!wasPlaying && !wasMetronomePlaying && !this.isReady && !this.masterChainReady) {
      return
    }

    // Health: a confirmed interruption tore down the graph. Treat as failed so the next start does
    // a full safe startup rather than trusting a stale running/ready snapshot.
    setAudioHealth(AudioHealth.FAILED, `hard-reset:${reason}`)

    console.warn('[Moondrone audio-interruption] iOS pulled audio focus — hard reset', {
      reason,
      wasPlaying,
      wasMetronomePlaying,
    })

    this.hardResetAudioGraph(reason)

    if ((wasPlaying || wasMetronomePlaying) && this.onPlaybackInterrupted) {
      try {
        this.onPlaybackInterrupted({ wasPlaying, wasMetronomePlaying })
      } catch {
        // A UI hook failure must never break audio teardown.
      }
    }
  }

  // Kill all audio immediately and dispose the graph so the next Play starts from a fresh,
  // silent chain. This is what prevents the loud pop/burst when returning from a background
  // interruption: stale Tone nodes, scheduled ramps, and suspended oscillators are destroyed
  // rather than resumed. Next Play rebuilds via ensureSignalChain()/ensureMetronomeChain().
  hardResetAudioGraph(reason = 'interruption') {
    audioDiag('hard-reset', `begin (${reason})`, {
      contextState: this.getContextState(),
      wasPlaying: this.isPlaying,
      wasMetronomePlaying: this.metronomePlaying,
      isReady: this.isReady,
    })

    // 1. Mute the final output first so the teardown itself cannot click.
    try {
      if (this.masterFinalOutputTrim) {
        this.masterFinalOutputTrim.volume.cancelScheduledValues(Tone.now())
        this.masterFinalOutputTrim.mute = true
      }
    } catch {
      // Output may already be torn down; ignore.
    }

    // 2. Dispose metronome graph (its nodes point at the master limiter we are about to drop).
    this.disposeMetronomeChain()

    // 3. Dispose the drone graph + master stage. disposeForDiagnostics() first calls
    //    stopForLifecycle() (cancels ramps/timers, zeros voice gains), then disposes every node
    //    and sets isReady=false / hasStarted=false / voices=[] / masterChainReady=false.
    this.disposeForDiagnostics()

    audioDiag('hard-reset', `end (${reason})`, { contextState: this.getContextState() })
  }

  // Dispose the metronome signal chain and reset its build latch so the next startMetronome()
  // rebuilds fresh nodes (the old ones were wired to a now-disposed master limiter).
  disposeMetronomeChain() {
    this.stopMetronome()

    const nodes = [
      this.metronomeFallbackOsc,
      this.metronomeFallbackVolume,
      this.metronomeTrim,
      this.metronomePresenceEq,
      this.metronomeClickEq,
      this.metronomeSoftClip,
      this.metronomeGain,
    ]

    Object.values(this.metronomePlayerPools ?? {}).forEach((players) => {
      players?.forEach((player) => nodes.push(player))
    })

    nodes.forEach((node) => {
      try {
        node?.dispose()
      } catch {
        // Partial teardown is fine; we null everything below.
      }
    })

    this.metronomePlayerPools = null
    this.metronomeTrim = null
    this.metronomePresenceEq = null
    this.metronomeClickEq = null
    this.metronomeSoftClip = null
    this.metronomeGain = null
    this.metronomeFallbackOsc = null
    this.metronomeFallbackVolume = null
    this.metronomeUsesSampleFallback = false
    this.metronomeChainReady = null
  }

  // Lifecycle-only AudioContext wake — does not start playback, rebuild voices, or retune.
  // Returns diagnostic fields for iOS background-audio lifecycle resume logging.
  async resumeAudioContextForLifecycle() {
    const context = Tone.getContext()
    const rawContext = context.rawContext
    const stateBefore = rawContext?.state ?? 'unknown'

    if (stateBefore === 'closed') {
      return {
        attempted: false,
        stateBefore,
        stateAfter: stateBefore,
        resumed: false,
        error: null,
        blocked: true,
      }
    }

    if (stateBefore === 'running') {
      return {
        attempted: false,
        stateBefore,
        stateAfter: stateBefore,
        resumed: false,
        error: null,
        blocked: false,
      }
    }

    try {
      if (typeof context.resume === 'function') {
        await context.resume()
      } else if (typeof rawContext?.resume === 'function') {
        await rawContext.resume()
      }

      const stateAfter = this.getContextState()
      const blocked = stateAfter !== 'running'

      return {
        attempted: true,
        stateBefore,
        stateAfter,
        resumed: stateAfter === 'running',
        error: null,
        blocked,
      }
    } catch (error) {
      const stateAfter = this.getContextState()

      return {
        attempted: true,
        stateBefore,
        stateAfter,
        resumed: false,
        error: error?.message ?? String(error),
        blocked: true,
      }
    }
  }

  async resumeContextIfNeeded() {
    await this.resumeAudioContextForLifecycle()
  }

  applyPreset(previousPresetName = this.currentPreset.name) {
    // Moon changes while playing run through one of two transition modes (selectable via
    // moondroneDebug.setMoonTransitionMode):
    //   'fullChainCrossfade' (default) – build a complete second chain for the new Moon and equal-power
    //                          crossfade the two complete chains' outputs (no shared moving bus).
    //   'masked'             – stable fade-down → silent rebuild → fade-up on one group fader.
    // Note/register transitions and the stopped-rebuild path below are unchanged in both modes.
    if (this.isPlaying && previousPresetName !== this.currentPreset.name) {
      const fullChain = this.moonTransitionMode === 'fullChainCrossfade'

      if (this.fullChainCrossfadeDebug) {
        console.log('[Moondrone full-chain:transition-request]', {
          from: previousPresetName,
          to: this.currentPreset.name,
          mode: this.moonTransitionMode,
          pathTaken: fullChain ? 'fullChainCrossfade' : 'masked-simple',
          maskedSimpleBypassed: fullChain,
        })
      }

      if (fullChain) {
        this.performFullChainMoonCrossfade(previousPresetName)
        return
      }

      if (MOON_TRANSITION.simpleFade?.enabled) {
        this.performSimpleMoonTransition(previousPresetName)
        return
      }
    }

    const enteringBinaural = this.isBinauralPreset() && previousPresetName !== 'Binaural'
    const leavingBinaural = previousPresetName === 'Binaural' && !this.isBinauralPreset()
    const binauralTransition = this.isPlaying && (enteringBinaural || leavingBinaural)
    const requiresVoiceRebuild = this.presetRequiresVoiceRebuild(previousPresetName)
    // A voice-rebuild moon change (Titan <-> Io etc.) drives every bus parameter over
    // the single unified aux morph window so the whole gesture lands together. Other
    // transitions keep the short legacy output ramp.
    const presetOutputRamp = this.isPlaying
      ? (requiresVoiceRebuild ? MOON_TRANSITION.auxMorphSeconds : this.getPresetTransitionRampSeconds())
      : TRANSITION_TUNING.volumeRampSeconds
    // Voice-coupled identity/body params land with the voice crossfade, not over the
    // 5.5s atmosphere window, so the incoming moon's resonance/EQ is present when its
    // voices are. Clamped to bodyMorphSeconds so it never lags the voices.
    const presetBodyRamp = this.isPlaying && requiresVoiceRebuild
      ? this.getMoonBodyMorphSeconds()
      : presetOutputRamp
    const transitionPath = !this.isPlaying
      ? 'stopped'
      : requiresVoiceRebuild
        ? 'voice-rebuild-crossfade'
        : 'preset-voice-transitions'

    if (this.isPlaying) {
      this.beginPresetTransitionDebug(previousPresetName, this.currentPreset.name, transitionPath, {
        presetOutputRamp,
        requiresVoiceRebuild,
      })
      this.captureMoonTransitionBreathSnapshot()
      if (requiresVoiceRebuild) {
        this.pendingMoonVoiceRebuildCrossfade = true
        this.captureMoonTransitionBusSnapshot()
      }
      this.beginMoonChangeDiagnostics(previousPresetName, this.currentPreset.name, transitionPath)
      this.armPresetTransitionGuard(requiresVoiceRebuild)

      if (this.metronomePlaying) {
        this.primeMetronomeSchedule()
      }
    }

    // Binaural is transition-compatible with other Moons: same Tone Lab, AIR, master
    // output ramp, and limiter ceiling. Only undertones, Beat (no Phase/Mood),
    // and voice-role changes differ — all ramped over presetOutputRamp.
    this.pendingBinauralTransitionRamp = binauralTransition ? presetOutputRamp : null
    this.clearBinauralUndertoneDeferredTimeouts()

    this.logTransitionDiagnostic('applyPreset', {
      from: previousPresetName,
      to: this.currentPreset.name,
      presetOutputRamp,
      enteringBinaural,
      leavingBinaural,
      mood: this.mood,
      breathCyclePosition: this.getBreathCyclePosition(),
    })

    // Two coordinated windows for a voice-rebuild moon change:
    //  - Voice-coupled identity/body (presetBodyRamp): intensity-filter tonal target,
    //    output/balance trim, projection body gain, voice panning, and preset + Tone Lab
    //    bus EQ. These land with the voices so the new moon's resonance is present when
    //    its voices are.
    //  - Atmosphere/motion (presetOutputRamp == auxMorphSeconds): reverb ambience, plus
    //    the air/bloom/eclipse/orbit/dual layers scheduled in scheduleMoonAuxLayerCrossfade.
    this.applyIntensity(true, presetBodyRamp)
    this.applyReverbWet(this.isPlaying ? presetOutputRamp : REVERB_TUNING.sliderRampSeconds)
    this.applyVoicePanning(this.isPlaying ? presetBodyRamp : 0.5, {
      skipBinauralRoleIndices: binauralTransition,
    })
    this.applyVolume(presetBodyRamp)
    this.applyProjectionNodes(this.isPlaying ? presetBodyRamp : PROJECTION_TUNING.rampSeconds)

    if (this.isPlaying && requiresVoiceRebuild) {
      this.applyPresetBusEq(this.getBaseTonalAmount(), presetBodyRamp)
      this.applyToneLabBusEq(presetBodyRamp)
    }

    this.logTransitionDiagnostic('applyPreset-bus', {
      presetOutputRamp,
      requiresVoiceRebuild,
      busSnapshot: this.moonTransitionBusSnapshot,
    })

    if (requiresVoiceRebuild) {
      if (this.isPlaying) {
        this.rebuildVoicesWhilePlaying(previousPresetName)
        this.pendingBinauralTransitionRamp = null
        return
      }

      this.rebuildVoicesWhileStopped()
      this.reanchorBreathAfterContextChange()
      this.reanchorMood()
      this.pendingBinauralTransitionRamp = null
      this.endPresetTransitionDebug('stopped-rebuild')
      return
    }

    if (this.isPlaying) {
      this.applyPresetVoiceTransitions(this.getBaseTonalAmount(), previousPresetName)
      this.reanchorBreathAfterContextChange(presetOutputRamp)
      this.reanchorMood()
      this.pendingBinauralTransitionRamp = null
      return
    }

    this.voices.forEach((voice, index) => {
      voice.targetGain = this.getVoiceTargetGain(index)
      this.resetVoiceDetune(voice, index)
      this.setVoiceFrequency(voice, this.getVoiceFrequency(index), Tone.now())
    })

    this.reanchorBreathAfterContextChange()
    this.reanchorMood()
    this.pendingBinauralTransitionRamp = null
  }

  applyPresetVoiceTransitions(tonalAmount = this.getBaseTonalAmount(), previousPresetName = this.currentPreset.name) {
    const now = Tone.now()
    const silenceThreshold = 0.0005
    const transitionEnd = now + PRESET_LAYER_FADE_OUT_SECONDS + PRESET_LAYER_FADE_IN_SECONDS

    this.primeMetronomeSchedule()
    this.presetTransitionEndsAt = transitionEnd

    if (this.presetTransitionDebugContext) {
      this.schedulePresetTransitionAudioProbe('presetTransitionEndsAt', transitionEnd, {
        guard: 'presetTransitionEndsAt',
      })
      this.schedulePresetTransitionAudioProbe('preset-fade-out-end', now + PRESET_LAYER_FADE_OUT_SECONDS, {
        guard: 'preset-layer-fade-out',
      })
      this.schedulePresetTransitionAudioProbe('preset-fade-in-end', transitionEnd, {
        guard: 'preset-layer-fade-in',
      })
      this.schedulePresetTransitionAudioProbe('transition-settled', transitionEnd + 0.12, {
        guard: 'post-preset-transition',
      })
    }

    this.voices.forEach((voice, index) => {
      let nextTargetGain = this.getVoiceTargetGain(index, tonalAmount, false)
      const nextFrequency = this.getVoiceFrequency(index)
      const nextPan = this.getVoicePan(index)

      voice.targetGain = this.getVoiceTargetGain(index, tonalAmount)

      voice.gain.gain.cancelAndHoldAtTime(now)
      this.getPrimaryOscillator(voice).frequency.cancelAndHoldAtTime(now)

      const currentGain = voice.gain.gain.value
      const currentFrequency = this.getPrimaryOscillator(voice).frequency.value
      const frequencyChanging = Math.abs(currentFrequency - nextFrequency) > 1
      const deactivating = currentGain > silenceThreshold && nextTargetGain <= silenceThreshold
      const activating = currentGain <= silenceThreshold && nextTargetGain > silenceThreshold
      const retuning = frequencyChanging && nextTargetGain > silenceThreshold && !deactivating && !activating
      const morphAudibleRetune = retuning
        && currentGain > silenceThreshold
        && nextTargetGain > silenceThreshold

      let transitionKind = 'gain-ramp-only'

      if (this.shouldDeferBinauralUndertoneVoice(index, previousPresetName)) {
        transitionKind = this.isBinauralPreset() ? 'binaural-deferred-enter' : 'binaural-deferred-exit'
        this.binauralUndertonesHeldSilent = true
        this.fadeBinauralUndertoneSilentAtTransitionStart(voice, index, now)
        this.logPresetTransitionDebug('voice-transition', {
          index,
          transitionKind,
          currentGain,
          nextTargetGain: 0,
          nextFrequency,
          nextPan,
        })
        return
      }

      if (this.isBinauralVoiceRoleTransition(index, previousPresetName, 'deactivating')) {
        transitionKind = 'binaural-deactivate'
        this.deactivateBinauralUndertone(voice, index, nextFrequency, now, previousPresetName)
        this.logPresetTransitionDebug('voice-transition', {
          index,
          transitionKind,
          currentGain,
          nextTargetGain,
          nextFrequency,
          nextPan,
        })
        return
      }

      if (this.isBinauralVoiceRoleTransition(index, previousPresetName, 'activating')) {
        transitionKind = 'binaural-activate'
        this.activateBinauralUndertone(voice, index, nextFrequency, nextTargetGain, nextPan, now, previousPresetName)
        this.logPresetTransitionDebug('voice-transition', {
          index,
          transitionKind,
          currentGain,
          nextTargetGain,
          nextFrequency,
          nextPan,
        })
        return
      }

      if (morphAudibleRetune
        && this.isBinauralVoiceRoleTransition(index, previousPresetName, 'morphAudibleRetune')) {
        transitionKind = 'binaural-morph'
        this.morphBinauralVoiceRole(voice, index, nextFrequency, nextTargetGain, nextPan, now, previousPresetName)
        this.logPresetTransitionDebug('voice-transition', {
          index,
          transitionKind,
          currentGain,
          nextTargetGain,
          nextFrequency,
          nextPan,
        })
        return
      }

      this.resetVoiceDetune(voice, index)

      if (morphAudibleRetune) {
        transitionKind = 'morph-audible-retune'
        this.rampVoiceFrequencyTarget(voice, nextFrequency, PRESET_GAIN_RAMP_SECONDS, now)
        this.rampParam(voice.gain.gain, nextTargetGain, PRESET_GAIN_RAMP_SECONDS, now)
        this.logTransitionDiagnostic('preset-voice-morph', {
          index,
          from: previousPresetName,
          to: this.currentPreset.name,
          currentGain,
          nextTargetGain,
        })
        this.logPresetTransitionDebug('voice-transition', {
          index,
          transitionKind,
          currentGain,
          nextTargetGain,
          nextFrequency,
          nextPan,
        })
        return
      }

      if (deactivating) {
        transitionKind = 'deactivate'
        const fadeOutEnd = now + PRESET_LAYER_FADE_OUT_SECONDS

        voice.gain.gain.linearRampToValueAtTime(0, fadeOutEnd)
        this.setVoiceFrequency(voice, nextFrequency, fadeOutEnd)
        this.logPresetTransitionSnap(`deactivate:voice[${index}].gain`, voice.gain.gain, 0, fadeOutEnd)
        voice.gain.gain.setValueAtTime(0, fadeOutEnd)
        this.logPresetTransitionDebug('voice-transition', {
          index,
          transitionKind,
          currentGain,
          nextTargetGain,
          nextFrequency,
          nextPan,
          fadeOutEnd,
        })
        return
      }

      if (activating) {
        if (this.shouldDelayCosmosVoiceEnter(index, previousPresetName)) {
          transitionKind = 'cosmos-delayed-enter'
          this.setVoiceFrequency(voice, nextFrequency, now)
          this.logPresetTransitionSnap(`cosmos-delayed:voice[${index}].gain`, voice.gain.gain, 0, now)
          voice.gain.gain.setValueAtTime(0, now)
          const fadeInStart = now + PRESET_LAYER_FADE_OUT_SECONDS
          const fadeInEnd = fadeInStart + PRESET_LAYER_FADE_IN_SECONDS
          voice.gain.gain.setValueAtTime(0, fadeInStart)
          voice.gain.gain.linearRampToValueAtTime(nextTargetGain, fadeInEnd)
          this.logPresetTransitionDebug('voice-transition', {
            index,
            transitionKind,
            currentGain,
            nextTargetGain,
            nextFrequency,
            nextPan,
            fadeInStart,
            fadeInEnd,
          })
          return
        }

        transitionKind = 'activate'
        this.setVoiceFrequency(voice, nextFrequency, now)
        this.logPresetTransitionSnap(`activate:voice[${index}].gain`, voice.gain.gain, 0, now)
        voice.gain.gain.setValueAtTime(0, now)
        voice.gain.gain.linearRampToValueAtTime(nextTargetGain, now + PRESET_LAYER_FADE_IN_SECONDS)
        this.logPresetTransitionDebug('voice-transition', {
          index,
          transitionKind,
          currentGain,
          nextTargetGain,
          nextFrequency,
          nextPan,
          fadeInEnd: now + PRESET_LAYER_FADE_IN_SECONDS,
        })
        return
      }

      const swellGuardRatio = TRANSITION_TUNING.presetGainSwellGuardRatio ?? 1.5
      const gainSwellUp = currentGain > silenceThreshold
        && nextTargetGain > silenceThreshold
        && nextTargetGain > currentGain * swellGuardRatio

      if (gainSwellUp) {
        transitionKind = 'gain-swell-guard'
        const fadeOutEnd = now + PRESET_LAYER_FADE_OUT_SECONDS
        const fadeInEnd = fadeOutEnd + PRESET_LAYER_FADE_IN_SECONDS

        this.logPresetTransitionSnap(`swell-guard:voice[${index}].gain-hold`, voice.gain.gain, currentGain, now)
        voice.gain.gain.setValueAtTime(currentGain, now)
        voice.gain.gain.linearRampToValueAtTime(0, fadeOutEnd)

        if (frequencyChanging) {
          this.setVoiceFrequency(voice, nextFrequency, fadeOutEnd)
        }

        this.logPresetTransitionSnap(`swell-guard:voice[${index}].gain-zero`, voice.gain.gain, 0, fadeOutEnd)
        voice.gain.gain.setValueAtTime(0, fadeOutEnd)
        voice.gain.gain.linearRampToValueAtTime(nextTargetGain, fadeInEnd)
        this.logPresetTransitionDebug('voice-transition', {
          index,
          transitionKind,
          currentGain,
          nextTargetGain,
          swellRatio: Number((nextTargetGain / currentGain).toFixed(2)),
          nextFrequency,
          nextPan,
          fadeOutEnd,
          fadeInEnd,
        })
        return
      }

      if (retuning) {
        transitionKind = 'retune-fade'
        const fadeOutEnd = now + PRESET_LAYER_FADE_OUT_SECONDS
        const fadeInEnd = fadeOutEnd + PRESET_LAYER_FADE_IN_SECONDS

        this.logPresetTransitionSnap(`retune:voice[${index}].gain-hold`, voice.gain.gain, currentGain, now)
        voice.gain.gain.setValueAtTime(currentGain, now)
        voice.gain.gain.linearRampToValueAtTime(0, fadeOutEnd)
        this.setVoiceFrequency(voice, nextFrequency, fadeOutEnd)
        this.logPresetTransitionSnap(`retune:voice[${index}].gain-zero`, voice.gain.gain, 0, fadeOutEnd)
        voice.gain.gain.setValueAtTime(0, fadeOutEnd)
        voice.gain.gain.linearRampToValueAtTime(nextTargetGain, fadeInEnd)
        this.logPresetTransitionDebug('voice-transition', {
          index,
          transitionKind,
          currentGain,
          nextTargetGain,
          nextFrequency,
          nextPan,
          fadeOutEnd,
          fadeInEnd,
        })
        return
      }

      if (frequencyChanging) {
        transitionKind = 'frequency-snap'
        this.setVoiceFrequency(voice, nextFrequency, now)
      }

      this.rampParam(voice.gain.gain, nextTargetGain, PRESET_GAIN_RAMP_SECONDS, now)
      this.logPresetTransitionDebug('voice-transition', {
        index,
        transitionKind,
        currentGain,
        nextTargetGain,
        nextFrequency,
        nextPan,
      })
    })

    if (this.isBinauralUndertoneLiveTransition(previousPresetName)) {
      this.scheduleDeferredBinauralUndertoneCompletion(previousPresetName)
    }

    this.logTransitionDiagnostic('applyPresetVoiceTransitions', {
      from: previousPresetName,
      to: this.currentPreset.name,
      guardSeconds: this.getPresetTransitionRampSeconds(),
      outputTrimDb: this.getToneLabOutputTrimDb(),
      balanceTrimDb: this.getDroneBalanceTrimDb(),
    })
  }

  applyVoicePanning(rampSeconds = 0.5, options = {}) {
    if (!this.isReady) {
      return
    }

    const skipBinauralRoleIndices = options.skipBinauralRoleIndices
      ? new Set([FOUNDATION_ROOT_VOICE_INDEX, BINAURAL_RIGHT_VOICE_INDEX])
      : null

    this.voices.forEach((voice, index) => {
      if (skipBinauralRoleIndices?.has(index)) {
        return
      }

      const nextPan = this.getVoicePan(index)

      if (this.presetTransitionDebugContext) {
        this.logPresetTransitionDebug('pan-target', {
          index,
          currentPan: voice.panner.pan.value,
          nextPan,
          rampSeconds,
        })
      }

      this.rampParam(voice.panner.pan, nextPan, rampSeconds)
    })
  }

  // Outgoing voices fade current -> 0 on the shared smoothstep curve. Paired with the
  // smoothstep fade-in below, equal steady levels keep the linear sum constant across
  // the overlap (equal-gain crossfade — no midpoint amplitude dip for a drone).
  rampOutgoingVoiceGain(voice, startTime = Tone.now(), duration = NOTE_FADE_OUT_SECONDS, options = {}) {
    const param = voice.gain.gain
    const { accurateStart = false } = options

    // Note changes interrupt the breath loop mid-ramp. Breath gain motion is
    // scheduled with param.rampTo (a setTargetAtTime exponential approach), and
    // some engines (notably iOS WebKit) mis-read the held value after
    // cancelAndHoldAtTime during a setTargetAtTime curve, snapping the fade
    // start toward the ramp target. The resulting step scales with breath depth,
    // so it is only audible on Titan/Strings (deep breath gain scale) at high
    // Intensity. Read the true instantaneous value in JS first and anchor the
    // fade-out to it so the outgoing voice can never jump.
    const accurateGain = accurateStart && typeof param.getValueAtTime === 'function'
      ? param.getValueAtTime(startTime)
      : null

    this.holdAudioParamAtTime(param, startTime)

    const currentGain = Math.max(accurateGain != null ? accurateGain : param.value, 0)

    this.logClickDiagnostic('outgoing-fade', { currentGain, duration })

    param.setValueAtTime(currentGain, startTime)

    if (currentGain <= 0 || duration <= 0) {
      param.linearRampToValueAtTime(0, startTime + Math.max(duration, 0.001))
      return
    }

    const steps = MOON_TRANSITION.curveSteps

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps
      const curved = this.resolveMoonAuxCurveProgress(progress, MOON_TRANSITION.curve)

      param.linearRampToValueAtTime(Math.max(currentGain * (1 - curved), 0), startTime + duration * progress)
    }
  }

  // Incoming voices fade 0 -> target on the shared smoothstep curve.
  rampPresetCrossfadeEntryGain(param, targetGain, fadeInStart, fadeInEnd) {
    const duration = fadeInEnd - fadeInStart

    if (targetGain <= 0 || duration <= 0) {
      param.setValueAtTime(0, fadeInStart)
      return
    }

    param.setValueAtTime(0, fadeInStart)

    const steps = MOON_TRANSITION.curveSteps

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps
      const curved = this.resolveMoonAuxCurveProgress(progress, MOON_TRANSITION.curve)

      param.linearRampToValueAtTime(targetGain * curved, fadeInStart + duration * progress)
    }
  }

  // Moon voice-rebuild crossfade: ease incoming targets up from overlapHeadroom scale
  // (Cosmos enter only) to full settled target by fadeInEnd — steady-state voicing unchanged.
  rampMoonCrossfadeEntryGain(param, targetGain, fadeInStart, fadeInEnd, index) {
    const duration = fadeInEnd - fadeInStart

    if (targetGain <= 0 || duration <= 0) {
      param.setValueAtTime(0, fadeInStart)
      return
    }

    const startScale = this.getMoonTransitionIncomingOverlapStartScale(index)

    param.setValueAtTime(0, fadeInStart)

    const steps = MOON_TRANSITION.curveSteps

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps
      const curved = this.resolveMoonAuxCurveProgress(progress, MOON_TRANSITION.curve)
      const overlapScale = startScale + (1 - startScale) * progress

      param.linearRampToValueAtTime(
        targetGain * curved * overlapScale,
        fadeInStart + duration * progress,
      )
    }
  }

  // Pure handoff. The unified envelope has already driven voices and every secondary
  // layer to their live targets, so completion does NOT ramp anything — it only clears
  // the transition state and resumes the breath/mood loops, which read the values that
  // are already in place (no audible re-ramp, no "second arrival").
  completePresetVoiceCrossfade() {
    if (!this.isReady) {
      return
    }

    const debugFromPreset = this.moonChangeDebugContext?.from
    const debugToPreset = this.moonChangeDebugContext?.to

    this.logMoonTransitionProbeTable('complete-before')

    this.presetTransitionEndsAt = 0
    this.noteCrossfadeEndsAt = 0
    this.pendingMoonVoiceRebuildCrossfade = false
    this.moonTransitionBusSnapshot = null
    this.moonVoiceCrossfadePlan = null
    this.moonAuxLayerCrossfadeActive = false
    this.moonAuxLayerCrossfadeUntil = 0
    this.moonTransitionContext = null
    this.moonTransitionAuxHandoffUntil = Tone.now() + this.getMoonBodyMorphSeconds()
    this.clearMoonTransitionIsolationProbes()

    if (this.presetTransitionDebugContext) {
      this.logPresetTransitionDebug('preset-voice-crossfade-complete', {
        guards: this.getPresetTransitionGuardSnapshot(),
        actualGains: this.getMoonChangeActualGainSnapshot(),
      })
    }

    // Resume modulation from the current (already-at-target) values. Do not call
    // syncBreathModulation() here — it re-evaluates effective tonal and re-ramp voice
    // gains, causing Io to drop and Titan to swell after the guard clears.
    if (this.getBreathAmount() > 0) {
      this.startBreathLoop()
    }

    this.logMoonHarmonicVoiceTransitionProbe('complete', {
      fromPreset: debugFromPreset,
      toPreset: debugToPreset,
    })

    this.moonHarmonicEntryTargetSnapshot = null
    this.clearMoonTransitionBreathSnapshot()

    this.startMoodLoop({ skipInitialSync: true })

    this.resumeStringsDriftAfterTransition()

    this.logMoonReanchorTimeline('voice-crossfade-complete', {
      timeline: [...this.moonReanchorTimeline],
    })

    this.logMoonTransitionProbeTable('complete-after')

    this.endPresetTransitionDebug('preset-voice-crossfade')
  }

  scheduleIncomingPresetCrossfadeGain(voice, targetGain, now, fadeInStart, fadeInEnd, index) {
    this.holdAudioParamAtTime(voice.gain.gain, now)
    voice.gain.gain.setValueAtTime(0, now)

    this.logClickDiagnostic('preset-crossfade-in', {
      index,
      gainBeforeSchedule: 0,
      targetGain,
      fadeInStart,
      fadeInEnd,
    })

    voice.gain.gain.setValueAtTime(0, fadeInStart)
    this.rampMoonCrossfadeEntryGain(voice.gain.gain, targetGain, fadeInStart, fadeInEnd, index)

    if (this.presetTransitionDebugContext) {
      this.logPresetTransitionDebug('preset-crossfade-incoming-voice', {
        index,
        transitionKind: 'preset-crossfade-in',
        targetGain,
        fadeInStart,
        fadeInEnd,
      })
    }
  }

  crossfadeToCurrentPitch(options = {}) {
    const {
      presetChange = false,
      previousPresetName = null,
    } = options

    // Clear only the stale breath-reanchor timeout; outgoing voice disposal is
    // tracked per-set (registerOutgoingVoiceSet) so it survives interruption.
    this.clearNoteCrossfadeTimeouts()
    this.clearStringsDriftResumeTimeout()
    this.clearStringsHighRegisterAirReanchorTimeout()

    const previousVoices = this.voices
    const now = Tone.now()
    // Single coordinated envelope for a moon change: a short symmetric voice crossfade
    // (voiceCrossfadeSeconds) overlapping the outgoing fade, with the guard held until
    // every secondary layer finishes its slow morph (auxMorphSeconds). Note/register
    // changes keep their legacy timing and inherit only the smoothstep curve + handoff.
    const outgoingFadeDuration = presetChange
      ? MOON_TRANSITION.voiceCrossfadeSeconds
      : NOTE_FADE_OUT_SECONDS
    const fadeInStart = presetChange
      ? now + MOON_TRANSITION.voiceInDelaySeconds
      : now + NOTE_FADE_IN_DELAY_SECONDS
    const fadeInEnd = presetChange
      ? fadeInStart + MOON_TRANSITION.voiceCrossfadeSeconds
      : fadeInStart + NOTE_FADE_IN_SECONDS
    const breathReanchorStart = fadeInEnd + BREATH_REANCHOR_DELAY_SECONDS
    let transitionEndsAt = presetChange
      ? fadeInStart + MOON_TRANSITION.auxMorphSeconds
      : breathReanchorStart + BREATH_REANCHOR_RAMP_SECONDS

    const presetCompletionTime = presetChange
      ? transitionEndsAt + BREATH_REANCHOR_DELAY_SECONDS
      : breathReanchorStart
    const disposeDelayMs = Math.max(outgoingFadeDuration, transitionEndsAt - now) * 1000 + 50

    if (presetChange) {
      if (!this.moonTransitionBreathSnapshot) {
        this.captureMoonTransitionBreathSnapshot()
      }
    } else {
      // Each note/key change gets a fresh breath snapshot so stale pinned phases cannot
      // stack across rapid taps and inflate entry targets.
      this.clearMoonTransitionBreathSnapshot()
      this.captureMoonTransitionBreathSnapshot()
    }

    const tonalAmount = this.getMoonTransitionVoicePlanningTonalAmount()
    const breathCyclePosition = this.getMoonTransitionVoicePlanningBreathCyclePosition()
    // Voice entry must match the live breath phase so incoming targets align with
    // outgoing fade levels. Air-only neutralization stays in the breath snapshot
    // (airBreathCyclePosition) for reanchor/deferred-air paths.
    const noteEntryBreathPhase = breathCyclePosition
    const noteEntryTonalAmount = this.getEffectiveTonalAmountAtCyclePosition(noteEntryBreathPhase)

    if (!presetChange) {
      const registerRampSeconds = Math.min(NOTE_FADE_IN_SECONDS, BREATH_REANCHOR_RAMP_SECONDS)

      // Register/output trim must move with the incoming note — deferring until reanchor
      // left per-voice register scaling and master trim mismatched during the crossfade.
      this.applyVolume(registerRampSeconds)
      this.applyPresetBusEq(this.getBaseTonalAmount(), registerRampSeconds)

      // Tiny headroom dip held across the high-intensity Titan crossfade overlap (no-op
      // otherwise) — outgoing voices are fully gone by now + outgoingFadeDuration.
      this.applyStringsSwitchHeadroomDip(now, now + outgoingFadeDuration)
    }

    if (this.noteChangeDebug && !presetChange) {
      const from = this.pendingNoteChangeFrom ?? {}
      this.noteChangeDebugContext = {
        oldKey: from.key ?? null,
        oldOctave: from.octave ?? null,
        newKey: this.currentKey,
        newOctave: this.currentOctave,
        entryTonalAmount: Number(noteEntryTonalAmount.toFixed(4)),
        entryTargets: [],
        syncBreathScheduled: false,
        startedAtAudio: now,
      }
      this.pendingNoteChangeFrom = null
      this.logNoteChangeProbe('start', {
        breathCyclePosition: Number(breathCyclePosition.toFixed(4)),
        noteEntryBreathPhase: Number(noteEntryBreathPhase.toFixed(4)),
      })
    }

    if (this.shouldArmStringsHighRegisterTransitionDeClick(presetChange, previousPresetName)) {
      const armDuration = (transitionEndsAt - now)
        + STRINGS_HIGH_REGISTER_TRANSITION_DECLICK.driftResumeDelaySeconds
        + BREATH_REANCHOR_RAMP_SECONDS
      this.armStringsHighRegisterTransitionDeClick(armDuration)
      this.logStringsIsolationAutomation('transition-arm', {
        presetChange,
        previousPresetName,
        armDuration: Number(armDuration.toFixed(3)),
        isolationMode: this.getStringsIsolationMode(),
      })
    }

    if (this.presetTransitionDebugContext) {
      this.logPresetTransitionDebug('crossfade-begin', {
        presetChange,
        previousPresetName,
        fadeInStart,
        fadeInEnd,
        breathReanchorStart,
        transitionEndsAt,
        disposeDelayMs,
        tonalAmount,
        breathCyclePosition,
        breathSnapshot: this.moonTransitionBreathSnapshot
          ? { ...this.moonTransitionBreathSnapshot }
          : null,
        outgoingFadeDuration,
      })

      this.schedulePresetTransitionAudioProbe('crossfade-fade-in-end', fadeInEnd, {
        guard: presetChange ? 'preset-crossfade-fade-in' : 'noteCrossfade-fade-in',
      })
      this.schedulePresetTransitionAudioProbe('crossfade-outgoing-dispose', now + disposeDelayMs / 1000, {
        guard: 'outgoing-voice-dispose',
      })
      this.schedulePresetTransitionAudioProbe('crossfade-breath-reanchor', presetCompletionTime, {
        guard: presetChange ? 'preset-crossfade-complete' : 'noteCrossfade-breath-reanchor',
      })
      this.schedulePresetTransitionAudioProbe('crossfade-guard-end', transitionEndsAt, {
        guard: presetChange ? 'presetTransitionEndsAt' : 'noteCrossfadeEndsAt',
      })
      this.schedulePresetTransitionAudioProbe('transition-settled', transitionEndsAt + 0.12, {
        guard: 'post-crossfade',
      })
    }

    this.pauseBreathLoop()

    if (previousVoices.some((voice) => voice.stringsDriftTimeouts?.length)) {
      this.stopStringsDriftOnVoices(previousVoices)
      this.holdOutgoingStringsDetuneOnVoices(previousVoices)
    }

    // Transition-only overlap compensation: clear the outgoing moon's root/sub/fifth/
    // foundation body voices faster than the incoming build so their (coherent, often
    // stronger) low-mid resonance does not stack with the incoming moon during overlap.
    const overlap = MOON_TRANSITION.overlapCompensation
    const bodyFadeActive = presetChange && overlap?.enabled
    const bodyVoiceIndices = overlap?.bodyVoiceIndices ?? []

    previousVoices.forEach((voice, index) => {
      const isBodyVoice = bodyFadeActive && bodyVoiceIndices.includes(index)
      const bodyFadeScale = isBodyVoice
        ? this.getMoonTransitionOutgoingBodyFadeScale(previousPresetName)
        : 1
      let voiceOutgoingFadeDuration = isBodyVoice
        ? outgoingFadeDuration * bodyFadeScale
        : outgoingFadeDuration
      const leaveExtensionIndices = MOON_TRANSITION.overlapHeadroom?.cosmosLeaveExtensionIndices ?? [6, 8, 9, 10]

      if (presetChange
        && previousPresetName === 'Cosmos'
        && leaveExtensionIndices.includes(index)) {
        voiceOutgoingFadeDuration *= MOON_TRANSITION.overlapHeadroom?.cosmosLeaveExtensionFadeScale ?? 0.45
      }

      if (this.presetTransitionDebugContext) {
        this.logPresetTransitionDebug('outgoing-voice-fade', {
          index,
          presetChange,
          outgoingFadeDuration: voiceOutgoingFadeDuration,
          bodyVoice: isBodyVoice,
        })
      }

      this.rampOutgoingVoiceGain(voice, now, voiceOutgoingFadeDuration, {
        accurateStart: !presetChange && this.isStringsPreset(),
      })
    })

    // Hand the just-faded-out set to its own dispose timer immediately, so a
    // rapid follow-up tap (which re-enters this method) cannot strand it.
    this.registerOutgoingVoiceSet(previousVoices, disposeDelayMs)

    this.primeMetronomeSchedule()

    const nextVoices = this.createVoices()

    let voiceCrossfadePlan = null

    if (presetChange) {
      this.moonTransitionContext = {
        fromPreset: previousPresetName,
        toPreset: this.currentPreset.name,
        fadeInStart,
        fadeInEnd,
        startedAtAudio: now,
      }

      if (MOON_TRANSITION_ISOLATION.enabled && MOON_TRANSITION_ISOLATION.muteOutgoingAfterSeconds != null) {
        this.scheduleMoonTransitionIsolationOutgoingMute(
          now,
          MOON_TRANSITION_ISOLATION.muteOutgoingAfterSeconds,
        )
      }

      this.applyMoonTransitionIsolationAtStart(now)

      if (this.moonChangeDebugContext) {
        this.moonChangeDebugContext.startedAtAudio = now
      }

      this.scheduleMoonTransitionTimedProbes(now)

      voiceCrossfadePlan = this.planMoonVoiceCrossfadeEntry(
        previousVoices,
        tonalAmount,
        breathCyclePosition,
        {
          previousPresetName,
        },
      )

      this.logMoonReanchorTimeline('voice-crossfade-begin', {
        fadeInStart: Number(fadeInStart.toFixed(3)),
        fadeInEnd: Number(fadeInEnd.toFixed(3)),
        previousPresetName,
        toPreset: this.currentPreset.name,
      })
      this.scheduleMoonAuxLayerCrossfade(now, fadeInStart, fadeInEnd, previousPresetName)

      if (this.moonAuxLayerCrossfadeUntil > transitionEndsAt) {
        transitionEndsAt = this.moonAuxLayerCrossfadeUntil
        this.presetTransitionEndsAt = transitionEndsAt
        this.noteCrossfadeEndsAt = transitionEndsAt
      }
    }

    nextVoices.forEach((voice, index) => {
      const planEntry = voiceCrossfadePlan?.voiceEntries[index]
      const liveBreathTarget = planEntry?.liveTarget ?? this.getVoiceTargetGain(index, tonalAmount, true, breathCyclePosition)
      const neutralTargetGain = planEntry?.neutralTarget ?? this.getVoiceTargetGain(index, tonalAmount, false, breathCyclePosition)
      const entryTargetGain = presetChange
        ? (planEntry?.entryTarget ?? this.getCrossfadeEntryTargetGain(index, tonalAmount))
        : this.getVoiceTargetGain(index, noteEntryTonalAmount, true, noteEntryBreathPhase)
      const outgoingGain = this.moonTransitionBreathSnapshot?.outgoingVoiceGains[index] ?? 0

      voice.targetGain = presetChange
        ? liveBreathTarget
        : this.getVoiceTargetGain(index, noteEntryTonalAmount, true, noteEntryBreathPhase)

      if (this.noteChangeDebugContext && !presetChange) {
        this.noteChangeDebugContext.entryTargets[index] = Number(entryTargetGain.toFixed(5))
      }
      this.startVoiceOscillators(voice, now, index)

      if (presetChange) {
        if (this.shouldMuteMoonTransitionIncomingExtension(index)) {
          this.holdAudioParamAtTime(voice.gain.gain, now)
          voice.gain.gain.setValueAtTime(0, now)
          return
        }

        if (planEntry?.deferExtension) {
          this.scheduleDeferredMoonCrossfadeExtensionGain(voice, planEntry, fadeInStart, now)
          return
        }

        this.scheduleIncomingPresetCrossfadeGain(
          voice,
          entryTargetGain,
          now,
          fadeInStart,
          fadeInEnd,
          index,
        )

        if (MOON_CHANGE_DEBUG.enabled) {
          this.logMoonChangeDiagnostic('incoming-voice-target', {
            index,
            outgoingGain,
            neutralTargetGain,
            liveBreathTarget,
            entryTargetGain,
            deferExtension: planEntry?.deferExtension ?? false,
          })
        }

        return
      }

      if (this.presetTransitionDebugContext) {
        this.logPresetTransitionSnap(`crossfade-in:voice[${index}].gain`, voice.gain.gain, 0, now)
      }

      this.holdAudioParamAtTime(voice.gain.gain, now)
      voice.gain.gain.setValueAtTime(0, now)

      this.logClickDiagnostic('note-crossfade-in', {
        index,
        targetGain: entryTargetGain,
        fadeInStart,
        fadeInEnd,
      })

      voice.gain.gain.setValueAtTime(0, fadeInStart)
      this.rampPresetCrossfadeEntryGain(voice.gain.gain, entryTargetGain, fadeInStart, fadeInEnd)

      if (this.presetTransitionDebugContext) {
        this.logPresetTransitionDebug('incoming-voice-target', {
          index,
          targetGain: entryTargetGain,
          neutralTargetGain,
          fadeInEnd,
        })
      }
    })

    this.stopStringsDrift()
    this.voices = nextVoices

    this.noteCrossfadeEndsAt = transitionEndsAt

    if (presetChange) {
      this.presetTransitionEndsAt = transitionEndsAt
    }

    const crossfadeCompletionTime = presetChange
      ? transitionEndsAt + BREATH_REANCHOR_DELAY_SECONDS
      : breathReanchorStart

    if (this.noteChangeDebugContext && !presetChange) {
      const midpointDelayMs = Math.max(0, ((fadeInStart + fadeInEnd) / 2 - now) * 1000)
      const completionDelayMs = Math.max(0, (crossfadeCompletionTime - now) * 1000)
      const postDelayMs = Math.max(0, (crossfadeCompletionTime + 0.3 - now) * 1000)

      this.scheduleNoteCrossfadeTimeout(() => {
        this.logNoteChangeProbe('midpoint')
      }, midpointDelayMs)
      this.scheduleNoteCrossfadeTimeout(() => {
        this.logNoteChangeProbe('completion')
      }, completionDelayMs)
      this.scheduleNoteCrossfadeTimeout(() => {
        this.logNoteChangeProbe('post-300ms')
        this.noteChangeDebugContext = null
      }, postDelayMs)
    }

    if (presetChange) {
      this.scheduleMoonTransitionCompletionProbes(Math.max(0, (crossfadeCompletionTime - now) * 1000))
    }

    this.scheduleNoteCrossfadeTimeout(() => {
      if (presetChange) {
        this.completePresetVoiceCrossfade()
        return
      }

      this.beginNoteCrossfadeBreathReanchor()
    }, Math.max(0, (crossfadeCompletionTime - now) * 1000))
  }

  startBreathLoop() {
    if (this.getBreathAmount() === 0 || !this.isReady || this.isSterileDiagnosticActive()) {
      return
    }

    if (!this.breathStartTime) {
      this.breathStartTime = window.performance.now()
    }

    if (this.breathFrame) {
      return
    }

    const tick = () => {
      this.breathFrame = null

      if (this.getBreathAmount() === 0 || !this.isReady) {
        if (this.getBreathAmount() === 0) {
          this.stopBreathLoop()
        }

        return
      }

      const now = window.performance.now()

      if (now - this.lastBreathUpdateTime >= BREATH_UPDATE_SECONDS * 1000) {
        this.lastBreathUpdateTime = now
        this.syncBreathModulation()
      }

      this.breathFrame = window.requestAnimationFrame(tick)
    }

    this.breathFrame = window.requestAnimationFrame(tick)
  }

  stopBreathLoop() {
    this.pauseBreathLoop()

    this.breathStartTime = null
    this.lastBreathUpdateTime = 0
  }

  rampBreathParam(param, value, duration, startTime = Tone.now()) {
    this.holdAudioParamAtTime(param, startTime)
    param.rampTo(value, duration, startTime)
  }

  rampParam(param, value, duration, startTime = Tone.now(), context = '') {
    const numericValue = typeof value === 'number' ? value : Number(value)

    if (!Number.isFinite(numericValue)) {
      console.warn('[Moondrone rampParam] skipped non-finite value', {
        context,
        value,
        duration,
        currentValue: param?.value,
      })
      return
    }

    if (!param || typeof param.rampTo !== 'function') {
      console.warn('[Moondrone rampParam] skipped missing param', {
        context,
        value: numericValue,
        duration,
      })
      return
    }

    if (!Number.isFinite(duration) || duration < 0) {
      console.warn('[Moondrone rampParam] skipped invalid duration', {
        context,
        value: numericValue,
        duration,
      })
      return
    }

    this.holdAudioParamAtTime(param, startTime)

    const currentValue = param.value

    if (!Number.isFinite(currentValue)) {
      console.warn('[Moondrone rampParam] repairing non-finite current value before ramp', {
        context,
        currentValue,
        targetValue: numericValue,
      })

      try {
        param.setValueAtTime(numericValue, startTime)
      } catch (error) {
        console.warn('[Moondrone rampParam] repair setValueAtTime failed', {
          context,
          targetValue: numericValue,
          message: error?.message,
        })
      }

      return
    }

    try {
      param.rampTo(numericValue, duration, startTime)
    } catch (error) {
      console.warn('[Moondrone rampParam] rampTo failed, snapping target', {
        context,
        targetValue: numericValue,
        duration,
        currentValue,
        message: error?.message,
      })

      try {
        param.setValueAtTime(numericValue, startTime)
      } catch (snapError) {
        console.warn('[Moondrone rampParam] snap fallback failed', {
          context,
          targetValue: numericValue,
          message: snapError?.message,
        })
      }
    }
  }

  rampVoiceGainForStop(voice, startTime = Tone.now()) {
    const param = voice.gain.gain

    if (typeof param.cancelAndHoldAtTime === 'function') {
      param.cancelAndHoldAtTime(startTime)
    } else {
      param.cancelScheduledValues(startTime)
    }

    const currentGain = Math.max(param.value, 0.0001)
    const quickEnd = startTime + STOP_FADE_QUICK_SECONDS
    const fadeEnd = startTime + STOP_FADE_SECONDS
    const quickGain = Math.max(currentGain * STOP_FADE_QUICK_LEVEL, 0.0001)

    param.setValueAtTime(currentGain, startTime)
    param.linearRampToValueAtTime(quickGain, quickEnd)
    param.exponentialRampToValueAtTime(0.0001, fadeEnd)
    param.linearRampToValueAtTime(0, fadeEnd + 0.01)
  }

  isStraightMetronome() {
    return this.metronomeActiveMeter === METRONOME_STRAIGHT_METER
  }

  getMetronomeActiveBeatsPerMeasure() {
    return this.isStraightMetronome() ? 1 : this.metronomeActiveMeter
  }

  clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value))
  }

  // Gentle tanh soft-saturation curve. Rounds peaks (so the limiter works less,
  // staying clean) and adds subtle midband harmonics that read as loudness on
  // tiny phone drivers. Normalized so the curve stays near unity gain — it shapes,
  // it does not add raw level (that is the makeup gain's job).
  createMasterSaturator() {
    const drive = MASTER_TUNING.saturationDrive
    const outputScale = MASTER_TUNING.saturationOutputScale
    const normalize = Math.tanh(drive) || 1
    const length = 1024
    const curve = new Float32Array(length)

    for (let index = 0; index < length; index += 1) {
      const x = (index / (length - 1)) * 2 - 1
      curve[index] = (Math.tanh(x * drive) / normalize) * outputScale
    }

    return new Tone.WaveShaper(curve)
  }

  // Passive final-output analyzer tap (dev builds only). In dev, masterFinalOutputTrim
  // → devOutputGain → destination; meters/analyser fan out from devOutputGain.
  connectMasterFinalOutputToDestination() {
    if (import.meta.env.DEV) {
      this.ensureDevOutputGainNode()
      this.masterFinalOutputTrim.connect(this.devOutputGain)
      this.devOutputGain.toDestination()
      this.attachDevOutputAnalyzerTap()
      return
    }

    this.masterFinalOutputTrim.toDestination()
  }

  ensureDevOutputGainNode() {
    if (!import.meta.env.DEV) {
      return
    }

    if (!this.devOutputGain) {
      this.devOutputGain = new Tone.Volume(this.devOutputGainDb)
    }
  }

  clampDevOutputGainDb(db) {
    const stepped = Math.round(db * 2) / 2

    return Math.max(-6, Math.min(6, stepped))
  }

  setDevOutputGainDb(db) {
    if (!import.meta.env.DEV) {
      return this.devOutputGainDb
    }

    this.devOutputGainDb = this.clampDevOutputGainDb(db)

    if (this.devOutputGain) {
      this.devOutputGain.volume.value = this.devOutputGainDb
    }

    return this.devOutputGainDb
  }

  getDevOutputGainDb() {
    return import.meta.env.DEV ? this.devOutputGainDb : 0
  }

  getDevOutputCalibrationInfo() {
    if (!import.meta.env.DEV) {
      return null
    }

    const productionTrimDb = this.getToneLabFinalOutputTrimDb()
    const devGainDb = this.devOutputGainDb
    const effectiveTotalDb = productionTrimDb + devGainDb

    return {
      productionTrimDb,
      devGainDb,
      effectiveTotalDb,
    }
  }

  attachDevOutputAnalyzerTap() {
    const tapNode = import.meta.env.DEV ? this.devOutputGain : null

    if (!tapNode || this.devOutputMeterPeak) {
      return
    }

    this.devOutputMeterPeak = new Tone.Meter({ smoothing: 0.15, normalRange: false })
    this.devOutputMeterRms = new Tone.Meter({ smoothing: 0.97, normalRange: false })
    this.devOutputAnalyser = new Tone.Analyser('fft', 256)
    tapNode.connect(this.devOutputMeterPeak)
    tapNode.connect(this.devOutputMeterRms)
    tapNode.connect(this.devOutputAnalyser)
  }

  getDevOutputMeterSnapshot() {
    if (!import.meta.env.DEV || !this.devOutputMeterPeak || !this.devOutputMeterRms) {
      return null
    }

    const peakDb = this.devOutputMeterPeak.getValue()
    const rmsDb = this.devOutputMeterRms.getValue()
    const fftValues = this.devOutputAnalyser?.getValue?.()
    const calibration = this.getDevOutputCalibrationInfo()

    return {
      peakDb: typeof peakDb === 'number' && Number.isFinite(peakDb) ? peakDb : -Infinity,
      rmsDb: typeof rmsDb === 'number' && Number.isFinite(rmsDb) ? rmsDb : -Infinity,
      clip: Number.isFinite(peakDb) && peakDb >= -0.5,
      nearClip: Number.isFinite(peakDb) && peakDb >= -3,
      analyserAvailable: Boolean(this.devOutputAnalyser),
      fft: fftValues instanceof Float32Array
        ? Array.from(fftValues)
        : Array.isArray(fftValues)
          ? fftValues
          : null,
      productionTrimDb: calibration?.productionTrimDb ?? 0,
      devGainDb: calibration?.devGainDb ?? 0,
      effectiveTotalDb: calibration?.effectiveTotalDb ?? 0,
    }
  }

  disposeDevOutputAnalyzerTap() {
    if (!import.meta.env.DEV) {
      return
    }

    ;[this.devOutputMeterPeak, this.devOutputMeterRms, this.devOutputAnalyser].forEach((node) => {
      try {
        node?.dispose()
      } catch {
        // Dev-only teardown.
      }
    })

    this.devOutputMeterPeak = null
    this.devOutputMeterRms = null
    this.devOutputAnalyser = null
  }

  disposeDevOutputGainNode() {
    if (!import.meta.env.DEV) {
      return
    }

    try {
      this.devOutputGain?.dispose()
    } catch {
      // Dev-only teardown.
    }

    this.devOutputGain = null
  }

  disposeDevOutputMonitoring() {
    this.disposeDevOutputAnalyzerTap()
    this.disposeDevOutputGainNode()
  }

  // Build the shared master stage exactly once. Signal flow:
  //   masterPreLowShelf → masterInput → compressor → [saturator?] → makeup → limiter
  //   → finalOutputTrim → destination
  // When masterSaturationEnabled is false, compressor connects directly to makeup (A/B diagnostic).
  ensureMasterOutput() {
    if (this.masterChainReady) {
      return
    }

    if (MASTER_TUNING.masterStageBypassEnabled) {
      // HARD BYPASS: legacy limiter-only chain. drone output → pass-through → limiter
      // → post-limiter trim → destination. No compressor/saturator/makeup/pre-shelf/metering exist.
      this.masterFinalOutputTrim = new Tone.Volume(this.getToneLabFinalOutputTrimDb())
      this.connectMasterFinalOutputToDestination()
      this.masterLimiter = new Tone.Limiter(LEGACY_MASTER_LIMITER_DB).connect(this.masterFinalOutputTrim)
      // masterPreLowShelf is the node ensureSignalChain connects the drone output to,
      // so alias the pass-through gain to it. metronomeGain connects to masterLimiter.
      this.masterPreLowShelf = new Tone.Gain(1).connect(this.masterLimiter)
      this.masterInput = null
      this.masterCompressor = null
      this.masterSaturator = null
      this.masterMakeup = null
      this.masterMeter = null
      this.masterMeterPre = null
      this.masterMeterPostCompressor = null
      this.masterMeterPostSaturation = null
      this.masterChainReady = true
      console.warn('[Moondrone] MASTER STAGE BYPASSED — legacy limiter-only chain active (no compressor/saturation/makeup).')
      return
    }

    const compressorSettings = TONE_LAB_TUNING.enabled
      ? getToneLabCompressorSettings(TONE_LAB_TUNING.dynamics.compressorAmount)
      : {
        thresholdDb: MASTER_TUNING.compressorThresholdDb,
        ratio: MASTER_TUNING.compressorRatio,
        makeupGainDb: MASTER_TUNING.makeupGainDb,
      }
    this.masterFinalOutputTrim = new Tone.Volume(this.getToneLabFinalOutputTrimDb())
    this.connectMasterFinalOutputToDestination()
    this.masterLimiter = new Tone.Limiter(this.getEffectiveLimiterCeilingDb()).connect(this.masterFinalOutputTrim)
    this.masterMakeup = new Tone.Volume(compressorSettings.makeupGainDb).connect(this.masterLimiter)
    this.masterSaturator = this.createMasterSaturator()
    this.masterCompressor = new Tone.Compressor({
      threshold: compressorSettings.thresholdDb,
      ratio: compressorSettings.ratio,
      knee: MASTER_TUNING.compressorKneeDb,
      attack: MASTER_TUNING.compressorAttackSeconds,
      release: MASTER_TUNING.compressorReleaseSeconds,
    })

    if (MASTER_TUNING.masterSaturationEnabled) {
      this.masterCompressor.connect(this.masterSaturator)
      this.masterSaturator.connect(this.masterMakeup)
    } else {
      this.masterCompressor.connect(this.masterMakeup)
    }

    const preMasterGain = 10 ** (MASTER_TUNING.preMasterGainDb / 20)
    this.masterInput = new Tone.Gain(preMasterGain).connect(this.masterCompressor)
    const { frequency, gainDb, Q } = MASTER_TUNING.preCompressorLowShelf
    this.masterPreLowShelf = new Tone.Filter({
      type: 'lowshelf',
      frequency,
      Q,
      gain: gainDb,
    }).connect(this.masterInput)

    this.masterMeter = new Tone.Meter({ smoothing: 0.3 })
    this.masterMakeup.connect(this.masterMeter)

    this.masterMeterPostCompressor = new Tone.Meter({ smoothing: 0.3 })
    this.masterCompressor.connect(this.masterMeterPostCompressor)

    this.masterMeterPostSaturation = new Tone.Meter({ smoothing: 0.3 })
    if (MASTER_TUNING.masterSaturationEnabled) {
      this.masterSaturator.connect(this.masterMeterPostSaturation)
    } else {
      this.masterCompressor.connect(this.masterMeterPostSaturation)
    }

    this.masterMeterPre = new Tone.Meter({ smoothing: 0.3 })

    this.masterChainReady = true

    if (MASTER_TUNING.meteringEnabled) {
      this.setMasterMetering(true)
    }

    if (MASTER_TUNING.masterDiagnosticsEnabled) {
      this.setMasterDiagnosticsLogging(true)
    }
  }

  connectMasterMeterPreTap() {
    if (this.output && this.masterMeterPre) {
      this.output.connect(this.masterMeterPre)
    }
  }

  disposeMasterOutput() {
    if (this.masterLevelLogTimer) {
      window.clearInterval(this.masterLevelLogTimer)
      this.masterLevelLogTimer = null
    }

    if (this.masterDiagnosticsTimer) {
      window.clearInterval(this.masterDiagnosticsTimer)
      this.masterDiagnosticsTimer = null
    }

    this.disposeDevOutputMonitoring()

    const nodes = [
      this.masterMeterPre,
      this.masterMeterPostCompressor,
      this.masterMeterPostSaturation,
      this.masterMeter,
      this.masterPreLowShelf,
      this.masterInput,
      this.masterCompressor,
      this.masterSaturator,
      this.masterMakeup,
      this.masterLimiter,
      this.masterFinalOutputTrim,
    ]

    nodes.forEach((node) => {
      try {
        node?.dispose()
      } catch {
        // Offline/diagnostic teardown may partially disconnect nodes.
      }
    })

    this.masterChainReady = false
    this.masterPreLowShelf = null
    this.masterInput = null
    this.masterCompressor = null
    this.masterSaturator = null
    this.masterMakeup = null
    this.masterLimiter = null
    this.masterFinalOutputTrim = null
    this.masterMeter = null
    this.masterMeterPre = null
    this.masterMeterPostCompressor = null
    this.masterMeterPostSaturation = null
  }

  // Tear down audio graph for offline diagnostic reruns (does not change tuning flags).
  disposeForDiagnostics() {
    this.stopForLifecycle()

    if (this.isReady) {
      const now = Tone.now()
      this.voices.forEach((voice) => {
        voice.oscillators?.forEach((osc) => {
          try {
            osc.stop(now)
            osc.dispose()
          } catch {
            // Oscillator may already be stopped during offline teardown.
          }
        })
        voice.gain?.dispose()
        voice.panner?.dispose()
      })
      this.voices = []

      const droneNodes = [
        this.filter,
        this.projectionDryNarrower,
        this.reverb,
        this.stereoWidener,
        this.moodBloomEq,
        this.moodEclipseEq,
        this.projectionLowMidCut,
        ...this.projectionPresenceEqs,
        this.presetLowMidEq,
        this.presetMediumBodyEq,
        this.presetBodyMidEq,
        this.presetUpperMidEq,
        this.droneMidVoicingEq,
        this.airLowMidScoop,
        this.airShelfEq,
        this.toneLabHighpass,
        this.toneLabLowpass,
        this.toneLabLowMid,
        this.toneLabSpeakerPresence,
        this.toneLabHighMid,
        this.toneLabAir,
        this.toneLabUpperAir,
        this.droneBusEq,
        this.output,
        this.moonTransitionGain,
        this.moonTransitionSendGain,
        this.moonTransitionHighpass,
        this.moonTransitionDampLowpass,
        this.moonTransitionReverb,
        this.moonTransitionBloomGain,
        this.airBreathGain,
        this.airBreathLowpass,
        this.airBreathHighpass,
        this.airBreathNoise,
        this.orbitPair?.oscA,
        this.orbitPair?.oscB,
        this.orbitPair?.gainA,
        this.orbitPair?.gainB,
        this.orbitPair?.pannerA,
        this.orbitPair?.pannerB,
        this.orbitPair?.busGain,
      ]

      droneNodes.forEach((node) => {
        try {
          node?.dispose()
        } catch {
          // Ignore partial teardown errors during offline reset.
        }
      })
    }

    this.disposeMasterOutput()
    this.isReady = false
    this.hasStarted = false
    this.isPlaying = false
    this.isStarting = false
    this.orbitPair = null
    this.orbitStarted = false
    this.dualBeats = null
    this.dualBeatsStarted = false
    this.output = null
    this.moonTransitionGain = null
    this.moonTransitionSendGain = null
    this.moonTransitionHighpass = null
    this.moonTransitionDampLowpass = null
    this.moonTransitionReverb = null
    this.moonTransitionBloomGain = null
    this.filter = null
    this.reverb = null
    this.stereoWidener = null
    this.projectionPresenceEqs = []
  }

  readMeterDb(meter) {
    const value = meter?.getValue()
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  getMasterDiagnosticsSnapshot() {
    return {
      saturationEnabled: MASTER_TUNING.masterSaturationEnabled,
      preMasterRmsDb: this.readMeterDb(this.masterMeterPre),
      postCompressorRmsDb: this.readMeterDb(this.masterMeterPostCompressor),
      postSaturationRmsDb: this.readMeterDb(this.masterMeterPostSaturation),
      postMakeupRmsDb: this.readMeterDb(this.masterMeter),
      compressorReductionDb: this.masterCompressor?.reduction ?? 0,
      limiterReductionDb: this.masterLimiter?.reduction ?? 0,
    }
  }

  // Live-device diagnostic: sample master taps over `durationMs` while playing.
  async runMasterDiagnostics(durationMs = 3000, intervalMs = 100) {
    if (!this.isPlaying) {
      throw new Error('runMasterDiagnostics requires the drone to be playing')
    }

    const samples = []
    const deadline = Date.now() + durationMs

    while (Date.now() < deadline) {
      samples.push({
        ...this.getMasterDiagnosticsSnapshot(),
        timestampMs: Date.now(),
      })
      await new Promise((resolve) => {
        window.setTimeout(resolve, intervalMs)
      })
    }

    const avg = (key) => {
      const values = samples.map((s) => s[key]).filter((v) => typeof v === 'number' && Number.isFinite(v))
      if (values.length === 0) {
        return null
      }
      return values.reduce((sum, v) => sum + v, 0) / values.length
    }

    const max = (key) => {
      const values = samples.map((s) => s[key]).filter((v) => typeof v === 'number' && Number.isFinite(v))
      if (values.length === 0) {
        return null
      }
      return Math.max(...values)
    }

    return {
      saturationEnabled: MASTER_TUNING.masterSaturationEnabled,
      sampleCount: samples.length,
      averages: {
        preMasterRmsDb: avg('preMasterRmsDb'),
        postCompressorRmsDb: avg('postCompressorRmsDb'),
        postSaturationRmsDb: avg('postSaturationRmsDb'),
        postMakeupRmsDb: avg('postMakeupRmsDb'),
        compressorReductionDb: avg('compressorReductionDb'),
        limiterReductionDb: avg('limiterReductionDb'),
      },
      peaks: {
        compressorReductionDb: max('compressorReductionDb'),
        limiterReductionDb: max('limiterReductionDb'),
      },
      samples,
    }
  }

  setMasterDiagnosticsLogging(enabled) {
    if (this.masterDiagnosticsTimer) {
      window.clearInterval(this.masterDiagnosticsTimer)
      this.masterDiagnosticsTimer = null
    }

    if (!enabled) {
      return
    }

    this.masterDiagnosticsTimer = window.setInterval(() => {
      const snap = this.getMasterDiagnosticsSnapshot()
      console.log('[Moondrone master diagnostics]', {
        sat: snap.saturationEnabled ? 'on' : 'bypass',
        pre: snap.preMasterRmsDb?.toFixed(1),
        postComp: snap.postCompressorRmsDb?.toFixed(1),
        postSat: snap.postSaturationRmsDb?.toFixed(1),
        postMakeup: snap.postMakeupRmsDb?.toFixed(1),
        compGr: snap.compressorReductionDb?.toFixed(1),
        limGr: snap.limiterReductionDb?.toFixed(1),
      })
    }, 500)
  }

  // Reconnect the drone output trim to the master stage through the Moon-transition group
  // gain (output → moonTransitionGain → masterPreLowShelf). Used after the master output is
  // rebuilt by the dev A/B toggles, since moonTransitionGain survives that teardown and must
  // be re-pointed at the freshly created masterPreLowShelf.
  connectDroneBusToMaster() {
    if (!this.output || !this.masterPreLowShelf) {
      return
    }

    try {
      this.output.disconnect()
    } catch {
      // May already be disconnected during rebuild.
    }

    if (this.moonTransitionGain) {
      try {
        this.moonTransitionGain.disconnect()
      } catch {
        // May already be disconnected during rebuild.
      }

      this.output.connect(this.moonTransitionGain)
      this.moonTransitionGain.connect(this.masterPreLowShelf)
      return
    }

    this.output.connect(this.masterPreLowShelf)
  }

  // Toggle saturation bypass and rebuild the master chain (for A/B on a real device).
  // Call before Play when switching paths: droneEngine.setMasterSaturationEnabled(false)
  setMasterSaturationEnabled(enabled) {
    if (MASTER_TUNING.masterSaturationEnabled === enabled) {
      return
    }

    MASTER_TUNING.masterSaturationEnabled = enabled

    if (!this.masterChainReady) {
      return
    }

    const wasPlaying = this.isPlaying
    const wasMetronomePlaying = this.metronomePlaying

    if (wasPlaying || wasMetronomePlaying) {
      this.stopForLifecycle()
    }

    const droneOutputTrim = this.output
    this.disposeMasterOutput()
    this.ensureMasterOutput()

    if (droneOutputTrim) {
      try {
        droneOutputTrim.disconnect()
      } catch {
        // May already be disconnected during diagnostic rebuild.
      }
      this.output = droneOutputTrim
      this.connectDroneBusToMaster()
      this.connectMasterMeterPreTap()
    }

    if (wasMetronomePlaying && this.metronomeGain && this.masterLimiter) {
      try {
        this.metronomeGain.disconnect()
      } catch {
        // Ignore reconnect teardown errors.
      }
      this.metronomeGain.connect(this.masterLimiter)
    }
  }

  // Toggle the hard master-stage bypass and rebuild the chain (A/B on a real device).
  // Safe to call while playing — playback is stopped, the chain is rebuilt, and the
  // drone/metronome buses are reconnected. Call Play again after toggling.
  setMasterStageBypassEnabled(enabled) {
    if (MASTER_TUNING.masterStageBypassEnabled === enabled) {
      return
    }

    MASTER_TUNING.masterStageBypassEnabled = enabled

    if (!this.masterChainReady) {
      return
    }

    if (this.isPlaying || this.metronomePlaying) {
      this.stopForLifecycle()
    }

    const droneOutputTrim = this.output
    this.disposeMasterOutput()
    this.ensureMasterOutput()

    if (droneOutputTrim) {
      try {
        droneOutputTrim.disconnect()
      } catch {
        // May already be disconnected during rebuild.
      }
      this.output = droneOutputTrim
      this.connectDroneBusToMaster()
      this.connectMasterMeterPreTap()
    }

    if (this.metronomeGain && this.masterLimiter) {
      try {
        this.metronomeGain.disconnect()
      } catch {
        // Ignore reconnect teardown errors.
      }
      this.metronomeGain.connect(this.masterLimiter)
    }

    console.warn(`[Moondrone] master stage bypass = ${enabled ? 'ON (legacy limiter only)' : 'OFF (full master stage)'}; press Play again.`)
  }

  // Snapshot of every active diagnostic/voicing mode — proof of what is actually
  // running. Logged on each Play and callable from the console: droneEngine.getDiagnosticState()
  getDiagnosticState() {
    return {
      preset: this.currentPreset.name,
      octave: this.currentOctave,
      register: ['', '', 'Low', 'Medium', 'High', 'Very High'][this.currentOctave] ?? String(this.currentOctave),
      mood: this.mood,
      intensity: this.intensity,
      sterileDiagnosticEnabled: STERILE_DIAGNOSTIC_MODE.enabled,
      sterileDiagnosticActiveNow: this.isSterileDiagnosticActive(),
      highVhCleanVoicingEnabled: HIGH_VH_CLEAN_VOICING.enabled,
      highVhCleanVoicingActiveNow: this.isHighVhCleanVoicingActive(),
      masterStageBypassEnabled: MASTER_TUNING.masterStageBypassEnabled,
      masterSaturationEnabled: MASTER_TUNING.masterSaturationEnabled,
      masterChainReady: this.masterChainReady,
    }
  }

  logDiagnosticState(context = 'state') {
    const s = this.getDiagnosticState()
    console.log(
      `[Moondrone diag:${context}] preset=${s.preset} register=${s.register} mood=${s.mood} I=${s.intensity}`
      + ` | STERILE ${s.sterileDiagnosticActiveNow ? 'ACTIVE' : (s.sterileDiagnosticEnabled ? 'enabled(inactive)' : 'off')}`
      + ` | CLEAN ${s.highVhCleanVoicingActiveNow ? 'ACTIVE' : (s.highVhCleanVoicingEnabled ? 'enabled(inactive)' : 'off')}`
      + ` | MASTER ${s.masterStageBypassEnabled ? 'BYPASS(legacy limiter)' : `full(sat ${s.masterSaturationEnabled ? 'on' : 'off'})`}`,
    )
  }

  // Returns the master-bus RMS level in dBFS (or -Infinity before the chain exists).
  getMasterLevelDb() {
    const value = this.masterMeter?.getValue()
    return typeof value === 'number' ? value : -Infinity
  }

  // Dev-only: toggle periodic console logging of master-bus RMS. Call
  // `droneEngine.setMasterMetering(true)` from the console on a real device.
  setMasterMetering(enabled) {
    if (this.masterLevelLogTimer) {
      window.clearInterval(this.masterLevelLogTimer)
      this.masterLevelLogTimer = null
    }

    if (!enabled || !this.masterMeter) {
      return
    }

    this.masterLevelLogTimer = window.setInterval(() => {
      const level = this.getMasterLevelDb()
      console.log(`[Moondrone] master RMS: ${Number.isFinite(level) ? level.toFixed(1) : level} dBFS`)
    }, 500)
  }

  getMetronomeSampleId(isDownbeat) {
    if (this.isStraightMetronome()) {
      return this.metronomeSoundMode === 'triangle' ? 'triangleClosed' : 'blockHigh'
    }

    if (this.metronomeSoundMode === 'triangle') {
      return isDownbeat ? 'triangleOpen' : 'triangleClosed'
    }

    return isDownbeat ? 'blockHigh' : 'blockLow'
  }

  resolveMetronomeSampleUrl(relativeUrl) {
    return resolveMetronomeAssetUrl(relativeUrl)
  }

  logMetronomeSampleLoadFailure(sampleId, relativeUrl, details = {}) {
    const resolvedUrl = this.resolveMetronomeSampleUrl(relativeUrl)

    console.error('[Moondrone metronome] Sample load failed', {
      sampleId,
      url: relativeUrl,
      resolvedUrl,
      ...details,
    })
  }

  // Soft pre-flight check. On a web dev server this catches a 404 that returns an
  // HTML page instead of audio. It must NEVER be fatal on its own, because native
  // Capacitor WebViews (iOS/Android custom schemes) frequently serve local assets
  // with a missing or non-"audio" content-type, or do not expose response headers
  // to fetch() — which previously threw here and silently killed the entire
  // metronome before any Tone.Player was even created (root cause of the iPhone
  // "Play does nothing" bug). The authoritative gate is decode success, verified
  // later by Tone.loaded() + collectMetronomeSampleLoadFailures().
  async verifyMetronomeSampleUrl(url) {
    const resolvedUrl = this.resolveMetronomeSampleUrl(url)
    audioDiag('metronome-samples', 'preflight sample URL', { url, resolvedUrl })

    try {
      const response = await fetch(resolvedUrl)

      if (!response.ok) {
        audioDiag('metronome-samples', 'preflight HTTP failed', {
          url,
          resolvedUrl,
          status: response.status,
        })
        console.warn('[Moondrone metronome] Sample preflight failed', {
          url,
          resolvedUrl,
          status: response.status,
          statusText: response.statusText,
        })
        return false
      }

      const contentType = response.headers.get('content-type') || ''
      audioDiag('metronome-samples', 'preflight HTTP ok', { url, resolvedUrl, contentType })

      if (contentType && !contentType.includes('audio') && !contentType.includes('octet-stream')) {
        console.warn('[Moondrone metronome] Sample preflight unexpected content-type', {
          url,
          resolvedUrl,
          contentType,
        })
      }

      return true
    } catch (error) {
      audioDiag('metronome-samples', 'preflight fetch skipped/failed (non-fatal)', {
        url,
        resolvedUrl,
        error: error?.message ?? String(error),
      })
      console.warn('[Moondrone metronome] Sample preflight skipped', {
        url,
        resolvedUrl,
        error: error?.message ?? String(error),
      })
      return null
    }
  }

  createMetronomeSoftClipper() {
    const curve = new Float32Array(256)

    for (let index = 0; index < 256; index += 1) {
      const amount = (index / 255) * 2 - 1
      curve[index] = Math.tanh(amount * METRONOME_SOFT_CLIP_DRIVE) * METRONOME_SOFT_CLIP_SCALE
    }

    return new Tone.WaveShaper(curve)
  }

  createMetronomePlayer(url) {
    const resolvedUrl = this.resolveMetronomeSampleUrl(url)
    audioDiag('metronome-samples', 'creating Tone.Player', { url, resolvedUrl })

    const player = new Tone.Player({
      url: resolvedUrl,
      onerror: (error) => {
        this.logMetronomeSampleLoadFailure('player', url, {
          resolvedUrl,
          error: error?.message ?? String(error),
          phase: 'Tone.Player.onerror',
        })
        audioDiag('metronome-samples', 'Tone.Player onerror', {
          url,
          resolvedUrl,
          error: error?.message ?? String(error),
        })
      },
      onload: () => {
        audioDiag('metronome-samples', 'Tone.Player loaded', { url, resolvedUrl })
      },
    })

    player.connect(this.metronomeTrim)
    return player
  }

  collectMetronomeSampleLoadFailures() {
    const failures = []

    Object.entries(this.metronomePlayerPools ?? {}).forEach(([sampleId, players]) => {
      const relativeUrl = METRONOME_SAMPLE_URLS[sampleId]

      players.forEach((player, index) => {
        if (player.loaded) {
          return
        }

        failures.push({
          sampleId,
          index,
          url: relativeUrl,
          resolvedUrl: this.resolveMetronomeSampleUrl(relativeUrl),
          playerState: player.state,
          bufferLoaded: Boolean(player.buffer),
        })

        this.logMetronomeSampleLoadFailure(sampleId, relativeUrl, {
          index,
          playerState: player.state,
          bufferLoaded: Boolean(player.buffer),
          phase: 'Tone.loaded',
        })
        audioDiag('metronome-samples', 'player not loaded after Tone.loaded', {
          sampleId,
          url: relativeUrl,
          resolvedUrl: this.resolveMetronomeSampleUrl(relativeUrl),
          index,
        })
      })
    })

    return failures
  }

  ensureMetronomeFallbackClick() {
    if (this.metronomeFallbackVolume) {
      return
    }

    this.metronomeFallbackOsc = new Tone.Oscillator({
      type: 'sine',
      frequency: METRONOME_CLICK_FREQUENCY,
    })
    this.metronomeFallbackVolume = new Tone.Volume(-100)
    this.metronomeFallbackOsc.connect(this.metronomeFallbackVolume)
    this.metronomeFallbackVolume.connect(this.metronomeTrim)
    this.metronomeFallbackOsc.start()
  }

  triggerMetronomeFallbackClick(time, targetDb) {
    if (!this.metronomeFallbackVolume) {
      return
    }

    const volumeParam = this.metronomeFallbackVolume.volume

    volumeParam.cancelScheduledValues(time)
    volumeParam.setValueAtTime(targetDb + METRONOME_ATTACK_SOFTENING_DB, time)
    volumeParam.linearRampToValueAtTime(targetDb, time + METRONOME_ATTACK_RAMP_SECONDS)
    volumeParam.exponentialRampToValueAtTime(-100, time + 0.045)

    this.metronomeBeatsScheduledTotal = (this.metronomeBeatsScheduledTotal ?? 0) + 1

    // Temporary debug: prove the oscillator click is actually scheduled (first few only).
    if ((this.metronomeClickLogCount ?? 0) < 8) {
      this.metronomeClickLogCount = (this.metronomeClickLogCount ?? 0) + 1
      audioDiag('metronome-tick', 'metronome oscillator click started', {
        beat: this.metronomeMeasureBeatIndex,
        time: Number(time?.toFixed?.(3) ?? time),
        contextState: this.getContextState(),
        primerPlaying: isPrimerPlaying(),
      })
    }
  }

  activateMetronomeSampleFallback(reason, details = {}) {
    this.metronomeUsesSampleFallback = true
    this.ensureMetronomeFallbackClick()
    audioDiag('metronome-samples', `using oscillator fallback (${reason})`, details)
    console.warn('[Moondrone metronome] Using oscillator fallback click', { reason, ...details })
  }

  // Build the metronome EQ/trim/gain processing nodes once and wire them into the master
  // limiter (the same audible output path the drone uses). Idempotent.
  buildMetronomeProcessingChain() {
    if (this.metronomeTrim) {
      return
    }

    this.ensureMasterOutput()
    this.metronomeTrim = new Tone.Volume(METRONOME_TRIM_DB)
    this.metronomeSoftClip = this.createMetronomeSoftClipper()
    this.metronomePresenceEq = new Tone.Filter({
      type: 'peaking',
      frequency: METRONOME_PRESENCE_FREQUENCY,
      Q: METRONOME_PRESENCE_Q,
      gain: METRONOME_PRESENCE_GAIN_DB,
    })
    this.metronomeClickEq = new Tone.Filter({
      type: 'peaking',
      frequency: METRONOME_CLICK_FREQUENCY,
      Q: METRONOME_CLICK_Q,
      gain: METRONOME_CLICK_GAIN_DB,
    })
    this.metronomeGain = new Tone.Volume(METRONOME_OUTPUT_DB)
    this.metronomeTrim.connect(this.metronomePresenceEq)
    this.metronomePresenceEq.connect(this.metronomeClickEq)
    this.metronomeClickEq.connect(this.metronomeSoftClip)
    this.metronomeSoftClip.connect(this.metronomeGain)
    this.metronomeGain.connect(this.masterLimiter)
  }

  async ensureMetronomeChain() {
    if (this.metronomeChainReady) {
      audioDiag('metronome-engine', 'ensureMetronomeChain → reusing existing chain (no rebuild)')
      return this.metronomeChainReady
    }

    audioDiag('metronome-engine', 'ensureMetronomeChain → building fresh chain')
    this.metronomeChainReady = (async () => {
      // iOS native (Capacitor WKWebView): sample loading from capacitor://localhost reliably
      // FAILS and churns the AVAudioSession mid-startup (the real cause of "one click then
      // silence"). Bypass the entire sample path — no preflight, no Tone.Player, no Tone.loaded()
      // — and use the oscillator click as the PRIMARY iOS metronome engine.
      if (isIosNative()) {
        this.buildMetronomeProcessingChain()
        this.metronomePlayerPools = null
        this.activateMetronomeSampleFallback('ios-oscillator-primary')
        audioDiag('metronome-engine', 'iOS metronome using oscillator primary', {
          contextState: this.getContextState(),
        })
        return
      }

      try {
        audioDiag('metronome-engine', 'metronome chain: sample URLs', {
          urls: Object.fromEntries(
            METRONOME_SAMPLE_IDS.map((sampleId) => [
              sampleId,
              {
                path: METRONOME_SAMPLE_URLS[sampleId],
                resolved: this.resolveMetronomeSampleUrl(METRONOME_SAMPLE_URLS[sampleId]),
              },
            ]),
          ),
        })

        audioDiag('metronome-engine', 'metronome chain: verifying samples')
        await Promise.all(
          METRONOME_SAMPLE_IDS.map((sampleId) => this.verifyMetronomeSampleUrl(METRONOME_SAMPLE_URLS[sampleId])),
        )
        audioDiag('metronome-engine', 'metronome chain: samples verified, building nodes')

        this.buildMetronomeProcessingChain()
        this.metronomePlayerPools = {
          blockHigh: [this.createMetronomePlayer(METRONOME_SAMPLE_URLS.blockHigh)],
          blockLow: [this.createMetronomePlayer(METRONOME_SAMPLE_URLS.blockLow)],
          triangleOpen: Array.from(
            { length: TRIANGLE_OPEN_PLAYER_POOL_SIZE },
            () => this.createMetronomePlayer(METRONOME_SAMPLE_URLS.triangleOpen),
          ),
          triangleClosed: [this.createMetronomePlayer(METRONOME_SAMPLE_URLS.triangleClosed)],
        }

        try {
          await Tone.loaded()
          audioDiag('metronome-samples', 'Tone.loaded resolved')
        } catch (loadError) {
          audioDiag('metronome-samples', 'Tone.loaded rejected (non-fatal — checking players)', {
            message: loadError?.message ?? String(loadError),
          })
        }

        const sampleFailures = this.collectMetronomeSampleLoadFailures()

        if (sampleFailures.length > 0) {
          this.activateMetronomeSampleFallback('sample-load-failures', {
            failureCount: sampleFailures.length,
            failures: sampleFailures,
          })
        } else {
          this.metronomeUsesSampleFallback = false
          audioDiag('metronome-samples', 'all sample players loaded successfully')
        }

        audioDiag('metronome-engine', 'metronome chain: build complete', {
          usesSampleFallback: this.metronomeUsesSampleFallback === true,
        })
      } catch (error) {
        audioDiag('metronome-engine', 'metronome chain: BUILD FAILED — attempting oscillator fallback', {
          message: error?.message ?? String(error),
        })

        try {
          this.buildMetronomeProcessingChain()
          this.metronomePlayerPools = null
          this.activateMetronomeSampleFallback('chain-build-error', {
            message: error?.message ?? String(error),
          })
          audioDiag('metronome-engine', 'metronome chain: recovered with oscillator fallback')
        } catch (fallbackError) {
          this.metronomeChainReady = null
          audioDiag('metronome-engine', 'metronome chain: fallback setup FAILED', {
            message: fallbackError?.message ?? String(fallbackError),
          })
          console.error('[Moondrone metronome] Metronome chain setup failed', {
            message: fallbackError?.message ?? String(fallbackError),
            error: fallbackError,
          })
          throw fallbackError
        }
      }
    })()

    return this.metronomeChainReady
  }

  getTriangleOpenPlayer() {
    const players = this.metronomePlayerPools?.triangleOpen

    if (!players?.length) {
      return null
    }

    const idlePlayer = players.find((player) => player.state !== 'started')

    return idlePlayer ?? null
  }

  getMetronomePlayer(sampleId) {
    const players = this.metronomePlayerPools?.[sampleId]

    if (!players?.length) {
      return null
    }

    if (sampleId === 'triangleOpen') {
      return this.getTriangleOpenPlayer()
    }

    return players[0]
  }

  advanceMetronomeMeasure() {
    this.metronomeMeasureBeatIndex = 0

    if (this.metronomePendingMeter !== null) {
      this.metronomeActiveMeter = this.metronomePendingMeter
      this.metronomePendingMeter = null
    }
  }

  triggerMetronomeClick(time = Tone.now()) {
    if (!this.metronomePlaying) {
      return
    }

    if (!this.metronomePlayerPools && !this.metronomeUsesSampleFallback) {
      return
    }

    const isDownbeat = this.metronomeMeasureBeatIndex === 0
    const sampleId = this.getMetronomeSampleId(isDownbeat)
    const beatsPerMeasure = this.getMetronomeActiveBeatsPerMeasure()
    const playbackDb = this.isStraightMetronome()
      ? (this.metronomeSoundMode === 'triangle' ? METRONOME_REGULAR_DB : METRONOME_ACCENT_DB)
      : (isDownbeat ? METRONOME_ACCENT_DB : METRONOME_REGULAR_DB)
    const sampleDb = sampleId === 'triangleOpen' ? METRONOME_TRIANGLE_OPEN_SAMPLE_DB : 0
    const targetDb = playbackDb + sampleDb

    const scheduleBeatVisual = () => {
      if (this.onMetronomeBeat) {
        const downbeat = isDownbeat
        Tone.Draw.schedule(() => {
          try {
            this.onMetronomeBeat?.(downbeat)
          } catch {
            // A visual hook must never disrupt audio scheduling.
          }
        }, time)
      }
    }

    const advanceBeat = () => {
      this.metronomeMeasureBeatIndex += 1

      if (this.metronomeMeasureBeatIndex >= beatsPerMeasure) {
        this.advanceMetronomeMeasure()
      }
    }

    if (this.metronomeUsesSampleFallback) {
      this.triggerMetronomeFallbackClick(time, targetDb)
      scheduleBeatVisual()
      advanceBeat()
      return
    }

    const player = this.getMetronomePlayer(sampleId)

    if (!player) {
      this.logMetronomeSampleLoadFailure(sampleId, METRONOME_SAMPLE_URLS[sampleId], {
        phase: 'trigger',
        reason: 'no idle player available',
      })
      this.triggerMetronomeFallbackClick(time, targetDb)
      scheduleBeatVisual()
      advanceBeat()
      return
    }

    if (!player.loaded) {
      this.logMetronomeSampleLoadFailure(sampleId, METRONOME_SAMPLE_URLS[sampleId], {
        phase: 'trigger',
        reason: 'player not loaded',
        playerState: player.state,
        bufferLoaded: Boolean(player.buffer),
      })
      this.triggerMetronomeFallbackClick(time, targetDb)
      scheduleBeatVisual()
      advanceBeat()
      return
    }

    player.volume.cancelScheduledValues(time)
    player.volume.setValueAtTime(targetDb + METRONOME_ATTACK_SOFTENING_DB, time)
    player.volume.linearRampToValueAtTime(targetDb, time + METRONOME_ATTACK_RAMP_SECONDS)
    player.start(time, 0)
    scheduleBeatVisual()
    advanceBeat()
  }

  advanceMetronomeBeatSilently() {
    const beatsPerMeasure = this.getMetronomeActiveBeatsPerMeasure()

    this.metronomeMeasureBeatIndex += 1

    if (this.metronomeMeasureBeatIndex >= beatsPerMeasure) {
      this.advanceMetronomeMeasure()
    }
  }

  getMetronomeBeatIntervalSeconds() {
    return 60 / this.metronomeBpm
  }

  fillMetronomeScheduleUntil(scheduleUntil, now = Tone.now(), options = {}) {
    const {
      maxBeats = METRONOME_MAX_BEATS_PER_SCHEDULE_TICK,
      unlimited = false,
    } = options
    const interval = this.getMetronomeBeatIntervalSeconds()
    let beatsScheduledThisTick = 0

    while (this.nextMetronomeBeatTime < scheduleUntil) {
      if (!unlimited && beatsScheduledThisTick >= maxBeats) {
        break
      }

      if (this.nextMetronomeBeatTime < now - METRONOME_LATE_TOLERANCE_SECONDS) {
        this.advanceMetronomeBeatSilently()
        this.nextMetronomeBeatTime += interval
        continue
      }

      const scheduleTime = Math.max(this.nextMetronomeBeatTime, now)
      this.triggerMetronomeClick(scheduleTime)
      this.nextMetronomeBeatTime += interval
      beatsScheduledThisTick += 1
    }
  }

  primeMetronomeSchedule(lookaheadSeconds = METRONOME_TRANSITION_PRIME_SECONDS) {
    if (!this.metronomePlaying) {
      return
    }

    this.fillMetronomeScheduleUntil(
      Tone.now() + lookaheadSeconds,
      Tone.now(),
      { unlimited: true },
    )
  }

  startMetronomeScheduler() {
    if (this.metronomeTimer) {
      return
    }

    this.metronomeSchedulerTickCount = 0

    const tick = () => {
      this.metronomeSchedulerTickCount += 1
      this.scheduleMetronomeBeats()

      // Only log "tick fired" when the context is actually running — while interrupted the scheduler
      // returns cleanly without scheduling, so logging every tick was just noise/spam during the
      // recovery window. (scheduleMetronomeBeats already logs the paused state once.)
      if (this.getContextState() !== 'running') {
        return
      }

      // Temporary debug: prove the repeating callback is actually firing (first few only).
      if ((this.metronomeTickLogCount ?? 0) < 8) {
        this.metronomeTickLogCount = (this.metronomeTickLogCount ?? 0) + 1
        audioDiag('metronome-tick', 'metronome tick fired', {
          tick: this.metronomeSchedulerTickCount,
          beat: this.metronomeMeasureBeatIndex,
          contextState: this.getContextState(),
          currentTime: Number(Tone.now().toFixed(3)),
          primerPlaying: isPrimerPlaying(),
          schedulerActive: Boolean(this.metronomeTimer),
          beatsScheduledTotal: this.metronomeBeatsScheduledTotal ?? 0,
        })
      }
    }

    this.metronomeTimer = window.setInterval(tick, METRONOME_SCHEDULE_INTERVAL_MS)
    this.metronomeUsesInterval = true
    tick()
  }

  stopMetronomeScheduler() {
    if (!this.metronomeTimer) {
      return
    }

    if (this.metronomeUsesInterval) {
      window.clearInterval(this.metronomeTimer)
    } else {
      window.clearTimeout(this.metronomeTimer)
    }

    this.metronomeTimer = null
    this.metronomeUsesInterval = false
  }

  clearMetronomePrimerWatchdog() {
    if (this.metronomePrimerWatchdogTimer) {
      window.clearTimeout(this.metronomePrimerWatchdogTimer)
      this.metronomePrimerWatchdogTimer = null
    }
  }

  assertMetronomeOperationCurrent(phase, operationToken) {
    if (operationToken == null) {
      return true
    }

    if (operationToken !== this.metronomeStartOperationToken) {
      audioDiag('metronome-engine', 'stale metronome operation ignored', {
        phase,
        operationToken,
        current: this.metronomeStartOperationToken,
      })
      return false
    }

    return true
  }

  // Best-effort, in-gesture primer unlock before the scheduler starts. The primer is a ONE-TIME
  // unlock — metronome truth is gated on the AudioContext being running, NOT on the primer
  // staying playing. We attempt a single ensurePrimerPlaying() if it is paused, but never fail
  // the start because of the primer alone (repeated primer restarts caused the interruption loop).
  async ensurePrimerPlayingForMetronomeScheduler(operationToken) {
    if (!isIosNative()) {
      return { ok: true, stale: false, contextState: this.getContextState(), primerPlaying: false }
    }

    const snapshot = () => ({
      contextState: this.getContextState(),
      primer: getPrimerDebugState(),
      primerPlaying: isPrimerPlaying(),
    })

    audioDiag('metronome-engine', 'metronome pre-scheduler primer check', snapshot())

    if (!this.assertMetronomeOperationCurrent('pre-scheduler-primer-check', operationToken)) {
      return { ok: false, stale: true }
    }

    // One-time unlock attempt only (best-effort).
    if (!isPrimerPlaying()) {
      audioDiag('metronome-engine', 'metronome pre-scheduler primer one-time unlock attempt', snapshot())
      await ensurePrimerPlaying('metronome-pre-scheduler')

      if (!this.assertMetronomeOperationCurrent('post-primer-unlock', operationToken)) {
        return { ok: false, stale: true }
      }
    }

    if (this.getContextState() !== 'running') {
      await this.ensureContextRunningForMetronomeScheduler('metronome-pre-scheduler-context')

      if (!this.assertMetronomeOperationCurrent('post-context-recheck', operationToken)) {
        return { ok: false, stale: true }
      }
    }

    const after = snapshot()
    audioDiag('metronome-engine', 'metronome scheduler start (context-gated, primer best-effort)', after)

    // Truth depends on the context running — a paused primer is acceptable.
    return { ok: after.contextState === 'running', stale: false, ...after }
  }

  scheduleMetronomePrimerWatchdog(operationToken) {
    this.clearMetronomePrimerWatchdog()

    this.metronomePrimerWatchdogTimer = window.setTimeout(() => {
      this.metronomePrimerWatchdogTimer = null
      void this.runMetronomePrimerWatchdog(operationToken)
    }, 750)
  }

  // Softened watchdog: the primer is a one-time in-gesture unlock. Once the oscillator metronome
  // is scheduled on a running context, a paused primer is NOT a failure and we must NOT keep
  // restarting it (that re-prime caused the interruption/recovery loop on iOS). We only act on the
  // AudioContext: if it is interrupted, recover the context (not the primer).
  async runMetronomePrimerWatchdog(operationToken) {
    if (!isIosNative()) {
      return
    }

    if (!this.assertMetronomeOperationCurrent('primer-watchdog', operationToken)) {
      return
    }

    if (!this.metronomePlaying || !this.metronomeTimer) {
      return
    }

    const contextState = this.getContextState()

    if (contextState === 'running') {
      audioDiag('metronome-engine', 'metronome primer watchdog: context running (primer pause ignored)', {
        contextState,
        primerPlaying: isPrimerPlaying(),
      })
      return
    }

    audioDiag('metronome-engine', 'metronome primer watchdog: context not running — recovering context (not primer)', {
      contextState,
      primerPlaying: isPrimerPlaying(),
    })
    this.scheduleContextInterruptRecovery('metronome-primer-watchdog')
  }

  clearMetronomeSchedulerForRestart(reason = 'restart') {
    if (this.metronomeTimer) {
      audioDiag('metronome-engine', 'clearing stale metronome scheduler before restart', { reason })
      this.stopMetronomeScheduler()
    }

    if (this.metronomePlaying) {
      this.metronomePlaying = false
      this.cancelPendingMetronomeClicks()
    }
  }

  async ensureContextRunningForMetronomeScheduler(reason = 'metronome-pre-scheduler') {
    const waitForRunning = async (attemptLabel) => {
      let state = this.getContextState()

      if (state === 'running') {
        return true
      }

      audioDiag('metronome-engine', 'context not running before metronome scheduler', {
        reason,
        attemptLabel,
        contextState: state,
      })

      if (state === 'interrupted' || state === 'suspended') {
        await this.attemptContextInterruptRecovery(`${reason}-${attemptLabel}`)
        state = this.getContextState()
        if (state === 'running') {
          return true
        }

        await this.resumeContextIfNeeded()
        await configureNativePlaybackSession('metronome-pre-scheduler', { throttle: true })
        await new Promise((resolve) => {
          window.setTimeout(resolve, attemptLabel === 'initial' ? 1100 : 500)
        })
        return this.getContextState() === 'running'
      }

      await this.resumeContextIfNeeded()
      return this.getContextState() === 'running'
    }

    if (await waitForRunning('initial')) {
      return true
    }

    return waitForRunning('retry')
  }

  logMetronomeSchedulerStartDiagnostics() {
    const snapshot = () => ({
      contextState: this.getContextState(),
      primer: getPrimerDebugState(),
      metronomePlaying: this.metronomePlaying,
      schedulerActive: Boolean(this.metronomeTimer),
    })

    audioDiag('metronome-engine', 'metronome scheduler start — primer/context snapshot', snapshot())

    window.setTimeout(() => {
      audioDiag('metronome-engine', 'metronome scheduler +1s — primer/context snapshot', snapshot())
    }, 1000)
  }

  scheduleMetronomeBeats() {
    if (!this.metronomePlaying) {
      return
    }

    // If the audio clock is frozen (iOS context interrupted/suspended), do NOT schedule beats
    // against a stalled clock — that produces a burst of catch-up clicks on recovery. Pause
    // scheduling until the context is running again, then resync from the next beat.
    const state = this.getContextState()

    if (state !== 'running') {
      this.metronomeNeedsResync = true

      if (!this.metronomeContextStallLogged) {
        this.metronomeContextStallLogged = true
        audioDiag('metronome-engine', 'metronome scheduler paused — context not running (awaiting recovery)', {
          contextState: state,
        })
      }

      return
    }

    if (this.metronomeNeedsResync) {
      // Defense-in-depth: if a resync was flagged but the scheduler never actually stalled and we
      // just started the audible scheduler, this is a stale startup recovery — skip the resync so we
      // do not reset nextMetronomeBeatTime and emit an early/double click.
      const sinceAudibleStart = Date.now() - (this.metronomeAudibleStartAt ?? 0)
      if (!this.metronomeContextStallLogged && sinceAudibleStart < 1500) {
        this.metronomeNeedsResync = false
        audioDiag('metronome-engine', 'metronome scheduler resync skipped — stale startup recovery', {
          contextState: state,
          sinceAudibleStart,
        })
      } else {
        this.metronomeNeedsResync = false
        this.metronomeContextStallLogged = false
        this.nextMetronomeBeatTime = Tone.now() + 0.05
        audioDiag('metronome-engine', 'metronome scheduler resynced after context recovery', {
          contextState: state,
        })
      }
    }

    const now = Tone.now()
    this.fillMetronomeScheduleUntil(now + METRONOME_LOOKAHEAD_SECONDS, now)
  }

  async startMetronome(bpm = this.metronomeBpm, {
    operationToken = null,
    skipNativeReconfigure = false,
    fastAudibleStart = false,
  } = {}) {
    this.metronomeStartOperationToken = operationToken
    this.metronomeStartupGeneration += 1
    this.metronomeStartupRecoveryPending = false
    const startupGeneration = this.metronomeStartupGeneration
    audioDiag('metronome-engine', 'startMetronome ENTER', {
      ...this.getMetronomeDiagnostics(),
      operationToken,
      startupGeneration,
      skipNativeReconfigure,
    })

    const assertCurrent = (phase) => {
      if (!this.assertMetronomeOperationCurrent(phase, operationToken)) {
        this.clearMetronomeSchedulerForRestart('stale-operation')
        throw new Error(`stale metronome operation at ${phase}`)
      }
    }

    // IMPORTANT (iOS): resume the WebAudio context FIRST, while we are still inside the user
    // gesture's activation window. Awaiting the native bridge before Tone.start() can consume
    // the transient activation and leave the context suspended (silent metronome).
    audioDiag('metronome-engine', 'before Tone.start()', { contextState: this.getContextState() })
    await Tone.start()
    assertCurrent('after-tone-start')
    audioDiag('metronome-engine', 'after Tone.start()', { contextState: this.getContextState() })
    await this.resumeContextIfNeeded()
    assertCurrent('after-resume-context')
    audioDiag('metronome-engine', 'after resumeContextIfNeeded()', { contextState: this.getContextState() })
    this.ensureContextStateWatcher()

    // Now that the context exists, re-assert AVAudioSession `.playback` natively so the metronome
    // ignores the Ring/Silent switch (WKWebView can reset the session on context init). No-op off iOS.
    // When the drone is already playing on a running context, skip this — reconfiguring the native
    // session can emit an interruption that disrupts the live drone.
    if (skipNativeReconfigure) {
      audioDiag('metronome-engine', 'skipping native session reconfigure (drone already running)', {
        contextState: this.getContextState(),
      })
    } else if (isNativePlaybackRecentlyConfigured()) {
      // App-open prewarm and media-primer-before already asserted Playback moments ago. Re-asserting
      // here is the call iOS associated with audioSessionInterrupted right after Tone.start during
      // metronome-first startup — skip it when Playback is already active/recent.
      audioDiag('metronome-engine', 'metronome-post-context skipped — Playback already active', {
        contextState: this.getContextState(),
      })
    } else {
      audioDiag('metronome-engine', 'before configureNativePlaybackSession')
      const sessionState = await configureNativePlaybackSession('metronome-post-context', { throttle: true })
      assertCurrent('after-native-session')
      audioDiag('metronome-engine', 'after configureNativePlaybackSession', {
        sessionState,
        contextState: this.getContextState(),
      })
    }

    this.metronomeBpm = this.clamp(bpm, MIN_METRONOME_BPM, MAX_METRONOME_BPM)

    if (this.metronomePlaying) {
      audioDiag('metronome-engine', 'startMetronome EARLY RETURN — already playing')
      return this.getMetronomeDiagnostics()
    }

    audioDiag('metronome-engine', 'before ensureMetronomeChain()', this.getMetronomeDiagnostics())
    await this.ensureMetronomeChain()
    assertCurrent('after-ensure-chain')
    audioDiag('metronome-engine', 'after ensureMetronomeChain()', {
      usesSampleFallback: this.metronomeUsesSampleFallback === true,
      contextState: this.getContextState(),
    })

    this.clearMetronomeSchedulerForRestart('pre-start')

    const contextReady = await this.ensureContextRunningForMetronomeScheduler('metronome-pre-scheduler')
    assertCurrent('after-context-recovery')
    if (!contextReady || this.getContextState() !== 'running') {
      this.clearMetronomeSchedulerForRestart('failed-context')
      audioDiag('metronome-engine', 'startMetronome FAILED — context not running before scheduler', {
        contextState: this.getContextState(),
      })
      throw new Error('AudioContext not running — cannot start metronome scheduler')
    }

    const primerReady = await this.ensurePrimerPlayingForMetronomeScheduler(operationToken)
    if (primerReady.stale) {
      this.clearMetronomeSchedulerForRestart('stale-operation')
      throw new Error('stale metronome operation before scheduler')
    }
    if (!primerReady.ok) {
      this.clearMetronomeSchedulerForRestart('context-not-ready')
      throw new Error('AudioContext not running — cannot start metronome scheduler')
    }

    assertCurrent('pre-scheduler')

    this.metronomeActiveMeter = this.metronomeMeter
    this.metronomePendingMeter = null

    let startupRecovered = false

    if (fastAudibleStart) {
      // Stable shared audio (drone already running on a healthy session) — start the audible
      // scheduler immediately. No settle window needed; reconfigure was already skipped.
      if (!this.beginAudibleMetronomeScheduler(operationToken, startupGeneration, 'fast-stable')) {
        throw new Error('stale metronome startup generation before audible scheduler')
      }
    } else {
      // Cold / uncertain / interrupted / recovering / failed: PREPARE only. Do NOT schedule any
      // audible click until the settle/recovery window confirms the context is stable — this is what
      // removes the one-click-then-restart double-click pattern (no click before stability).
      audioDiag('metronome-engine', 'metronome cold startup prepared — waiting for stable audio', {
        contextState: this.getContextState(),
        startupGeneration,
      })
      audioDiag('metronome-engine', 'metronome audible scheduler delayed until stable', { startupGeneration })

      const stable = await this.waitForMetronomeStartupStable(operationToken, startupGeneration)
      if (stable.stale) {
        throw new Error('stale metronome operation during startup wait')
      }
      if (!stable.ok) {
        audioDiag('metronome-engine', 'metronome startup failed — no scheduler started', {
          contextState: this.getContextState(),
          startupGeneration,
        })
        this.clearMetronomeSchedulerForRestart('startup-failed')
        throw new Error('Metronome startup did not stabilize — context not running')
      }
      startupRecovered = stable.recovered === true

      if (!this.beginAudibleMetronomeScheduler(operationToken, startupGeneration, 'stable-after-wait')) {
        throw new Error('stale metronome startup generation before audible scheduler')
      }
    }

    // Final reality: running context + live scheduler + at least one beat scheduled by the clock.
    const schedulerReal = Boolean(this.metronomeTimer) && (this.metronomeBeatsScheduledTotal ?? 0) > 0
    if (this.getContextState() !== 'running' || !schedulerReal) {
      this.clearMetronomeSchedulerForRestart('post-start-verify-failed')
      throw new Error('Metronome scheduler failed to start with running context and scheduled beats')
    }

    return { ...this.getMetronomeDiagnostics(), startupRecovered }
  }

  // Start the AUDIBLE metronome scheduler exactly once per successful startup generation. Resets all
  // beat/scheduling state first (no stale primed beat / catch-up burst), then marks audio health
  // stable — the caller has already confirmed the context is running for this generation.
  beginAudibleMetronomeScheduler(operationToken, startupGeneration, reason) {
    if (startupGeneration !== this.metronomeStartupGeneration
      || !this.assertMetronomeOperationCurrent('begin-audible-scheduler', operationToken)) {
      audioDiag('metronome-engine', 'metronome scheduler start ignored — stale startup generation', {
        reason,
        startupGeneration,
        currentGeneration: this.metronomeStartupGeneration,
      })
      return false
    }

    if (this.getContextState() !== 'running') {
      audioDiag('metronome-engine', 'metronome scheduler start ignored — context not running', {
        reason,
        contextState: this.getContextState(),
      })
      return false
    }

    // Consume any context-interrupt recovery that was scheduled DURING this startup. The audible
    // scheduler is now starting from a clean, running context, so a stale earlier recovery must not
    // later fire and resync (the cause of first-click → early/double-click → normal).
    if (this.contextInterruptDebounceTimer) {
      window.clearTimeout(this.contextInterruptDebounceTimer)
      this.contextInterruptDebounceTimer = null
      audioDiag('metronome-engine', 'metronome startup consumed pending interruption recovery', {
        reason,
        startupGeneration,
      })
    }
    this.metronomeContextRecoveryDeadline = 0

    // Clean slate: no stale next-beat time, beat index, primed beats, or counters.
    this.metronomeMeasureBeatIndex = 0
    this.metronomeNeedsResync = false
    this.metronomeContextStallLogged = false
    this.metronomeAudibleStartAt = Date.now()
    this.metronomePlaying = true
    this.applyDroneMetronomeHeadroom()
    this.nextMetronomeBeatTime = Tone.now() + 0.05
    this.metronomeBeatsScheduledTotal = 0
    this.metronomeClickLogCount = 0
    this.metronomeTickLogCount = 0
    this.primeMetronomeSchedule(METRONOME_TRANSITION_PRIME_SECONDS)
    this.startMetronomeScheduler()
    this.logMetronomeSchedulerStartDiagnostics()
    this.scheduleMetronomePrimerWatchdog(operationToken)

    setAudioHealth(AudioHealth.STABLE, `metronome-audible-start:${reason}`)
    audioDiag('metronome-engine', 'metronome startup stable — starting audible scheduler', {
      reason,
      contextState: this.getContextState(),
      schedulerActive: Boolean(this.metronomeTimer),
      beatsScheduled: this.metronomeBeatsScheduledTotal,
      startupGeneration,
    })
    return true
  }

  // Wait through the settle window WITHOUT any audible scheduler running. If the context interrupts
  // before the audible scheduler starts, recover exactly ONCE (generation-guarded so a superseded
  // start, watchdog, statechange, or native handler cannot double-recover). Returns
  // { ok, stale, recovered }.
  async waitForMetronomeStartupStable(operationToken, startupGeneration) {
    const CONSERVATIVE_SETTLE_MS = 400
    const FAST_SETTLE_MS = 275

    // Use the shorter settle ONLY when interruption is unlikely: no startup recovery pending and the
    // native Playback session is already active + clean (warm session). A cold start, a pending
    // recovery, or a partial native failure keeps the conservative settle.
    const canFastSettle = !this.metronomeStartupRecoveryPending
      && (!isIosNative() || (isNativePlaybackActive() && wasLastNativeConfigureClean()))
    const settleMs = canFastSettle ? FAST_SETTLE_MS : CONSERVATIVE_SETTLE_MS

    if (canFastSettle) {
      audioDiag('metronome-engine', 'metronome startup using fast settle', { settleMs, startupGeneration })
    } else {
      audioDiag('metronome-engine', 'metronome startup using conservative settle after interruption', {
        settleMs,
        startupGeneration,
        recoveryPending: this.metronomeStartupRecoveryPending === true,
      })
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, settleMs)
    })

    if (!this.assertMetronomeOperationCurrent('startup-wait', operationToken)
      || startupGeneration !== this.metronomeStartupGeneration) {
      return { ok: false, stale: true }
    }

    if (this.getContextState() === 'running') {
      return { ok: true, recovered: false }
    }

    audioDiag('metronome-engine', 'metronome startup interrupted before audible scheduler', {
      contextState: this.getContextState(),
      startupGeneration,
    })

    if (this.metronomeStartupRecoveryPending) {
      audioDiag('metronome-engine', 'metronome startup recovery already pending', {
        contextState: this.getContextState(),
        startupGeneration,
      })
    } else {
      this.metronomeStartupRecoveryPending = true
      await this.attemptContextInterruptRecovery('metronome-startup')
      this.metronomeStartupRecoveryPending = false
    }

    if (!this.assertMetronomeOperationCurrent('startup-wait-post-recovery', operationToken)
      || startupGeneration !== this.metronomeStartupGeneration) {
      return { ok: false, stale: true }
    }

    return { ok: this.getContextState() === 'running', recovered: true }
  }

  cancelPendingMetronomeClicks() {
    // iOS oscillator-primary: cancel any future scheduled click envelopes and release the running
    // click oscillator to silence with a tiny declick. Without this, a click whose down-ramp was
    // scheduled past the stop (lookahead) can leave the oscillator sustained at an audible level —
    // the "high tone after stop" bug. We silence the dedicated click volume only; the oscillator
    // keeps running at -100 dB and is disposed later by disposeMetronomeChain (never the master).
    if (this.metronomeFallbackVolume) {
      const volumeParam = this.metronomeFallbackVolume.volume
      const now = Tone.now()
      let wasAudible = false

      try {
        const currentDb = typeof volumeParam.getValueAtTime === 'function'
          ? volumeParam.getValueAtTime(now)
          : volumeParam.value
        wasAudible = currentDb > -60

        if (typeof volumeParam.cancelAndHoldAtTime === 'function') {
          volumeParam.cancelAndHoldAtTime(now)
        } else {
          volumeParam.cancelScheduledValues(now)
        }
        volumeParam.linearRampToValueAtTime(-100, now + 0.02)
      } catch {
        // Param may be mid-teardown; the chain dispose will finish silencing it.
      }

      if (wasAudible) {
        audioDiag('metronome-engine', 'metronome stop active click oscillators released', {
          contextState: this.getContextState(),
        })
      }

      audioDiag('metronome-engine', 'metronome oscillator cleanup complete', {
        contextState: this.getContextState(),
      })
    }

    if (!this.metronomePlayerPools) {
      return
    }

    Object.values(this.metronomePlayerPools).forEach((players) => {
      players.forEach((player) => {
        player.stop()
        player.volume.cancelScheduledValues(0)
      })
    })
  }

  // Metronome-only teardown. Touches ONLY metronome state/timer/click nodes plus the shared output
  // *level* (to remove the metronome headroom and restore the drone's gain). It must never dispose
  // or disconnect shared master/drone nodes, rebuild masterChain, mute final output, suspend the
  // context, hard reset, reconfigure the native session, or mark audio health failed.
  stopMetronome({ droneActive = false } = {}) {
    if (droneActive) {
      audioDiag('metronome-engine', 'metronome stop while drone active — preserving shared output', {
        contextState: this.getContextState(),
        isReady: this.isReady,
      })
    }

    this.clearMetronomePrimerWatchdog()
    this.metronomeStartOperationToken = null
    // Advance the startup generation so any in-flight startup wait/recovery for this metronome is
    // treated as stale and cannot start an audible scheduler after we have stopped.
    this.metronomeStartupGeneration += 1
    this.metronomeStartupRecoveryPending = false
    this.metronomeContextRecoveryDeadline = 0
    this.metronomeNeedsResync = false
    this.metronomeContextStallLogged = false
    this.metronomePlaying = false
    this.metronomeMeasureBeatIndex = 0
    this.metronomePendingMeter = null
    // Reset so a stopped metronome does not report a stale scheduled-beat count in diagnostics.
    // (startMetronome resets this again before each run; the UI honesty gate also requires
    // metronomePlaying + schedulerActive, so this is purely to keep stopped state truthful.)
    this.metronomeBeatsScheduledTotal = 0

    this.stopMetronomeScheduler()
    this.cancelPendingMetronomeClicks()
    // Restores the drone's master output level (removes metronome headroom). This is the ONLY shared
    // write and it ramps the level UP — it never silences or disconnects the drone.
    this.applyDroneMetronomeHeadroom()

    audioDiag('metronome-engine', 'metronome stop cleanup — metronome branch only', {
      contextState: this.getContextState(),
      droneActive,
      droneIsReady: this.isReady,
      droneIsPlaying: this.isPlaying,
    })
  }

  // Requirement G: after a metronome Stop while the drone should keep playing, verify the drone's
  // output is actually healthy and repair it immediately (do NOT wait for background/resume).
  verifyDroneOutputAfterMetronomeStop() {
    if (!this.isPlaying) {
      return
    }

    const contextState = this.getContextState()
    audioDiag('metronome-engine', 'post-metronome-stop drone output check', {
      contextState,
      isReady: this.isReady,
      masterChainReady: this.masterChainReady,
    })

    // Context interrupted/suspended while the drone should be playing — recover NOW via the shared
    // recovery path rather than waiting for an accidental background/resume recovery.
    if (contextState !== 'running') {
      audioDiag('metronome-engine', 'drone output repair after metronome stop', { contextState })
      this.scheduleContextInterruptRecovery('post-metronome-stop')
      return
    }

    // Context running but the drone graph is gone (disposed/disconnected) — we cannot silently
    // repair audio nodes that no longer exist, so force an honest UI state + allow a clean restart.
    if (!this.isReady || !this.masterChainReady || !this.output) {
      audioDiag('metronome-engine', 'drone output silent while UI playing — forcing honest state', {
        contextState,
        isReady: this.isReady,
        masterChainReady: this.masterChainReady,
      })
      this.isPlaying = false
      if (this.onPlaybackInterrupted) {
        try {
          this.onPlaybackInterrupted({ wasPlaying: true, wasMetronomePlaying: false })
        } catch {
          // UI hook failure must never break audio.
        }
      }
      return
    }

    // Context running and graph intact — re-assert the drone output level as a cheap repair in case
    // the headroom math or a stale ramp left it low. applyVolume()/headroom both ramp, no click.
    audioDiag('metronome-engine', 'drone output repair after metronome stop', {
      contextState,
      repair: 'reassert-output-level',
    })
    this.applyDroneMetronomeHeadroom()
  }

  // Background audio is disabled: when the app backgrounds/locks/goes inactive, stop cleanly with a
  // short declick instead of a hard reset. Reflects "stopped" intent synchronously (so a deferred
  // teardown frozen by iOS cannot desync resume logic), declicks the audible output, then tears the
  // graph down via the normal lifecycle stop once it is silent. Returns { wasPlaying, wasMetronomePlaying }.
  gracefulStopForLifecycle() {
    const wasPlaying = this.isPlaying
    const wasMetronomePlaying = this.metronomePlaying

    // Idempotent: duplicate inactive/hidden/pagehide events must not double-teardown. If a stop is
    // already in progress, or there is genuinely nothing to stop, skip.
    if (this.lifecycleStopInProgress || (!wasPlaying && !wasMetronomePlaying)) {
      audioDiag('lifecycle', 'lifecycle graceful stop skipped — already stopped/in progress', {
        lifecycleStopInProgress: this.lifecycleStopInProgress === true,
        wasPlaying,
        wasMetronomePlaying,
      })
      return { wasPlaying, wasMetronomePlaying }
    }

    this.lifecycleStopInProgress = true

    audioDiag('lifecycle', 'background audio disabled — graceful stop begin', {
      wasPlaying,
      wasMetronomePlaying,
      contextState: this.getContextState(),
    })

    // Mark intent stopped immediately + bump generations so any in-flight startup/recovery callback
    // is treated as stale and cannot restore output after this lifecycle stop.
    this.isPlaying = false
    this.metronomePlaying = false
    this.isStarting = false
    this.droneExplicitlyStopped = true
    this.lastDroneStopAt = Date.now()
    this.lifecycleStopPendingPlay = true
    this.bumpDroneOpGeneration('lifecycle-stop')
    this.metronomeStartupGeneration += 1

    // Cancel stale startup/recovery timers so nothing fires mid/post teardown.
    if (this.contextInterruptDebounceTimer) {
      window.clearTimeout(this.contextInterruptDebounceTimer)
      this.contextInterruptDebounceTimer = null
    }
    this.metronomeContextRecoveryDeadline = 0
    this.metronomeStartupRecoveryPending = false
    this.clearMetronomePrimerWatchdog()

    // Stop metronome scheduling immediately (no tick lands during the declick) + release the click
    // oscillator so nothing sustains.
    this.stopMetronomeScheduler()
    this.cancelPendingMetronomeClicks()

    // Emergency declick: cancel scheduled automation on the final output, ramp to near-silence over
    // ~60ms, and snap the reverb wet to 0 so no reverb tail survives the background suspension.
    const DECLICK_SECONDS = 0.06
    const now = Tone.now()
    if (this.masterFinalOutputTrim) {
      try {
        this.masterFinalOutputTrim.volume.cancelScheduledValues(now)
        this.rampParam(this.masterFinalOutputTrim.volume, -60, DECLICK_SECONDS)
      } catch {
        // Output may be mid-teardown; ignore.
      }
    }
    if (this.reverb?.wet) {
      try {
        this.reverb.wet.cancelScheduledValues(now)
        this.reverb.wet.linearRampToValueAtTime(0, now + DECLICK_SECONDS)
      } catch {
        // Reverb may be mid-teardown; ignore.
      }
    }

    // Tear down the graph once the declick has rendered, then restore the trim level for next Play.
    window.setTimeout(() => {
      this.stopForLifecycle()
      if (this.masterFinalOutputTrim) {
        try {
          this.masterFinalOutputTrim.volume.cancelScheduledValues(Tone.now())
          this.masterFinalOutputTrim.volume.value = this.getToneLabFinalOutputTrimDb()
        } catch {
          // Node may be mid-teardown; ignore.
        }
      }
      this.lifecycleStopInProgress = false
      audioDiag('lifecycle', 'background audio disabled — graceful stop complete', {
        contextState: this.getContextState(),
      })
    }, 120)

    return { wasPlaying, wasMetronomePlaying }
  }

  // On resume after a background stop: clear any stale recovery timers/state and reset the final
  // output trim so the next foreground Play starts clean. Background audio is not kept alive, so
  // there is nothing to recover here.
  clearBackgroundRecoveryState(reason = 'resume') {
    if (this.contextInterruptDebounceTimer) {
      window.clearTimeout(this.contextInterruptDebounceTimer)
      this.contextInterruptDebounceTimer = null
    }
    this.contextInterruptRecoveryInFlight = false
    this.metronomeContextRecoveryDeadline = 0
    this.metronomeStartupRecoveryPending = false

    if (this.masterFinalOutputTrim) {
      try {
        this.masterFinalOutputTrim.mute = false
        this.masterFinalOutputTrim.volume.cancelScheduledValues(Tone.now())
        this.masterFinalOutputTrim.volume.value = this.getToneLabFinalOutputTrimDb()
      } catch {
        // Node may be mid-teardown; ignore.
      }
    }

    // Force the next Play onto the safe foreground startup path (no lightweight reuse of a stale
    // "stable" health from before the background stop).
    setAudioHealth(AudioHealth.UNCERTAIN, `resume-after-background-stop:${reason}`)

    audioDiag('lifecycle', 'background recovery timers cleared', { reason })
  }

  setMetronomeBpm(bpm) {
    this.metronomeBpm = this.clamp(bpm, MIN_METRONOME_BPM, MAX_METRONOME_BPM)

    if (this.metronomePlaying) {
      this.nextMetronomeBeatTime = Math.max(this.nextMetronomeBeatTime, Tone.now() + 0.01)
      this.primeMetronomeSchedule(METRONOME_LOOKAHEAD_SECONDS)
    }
  }

  setMetronomeSoundMode(mode) {
    if (mode === 'triangle' || mode === 'wood') {
      this.metronomeSoundMode = mode
    }
  }

  setMetronomeMeter(meter) {
    if (meter === METRONOME_STRAIGHT_METER) {
      this.metronomeMeter = METRONOME_STRAIGHT_METER

      if (this.metronomePlaying) {
        this.metronomePendingMeter = METRONOME_STRAIGHT_METER
        return
      }

      this.metronomeActiveMeter = METRONOME_STRAIGHT_METER
      this.metronomePendingMeter = null
      this.metronomeMeasureBeatIndex = 0
      return
    }

    const beatsPerMeasure = Math.round(meter)

    if (beatsPerMeasure < 2 || beatsPerMeasure > 6) {
      return
    }

    this.metronomeMeter = beatsPerMeasure

    if (this.metronomePlaying) {
      this.metronomePendingMeter = beatsPerMeasure
      return
    }

    this.metronomeActiveMeter = beatsPerMeasure
    this.metronomePendingMeter = null
    this.metronomeMeasureBeatIndex = 0
  }

  createStandardVoice(index) {
    const gain = new Tone.Gain(0)
    const panner = new Tone.Panner(this.getVoicePan(index)).connect(this.filter)
    const oscillator = new Tone.Oscillator({
      ...this.getVoiceOscillatorOptions(index),
      detune: 0,
    }).connect(gain)
    gain.connect(panner)

    return {
      gain,
      panner,
      oscillators: [oscillator],
      oscillator,
      targetGain: this.getVoiceTargetGain(index),
    }
  }

  createStringsVoice(index) {
    const gain = new Tone.Gain(0)
    const panner = new Tone.Panner(this.getVoicePan(index)).connect(this.filter)
    const ensembleDetunes = STRINGS_ENSEMBLE_DETUNE_CENTS[index]
    const oscillators = []
    const ensembleGains = []
    const stringsBaseDetunes = []

    ensembleDetunes.forEach((baseDetune) => {
      const ensembleGain = new Tone.Gain(0.5)
      const oscillator = new Tone.Oscillator({
        ...this.getStringsOscillatorOptions(index),
        detune: baseDetune,
      })

      oscillator.connect(ensembleGain)
      ensembleGain.connect(gain)
      oscillators.push(oscillator)
      ensembleGains.push(ensembleGain)
      stringsBaseDetunes.push(baseDetune)
    })

    gain.connect(panner)

    return {
      gain,
      panner,
      oscillators,
      oscillator: oscillators[0],
      ensembleGains,
      stringsBaseDetunes,
      stringsDriftTimeouts: [],
      targetGain: this.getVoiceTargetGain(index),
    }
  }

  createChoirVoice(index) {
    const { main, side } = this.getChoirEnsembleGains(this.getBaseTonalAmount())
    const gain = new Tone.Gain(0)
    const panner = new Tone.Panner(this.getVoicePan(index)).connect(this.filter)
    const detunes = CHOIR_ENSEMBLE_DETUNE_CENTS[index]
    const oscillators = []
    const choirMemberGains = []
    const choirMemberPanners = []
    const choirBaseDetunes = []

    detunes.forEach((detune, memberIndex) => {
      const memberGain = new Tone.Gain(memberIndex === 0 ? main : side)
      const memberPanner = new Tone.Panner(CHOIR_ENSEMBLE_PANS[memberIndex])
      const oscillator = new Tone.Oscillator({
        ...this.getVoiceOscillatorOptions(index),
        detune,
      })

      oscillator.connect(memberPanner)
      memberPanner.connect(memberGain)
      memberGain.connect(gain)
      oscillators.push(oscillator)
      choirMemberGains.push(memberGain)
      choirMemberPanners.push(memberPanner)
      choirBaseDetunes.push(detune)
    })

    gain.connect(panner)

    return {
      gain,
      panner,
      oscillators,
      oscillator: oscillators[0],
      choirMemberGains,
      choirMemberPanners,
      choirBaseDetunes,
      targetGain: this.getVoiceTargetGain(index),
    }
  }

  createVoice(index) {
    if (this.isStringsLayer(index)) {
      return this.createStringsVoice(index)
    }

    if (this.isChoirLayer(index)) {
      return this.createChoirVoice(index)
    }

    return this.createStandardVoice(index)
  }

  createVoices() {
    const voices = []

    for (let index = 0; index < VOICE_COUNT; index += 1) {
      voices.push(this.createVoice(index))

      if (
        this.metronomePlaying
        && METRONOME_CREATE_VOICES_PRIME_INTERVAL > 0
        && (index + 1) % METRONOME_CREATE_VOICES_PRIME_INTERVAL === 0
        && index + 1 < VOICE_COUNT
      ) {
        this.primeMetronomeSchedule(METRONOME_LOOKAHEAD_SECONDS)
      }
    }

    if (this.presetTransitionDebugContext) {
      this.logPresetTransitionDebug('voice-create-set', {
        count: voices.length,
        structures: voices.map((voice, index) => ({
          index,
          structure: this.getVoiceStructureLabel(index),
          oscillatorCount: this.getVoiceOscillators(voice).length,
        })),
      })
    }

    return voices
  }

  ensureSignalChain() {
    if (this.isReady) {
      return
    }

    this.ensureMasterOutput()
    // Drone bus: tone lab EQ → output trim → Moon-transition group gain → pre-compressor
    // low shelf → master stage. moonTransitionGain holds the ENTIRE drone bus (voices,
    // air, orbit, dual beats, reverb tail) under one fader for the simple Moon-change
    // fade-down/rebuild/fade-up. It sits before the shared master stage, and the metronome
    // (which joins only at the limiter) is unaffected.
    this.moonTransitionGain = new Tone.Gain(1).connect(this.masterPreLowShelf)
    this.output = new Tone.Volume(DRONE_OUTPUT_TRIM_DB).connect(this.moonTransitionGain)
    this.connectMasterMeterPreTap()
    const toneLabActive = TONE_LAB_TUNING.enabled
    const masterTone = resolveToneLabMasterTone(TONE_LAB_TUNING.masterTone)
    this.toneLabUpperAir = new Tone.Filter({
      type: 'peaking',
      frequency: masterTone.upperAirFrequencyHz,
      Q: masterTone.upperAirQ,
      gain: toneLabActive ? masterTone.upperAirGainDb : 0,
    }).connect(this.output)
    this.toneLabAir = new Tone.Filter({
      type: 'highshelf',
      frequency: masterTone.airFrequencyHz,
      Q: masterTone.airQ,
      gain: toneLabActive ? masterTone.airGainDb : 0,
    }).connect(this.toneLabUpperAir)
    this.toneLabHighMid = new Tone.Filter({
      type: 'peaking',
      frequency: masterTone.highMidFrequencyHz,
      Q: masterTone.highMidQ,
      gain: toneLabActive ? masterTone.highMidGainDb : 0,
    }).connect(this.toneLabAir)
    this.toneLabSpeakerPresence = new Tone.Filter({
      type: 'peaking',
      frequency: masterTone.speakerPresenceFrequencyHz,
      Q: masterTone.speakerPresenceQ,
      gain: toneLabActive ? masterTone.speakerPresenceGainDb : 0,
    }).connect(this.toneLabHighMid)
    this.toneLabLowMid = new Tone.Filter({
      type: 'peaking',
      frequency: masterTone.lowMidFrequencyHz,
      Q: masterTone.lowMidQ,
      gain: toneLabActive ? masterTone.lowMidGainDb : 0,
    }).connect(this.toneLabSpeakerPresence)
    this.toneLabLowpass = new Tone.Filter({
      type: 'lowpass',
      frequency: toneLabActive ? masterTone.highCutHz : 20000,
      Q: 0.7,
    }).connect(this.toneLabLowMid)
    this.toneLabHighpass = new Tone.Filter({
      type: 'highpass',
      frequency: toneLabActive ? masterTone.lowCutHz : 20,
      Q: 0.7,
    }).connect(this.toneLabLowpass)
    this.droneBusEq = new Tone.Filter({
      type: 'lowshelf',
      frequency: DRONE_BASS_SHELF_FREQUENCY,
      Q: DRONE_BASS_SHELF_Q,
      gain: DRONE_BASS_SHELF_GAIN_DB,
    }).connect(this.toneLabHighpass)
    this.droneMidVoicingEq = new Tone.Filter({
      type: 'peaking',
      frequency: DRONE_MID_VOICING_EQ_FREQUENCY,
      Q: DRONE_MID_VOICING_EQ_Q,
      gain: DRONE_MID_VOICING_EQ_GAIN_DB,
    }).connect(this.droneBusEq)
    const airEnabled = AIR_SHIMMER_TUNING.enabled
    this.airLowMidScoop = new Tone.Filter({
      type: 'peaking',
      frequency: AIR_SHIMMER_TUNING.lowMidScoop.frequency,
      Q: AIR_SHIMMER_TUNING.lowMidScoop.Q,
      gain: airEnabled ? AIR_SHIMMER_TUNING.lowMidScoop.gainDb : 0,
    }).connect(this.droneMidVoicingEq)
    this.airShelfEq = new Tone.Filter({
      type: 'highshelf',
      frequency: AIR_SHIMMER_TUNING.airShelf.frequency,
      Q: AIR_SHIMMER_TUNING.airShelf.Q,
      gain: airEnabled ? AIR_SHIMMER_TUNING.airShelf.gainDb : 0,
    }).connect(this.airLowMidScoop)
    this.presetUpperMidEq = new Tone.Filter({
      type: 'peaking',
      frequency: SHRUTI_BUS_EQ.upperMidFrequency,
      Q: SHRUTI_BUS_EQ.upperMidQ,
      gain: 0,
    }).connect(this.airShelfEq)
    this.presetBodyMidEq = new Tone.Filter({
      type: 'peaking',
      frequency: 820,
      Q: 0.52,
      gain: 0,
    }).connect(this.presetUpperMidEq)
    // Medium-register key-following body notch (PRESET_MEDIUM_BODY_NOTCH). Transparent
    // (0 dB) except in Medium register on listed presets, where it dips the index-0
    // body fundamental of the selected key. Sits inline with the preset bus EQ trio.
    this.presetMediumBodyEq = new Tone.Filter({
      type: 'peaking',
      frequency: 110,
      Q: 1.2,
      gain: 0,
    }).connect(this.presetBodyMidEq)
    this.presetLowMidEq = new Tone.Filter({
      type: 'peaking',
      frequency: SHRUTI_BUS_EQ.lowMidFrequency,
      Q: SHRUTI_BUS_EQ.lowMidQ,
      gain: 0,
    }).connect(this.presetMediumBodyEq)

    // Projection presence + low-mid decongestion. Created at 0 dB (transparent)
    // and ramped in/out by applyProjectionNodes(). Built downstream-first so each
    // node connects to an already-created node. Order among linear EQ filters is
    // sonically irrelevant — they sit on the post-reverb drone+ambience bus.
    const projectionPresenceConfigs = PROJECTION_TUNING.presence
    this.projectionPresenceEqs = []
    let projectionDownstream = this.presetLowMidEq

    for (let i = projectionPresenceConfigs.length - 1; i >= 0; i -= 1) {
      const config = projectionPresenceConfigs[i]
      const presenceEq = new Tone.Filter({
        type: 'peaking',
        frequency: config.frequency,
        Q: config.Q,
        gain: 0,
      }).connect(projectionDownstream)

      this.projectionPresenceEqs[i] = presenceEq
      projectionDownstream = presenceEq
    }

    this.projectionLowMidCut = new Tone.Filter({
      type: 'peaking',
      frequency: PROJECTION_TUNING.lowMidCut.frequency,
      Q: PROJECTION_TUNING.lowMidCut.Q,
      gain: 0,
    }).connect(projectionDownstream)

    // Mood spectral motion (bloom high-shelf + sweeping eclipse notch). Created
    // at 0 dB (transparent) and driven by applyMoodToneNodes(). Post-reverb so
    // the whole drone+ambience spectrum opens/closes and bands pass into shadow.
    this.moodEclipseEq = new Tone.Filter({
      type: 'peaking',
      frequency: MOOD_ECLIPSE_FREQUENCY_MIN,
      Q: MOOD_ECLIPSE_PEAK_Q,
      gain: 0,
    }).connect(this.projectionLowMidCut)
    this.moodBloomEq = new Tone.Filter({
      type: 'highshelf',
      frequency: MOOD_BLOOM_SHELF_FREQUENCY,
      Q: MOOD_BLOOM_SHELF_Q,
      gain: 0,
    }).connect(this.moodEclipseEq)

    this.stereoWidener = new Tone.StereoWidener(this.getStereoWidth()).connect(this.moodBloomEq)
    this.reverb = new Tone.Reverb({
      decay: this.getReverbDecay(),
      preDelay: this.getReverbPreDelay(),
      wet: this.getReverbWet(),
    }).connect(this.stereoWidener)
    // Pre-reverb dry-narrowing widener. 0.5 = unity (normal mode). In Projection
    // Mode it narrows the dry body toward center for mono-safe phone playback;
    // the reverb (downstream, stereo IR) still produces a spacious wet tail.
    this.projectionDryNarrower = new Tone.StereoWidener(0.5).connect(this.reverb)
    this.filter = new Tone.Filter({
      frequency: this.getTonalFilterFrequency(this.getBaseTonalAmount()),
      rolloff: -12,
      type: 'lowpass',
      Q: this.getTonalFilterQ(this.getBaseTonalAmount()),
    }).connect(this.projectionDryNarrower)

    this.buildMoonTransitionBloomChain()

    this.buildAirBreathLayer()
    this.buildOrbitPair()
    this.buildDualBeats()

    this.voices = this.createVoices()

    this.isReady = true
  }

  // Symmetric True-Orbit pair. Two sine partners → per-partner 0.5 gains → opposed
  // panners → a shared bus gain (busGain, the level/in-out control) → this.filter,
  // so the pair shares the exact same downstream path as the voices (lowpass tone →
  // dry narrower → reverb → stereo widener → mood/projection EQs → output trim →
  // master limiter). Per-partner 0.5 gains keep the constructive peak at busGain's
  // value, so the master limiter ceiling is never threatened. Built at busGain 0
  // (fully silent/transparent); applyOrbitPair() ramps it in only for moods that
  // define a trueOrbit block. Oscillators are started lazily in start().
  buildOrbitPair() {
    if (this.orbitPair || !this.filter) {
      return
    }

    const centerFrequency = this.getOrbitCenterFrequency()
    const busGain = new Tone.Gain(0).connect(this.filter)
    const pannerA = new Tone.Panner(0).connect(busGain)
    const pannerB = new Tone.Panner(0).connect(busGain)
    const gainA = new Tone.Gain(0.5).connect(pannerA)
    const gainB = new Tone.Gain(0.5).connect(pannerB)
    const oscA = new Tone.Oscillator({ frequency: centerFrequency, type: 'sine', detune: 0 }).connect(gainA)
    const oscB = new Tone.Oscillator({ frequency: centerFrequency, type: 'sine', detune: 0 }).connect(gainB)

    this.orbitPair = { oscA, oscB, gainA, gainB, pannerA, pannerB, busGain }
  }

  // Dual-beat pairs (Super). Each pair: oscL/oscR → near-hard L/R panners → a
  // per-pair gain → a shared bus → the Tone Lab bus (toneLabHighpass onward).
  // Still skips reverb / stereo widener / projection dry-narrower so the hard L/R
  // split stays intact, but now passes the same Tone Lab EQ + output trim as voices
  // and the True Orbit pair (previously this bus jumped straight to this.output,
  // bypassing Tone Lab and reading much louder / immune to masterTone knobs).
  buildDualBeats() {
    const template = MOOD_DUAL_BEATS.super

    if (this.dualBeats || !this.toneLabHighpass || !template) {
      return
    }

    const bus = new Tone.Gain(1).connect(this.toneLabHighpass)

    const buildPair = (config) => {
      const pairGain = new Tone.Gain(0).connect(bus)
      const pannerL = new Tone.Panner(-config.pan).connect(pairGain)
      const pannerR = new Tone.Panner(config.pan).connect(pairGain)
      const carrier = this.getDualBeatCarrierFrequency(config.semitoneOffset)
      const half = config.beatHz / 2
      const oscL = new Tone.Oscillator({ frequency: carrier - half, type: 'sine' }).connect(pannerL)
      const oscR = new Tone.Oscillator({ frequency: carrier + half, type: 'sine' }).connect(pannerR)

      return { oscL, oscR, pannerL, pannerR, pairGain, config }
    }

    this.dualBeats = { bus, pairs: [buildPair(template.beatA), buildPair(template.beatB)] }
  }

}

export const droneEngine = new DroneEngine()

export {
  DEFAULT_REFERENCE_A_HZ,
  MAX_MASTER_VOLUME_NORMALIZED,
  MAX_REFERENCE_A_HZ,
  MIN_REFERENCE_A_HZ,
}
