import Foundation
import Capacitor
import AVFoundation
import UIKit

/// Single owner of the shared `AVAudioSession` configuration.
///
/// `.playback` with an active session is what makes Moondrone:
///   - keep playing when the Ring/Silent switch is ON, and
///   - keep playing on the lock screen / in the background (with `UIBackgroundModes: audio`).
///
/// No `.mixWithOthers`: Moondrone takes the active audio focus so iOS delivers proper
/// interruption notifications (calls, other apps, Siri). Mixing would suppress them.
enum AudioSessionManager {

    @discardableResult
    static func configureForPlayback(_ reason: String) -> [String: Any] {
        let session = AVAudioSession.sharedInstance()
        var configError: String?
        do {
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            configError = error.localizedDescription
            print("⚡️ [MoondroneAudio] FAILED to configure AVAudioSession (\(reason)):", error)
        }
        var state = currentState()
        if let configError = configError {
            state["error"] = configError
        }
        print("⚡️ [MoondroneAudio] AVAudioSession state (\(reason)):", state)
        return state
    }

    static func currentState() -> [String: Any] {
        let session = AVAudioSession.sharedInstance()
        return [
            "category": session.category.rawValue,
            "mode": session.mode.rawValue,
            "options": session.categoryOptions.rawValue,
            "secondaryAudioShouldBeSilencedHint": session.secondaryAudioShouldBeSilencedHint,
            "outputVolume": session.outputVolume,
            "sampleRate": session.sampleRate,
        ]
    }
}

/// Capacitor bridge so JavaScript can re-assert `.playback` immediately before every
/// user-initiated Play, and so native interruption / media-reset events reach the web layer.
///
/// IMPORTANT: Capacitor 8 does NOT auto-discover plugins by scanning the Obj-C runtime.
/// It only registers core plugins plus the `packageClassList` from capacitor.config.json
/// (generated from installed npm plugin packages). A local app plugin like this one must be
/// registered explicitly — see `MainViewController.capacitorDidLoad()` below.
@objc(MoondroneAudioPlugin)
public class MoondroneAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MoondroneAudioPlugin"
    public let jsName = "MoondroneAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configurePlaybackSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "testNativeBeep", returnType: CAPPluginReturnPromise)
    ]

    private var observersRegistered = false

    // Held strongly so ARC does not deallocate them mid-beep (would cut the sound short / silently).
    private var beepEngine: AVAudioEngine?
    private var beepPlayer: AVAudioPlayerNode?

    public override func load() {
        print("⚡️ [MoondroneAudio] plugin load() — instance registered with bridge")
        registerObservers()
    }

    /// Called from JS right before Tone.start / drone start / metronome start.
    @objc func configurePlaybackSession(_ call: CAPPluginCall) {
        print("⚡️ [MoondroneAudio] configurePlaybackSession ENTERED (native Swift)")
        registerObservers()
        let state = AudioSessionManager.configureForPlayback("js-configure")
        print("⚡️ [MoondroneAudio] configurePlaybackSession RESOLVING with:", state)
        call.resolve(state)
    }

    /// Plays a short beep using NATIVE iOS audio (AVAudioEngine), NOT WebAudio.
    /// First asserts `.playback` via the same AudioSessionManager path used by configurePlaybackSession.
    ///
    /// Diagnostic purpose:
    ///   - Audible with Silent Mode ON  → AVAudioSession `.playback` truly works; remaining mute is
    ///     WKWebView/WebAudio-specific.
    ///   - Muted with Silent Mode ON    → the AVAudioSession setup is still incomplete despite
    ///     reporting `.playback`.
    @objc func testNativeBeep(_ call: CAPPluginCall) {
        print("⚡️ [MoondroneAudio] testNativeBeep ENTERED (native Swift)")
        let sessionState = AudioSessionManager.configureForPlayback("native-beep")

        let sampleRate = 44100.0
        let duration = 0.4
        let frequency = 880.0

        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1) else {
            call.reject("native beep: could not create AVAudioFormat")
            return
        }

        let frameCount = AVAudioFrameCount(sampleRate * duration)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount),
              let channelData = buffer.floatChannelData else {
            call.reject("native beep: could not create AVAudioPCMBuffer")
            return
        }

        buffer.frameLength = frameCount
        for frame in 0..<Int(frameCount) {
            let t = Double(frame) / sampleRate
            let envelope = exp(-t * 3.0)
            channelData[0][frame] = Float(sin(2.0 * Double.pi * frequency * t) * envelope * 0.6)
        }

        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)

        do {
            try engine.start()
        } catch {
            print("⚡️ [MoondroneAudio] testNativeBeep engine.start FAILED:", error)
            call.reject("native beep: engine.start failed: \(error.localizedDescription)")
            return
        }

        player.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
        player.play()
        self.beepEngine = engine
        self.beepPlayer = player
        print("⚡️ [MoondroneAudio] testNativeBeep playing")

        DispatchQueue.main.asyncAfter(deadline: .now() + duration + 0.2) { [weak self] in
            player.stop()
            engine.stop()
            self?.beepEngine = nil
            self?.beepPlayer = nil
            print("⚡️ [MoondroneAudio] testNativeBeep stopped")
        }

        var result = sessionState
        result["beepStarted"] = true
        result["engine"] = "AVAudioEngine"
        call.resolve(result)
    }

    private func registerObservers() {
        if observersRegistered { return }
        observersRegistered = true

        let center = NotificationCenter.default
        center.addObserver(self,
                           selector: #selector(handleInterruption(_:)),
                           name: AVAudioSession.interruptionNotification,
                           object: nil)
        center.addObserver(self,
                           selector: #selector(handleMediaServicesReset),
                           name: AVAudioSession.mediaServicesWereResetNotification,
                           object: nil)
        // Earliest lifecycle signal that the app is about to lose foreground focus (lock button,
        // Control Center, incoming call banner, app switcher, backgrounding). Fires before Capacitor's
        // appStateChange-inactive / WKWebView visibilitychange, giving JS a best-effort chance to
        // click-safe mute WebAudio WHILE the context may still be running. This is NOT a stop — the
        // web layer decides whether to fully stop (real background) or restore (transient resign).
        center.addObserver(self,
                           selector: #selector(handleWillResignActive),
                           name: UIApplication.willResignActiveNotification,
                           object: nil)
        // Counterpart to willResignActive: lets JS reverse a pre-mute duck when the app returns to
        // active WITHOUT a real background stop (transient resign). Fires on every activation; the web
        // layer no-ops it after a real background stop (nothing left to restore).
        center.addObserver(self,
                           selector: #selector(handleDidBecomeActive),
                           name: UIApplication.didBecomeActiveNotification,
                           object: nil)
    }

    @objc private func handleWillResignActive() {
        print("⚡️ [MoondroneAudio] willResignActive — requesting JS pre-mute")
        notifyListeners("audioWillResignActive", data: ["reason": "willResignActive"])
    }

    @objc private func handleDidBecomeActive() {
        print("⚡️ [MoondroneAudio] didBecomeActive — requesting JS pre-mute restore")
        notifyListeners("audioDidBecomeActive", data: ["reason": "didBecomeActive"])
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let rawType = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: rawType) else {
            return
        }

        switch type {
        case .began:
            // iOS paused our audio (call / other app / Siri). Tell JS to stop cleanly and reset
            // the UI honestly. We do NOT fight for focus or auto-resume.
            print("⚡️ [MoondroneAudio] interruption began")
            notifyListeners("audioSessionInterrupted", data: ["reason": "interruption-began"])
        case .ended:
            // Re-assert `.playback` so a fresh, user-initiated Play works again. Playback itself
            // is never auto-resumed — the web layer requires a new Play.
            print("⚡️ [MoondroneAudio] interruption ended")
            AudioSessionManager.configureForPlayback("interruption-ended")
            notifyListeners("audioSessionInterruptionEnded", data: AudioSessionManager.currentState())
        @unknown default:
            break
        }
    }

    @objc private func handleMediaServicesReset() {
        // Media server restarted; every audio object is invalid. Rebuild the session and tell JS
        // to hard-reset its graph.
        print("⚡️ [MoondroneAudio] media services were reset — reconfiguring")
        AudioSessionManager.configureForPlayback("media-services-reset")
        notifyListeners("audioSessionInterrupted", data: ["reason": "media-services-reset"])
    }
}

// =============================================================================
// NATIVE DRONE EXPERIMENT (temporary POC — Jul 2026)
// =============================================================================
// Isolated proof-of-concept: a continuous native Swift drone rendered by
// AVAudioEngine + AVAudioSourceNode, completely separate from the Tone.js/WebAudio
// engine. Purpose is to verify whether native audio survives Silent Mode and
// lock/background reliably. It does NOT touch the existing MoondroneAudioPlugin,
// the web engine, or the normal Play button.
//
// Revert: delete this marked block + its registration line in
// MainViewController.capacitorDidLoad(), remove the UIBackgroundModes `audio`
// key from Info.plist, and delete src/nativeDroneExperiment.js.

/// RBJ biquad (Direct Form I). Coefficients are recomputed cheaply at buffer start on
/// the render thread from preset scalars; the filter *state* persists across buffers so
/// preset changes stay click-free.
struct Biquad {
    var b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0
    var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0

    mutating func reset() { x1 = 0; x2 = 0; y1 = 0; y2 = 0 }

    mutating func setPeaking(_ freq: Double, _ q: Double, _ gainDb: Double, _ sr: Double) {
        let a = pow(10.0, gainDb / 40.0)
        let w0 = 2.0 * Double.pi * min(freq, sr * 0.45) / sr
        let alpha = sin(w0) / (2.0 * max(q, 0.0001))
        let cw = cos(w0)
        let a0 = 1.0 + alpha / a
        b0 = (1.0 + alpha * a) / a0
        b1 = (-2.0 * cw) / a0
        b2 = (1.0 - alpha * a) / a0
        a1 = (-2.0 * cw) / a0
        a2 = (1.0 - alpha / a) / a0
    }

    mutating func setLowShelf(_ freq: Double, _ q: Double, _ gainDb: Double, _ sr: Double) {
        let a = pow(10.0, gainDb / 40.0)
        let w0 = 2.0 * Double.pi * min(freq, sr * 0.45) / sr
        let cw = cos(w0)
        let alpha = sin(w0) / (2.0 * max(q, 0.0001))
        let twoSqrtAAlpha = 2.0 * sqrt(a) * alpha
        let a0 = (a + 1.0) + (a - 1.0) * cw + twoSqrtAAlpha
        b0 = a * ((a + 1.0) - (a - 1.0) * cw + twoSqrtAAlpha) / a0
        b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cw) / a0
        b2 = a * ((a + 1.0) - (a - 1.0) * cw - twoSqrtAAlpha) / a0
        a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cw) / a0
        a2 = ((a + 1.0) + (a - 1.0) * cw - twoSqrtAAlpha) / a0
    }

    mutating func setHighShelf(_ freq: Double, _ q: Double, _ gainDb: Double, _ sr: Double) {
        let a = pow(10.0, gainDb / 40.0)
        let w0 = 2.0 * Double.pi * min(freq, sr * 0.45) / sr
        let cw = cos(w0)
        let alpha = sin(w0) / (2.0 * max(q, 0.0001))
        let twoSqrtAAlpha = 2.0 * sqrt(a) * alpha
        let a0 = (a + 1.0) - (a - 1.0) * cw + twoSqrtAAlpha
        b0 = a * ((a + 1.0) + (a - 1.0) * cw + twoSqrtAAlpha) / a0
        b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cw) / a0
        b2 = a * ((a + 1.0) + (a - 1.0) * cw - twoSqrtAAlpha) / a0
        a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cw) / a0
        a2 = ((a + 1.0) - (a - 1.0) * cw - twoSqrtAAlpha) / a0
    }

    @inline(__always) mutating func process(_ x: Double) -> Double {
        let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2 = x1; x1 = x; y2 = y1; y1 = y
        return y
    }
}

/// A native "Moondrone voice model" that ports the most important sound-design behavior
/// from the Tone.js engine (src/droneEngine.js + soundTuning.js) as closely as practical:
///
///   • Voice architecture — named layers at the original intervals [-12, 0, 7, 12, 24, 31]
///     plus a foundation root (Shruti/Cosmos), Cosmos sky/celestial layers, and a real
///     binaural L/R beat carrier pair.
///   • Presets — per-moon voiceGains, filter base frequency, foundation gain, breath-noise
///     scale, and low-mid voicing taken from the original tuning numbers.
///   • Breath — the 12 s asymmetric inhale/exhale cycle (BREATH_TUNING) driving tonal
///     amount, per-layer voice presence, air-noise swell, and exhale softening.
///   • Air/wind — a filtered breath-following noise bed (AIR_SHIMMER_TUNING), off for Binaural.
///   • Tone stages — bass shelf, mid/low-mid scoop, air shelf, intensity-driven low-pass,
///     DC block, and a compressor-ish makeup + tanh soft-clip limiter (SPEAKER_SAFETY /
///     MASTER_TUNING). Approximations, not the full biquad-for-biquad chain.
///
/// Intentionally approximated (documented for later): per-register voice scaling, mood
/// motion (New/Full/Blue/Blood/Super — architecture-ready but not yet applied), Strings
/// ensemble detune, reverb, and the full multi-band master compressor.
///
/// Thread model: the render callback is the only writer of the `current*`/`active*` state,
/// phases, and filter memory. The main thread writes `target*` scalars (word-sized, benign
/// race). Custom-partial POC data is swapped under `paramLock`.
final class NativeDroneEngine {
    struct Partial { var ratio: Double; var gain: Float }

    // Named voice layers (indices match the voice model below).
    private enum Layer: Int, CaseIterable {
        case lowOctave = 0, root, fifth, octave, upperOctave, upperFifth
        case foundation, celestial, skyRoot, skyOctave
    }
    private static let bankSize = 10
    // Fixed frequency ratios per named layer (2^(semitones/12)); sky layers +36/+36/+48.
    private static let layerRatios: [Double] = [
        0.5,                 // −12 low octave
        1.0,                 // root
        1.4983070768766815,  // +7 fifth
        2.0,                 // +12 octave
        4.0,                 // +24 upper octave
        5.993741017563663,   // +31 upper fifth
        1.0,                 // foundation root
        8.0,                 // celestial (+36)
        8.0,                 // sky root (+36)
        16.0,                // sky octave (+48)
    ]

    // ---- Original tuning constants (soundTuning.js) --------------------------
    private struct Presence { let base, s1, s2, breath: Double }
    // VOICE_LAYER_PRESENCE (base, character/lowSettling scale, focus scale, breathScale).
    private static let presenceLowOctave = Presence(base: 0.45, s1: 0.46, s2: 0.0, breath: 0.35)
    private static let presenceRoot = Presence(base: 0.68, s1: 0.12, s2: 0.0, breath: 1.0)
    private static let presenceFifth = Presence(base: 0.07, s1: 0.64, s2: 0.30, breath: 0.22)
    private static let presenceOctave = Presence(base: 0.01, s1: 0.64, s2: 0.82, breath: 0.18)
    private static let presenceUpperOctave = Presence(base: 0.004, s1: 0.24, s2: 0.42, breath: 0.12)
    private static let presenceUpperFifth = Presence(base: 0.002, s1: 0.12, s2: 0.22, breath: 0.08)

    private static let voiceMotionDepth = 0.34
    private static let breathOffsetDepth = 0.44
    private static let breathExhaleAsymmetry = 1.45
    private static let breathExhaleSoftening = 0.12
    private static let breathSliderCurvePower = 1.08
    private static let breathCycleSeconds = 12.0
    private static let effectiveTonalMax = 1.15

    // Per-preset data ported from PRESETS / PRESET_VOICE_GAINS (phone-speaker effective) /
    // FOUNDATION / AIR_SHIMMER breathNoise / lowMidScoop.
    private struct PresetDef {
        let voiceGains: [Double]      // 6 layers: −12,0,+7,+12,+24,+31
        let filterBaseHz: Double      // intensity low-pass base
        let foundationGain: Double    // 0 = no foundation layer
        let isCosmos: Bool
        let breathAmountScale: Double
        let breathNoiseScale: Double
        let lowMidFreq: Double
        let lowMidGainDb: Double
    }
    private static let presets: [String: PresetDef] = [
        "Pure": PresetDef(voiceGains: [0.06, 0.21, 0.003, 0.085, 0.014, 0.005],
                          filterBaseHz: 2280, foundationGain: 0, isCosmos: false,
                          breathAmountScale: 0.58, breathNoiseScale: 0.48,
                          lowMidFreq: 520, lowMidGainDb: -1.55),
        "Shruti": PresetDef(voiceGains: [0.056, 0.33, 0.11, 0.022, 0.048, 0.014],
                            filterBaseHz: 850, foundationGain: 0.44, isCosmos: false,
                            breathAmountScale: 1.0, breathNoiseScale: 1.0,
                            lowMidFreq: 420, lowMidGainDb: -1.25),
        "Strings": PresetDef(voiceGains: [0.19, 0.36, 0.10, 0.015, 0.015, 0.01],
                             filterBaseHz: 4200, foundationGain: 0, isCosmos: false,
                             breathAmountScale: 1.0, breathNoiseScale: 0.36,
                             lowMidFreq: 300, lowMidGainDb: -1.15),
        "Cosmos": PresetDef(voiceGains: [0.038, 0.25, 0.14, 0.24, 0.29, 0.14],
                            filterBaseHz: 420, foundationGain: 0.54, isCosmos: true,
                            breathAmountScale: 1.0, breathNoiseScale: 0.92,
                            lowMidFreq: 300, lowMidGainDb: -1.15),
        "Binaural": PresetDef(voiceGains: [0.048, 0.35, 0.14, 0.13, 0.078, 0.034],
                              filterBaseHz: 385, foundationGain: 0, isCosmos: false,
                              breathAmountScale: 1.0, breathNoiseScale: 0.0,
                              lowMidFreq: 360, lowMidGainDb: -1.45),
    ]
    // Cosmos sky layer gains — COSMOS_EXTENSION_GAINS (phone-speaker effective).
    private static let cosmosCelestialGain = 0.055
    private static let cosmosSkyRootGain = 0.034
    private static let cosmosSkyOctaveGain = 0.032

    private let engine = AVAudioEngine()
    private var sourceNode: AVAudioSourceNode?
    private(set) var isRunning = false

    private let sampleRate: Double = 44100.0
    private static let maxCustomPartials = 8

    // Mode: voice model (preset-driven) vs. custom partials (POC buttons).
    private var useCustomPartials = false

    // Custom-partial POC path (guarded by paramLock).
    private let paramLock = NSLock()
    private var pendingRatios = [Double](repeating: 0, count: maxCustomPartials)
    private var requestedGains = [Float](repeating: 0, count: maxCustomPartials)
    private var customCount = 0
    private var scratchPending = [Double](repeating: 0, count: maxCustomPartials)
    private var scratchRequested = [Float](repeating: 0, count: maxCustomPartials)

    // Oscillator bank (render-thread state). Sized for the named voice model.
    private var activeRatios = [Double](repeating: 0, count: bankSize)
    private var targetRatios = [Double](repeating: 0, count: bankSize)
    private var targetGains = [Double](repeating: 0, count: bankSize)
    private var currentGains = [Double](repeating: 0, count: bankSize)
    private var phases = [Double](repeating: 0, count: bankSize)

    // Breath + filter + noise state (render thread only).
    private var breathElapsed = 0.0
    private var lpState = 0.0
    private var dcPrevIn = 0.0
    private var dcPrevOut = 0.0
    private var bassShelf = Biquad()
    private var midScoop = Biquad()
    private var lowMidScoop = Biquad()
    private var airShelf = Biquad()
    private var rngState: UInt32 = 0x6d2b79f5
    private var noiseHp = 0.0
    private var noiseLp = 0.0
    private var binPhaseL = 0.0
    private var binPhaseR = 0.0

    // Register awareness (octave 2=Low, 3=Medium, 4=High, 5=VeryHigh). rootHz already
    // encodes pitch; register additionally drives Low/Med/High/VH voicing + output trim,
    // mirroring REGISTER_BALANCE_TRIM_DB / lowLayerScaleByRegister in soundTuning.js.
    private var currentOctave = 3

    // Strings-only detuned-ensemble state: a detuned partner phase per principle body
    // layer (0 low-oct, 1 root, 2 fifth) plus a very slow drift LFO → a chorused string
    // timbre with saw-ish harmonics. Idle (never summed) for every other preset.
    private var stringsDetunePhase = [Double](repeating: 0, count: bankSize)
    private var stringsDriftPhase = 0.0

    // Mood (slow, timbral-only motion — moods.js). Never applied for Binaural. Uses two
    // slow shelves (bloom / eclipse) + a capped upper-layer detune drift, no level cycling.
    private var moodName = "full"
    private var moodElapsed = 0.0
    private var moodShelf = Biquad()   // slow "bloom" high shelf
    private var moodNotch = Biquad()   // sweeping "eclipse" notch (Blood)
    private var resonancePeak = Biquad()  // gentle intensity-driven resonance (>~62%)

    // Smoothed scalar params: target* on main, current* ramped on render thread.
    private var targetRootHz = 146.83  // D3 (matches app default key/octave region)
    private var currentRootHz = 146.83
    private var targetVolume = 0.0, currentVolume = 0.0
    private var targetBreath = 0.0, currentBreath = 0.0
    private var targetIntensity = 0.7, currentIntensity = 0.7
    private var targetBinauralBeatHz = 0.0, currentBinauralBeatHz = 0.0

    // Preset scalars read on the render thread (benign race on swap; smoothed downstream).
    private var presetName = "Shruti"
    private var pVoiceGains: [Double] = NativeDroneEngine.presets["Shruti"]!.voiceGains
    private var pFilterBaseHz = 850.0
    private var pFoundationGain = 0.44
    private var pIsCosmos = false
    private var pBreathAmountScale = 1.0
    private var pBreathNoiseScale = 1.0
    private var pLowMidFreq = 420.0
    private var pLowMidGainDb = -1.25
    private var pSoftCeilingUi = 0.0        // 0 = none
    private var pAboveCeilingContribution = 0.25
    private var pAmountScale = 1.0
    private var pUpperKneeUi = 0.0          // 0 = none (Binaural)
    private var pUpperMaxEffectiveUi = 0.67
    private var pUpperCompressionPower = 2.4

    private lazy var ampCoeff = 1.0 - exp(-1.0 / (0.040 * sampleRate))   // ~40 ms tiny dezipper glide
    // Reference-A / small tuning steps use a slow, AUDIBLE pitch glide (~0.22 s) — original
    // Moondrone slides small retunes rather than snapping. Note/key/register changes do NOT
    // glide; they use the note-change dip envelope below (fade out → retune at quiet → fade in).
    private lazy var freqCoeff = 1.0 - exp(-1.0 / (0.22 * sampleRate))

    // ---- Musical transition envelopes (ported from droneEngine transition timings) ----------
    // Original: noteFadeOutSeconds 0.75, noteFadeInDelaySeconds 0.18, noteFadeInSeconds 0.85,
    // startFadeSeconds 4, stopFadeSeconds 3, moon full-chain crossfade ~1.5 s, voice/body/aux
    // morphs ~2.2–3.2 s. The Swift engine keeps tiny per-sample dezipper smoothing but layers
    // these higher-level envelopes on top so nothing feels sudden.

    // Master volume fade-in at cold start (~1.1 s TC → ~92% by 2.5 s, ~98% by 4 s). Engine
    // still starts immediately; only the volume envelope is gentle (pad-like swell).
    private lazy var startupFadeCoeff = 1.0 - exp(-1.0 / (1.1 * sampleRate))
    private var startupFadeActive = false
    // Master volume fade-out on Stop (~0.6 s TC). Teardown is deferred ~3 s so the tail fully
    // decays to silence before the AVAudioEngine graph is stopped (no stop click).
    private lazy var stopFadeCoeff = 1.0 - exp(-1.0 / (0.6 * sampleRate))
    private var stopFadeActive = false
    private var runGeneration = 0        // bumped on every start; guards deferred stop teardown

    // Note/key/register PITCH change gesture: fade the whole voice bed down, retune at the quiet
    // point, then fade back in — a musical "note change", not a portamento swoop.
    private enum NotePhase { case idle, fadeOut, hold, fadeIn }
    private var notePhase: NotePhase = .idle
    private var noteHoldCounter = 0
    private var transitionGain = 1.0     // global voice-bed multiplier (post tone chain)
    private lazy var noteFadeOutInc = 1.0 / (0.65 * sampleRate)   // ~0.65 s fade down
    private lazy var noteFadeInInc = 1.0 / (0.80 * sampleRate)    // ~0.80 s fade up
    private lazy var noteFadeInDelayFrames = Int(0.18 * sampleRate) // quiet-point hold

    // Moon/preset + register VOICE crossfade window: during this window the voice gains ramp on
    // the slow morph coeff (~0.9 s TC) for a smooth timbre crossfade with no silence gap; the
    // preset filter base + low-mid also glide (below). Outside the window gains use the snappy
    // gainCoeff so Breath stays a live, responsive 12 s motion.
    private lazy var gainCoeff = 1.0 - exp(-1.0 / (0.12 * sampleRate))       // normal (breath-live)
    private lazy var gainMorphCoeff = 1.0 - exp(-1.0 / (0.9 * sampleRate))   // preset/register crossfade
    private var gainMorphFramesRemaining = 0
    private var lastTransitionKind = "none"  // note | register | preset | glide | none (debug)

    // Register-derived scalars smoothed over ~1.0 s so octave/register changes morph the output
    // trim + filter brightness musically (voicing gains morph via the voice crossfade above).
    private lazy var regCoeff = 1.0 - exp(-1.0 / (1.0 * sampleRate))
    private var curRegTrim = 1.0
    private var curRegBright = 1.0

    // Preset scalars that feed the tone/filter chain, glided so a moon change never snaps the
    // cutoff (e.g. Cosmos 420 Hz → Strings 4200 Hz) — smoothed per buffer (~1.5 s).
    private var curFilterBaseHz = 850.0
    private var curLowMidFreq = 420.0
    private var curLowMidGainDb = -1.25
    private var curBreathNoiseScale = 1.0

    // Debug snapshot values written on the render thread (benign race on read).
    private var dbgBreathPhase = 0.0
    private var dbgBreathAmount = 0.0
    private var dbgAirNoiseGain = 0.0
    private var dbgIntensityFilterMult = 1.0
    private var dbgIntensityResonance = 0.0
    private var dbgLowEndScale = 1.0

    init() {
        setPreset("Shruti")
        for i in 0..<NativeDroneEngine.bankSize {
            activeRatios[i] = NativeDroneEngine.layerRatios[i]
            targetRatios[i] = NativeDroneEngine.layerRatios[i]
        }
    }

    // ---- Intensity → internal amount (INTENSITY_TUNING + PRESET_INTENSITY_TUNING) -----
    private func intensityAmount() -> Double {
        var ui = Double(max(0.0, min(1.0, currentIntensity)))
        // Preset soft-ceiling / upper-knee compression.
        if pUpperKneeUi > 0.0, ui > pUpperKneeUi {
            let normalized = (ui - pUpperKneeUi) / (1.0 - pUpperKneeUi)
            ui = pUpperKneeUi + pow(normalized, pUpperCompressionPower) * (pUpperMaxEffectiveUi - pUpperKneeUi)
        } else if pSoftCeilingUi > 0.0, ui > pSoftCeilingUi {
            ui = pSoftCeilingUi + (ui - pSoftCeilingUi) * pAboveCeilingContribution
        }
        let useful = 0.9
        var amount: Double
        if ui <= useful {
            amount = pow(ui / useful, 0.9)
        } else {
            amount = 1.0 + pow((ui - useful) / (1.0 - useful), 1.2) * 0.15
        }
        return amount * pAmountScale
    }

    // Intensity → low-pass cutoff multiplier of the preset base (INTENSITY_TUNING neutral shape):
    //   0.0 → 0.48× (darker/warmer) · 0.5 → 1.0× (neutral) · 1.0 → 1.78× (brighter/more focused).
    @inline(__always) private func intensityFilterMult(_ ui: Double) -> Double {
        let u = max(0.0, min(1.0, ui))
        if u <= 0.5 { return 0.48 + (1.0 - 0.48) * (u / 0.5) }
        return 1.0 + (1.78 - 1.0) * ((u - 0.5) / 0.5)
    }

    func start(volume: Float?) throws {
        // Cancel any pending stop-fade teardown (a Play landing during a Stop tail) and swell
        // back up from the current level rather than restarting cold.
        stopFadeActive = false
        runGeneration += 1
        if isRunning {
            if let volume = volume { targetVolume = clamp01(Double(volume)) }
            startupFadeActive = true   // musical swell back up (no hard snap)
            return
        }

        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2) else {
            throw NSError(domain: "NativeDrone", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "could not create AVAudioFormat"])
        }

        // Start silent and ramp up so there is no onset click; reset time-varying state.
        // currentVolume begins at 0 and swells to targetVolume via the slow startupFadeCoeff
        // (musical fade-in — NOT snapped). targetVolume is the requested level.
        currentVolume = 0.0
        targetVolume = clamp01(Double(volume ?? 0.2))
        startupFadeActive = true
        // Snap smoothed pitch/intensity/breath to their configured targets at cold start so the
        // drone begins directly in the selected key/register/intensity/breath — never glides up
        // from the default (D3 / Shruti) state. Volume still ramps from 0 for a click-free onset.
        currentRootHz = targetRootHz
        currentIntensity = targetIntensity
        currentBreath = targetBreath
        currentBinauralBeatHz = targetBinauralBeatHz
        breathElapsed = 0.0
        lpState = 0.0; dcPrevIn = 0.0; dcPrevOut = 0.0
        noiseHp = 0.0; noiseLp = 0.0
        bassShelf.reset(); midScoop.reset(); lowMidScoop.reset(); airShelf.reset()
        moodShelf.reset(); moodNotch.reset(); resonancePeak.reset()
        for i in 0..<NativeDroneEngine.bankSize { stringsDetunePhase[i] = 0.0 }

        // Snap the transition / morph state to a clean idle at cold start, and snap the smoothed
        // register + preset filter scalars to their configured values so the first buffer is
        // already in the requested register/timbre (only the master volume swells in).
        notePhase = .idle
        transitionGain = 1.0
        gainMorphFramesRemaining = 0
        lastTransitionKind = "none"
        curRegTrim = registerTrimLinear()
        curRegBright = currentOctave >= 4 ? 1.12 : 1.0
        curFilterBaseHz = pFilterBaseHz
        curLowMidFreq = pLowMidFreq
        curLowMidGainDb = pLowMidGainDb
        curBreathNoiseScale = pBreathNoiseScale

        let twoPi = 2.0 * Double.pi
        let sr = sampleRate

        let node = AVAudioSourceNode { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self else { return noErr }
            let abl = UnsafeMutableAudioBufferListPointer(audioBufferList)
            let leftPtr = abl[0].mData?.assumingMemoryBound(to: Float.self)
            let rightPtr = abl.count > 1 ? abl[1].mData?.assumingMemoryBound(to: Float.self) : nil

            let custom = self.useCustomPartials
            var customN = 0
            if custom {
                self.paramLock.lock()
                customN = self.customCount
                for i in 0..<customN {
                    self.scratchPending[i] = self.pendingRatios[i]
                    self.scratchRequested[i] = self.requestedGains[i]
                }
                self.paramLock.unlock()
            }

            // ---- Control-rate block: recompute filter coeffs + voice-model targets once. ----
            // Preset filter scalars glide (~1.5 s) so a moon change crossfades the cutoff / low-mid
            // instead of snapping (e.g. Cosmos 420 Hz → Strings 4200 Hz).
            let presetBufCoeff = 1.0 - exp(-Double(frameCount) / (1.5 * sr))
            self.curFilterBaseHz += (self.pFilterBaseHz - self.curFilterBaseHz) * presetBufCoeff
            self.curLowMidFreq += (self.pLowMidFreq - self.curLowMidFreq) * presetBufCoeff
            self.curLowMidGainDb += (self.pLowMidGainDb - self.curLowMidGainDb) * presetBufCoeff
            self.curBreathNoiseScale += (self.pBreathNoiseScale - self.curBreathNoiseScale) * presetBufCoeff

            self.bassShelf.setLowShelf(210, 0.7, -4.5, sr)          // SPEAKER_SAFETY bass shelf
            self.midScoop.setPeaking(600, 0.38, -1.8, sr)           // mid voicing
            self.lowMidScoop.setPeaking(self.curLowMidFreq, 0.55, self.curLowMidGainDb, sr) // AIR low-mid scoop
            self.airShelf.setHighShelf(4200, 0.5, 1.05, sr)         // AIR air shelf

            // Breath (evaluated at buffer start; per-sample cycle advance below keeps it live).
            let breathAmount = pow(Double(max(0.0, min(1.0, self.currentBreath))), NativeDroneEngine.breathSliderCurvePower) * self.pBreathAmountScale
            let cyclePos = (self.breathElapsed.truncatingRemainder(dividingBy: NativeDroneEngine.breathCycleSeconds)) / NativeDroneEngine.breathCycleSeconds
            let rawBreath = sin(cyclePos * twoPi)
            let shapedBreath = rawBreath >= 0 ? rawBreath : rawBreath * NativeDroneEngine.breathExhaleAsymmetry
            let breathOffset = shapedBreath * breathAmount * NativeDroneEngine.breathOffsetDepth
            let exhaleAmount = rawBreath < 0 ? -rawBreath * breathAmount : 0
            let breathMotion = shapedBreath * breathAmount

            if !custom {
                self.computeVoiceModel(breathOffset: breathOffset, breathMotion: breathMotion, exhaleAmount: exhaleAmount)
            }

            // Air/wind noise bed envelope (breath-following swell). Louder + more present than
            // before, with a soft floor (never hard-gates to zero): even a still breath keeps a
            // faint air bed, and the swell follows the 12 s cycle. Per-preset scale (Cosmos
            // airiest, Shruti clear tanpura air, Pure/Strings lower-but-present, Binaural off).
            let breathSwell = 0.5 + 0.5 * rawBreath  // 0..1 following the cycle
            let noiseEnv = (0.22 + 0.78 * pow(breathSwell, 0.85)) * (0.45 + 0.55 * breathAmount)
            let noiseLevel = 0.011 * self.curBreathNoiseScale * noiseEnv
            // Breath also opens the air's low-pass slightly on the inhale (brighter air on swell).
            let noiseLpCoeff = 0.40 + 0.18 * breathSwell

            let breathInc = 1.0 / sr
            let beatActive = self.presetName == "Binaural"

            let count = custom ? customN : NativeDroneEngine.bankSize
            let isStrings = self.presetName == "Strings"

            // ---- Register-derived output trim + low-pass brightness targets (smoothed per-sample
            // toward these over ~1 s so a register change morphs the trim/brightness musically). ----
            let targetRegTrim = self.registerTrimLinear()
            let targetRegBright = self.currentOctave >= 4 ? 1.12 : 1.0

            // Debug snapshot values (control-rate; read on main thread).
            self.dbgBreathPhase = cyclePos
            self.dbgBreathAmount = breathAmount
            self.dbgAirNoiseGain = noiseLevel
            self.dbgIntensityFilterMult = self.intensityFilterMult(Double(self.currentIntensity))
            self.dbgIntensityResonance = min(1.0, max(0.0, (Double(self.currentIntensity) - 0.62) / 0.38))

            // ---- Mood: very slow timbral motion (moods.js). Skipped for Binaural. ----
            // Advance the mood clock once per buffer (control rate). Motion is purely
            // spectral (bloom shelf + eclipse notch) + a capped upper-layer detune drift —
            // deliberately NO amplitude/tremolo cycling.
            self.moodElapsed += Double(frameCount) / sr
            var moodBloomDb = 0.0
            var moodEclipseDb = 0.0
            var moodEclipseHz = 1200.0
            var moodBright = 1.0
            var moodDetuneCents = 0.0
            if !custom && !beatActive {
                let t = self.moodElapsed
                switch self.moodName {
                case "new":   // near-still reference
                    moodDetuneCents = 0.6 * sin(twoPi * t / 80.0)
                case "full":  // slow warm bloom
                    moodBloomDb = 3.2 * sin(twoPi * t / 184.0)
                    moodDetuneCents = 1.4 * sin(twoPi * t / 176.0)
                case "blue":  // spacious / cooler / wider
                    moodBloomDb = 2.2 * sin(twoPi * t / 130.0)
                    moodBright = 0.9
                    moodDetuneCents = 3.0 * sin(twoPi * t / 96.0)
                case "blood": // darker + slow sweeping eclipse shadow
                    moodBloomDb = 2.4 * sin(twoPi * t / 60.0)
                    let sweep = 0.5 + 0.5 * sin(twoPi * t / 48.0)
                    moodEclipseDb = -10.5 * sweep
                    moodEclipseHz = 700.0 + (2300.0 - 700.0) * sweep
                    moodBright = 0.82
                    moodDetuneCents = 4.0 * sin(twoPi * t / 54.0)
                case "super": // brightest / most radiant
                    moodBloomDb = 4.0 * sin(twoPi * t / 64.0)
                    moodBright = 1.12
                    moodDetuneCents = 2.5 * sin(twoPi * t / 70.0)
                default:
                    break
                }
            }
            self.moodShelf.setHighShelf(1600, 0.7, moodBloomDb, sr)
            self.moodNotch.setPeaking(moodEclipseHz, 1.2, moodEclipseDb, sr)
            // Cap upper-layer detune (root/fifth stay fixed) and precompute the factor.
            let moodDetuneFactor = pow(2.0, max(-6.0, min(6.0, moodDetuneCents)) / 1200.0)

            // ---- Strings detuned-ensemble drift (Strings only). ----
            self.stringsDriftPhase += twoPi * (Double(frameCount) / sr) / 30.0  // ~30 s drift
            if self.stringsDriftPhase > twoPi { self.stringsDriftPhase -= twoPi }
            let stringsDetuneFactor = pow(2.0, (2.6 + 1.0 * sin(self.stringsDriftPhase)) / 1200.0)

            // ---- Intensity resonance (gentle Q rise above ~62%). Cutoff follows the neutral
            // intensity multiplier (0.48×–1.78× preset base), biased by smoothed register
            // brightness + mood tone tilt. ----
            let resoAmt = max(0.0, (Double(self.currentIntensity) - 0.62) / 0.38)
            let fcBaseBuf = self.curFilterBaseHz * self.curRegBright * moodBright
            let resoFc = min(sr * 0.45, fcBaseBuf * self.intensityFilterMult(Double(self.currentIntensity)))
            self.resonancePeak.setPeaking(resoFc, 0.9 + resoAmt * 0.6, resoAmt * 4.0, sr)

            for frame in 0..<Int(frameCount) {
                // Master volume: musical swell at cold start, gentle fade-out on Stop, otherwise
                // the snappy ampCoeff so the volume slider stays responsive.
                let volumeCoeff: Double
                if self.stopFadeActive { volumeCoeff = self.stopFadeCoeff }
                else if self.startupFadeActive { volumeCoeff = self.startupFadeCoeff }
                else { volumeCoeff = self.ampCoeff }
                self.currentVolume += (self.targetVolume - self.currentVolume) * volumeCoeff
                if self.startupFadeActive && abs(self.targetVolume - self.currentVolume) < 0.004 {
                    self.startupFadeActive = false
                }
                self.currentBreath += (self.targetBreath - self.currentBreath) * self.ampCoeff
                self.currentIntensity += (self.targetIntensity - self.currentIntensity) * self.ampCoeff
                self.currentBinauralBeatHz += (self.targetBinauralBeatHz - self.currentBinauralBeatHz) * self.ampCoeff

                // Register trim + brightness morph smoothly (~1 s) toward the current register.
                self.curRegTrim += (targetRegTrim - self.curRegTrim) * self.regCoeff
                self.curRegBright += (targetRegBright - self.curRegBright) * self.regCoeff

                // Pitch: FROZEN during a note-change dip (fadeOut/hold) so there is no audible
                // glide while the bed is still up — it snaps at the quiet point. Reference-A /
                // glide retunes (notePhase idle) slide smoothly via freqCoeff.
                if self.notePhase == .fadeOut || self.notePhase == .hold {
                    // held; snapped at quiet point below
                } else {
                    self.currentRootHz += (self.targetRootHz - self.currentRootHz) * self.freqCoeff
                }

                // ---- Note-change dip envelope (fade out → retune at quiet → fade in). ----
                switch self.notePhase {
                case .fadeOut:
                    self.transitionGain -= self.noteFadeOutInc
                    if self.transitionGain <= 0.0 {
                        self.transitionGain = 0.0
                        self.currentRootHz = self.targetRootHz   // retune at the quiet point
                        self.noteHoldCounter = self.noteFadeInDelayFrames
                        self.notePhase = .hold
                    }
                case .hold:
                    self.noteHoldCounter -= 1
                    if self.noteHoldCounter <= 0 { self.notePhase = .fadeIn }
                case .fadeIn:
                    self.transitionGain += self.noteFadeInInc
                    if self.transitionGain >= 1.0 {
                        self.transitionGain = 1.0
                        self.notePhase = .idle
                    }
                case .idle:
                    break
                }
                self.breathElapsed += breathInc

                // Voice-gain smoothing coeff: slow crossfade during a preset/register morph
                // window, otherwise fast so Breath stays a live 12 s motion.
                let gc: Double
                if self.gainMorphFramesRemaining > 0 {
                    gc = self.gainMorphCoeff
                    self.gainMorphFramesRemaining -= 1
                } else {
                    gc = self.gainCoeff
                }

                var mix = 0.0
                for i in 0..<count {
                    let targetRatio = custom ? self.scratchPending[i] : self.targetRatios[i]
                    let targetGain = custom ? Double(self.scratchRequested[i]) : self.targetGains[i]
                    // Click-free morph on ratio change: fade out, swap while inaudible, fade in.
                    if self.activeRatios[i] != targetRatio {
                        self.currentGains[i] += (0.0 - self.currentGains[i]) * self.gainCoeff
                        if self.currentGains[i] < 0.0008 {
                            self.activeRatios[i] = targetRatio
                            self.phases[i] = 0.0
                        }
                    } else {
                        self.currentGains[i] += (targetGain - self.currentGains[i]) * gc
                    }
                    // Upper layers (octave and above) get the slow, capped mood detune drift;
                    // root/fifth/low octave stay pitch-locked so the tuning centre never moves.
                    let ratio = (!custom && i >= 3) ? self.activeRatios[i] * moodDetuneFactor : self.activeRatios[i]
                    self.phases[i] += twoPi * (self.currentRootHz * ratio) / sr
                    if self.phases[i] > twoPi { self.phases[i] -= twoPi }

                    var osc: Double
                    if isStrings && i <= 2 {
                        // Detuned saw ensemble on the principle body layers → chorused strings.
                        self.stringsDetunePhase[i] += twoPi * (self.currentRootHz * self.activeRatios[i] * stringsDetuneFactor) / sr
                        if self.stringsDetunePhase[i] > twoPi { self.stringsDetunePhase[i] -= twoPi }
                        osc = 0.6 * self.sawApprox(self.phases[i]) + 0.4 * self.sawApprox(self.stringsDetunePhase[i])
                    } else {
                        osc = sin(self.phases[i])
                    }
                    mix += osc * self.currentGains[i]
                }

                // Air/wind: white noise → HP ~1.1 kHz → LP ~5 kHz → breath swell.
                if noiseLevel > 0 {
                    self.rngState ^= self.rngState << 13
                    self.rngState ^= self.rngState >> 17
                    self.rngState ^= self.rngState << 5
                    let white = Double(self.rngState) / Double(UInt32.max) * 2.0 - 1.0
                    self.noiseHp += 0.15 * (white - self.noiseHp)          // remove lows
                    let hp = white - self.noiseHp
                    self.noiseLp += noiseLpCoeff * (hp - self.noiseLp)     // breath opens the air LP
                    mix += self.noiseLp * noiseLevel
                }

                // ---- Tone stages ----
                var x = self.bassShelf.process(mix)
                x = self.midScoop.process(x)
                x = self.lowMidScoop.process(x)
                x = self.airShelf.process(x)
                x = self.moodShelf.process(x)   // slow bloom (mood)
                x = self.moodNotch.process(x)   // sweeping eclipse (Blood)
                x = self.resonancePeak.process(x)  // gentle intensity resonance near cutoff

                // Intensity-driven low-pass: neutral shape (0.48×–1.78× preset base at 0/0.5/1),
                // biased by smoothed register brightness + mood tone tilt.
                let fc = min(sr * 0.45, self.curFilterBaseHz * self.curRegBright * moodBright
                                        * self.intensityFilterMult(Double(self.currentIntensity)))
                let w = twoPi * fc / sr
                let lpAlpha = w / (1.0 + w)
                self.lpState += lpAlpha * (x - self.lpState)

                // DC-block high-pass (~3–4 Hz).
                let dcOut = self.lpState - self.dcPrevIn + 0.9995 * self.dcPrevOut
                self.dcPrevIn = self.lpState
                self.dcPrevOut = dcOut

                // Real binaural beat: separate L/R carriers split around the root by beat Hz.
                var left = dcOut
                var right = dcOut
                if beatActive && self.currentBinauralBeatHz > 0.01 {
                    let half = self.currentBinauralBeatHz * 0.5
                    self.binPhaseL += twoPi * (self.currentRootHz - half) / sr
                    self.binPhaseR += twoPi * (self.currentRootHz + half) / sr
                    if self.binPhaseL > twoPi { self.binPhaseL -= twoPi }
                    if self.binPhaseR > twoPi { self.binPhaseR -= twoPi }
                    left += sin(self.binPhaseL) * 0.16
                    right += sin(self.binPhaseR) * 0.16
                }

                // Note-change dip: the whole voice bed (incl. binaural carriers) fades to the
                // quiet point and back so key/register changes are a musical gesture, not a jump.
                left *= self.transitionGain
                right *= self.transitionGain

                // Master: smoothed register trim + makeup gain + tanh soft-clip limiter.
                let drive = Double(self.currentVolume) * 1.68 * 1.1 * self.curRegTrim
                let sl = Float(tanh(left * drive) * 0.97)
                let sr2 = Float(tanh(right * drive) * 0.97)
                leftPtr?[frame] = sl
                rightPtr?[frame] = rightPtr != nil ? sr2 : sl
            }
            return noErr
        }

        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
        sourceNode = node
        engine.prepare()
        try engine.start()
        isRunning = true
        print("⚡️ [NativeDrone] engine started (preset \(presetName), targetVolume \(targetVolume))")
    }

    /// Atomically configure the full voice state, then start (one call from JS). Ordering
    /// matters: preset first (it resets ratios + intensity compression), then register/pitch/
    /// mood/beat/intensity/breath, then start — which snaps current* to these targets so the
    /// drone begins directly in the requested state (no default-Shruti/D3 flash, no per-call
    /// round-trips). If already running, this behaves as a live reconfigure + volume set.
    func configureAndStart(volume: Float, rootHz: Double, octave: Int, preset: String,
                           mood: String, beatHz: Double, intensity: Float, breath: Float) throws {
        setPreset(preset)
        setRegister(octave)
        setMood(mood)
        setBinauralBeat(beatHz)
        setFrequency(rootHz)
        setIntensity(intensity)
        setBreath(breath)
        try start(volume: volume)
    }

    /// Safety net after the shared iOS audio session is reconfigured (e.g. WebAudio metronome
    /// start in Native Mode). If we still consider the drone "running" but AVAudioEngine was
    /// bumped, restart the engine graph. Never changes UI/logical running state.
    func reassert() {
        guard isRunning else { return }
        if !engine.isRunning {
            do {
                try engine.start()
                print("⚡️ [NativeDrone] reassert — restarted engine after session change")
            } catch {
                print("⚡️ [NativeDrone] reassert failed:", error)
            }
        }
    }

    /// Compute the named voice-model target gains for this buffer (render thread).
    private func computeVoiceModel(breathOffset: Double, breathMotion: Double, exhaleAmount: Double) {
        let amount = intensityAmount()
        let tonal = max(0.0, min(NativeDroneEngine.effectiveTonalMax, amount + breathOffset))
        let character = pow(tonal, 1.35)
        let focus = pow(max(0.0, (tonal - 0.5) / 0.5), 1.4)
        let lowSettling = pow(max(0.0, (tonal - 0.4) / 0.6), 1.15)
        let vm = NativeDroneEngine.voiceMotionDepth

        func bm(_ scale: Double) -> Double { scale * breathMotion * vm }
        let P = NativeDroneEngine.self
        let presence: [Double] = [
            P.presenceLowOctave.base - lowSettling * P.presenceLowOctave.s1 + bm(P.presenceLowOctave.breath),
            P.presenceRoot.base - lowSettling * P.presenceRoot.s1 + bm(P.presenceRoot.breath),
            P.presenceFifth.base + character * P.presenceFifth.s1 + focus * P.presenceFifth.s2 + bm(P.presenceFifth.breath),
            P.presenceOctave.base + character * P.presenceOctave.s1 + focus * P.presenceOctave.s2 + bm(P.presenceOctave.breath),
            P.presenceUpperOctave.base + character * P.presenceUpperOctave.s1 + focus * P.presenceUpperOctave.s2 + bm(P.presenceUpperOctave.breath),
            P.presenceUpperFifth.base + character * P.presenceUpperFifth.s1 + focus * P.presenceUpperFifth.s2 + bm(P.presenceUpperFifth.breath),
        ]

        // Cosmos high-intensity softening (COSMOS_TUNING) applied to upper + sky layers.
        let cosmosSoft = pIsCosmos ? pow(max(0.0, (tonal - 0.65) / 0.35), 1.1) : 0.0

        // Register voicing: lower registers relieve low-octave/fifth/foundation pressure;
        // High/VH ease the low octave + foundation further (intensity low-end + register).
        let regLow = regLowLayerScale()
        let highRegLowEase = currentOctave >= 5 ? 0.75 : (currentOctave >= 4 ? 0.85 : 1.0)

        // High intensity slightly reduces low octave / fifth / foundation pressure (the sound
        // tilts brighter/more focused, not just louder) — begins easing above ~60% intensity.
        let lowEnd = 1.0 - 0.30 * max(0.0, (Double(currentIntensity) - 0.6) / 0.4)
        dbgLowEndScale = lowEnd

        for i in 0..<6 {
            var soften = i >= 2 ? (1.0 - exhaleAmount * NativeDroneEngine.breathExhaleSoftening) : 1.0
            if pIsCosmos && i >= 4 { soften *= (1.0 - 0.4 * cosmosSoft) }
            var g = pVoiceGains[i] * presence[i] * soften
            if i == 0 { g *= regLow * highRegLowEase * lowEnd }   // −12 low octave
            if i == 2 { g *= regLow * lowEnd }                   // fifth
            targetGains[i] = max(0.0, g)
        }

        // Foundation root (Shruti/Cosmos): constant low anchor eased by low-frequency settling
        // and by register (less low-mid weight in Low/Medium, further eased at High/VH), plus
        // the high-intensity low-end relief.
        targetGains[Layer.foundation.rawValue] = pFoundationGain > 0
            ? max(0.0, pFoundationGain * (0.68 - lowSettling * 0.12) * regLow * highRegLowEase * lowEnd)
            : 0.0

        // Cosmos sky/celestial layers — airy high extension presence.
        if pIsCosmos {
            let extPresence = max(0.0, 0.002 + character * 0.12 + focus * 0.22) * (1.0 - 0.4 * cosmosSoft)
            targetGains[Layer.celestial.rawValue] = NativeDroneEngine.cosmosCelestialGain * extPresence
            targetGains[Layer.skyRoot.rawValue] = NativeDroneEngine.cosmosSkyRootGain * extPresence
            targetGains[Layer.skyOctave.rawValue] = NativeDroneEngine.cosmosSkyOctaveGain * extPresence
        } else {
            targetGains[Layer.celestial.rawValue] = 0.0
            targetGains[Layer.skyRoot.rawValue] = 0.0
            targetGains[Layer.skyOctave.rawValue] = 0.0
        }
    }

    /// Musical stop: fade the master volume down over ~2–3 s (stopFadeCoeff), then tear the
    /// engine down once the tail has fully decayed to silence. A Play landing during the fade
    /// bumps runGeneration, which cancels this deferred teardown (start() swells back up).
    func stop() {
        guard isRunning else { return }
        targetVolume = 0.0
        startupFadeActive = false
        stopFadeActive = true
        let gen = runGeneration
        // ~3 s later the fade (0.6 s TC) has decayed to < -40 dB — tear down cleanly.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            guard let self = self else { return }
            // A new start() (or another stop) happened during the fade → do not tear down.
            guard self.runGeneration == gen, self.stopFadeActive else { return }
            self.stopFadeActive = false
            self.isRunning = false
            let node = self.sourceNode
            self.sourceNode = nil
            self.engine.stop()
            if let node = node { self.engine.detach(node) }
            print("⚡️ [NativeDrone] engine stopped (after musical stop fade)")
        }
    }

    private func clamp01(_ value: Double) -> Double {
        return max(0.0, min(1.0, value))
    }

    func setVolume(_ value: Float) { targetVolume = clamp01(Double(value)) }
    /// Raw pitch target (used by configureAndStart cold-start, which snaps). Live UI changes
    /// should use changeNote (key/register → dip gesture) or retune (reference-A → glide).
    func setFrequency(_ hz: Double) { targetRootHz = max(20.0, min(4000.0, hz)) }
    func setBreath(_ value: Float) { targetBreath = clamp01(Double(value)) }
    func setIntensity(_ value: Float) { targetIntensity = clamp01(Double(value)) }
    func setBinauralBeat(_ hz: Double) { targetBinauralBeatHz = max(0.0, min(60.0, hz)) }

    /// Live key/note change: trigger the musical dip → retune-at-quiet → fade-in gesture.
    func changeNote(_ hz: Double) {
        setFrequency(hz)
        guard isRunning else { return }   // stopped: next start() snaps to it, no dip needed
        notePhase = .fadeOut
        lastTransitionKind = "note"
    }

    /// Live reference-A / small tuning step: smooth, audible pitch glide (no dip).
    func retune(_ hz: Double) {
        setFrequency(hz)
        if isRunning { lastTransitionKind = "glide" }
    }

    /// Current musical register (2=Low … 5=VeryHigh). A real octave change while playing opens
    /// a ~1.5 s voice/trim/brightness morph window so the register voicing crossfades musically.
    func setRegister(_ octave: Int) {
        let o = max(2, min(5, octave))
        if o != currentOctave && isRunning {
            gainMorphFramesRemaining = max(gainMorphFramesRemaining, Int(1.5 * sampleRate))
            lastTransitionKind = "register"
        }
        currentOctave = o
    }

    /// Select the slow-motion Mood (moods.js ids). Ignored while the preset is Binaural.
    func setMood(_ name: String) { moodName = name }

    // Low/fifth/foundation relief in the lower registers (lowLayerScaleByRegister).
    private func regLowLayerScale() -> Double {
        switch currentOctave {
        case 2: return 0.74
        case 3: return 0.84
        default: return 1.0
        }
    }

    // Register output trim relative to Medium (REGISTER_BALANCE_TRIM_DB + air high-trim,
    // gentled for native headroom). High/VH taper down; Low a touch below Medium.
    private func registerTrimLinear() -> Double {
        let db: Double
        switch currentOctave {
        case 2: db = -0.25
        case 4: db = -2.0
        case 5: db = -2.75
        default: db = 0.0
        }
        return pow(10.0, db / 20.0)
    }

    // Soft saw-ish waveshape from a single tracked phase (cheap harmonic sum). Used only
    // by the Strings ensemble to give the strings their reedy, harmonically rich body.
    @inline(__always) private func sawApprox(_ p: Double) -> Double {
        return (sin(p) + 0.5 * sin(2.0 * p) + 0.33 * sin(3.0 * p)) * 0.7
    }

    /// Select a Moondrone moon preset (voice model mode).
    func setPreset(_ name: String) {
        let def = NativeDroneEngine.presets[name] ?? NativeDroneEngine.presets["Shruti"]!
        presetName = NativeDroneEngine.presets[name] != nil ? name : "Shruti"
        pVoiceGains = def.voiceGains
        pFilterBaseHz = def.filterBaseHz
        pFoundationGain = def.foundationGain
        pIsCosmos = def.isCosmos
        pBreathAmountScale = def.breathAmountScale
        pBreathNoiseScale = def.breathNoiseScale
        pLowMidFreq = def.lowMidFreq
        pLowMidGainDb = def.lowMidGainDb
        // Per-preset intensity compression (PRESET_INTENSITY_TUNING).
        pSoftCeilingUi = 0.0; pAboveCeilingContribution = 0.25; pAmountScale = 1.0
        pUpperKneeUi = 0.0; pUpperMaxEffectiveUi = 0.67; pUpperCompressionPower = 2.4
        switch presetName {
        case "Pure": pSoftCeilingUi = 0.70; pAboveCeilingContribution = 0.20
        case "Cosmos": pSoftCeilingUi = 0.65; pAboveCeilingContribution = 0.32; pAmountScale = 0.94
        case "Binaural": pUpperKneeUi = 0.50; pUpperMaxEffectiveUi = 0.67; pUpperCompressionPower = 2.4; pAmountScale = 0.82
        default: break
        }
        useCustomPartials = false
        // Restore the named-layer ratios (in case we were in custom-partials mode).
        for i in 0..<NativeDroneEngine.bankSize {
            targetRatios[i] = NativeDroneEngine.layerRatios[i]
        }
        // Live moon change: open a ~3 s voice crossfade window so the new preset's voice gains
        // blend in (the preset filter base / low-mid glide separately, per buffer) — no abrupt
        // timbre switch, no silence gap. When stopped, start() snaps the fresh preset instead.
        if isRunning {
            gainMorphFramesRemaining = max(gainMorphFramesRemaining, Int(3.0 * sampleRate))
            lastTransitionKind = "preset"
        }
    }

    /// POC-only: drive a raw partial set (debug buttons). Switches to custom mode.
    func setPartials(_ partials: [Partial]) {
        let count = min(partials.count, NativeDroneEngine.maxCustomPartials)
        paramLock.lock()
        for i in 0..<count {
            pendingRatios[i] = partials[i].ratio
            requestedGains[i] = max(0.0, min(1.0, partials[i].gain))
        }
        if count < customCount {
            for i in count..<customCount { requestedGains[i] = 0.0 }
        }
        customCount = max(count, customCount)
        paramLock.unlock()
        useCustomPartials = true
    }

    func snapshot() -> [String: Any] {
        return [
            "isRunning": isRunning,
            "mode": useCustomPartials ? "customPartials" : "voiceModel",
            "preset": presetName,
            "octave": currentOctave,
            "mood": moodName,
            "rootHz": targetRootHz,
            "volume": targetVolume,
            "breath": targetBreath,
            "intensity": targetIntensity,
            "binauralBeatHz": targetBinauralBeatHz,
            "beatActive": presetName == "Binaural",
            "voiceCount": useCustomPartials ? customCount : NativeDroneEngine.bankSize,
            // ---- Transition / envelope + breath + intensity diagnostics ----
            "transitionActive": notePhase != .idle || gainMorphFramesRemaining > 0,
            "transitionKind": lastTransitionKind,
            "startFadeActive": startupFadeActive,
            "stopFadeActive": stopFadeActive,
            "currentRootHz": currentRootHz,
            "targetRootHz": targetRootHz,
            "currentVolume": currentVolume,
            "targetVolume": targetVolume,
            "breathPhase": dbgBreathPhase,
            "breathCycleSeconds": NativeDroneEngine.breathCycleSeconds,
            "breathAmount": dbgBreathAmount,
            "airNoiseGain": dbgAirNoiseGain,
            "intensityFilterMultiplier": dbgIntensityFilterMult,
            "intensityResonance": dbgIntensityResonance,
            "lowEndScale": dbgLowEndScale,
        ]
    }
}

/// Capacitor bridge for the native drone POC. Exposed to JS as `NativeDrone`.
@objc(NativeDronePlugin)
public class NativeDronePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeDronePlugin"
    public let jsName = "NativeDrone"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startNativeDrone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopNativeDrone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeDroneVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeDroneFrequency", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeDronePartials", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeDroneBreath", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeDroneIntensity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeDronePreset", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeDroneBinauralBeat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeDroneRegister", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeDroneMood", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configureAndStartNativeDrone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reassertNativeDrone", returnType: CAPPluginReturnPromise)
    ]

    private let drone = NativeDroneEngine()

    @objc func startNativeDrone(_ call: CAPPluginCall) {
        print("⚡️ [NativeDrone] startNativeDrone ENTERED (native Swift)")
        // Activate the shared `.playback` session only now — when native playback actually starts.
        let sessionState = AudioSessionManager.configureForPlayback("native-drone-start")
        let requestedVolume = call.getDouble("volume")

        DispatchQueue.main.async {
            do {
                try self.drone.start(volume: requestedVolume.map { Float($0) })
                var result = sessionState
                result["droneRunning"] = true
                result["engine"] = "AVAudioEngine+AVAudioSourceNode"
                result["state"] = self.drone.snapshot()
                call.resolve(result)
            } catch {
                print("⚡️ [NativeDrone] startNativeDrone FAILED:", error)
                call.reject("native drone start failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func stopNativeDrone(_ call: CAPPluginCall) {
        print("⚡️ [NativeDrone] stopNativeDrone ENTERED (native Swift)")
        DispatchQueue.main.async {
            self.drone.stop()
            call.resolve(["droneRunning": false])
        }
    }

    @objc func setNativeDroneVolume(_ call: CAPPluginCall) {
        guard let value = call.getDouble("value") else {
            call.reject("setNativeDroneVolume requires a numeric 'value' (0.0–1.0)")
            return
        }
        let clamped = max(0.0, min(1.0, value))
        drone.setVolume(Float(clamped))
        call.resolve(["volume": clamped])
    }

    @objc func setNativeDroneFrequency(_ call: CAPPluginCall) {
        guard let hz = call.getDouble("rootHz") else {
            call.reject("setNativeDroneFrequency requires a numeric 'rootHz'")
            return
        }
        // transition: "note" (default) → musical dip+retune gesture for key/register changes;
        // "glide" → smooth audible pitch ramp for small reference-A tuning steps.
        let transition = call.getString("transition") ?? "note"
        if transition == "glide" {
            drone.retune(hz)
        } else {
            drone.changeNote(hz)
        }
        call.resolve(["rootHz": hz, "transition": transition])
    }

    @objc func setNativeDronePartials(_ call: CAPPluginCall) {
        guard let raw = call.getArray("partials") else {
            call.reject("setNativeDronePartials requires an array 'partials' of { ratio, gain }")
            return
        }
        var partials: [NativeDroneEngine.Partial] = []
        for entry in raw {
            guard let dict = entry as? [String: Any],
                  let ratio = (dict["ratio"] as? NSNumber)?.doubleValue,
                  let gain = (dict["gain"] as? NSNumber)?.doubleValue else {
                continue
            }
            partials.append(NativeDroneEngine.Partial(ratio: ratio, gain: Float(gain)))
        }
        if partials.isEmpty {
            call.reject("setNativeDronePartials: no valid { ratio, gain } entries")
            return
        }
        drone.setPartials(partials)
        call.resolve(["partialCount": partials.count])
    }

    @objc func setNativeDroneBreath(_ call: CAPPluginCall) {
        guard let value = call.getDouble("value") else {
            call.reject("setNativeDroneBreath requires a numeric 'value' (0.0–1.0)")
            return
        }
        let clamped = max(0.0, min(1.0, value))
        drone.setBreath(Float(clamped))
        call.resolve(["breath": clamped])
    }

    @objc func setNativeDroneIntensity(_ call: CAPPluginCall) {
        guard let value = call.getDouble("value") else {
            call.reject("setNativeDroneIntensity requires a numeric 'value' (0.0–1.0)")
            return
        }
        let clamped = max(0.0, min(1.0, value))
        drone.setIntensity(Float(clamped))
        call.resolve(["intensity": clamped])
    }

    @objc func setNativeDronePreset(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else {
            call.reject("setNativeDronePreset requires a string 'name' (Pure/Shruti/Strings/Cosmos/Binaural)")
            return
        }
        DispatchQueue.main.async {
            self.drone.setPreset(name)
            call.resolve(["preset": name, "state": self.drone.snapshot()])
        }
    }

    @objc func setNativeDroneBinauralBeat(_ call: CAPPluginCall) {
        guard let hz = call.getDouble("beatHz") else {
            call.reject("setNativeDroneBinauralBeat requires a numeric 'beatHz'")
            return
        }
        drone.setBinauralBeat(hz)
        call.resolve(["beatHz": hz])
    }

    @objc func setNativeDroneRegister(_ call: CAPPluginCall) {
        guard let octave = call.getInt("octave") else {
            call.reject("setNativeDroneRegister requires an integer 'octave' (2=Low … 5=VeryHigh)")
            return
        }
        drone.setRegister(octave)
        call.resolve(["octave": octave])
    }

    @objc func setNativeDroneMood(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else {
            call.reject("setNativeDroneMood requires a string 'name' (new/full/blue/blood/super)")
            return
        }
        drone.setMood(name)
        call.resolve(["mood": name])
    }

    /// One-shot configure + start. Fixes slow multi-call startup and the brief default-state
    /// flash: JS computes rootHz/beatHz and passes the whole voice state in a single call.
    @objc func configureAndStartNativeDrone(_ call: CAPPluginCall) {
        print("⚡️ [NativeDrone] configureAndStartNativeDrone ENTERED (native Swift)")
        let sessionState = AudioSessionManager.configureForPlayback("native-drone-configure-start")
        let volume = Float(call.getDouble("volume") ?? 0.2)
        let rootHz = call.getDouble("rootHz") ?? 146.83
        let octave = call.getInt("octave") ?? 3
        let preset = call.getString("preset") ?? "Shruti"
        let mood = call.getString("mood") ?? "full"
        let beatHz = call.getDouble("beatHz") ?? 0.0
        let intensity = Float(call.getDouble("intensity") ?? 0.7)
        let breath = Float(call.getDouble("breath") ?? 0.0)

        DispatchQueue.main.async {
            do {
                try self.drone.configureAndStart(volume: volume, rootHz: rootHz, octave: octave,
                                                 preset: preset, mood: mood, beatHz: beatHz,
                                                 intensity: intensity, breath: breath)
                var result = sessionState
                result["droneRunning"] = true
                result["engine"] = "AVAudioEngine+AVAudioSourceNode"
                result["state"] = self.drone.snapshot()
                call.resolve(result)
            } catch {
                print("⚡️ [NativeDrone] configureAndStartNativeDrone FAILED:", error)
                call.reject("native drone configure+start failed: \(error.localizedDescription)")
            }
        }
    }

    /// Re-assert the native engine after the shared session was reconfigured (metronome).
    @objc func reassertNativeDrone(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.drone.reassert()
            call.resolve(["state": self.drone.snapshot()])
        }
    }
}
// =============================================================================
// END NATIVE DRONE EXPERIMENT
// =============================================================================

/// Custom bridge view controller whose sole job is to register the local `MoondroneAudioPlugin`.
///
/// Wired in Base.lproj/Main.storyboard (customClass=MainViewController, module=App). This is the
/// documented Capacitor 6+ way to register a plugin that lives in the app target rather than in
/// an npm package.
public class MainViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        print("⚡️ [MoondroneAudio] MainViewController.capacitorDidLoad — registering MoondroneAudioPlugin")
        bridge?.registerPluginInstance(MoondroneAudioPlugin())
        // Native drone POC (temporary — see NATIVE DRONE EXPERIMENT block above).
        bridge?.registerPluginInstance(NativeDronePlugin())
    }
}
