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

// ---- Lightweight stereo "wash" (Schroeder/Freeverb-style) --------------------------------
// A compact, self-contained reverb rendered inside the source node (NO AVAudioUnitReverb, so
// there is no added latency, no external tail state to manage, and it reverts with this file).
// 8 comb + 4 allpass filters per channel with a small L/R delay spread → a diffuse pad wash.
// Stable by construction: comb feedback stays < 1, allpass feedback is fixed 0.5, and the
// master tanh limiter downstream catches any peak. Dry path keeps its own DC block + limiter.
private struct CombFilter {
    var buffer: [Double]
    var bufIdx = 0
    var filterStore = 0.0
    var feedback = 0.5
    var damp1 = 0.25
    var damp2 = 0.75
    init(size: Int) { buffer = [Double](repeating: 0, count: max(1, size)) }
    mutating func reset() { for i in buffer.indices { buffer[i] = 0 }; filterStore = 0 }
    mutating func setDamp(_ d: Double) { damp1 = d; damp2 = 1.0 - d }
    @inline(__always) mutating func process(_ input: Double) -> Double {
        let output = buffer[bufIdx]
        filterStore = output * damp2 + filterStore * damp1
        buffer[bufIdx] = input + filterStore * feedback
        bufIdx += 1
        if bufIdx >= buffer.count { bufIdx = 0 }
        return output
    }
}

private struct AllpassFilter {
    var buffer: [Double]
    var bufIdx = 0
    var feedback = 0.5
    init(size: Int) { buffer = [Double](repeating: 0, count: max(1, size)) }
    mutating func reset() { for i in buffer.indices { buffer[i] = 0 } }
    @inline(__always) mutating func process(_ input: Double) -> Double {
        let bufout = buffer[bufIdx]
        let output = -input + bufout
        buffer[bufIdx] = input + bufout * feedback
        bufIdx += 1
        if bufIdx >= buffer.count { bufIdx = 0 }
        return output
    }
}

private final class FreeverbWash {
    // Classic Freeverb delay tunings (samples @ 44.1 kHz) + a small stereo spread.
    private static let combTunings = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
    private static let allpassTunings = [556, 441, 341, 225]
    private static let stereoSpread = 23
    private static let fixedGain = 0.015     // Freeverb input scale (keeps the tail well-behaved)

    private var combsL: [CombFilter] = []
    private var combsR: [CombFilter] = []
    private var apL: [AllpassFilter] = []
    private var apR: [AllpassFilter] = []

    init() {
        for t in FreeverbWash.combTunings {
            combsL.append(CombFilter(size: t))
            combsR.append(CombFilter(size: t + FreeverbWash.stereoSpread))
        }
        for t in FreeverbWash.allpassTunings {
            var l = AllpassFilter(size: t); l.feedback = 0.5; apL.append(l)
            var r = AllpassFilter(size: t + FreeverbWash.stereoSpread); r.feedback = 0.5; apR.append(r)
        }
    }

    func reset() {
        for i in combsL.indices { combsL[i].reset(); combsR[i].reset() }
        for i in apL.indices { apL[i].reset(); apR[i].reset() }
    }

    /// room 0..1 → comb feedback 0.70..0.98 (larger = longer tail); damp 0..1 → HF damping.
    func setParams(room: Double, damp: Double) {
        let fb = max(0.0, min(0.98, room * 0.28 + 0.70))
        let d = max(0.0, min(0.95, damp))
        for i in combsL.indices {
            combsL[i].feedback = fb; combsL[i].setDamp(d)
            combsR[i].feedback = fb; combsR[i].setDamp(d)
        }
    }

    @inline(__always) func process(_ inL: Double, _ inR: Double) -> (Double, Double) {
        let inputL = inL * FreeverbWash.fixedGain
        let inputR = inR * FreeverbWash.fixedGain
        var outL = 0.0, outR = 0.0
        for i in combsL.indices { outL += combsL[i].process(inputL); outR += combsR[i].process(inputR) }
        for i in apL.indices { outL = apL[i].process(outL); outR = apR[i].process(outR) }
        return (outL, outR)
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
        let stereoWidth: Double       // mid/side spread of the panned voices (presetStereoWidth)
        let voicePan: [Double]        // per-layer pan (±), length bankSize (presetVoicePan)
        let washWet: Double           // reverb wet mix (from PRESETS.reverb.wet, native-safe)
        let washRoom: Double          // reverb room size 0..1 (from PRESETS.reverb.decay)
    }
    private static let presets: [String: PresetDef] = [
        // Pure/Mimas — very root-centered, near-sine: quiet −12 body, almost no fifth, gentle
        // +12 float, spacious/clean (not organ). Slight clean spread + generous clean space.
        "Pure": PresetDef(voiceGains: [0.05, 0.225, 0.002, 0.07, 0.01, 0.003],
                          filterBaseHz: 2280, foundationGain: 0, isCosmos: false,
                          breathAmountScale: 0.58, breathNoiseScale: 0.55,
                          lowMidFreq: 520, lowMidGainDb: -1.55,
                          stereoWidth: 0.42, voicePan: [-0.14, 0.06, 0, 0.11, 0, 0, 0, 0, 0, 0],
                          washWet: 0.20, washRoom: 0.82),
        // Shruti/Europa — tanpura/shruti-box: strong root + audible fifth, hollow low-mid, some
        // upper-octave shimmer, foundation root that supports but does not boom. Moderate room.
        "Shruti": PresetDef(voiceGains: [0.052, 0.34, 0.135, 0.02, 0.05, 0.014],
                            filterBaseHz: 850, foundationGain: 0.40, isCosmos: false,
                            breathAmountScale: 1.0, breathNoiseScale: 1.0,
                            lowMidFreq: 420, lowMidGainDb: -1.25,
                            stereoWidth: 0.44, voicePan: [-0.14, 0, 0.12, 0, 0.20, 0, 0, 0, 0, 0],
                            washWet: 0.17, washRoom: 0.60),
        // Strings/Titan — richness reference: detuned saw ensemble on the body layers (rendered
        // below), warm/wide pad body, a touch more upper harmonic for air (not buzzy). Warm room.
        "Strings": PresetDef(voiceGains: [0.185, 0.36, 0.115, 0.03, 0.022, 0.012],
                             filterBaseHz: 4200, foundationGain: 0, isCosmos: false,
                             breathAmountScale: 1.0, breathNoiseScale: 0.42,
                             lowMidFreq: 300, lowMidGainDb: -1.15,
                             stereoWidth: 0.46, voicePan: [-0.10, 0, 0.05, 0.08, 0.14, 0, 0, 0, 0, 0],
                             washWet: 0.19, washRoom: 0.64),
        // Cosmos/Io — darker base but airy top: lighter root, more celestial +36/+48 sky presence,
        // widest layers, biggest/airiest space. Sky gains raised so the shimmer is clearly audible.
        "Cosmos": PresetDef(voiceGains: [0.036, 0.215, 0.13, 0.24, 0.30, 0.15],
                            filterBaseHz: 420, foundationGain: 0.52, isCosmos: true,
                            breathAmountScale: 1.0, breathNoiseScale: 0.96,
                            lowMidFreq: 300, lowMidGainDb: -1.15,
                            stereoWidth: 0.55,
                            voicePan: [-0.18, 0, 0.10, -0.12, 0.16, 0.22, 0, -0.30, 0.30, 0.42],
                            washWet: 0.34, washRoom: 0.90),
        // Binaural — real L/R beat pair; near-mono voice bed + restrained wash so the beat stays
        // clear (its own L/R carriers provide the width, not the mid/side pan or a big tail).
        "Binaural": PresetDef(voiceGains: [0.048, 0.35, 0.14, 0.13, 0.078, 0.034],
                              filterBaseHz: 385, foundationGain: 0, isCosmos: false,
                              breathAmountScale: 1.0, breathNoiseScale: 0.0,
                              lowMidFreq: 360, lowMidGainDb: -1.45,
                              stereoWidth: 0.06, voicePan: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                              washWet: 0.10, washRoom: 0.52),
    ]
    // Cosmos sky layer gains — COSMOS_EXTENSION_GAINS, raised for clearly audible celestial air.
    private static let cosmosCelestialGain = 0.085
    private static let cosmosSkyRootGain = 0.055
    private static let cosmosSkyOctaveGain = 0.050

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
    private var stringsDetunePhase2 = [Double](repeating: 0, count: bankSize)
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
    private var transitionRetriggered = false // true when a note/register change arrived mid-crossfade

    // Register-derived scalars smoothed over ~2.05 s so octave/register changes morph the output
    // trim + filter brightness in step with the register deck crossfade (~2.05 s) — not faster.
    private lazy var regCoeff = 1.0 - exp(-1.0 / (2.05 * sampleRate))
    private var curRegTrim = 1.0
    private var curRegBright = 1.0

    // Preset scalars that feed the tone/filter chain, glided so a moon change never snaps the
    // cutoff (e.g. Cosmos 420 Hz → Strings 4200 Hz) — smoothed per buffer (~1.5 s).
    private var curFilterBaseHz = 850.0
    private var curLowMidFreq = 420.0
    private var curLowMidGainDb = -1.25
    private var curBreathNoiseScale = 1.0

    // ---- Stereo width / panning + space wash --------------------------------
    private var pWidth = 0.44                 // preset mid/side width
    private var pPan = [Double](repeating: 0, count: bankSize)  // per-layer pan (±)
    private let wash = FreeverbWash()
    private var targetWashWet = 0.17, curWashWet = 0.17         // reverb wet mix (smoothed)
    private var targetWashRoom = 0.60, curWashRoom = 0.60       // reverb room size (smoothed)
    private var sideLp = 0.0                  // gentle LP on the side signal (tames pan sizzle)

    // ---- Mood orbit pair (dedicated oscillators, separate from the voice bank). Blue/Blood/
    // Super/Full get a slow symmetric detune pair centred on a musical interval → shimmer/beating
    // with the pitch centre held. Off for New and Binaural. ----
    private var orbitPhaseA = 0.0, orbitPhaseB = 0.0
    private var orbitDriftPhase = 0.0

    // ---- Pitch crossfade deck (note / register change) --------------------------------------
    // Overlapping equal-power crossfade INSTEAD of a fade-to-silence dip. On a key/register change
    // the current bank is snapshotted into a frozen "outgoing" deck (old pitch/voicing/timbre) that
    // keeps sounding and fades OUT, while the main bank snaps to the new pitch/voicing and fades IN
    // — no silence gap. Both decks sum before the shared tone chain + wash, so the reverb tail keeps
    // ringing across the change. Armed on main via `xfArmPending`; the snapshot + progress live on
    // the render thread. Only in voice-model mode (custom-partials POC never crossfades).
    private var xfActive = false
    private var xfArmPending = false
    private var xfArmDurationFrames = 0
    private var xfProgress = 0.0        // 0 → 1 across the crossfade
    private var xfInc = 0.0
    private var xfRootHz = 146.83       // frozen OLD pitch for the outgoing deck
    private var xfPhases = [Double](repeating: 0, count: bankSize)
    private var xfRatios = [Double](repeating: 0, count: bankSize)
    private var xfGains = [Double](repeating: 0, count: bankSize)
    private var xfStringsPhase = [Double](repeating: 0, count: bankSize)
    private var xfStringsPhase2 = [Double](repeating: 0, count: bankSize)
    private var xfPan = [Double](repeating: 0, count: bankSize)
    private var xfIsStrings = false
    private var xfBeatActive = false
    private var xfBinBeatHz = 0.0
    private var xfBinPhaseL = 0.0, xfBinPhaseR = 0.0
    // Binaural beat-pair fade: switching a preset to/from Binaural ramps this 0↔1 over the preset
    // window so the L/R carriers fade in/out (no instant carrier on/off → no clip/pop). Authority
    // for whether the carriers sound; the voice bank + wash + width morph via their own smoothing.
    private var curBeatMix = 0.0
    private var registerChangePending = false   // set by setRegister → next changeNote uses reg timing
    private lazy var noteXfadeFrames = Int(1.50 * sampleRate)      // key change overlap ~1.50 s
    private lazy var registerXfadeFrames = Int(2.05 * sampleRate)  // register change overlap ~2.05 s

    // ---- Smoothed preset scalars (glided so a moon change never snaps pan/width/timbre) ------
    private var curWidth = 0.44                                   // smoothed mid/side width
    private var curPan = [Double](repeating: 0, count: bankSize)  // smoothed per-layer pan
    private var curStringsMix = 0.0   // 0 = sine bodies, 1 = full Strings saw ensemble (crossfaded)
    private var gainMorphTotalFrames = 1                           // for presetCrossfadeProgress debug

    // ---- Smoothed mood identity (ramps old → new over ~1.2 s so a phase change never jumps a
    // shelf/notch/orbit gain). Targets are recomputed per buffer from moodName; these follow. ----
    private var mCurBloomDb = 0.0
    private var mCurEclipseDb = 0.0
    private var mCurEclipseHz = 1200.0
    private var mCurBright = 1.0
    private var mCurDetuneCents = 0.0
    private var mCurWidthAdd = 0.0
    private var mCurOrbitGain = 0.0
    private var mCurOrbitSemitone = 12.0
    private var mCurOrbitMaxCents = 0.0
    private var mCurOrbitPeriod = 120.0
    private var moodSnapPending = false        // cold start snaps mood identity (no ramp-in)
    private var moodXfadeRemaining = 0         // frames left in the current mood ramp (debug/active)
    private lazy var moodXfadeTotalFrames = Int(1.2 * sampleRate)

    // ---- Native Tone Lab (organ-timbre experiment) ------------------------------------------
    // A REVERSIBLE, live-adjustable soft-organ/drawbar body layer, isolated to Native Mode. It adds
    // a warm harmonic stack (sines + a little triangle/saw body + gentle formant) on top of the
    // voice bank — aimed at restoring Titan/Strings' old "organy" glow without just being louder.
    // Every param has a `tl*` main-thread target and a `cur*` render-smoothed value so live changes
    // never click. Per-moon organ amount + trim resolve from the current preset and glide, so the
    // organ participates in the existing moon crossfades. Defaults reproduce the current sound plus
    // a subtle Titan experiment. All values are clamped. `setToneLab` merges partial updates.
    private var tlOrganAmount = 0.25, curOrganAmount = 0.25
    private var tlOrganBright = 0.30, curOrganBright = 0.30
    private var tlOrganBlend = 0.25, curOrganBlend = 0.25
    private var tlTriBody = 0.45, curTriBody = 0.45
    private var tlSawBody = 0.18, curSawBody = 0.18
    private var tlFormant = 0.18, curFormant = 0.18
    private var tlOutputTrimDb = 0.0, curOutputTrimDb = 0.0
    private var tlPresetOrgan: [String: Double] = ["Pure": 0.02, "Shruti": 0.08, "Strings": 0.45, "Cosmos": 0.18, "Binaural": 0.0]
    private var tlPresetTrimDb: [String: Double] = ["Pure": 0.0, "Shruti": 0.0, "Strings": 0.0, "Cosmos": 0.0, "Binaural": 0.0]
    private var curPresetOrgan = 0.08     // smoothed organ amount for the current moon
    private var curPresetTrimDb = 0.0     // smoothed per-moon safety trim (dB)
    // ---- Mood / phase shaping (Native Tone Lab, Native Mode only) ----
    // moodAmount scales ALL mood identity (bloom / eclipse / bright tilt / width / detune / orbit).
    // moodResonance additionally scales the resonant "note-like" parts (eclipse notch + orbit cents).
    // moodOrbit additionally scales the orbit pair level. moodTransSpeed maps to the mood glide time
    // (0 → ~1.8 s slow, 0.65 → ~0.9 s, 1 → ~0.4 s snappy). Defaults soften + speed up vs. the old feel.
    private var tlMoodAmount = 0.55, curMoodAmount = 0.55
    private var tlMoodResonance = 0.45, curMoodResonance = 0.45
    private var tlMoodTransSpeed = 0.65, curMoodTransSpeed = 0.65
    private var tlMoodOrbit = 0.45, curMoodOrbit = 0.45
    // Root follower for the mood ORBIT / resonant layer. The main voice decks crossfade note/register
    // changes, but the orbit centre reads the root directly — if it used currentRootHz (which SNAPS
    // to the new pitch on the crossfade-arm frame) the orbit/resonant tone would jump to the new place
    // while the bed is still mostly the old pitch. moodRootHz instead GLIDES toward targetRootHz so the
    // orbit follows the transition smoothly (no jump, no phase reset). The follow TIME is controlled by
    // moodPitchFollowSpeed (0 → ~1.9 s slow dramatic slide … 1 → ~0.2 s fast). This is a SEPARATE
    // control from moodTransitionSpeed (which governs phase/mood identity changes like New→Full→Blood).
    // Snapped at cold start; glided per-buffer. Reference-A glides track it too.
    private var moodRootHz = 146.83
    private var tlMoodPitchFollow = 0.75, curMoodPitchFollow = 0.75
    // Native metronome click level (0…1.5; 1.0 = original level). Persisted via Native Tone Lab.
    // Smoothed so live changes never click. Applied to the click ONLY (never the drone bed).
    private var tlMetVolume = 1.0, curMetVolume = 1.0
    // Native metronome click tone/pitch (0…1; 0.5 = default). Lower = darker/woodier, higher = brighter.
    private var tlMetTone = 0.5, curMetTone = 0.5
    private var organPhase = [Double](repeating: 0, count: 6)
    private var organLp = 0.0             // soft low-pass on the organ layer (warmth)
    private var organFormant = Biquad()   // gentle vowel/organ low-mid body
    private var organRootHz = 146.83      // organ pitch GLIDES (no snap) so crossfades don't jump it
    private lazy var organGlideCoeff = 1.0 - exp(-1.0 / (0.7 * sampleRate))  // ~0.7 s organ portamento
    // Drawbar-style harmonics: sub, root, fifth, octave, twelfth, upper — "very controlled" upper.
    private static let organRatios: [Double] = [0.5, 1.0, 1.5, 2.0, 3.0, 4.0]
    private static let organDrawbar: [Double] = [0.26, 1.0, 0.24, 0.5, 0.18, 0.24]
    private static let organMakeup = 0.55

    // ---- Native metronome (Native Mode only) -------------------------------------------------
    // Sample-accurate click generated on THIS render thread and mixed into the same output as the
    // drone — no Tone.js / WebAudio / media-primer / session reconfigure involved. Clicks are a
    // short decaying sine (+ tiny noise transient for "wood") so a Stop mid-click still decays
    // cleanly. `metronomeEnabled`/params are written on main (benign word-sized race); the beat
    // counter + click envelope are render-thread only. `metRestartPending` requests a fresh
    // downbeat-aligned start from the render thread.
    private var metronomeEnabled = false
    private var metRestartPending = false
    private var metStartedEngine = false      // true if the metronome (not the drone) started the engine
    // True while the USER has the drone playing (Play pressed, not Stopped). Distinct from isRunning,
    // which can stay true for a metronome-only engine after the drone bed has faded out. Drives the
    // `droneUserActive` snapshot + the teardown decision in stop()/stopMetronome().
    private var droneUserPlaying = false
    private var metBpm = 100.0
    private var metMeter = 0                    // 0 = straight (no accent) default; 2…6 = beats/bar
    private var metSoundMode = "wood"
    private var metBeatIndex = 0
    private var metFramesToNext = 0
    private var metClickEnv = 0.0
    private var metClickPhase = 0.0
    private var metClickInc = 0.0
    private var metClickBaseFreq = 0.0   // unscaled click pitch; live tone slider retargets metClickInc
    private var metClickDecay = 0.0
    private var metNoiseEnv = 0.0
    private var metNoiseDecay = 0.0

    // Debug snapshot values written on the render thread (benign race on read).
    private var dbgBreathPhase = 0.0
    private var dbgBreathAmount = 0.0
    private var dbgAirNoiseGain = 0.0
    private var dbgIntensityFilterMult = 1.0
    private var dbgIntensityResonance = 0.0
    private var dbgLowEndScale = 1.0
    private var dbgMoodBloomDb = 0.0
    private var dbgMoodEclipseDb = 0.0
    private var dbgMoodBright = 1.0
    private var dbgMoodDetuneCents = 0.0
    private var dbgMoodOrbitActive = false
    private var dbgTransitionHeadroomDb = 0.0

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
        // A start() is a user drone start by default. startMetronome() calls start(volume: 0) to
        // spin up a click-only engine and immediately clears this again (see startMetronome).
        droneUserPlaying = true
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
        for i in 0..<NativeDroneEngine.bankSize { stringsDetunePhase[i] = 0.0; stringsDetunePhase2[i] = 0.0 }

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
        curWashWet = targetWashWet
        curWashRoom = targetWashRoom
        sideLp = 0.0
        orbitPhaseA = 0.0; orbitPhaseB = 0.0; orbitDriftPhase = 0.0
        metClickEnv = 0.0; metNoiseEnv = 0.0; metBeatIndex = 0; metFramesToNext = 0
        wash.reset()

        // Snap smoothed preset scalars so the first buffer is already in the requested timbre
        // (pan/width/Strings character morph only for LIVE changes, never a start ramp).
        curWidth = pWidth
        for i in 0..<NativeDroneEngine.bankSize { curPan[i] = pPan[i] }
        curStringsMix = (presetName == "Strings") ? 1.0 : 0.0
        curBeatMix = (presetName == "Binaural") ? 1.0 : 0.0
        // Snap Native Tone Lab (organ layer) to its targets so the drone begins in the requested
        // timbre; live changes glide. Reset the organ oscillator/filter state.
        curOrganAmount = tlOrganAmount; curOrganBright = tlOrganBright; curOrganBlend = tlOrganBlend
        curTriBody = tlTriBody; curSawBody = tlSawBody; curFormant = tlFormant
        curOutputTrimDb = tlOutputTrimDb
        curPresetOrgan = tlPresetOrgan[presetName] ?? 0.0
        curPresetTrimDb = tlPresetTrimDb[presetName] ?? 0.0
        curMoodAmount = tlMoodAmount; curMoodResonance = tlMoodResonance
        curMoodTransSpeed = tlMoodTransSpeed; curMoodOrbit = tlMoodOrbit
        curMoodPitchFollow = tlMoodPitchFollow
        curMetVolume = tlMetVolume
        curMetTone = tlMetTone
        moodRootHz = targetRootHz        // orbit/resonant follower begins at the requested pitch
        for i in 0..<6 { organPhase[i] = 0.0 }
        organLp = 0.0; organFormant.reset()
        organRootHz = targetRootHz        // begin the organ at the requested pitch (no glide-in)
        // Reset the pitch crossfade deck to idle (a cold start never crossfades).
        xfActive = false; xfArmPending = false; xfProgress = 0.0
        registerChangePending = false
        // Snap the mood identity to the selected mood at cold start (live mood changes ramp).
        moodSnapPending = true
        moodXfadeRemaining = 0

        let twoPi = 2.0 * Double.pi
        let halfPi = 0.5 * Double.pi
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
            // Space wash wet/room glide so a moon change crossfades the reverb size (the tail
            // itself decays naturally); then push the (smoothed) room into the wash network.
            self.curWashWet += (self.targetWashWet - self.curWashWet) * presetBufCoeff
            self.curWashRoom += (self.targetWashRoom - self.curWashRoom) * presetBufCoeff
            self.wash.setParams(room: self.curWashRoom, damp: 0.28)

            // Preset pan / width / Strings-ensemble character glide (~1.5 s) too, so a moon change
            // morphs stereo image + timbre smoothly instead of snapping (a snap here was a pop).
            self.curWidth += (self.pWidth - self.curWidth) * presetBufCoeff
            let stringsTargetMix = (self.presetName == "Strings") ? 1.0 : 0.0
            self.curStringsMix += (stringsTargetMix - self.curStringsMix) * presetBufCoeff
            // Binaural carrier fade: ramp in/out over the preset window (to/from Binaural).
            let beatTargetMix = (self.presetName == "Binaural") ? 1.0 : 0.0
            self.curBeatMix += (beatTargetMix - self.curBeatMix) * presetBufCoeff

            // ---- Native Tone Lab (organ layer) glides. Globals dezip fast (~0.12 s), per-moon
            // organ/trim glide over the preset window so the organ body morphs with moon changes. ----
            let tlCoeff = 1.0 - exp(-Double(frameCount) / (0.12 * sr))
            self.curOrganAmount += (self.tlOrganAmount - self.curOrganAmount) * tlCoeff
            self.curOrganBright += (self.tlOrganBright - self.curOrganBright) * tlCoeff
            self.curOrganBlend += (self.tlOrganBlend - self.curOrganBlend) * tlCoeff
            self.curTriBody += (self.tlTriBody - self.curTriBody) * tlCoeff
            self.curSawBody += (self.tlSawBody - self.curSawBody) * tlCoeff
            self.curFormant += (self.tlFormant - self.curFormant) * tlCoeff
            self.curOutputTrimDb += (self.tlOutputTrimDb - self.curOutputTrimDb) * tlCoeff
            // Mood-shaping params dezip at the same fast rate (moving sliders never clicks).
            self.curMoodAmount += (self.tlMoodAmount - self.curMoodAmount) * tlCoeff
            self.curMoodResonance += (self.tlMoodResonance - self.curMoodResonance) * tlCoeff
            self.curMoodTransSpeed += (self.tlMoodTransSpeed - self.curMoodTransSpeed) * tlCoeff
            self.curMoodOrbit += (self.tlMoodOrbit - self.curMoodOrbit) * tlCoeff
            self.curMoodPitchFollow += (self.tlMoodPitchFollow - self.curMoodPitchFollow) * tlCoeff
            self.curMetVolume += (self.tlMetVolume - self.curMetVolume) * tlCoeff
            self.curMetTone += (self.tlMetTone - self.curMetTone) * tlCoeff
            let organTargetForPreset = self.tlPresetOrgan[self.presetName] ?? 0.0
            let trimTargetForPreset = self.tlPresetTrimDb[self.presetName] ?? 0.0
            self.curPresetOrgan += (organTargetForPreset - self.curPresetOrgan) * presetBufCoeff
            self.curPresetTrimDb += (trimTargetForPreset - self.curPresetTrimDb) * presetBufCoeff
            // Organ layer soft low-pass cutoff (warm: ~650 Hz dark → ~3500 Hz at full brightness),
            // and a gentle vowel/organ formant peak (subtle, scales with formantBody).
            let organFc = 650.0 + 2850.0 * self.curOrganBright
            let organW = 2.0 * Double.pi * organFc / sr
            let organLpCoeff = organW / (1.0 + organW)
            self.organFormant.setPeaking(760.0, 0.8, self.curFormant * 3.2, sr)
            // Effective organ gain (timbre body, not loudness): global amount × per-moon × blend.
            let organGain = self.curOrganAmount * self.curPresetOrgan * self.curOrganBlend * NativeDroneEngine.organMakeup
            let organActive = organGain > 0.00005
            // Safety trim (global + per-moon), applied to the drone drive only (never the metronome).
            let toneLabTrimLin = pow(10.0, (self.curOutputTrimDb + self.curPresetTrimDb) / 20.0)
            if !custom {
                for i in 0..<NativeDroneEngine.bankSize {
                    self.curPan[i] += (self.pPan[i] - self.curPan[i]) * presetBufCoeff
                }
            }

            // ---- Arm a pitch crossfade (note/register change): snapshot the CURRENT bank into the
            // frozen outgoing deck (old pitch/voicing/timbre), snap the main bank to the new pitch
            // (inaudible — incoming starts at zero gain), and start the equal-power overlap. Done at
            // buffer start on the render thread so there is no race with the main-thread arm. ----
            if self.xfArmPending && !custom {
                self.xfArmPending = false
                for i in 0..<NativeDroneEngine.bankSize {
                    self.xfPhases[i] = self.phases[i]
                    self.xfRatios[i] = self.activeRatios[i]
                    self.xfGains[i] = self.currentGains[i]
                    self.xfStringsPhase[i] = self.stringsDetunePhase[i]
                    self.xfStringsPhase2[i] = self.stringsDetunePhase2[i]
                    self.xfPan[i] = self.curPan[i]
                }
                self.xfRootHz = self.currentRootHz          // frozen OLD pitch (outgoing)
                self.xfIsStrings = (self.curStringsMix > 0.5)
                self.xfBeatActive = (self.presetName == "Binaural")
                self.xfBinBeatHz = self.currentBinauralBeatHz
                self.xfBinPhaseL = self.binPhaseL
                self.xfBinPhaseR = self.binPhaseR
                self.currentRootHz = self.targetRootHz      // incoming snaps to NEW pitch (silent)
                self.xfProgress = 0.0
                self.xfInc = 1.0 / Double(max(1, self.xfArmDurationFrames))
                self.xfActive = true
            } else if self.xfArmPending {
                self.xfArmPending = false   // custom-partials mode: no crossfade, just retune
            }

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

            // ---- Mood: slow timbral motion (moods.js) with an IMMEDIATE static identity. ----
            // Each phase has a constant character (brightness / bloom baseline / width / eclipse
            // / orbit) that reads within a second or two, PLUS very slow sinusoidal motion that
            // unfolds over long cycles. Purely spectral + detune + width + orbit — never amplitude
            // tremolo, and the root pitch centre stays fixed. Skipped for Binaural.
            self.moodElapsed += Double(frameCount) / sr
            var moodBloomDb = 0.0          // total high-shelf gain (static base + slow swing)
            var moodEclipseDb = 0.0
            var moodEclipseHz = 1200.0
            var moodBright = 1.0           // filter-cutoff tilt (static identity)
            var moodDetuneCents = 0.0      // capped upper-layer drift
            var moodWidthAdd = 0.0         // extra mid/side width (static + slow)
            var orbitGain = 0.0            // dedicated orbit pair level (0 = off)
            var orbitSemitone = 12.0       // orbit centre above root
            var orbitMaxCents = 0.0        // peak symmetric detune
            var orbitPeriodSec = 120.0     // orbit convergence/divergence cycle
            if !custom && !beatActive {
                let t = self.moodElapsed
                switch self.moodName {
                case "new":   // near-still reference: sub-musical epsilon drift only
                    moodBright = 0.99
                    moodDetuneCents = 0.5 * sin(twoPi * t / 80.0)
                case "full":  // warm bloom + gentle octave orbit
                    moodBloomDb = 1.6 + 3.7 * sin(twoPi * t / 184.0)
                    moodBright = 1.03
                    moodWidthAdd = 0.05
                    moodDetuneCents = 1.6 * sin(twoPi * t / 176.0)
                    orbitGain = 0.030; orbitSemitone = 12; orbitMaxCents = 2.5; orbitPeriodSec = 240
                case "blue":  // cooler / distant / widest + soft minor-7th orbit color
                    moodBloomDb = -1.4 + 2.4 * sin(twoPi * t / 130.0)
                    moodBright = 0.86
                    moodWidthAdd = 0.30
                    moodDetuneCents = 3.0 * sin(twoPi * t / 96.0)
                    orbitGain = 0.050; orbitSemitone = 10; orbitMaxCents = 22; orbitPeriodSec = 96
                case "blood": // darker/deeper: constant eclipse shadow + sweeping notch + fifth orbit
                    moodBloomDb = -0.8 + 2.6 * sin(twoPi * t / 60.0)
                    moodBright = 0.76
                    moodWidthAdd = 0.16
                    let sweep = 0.5 + 0.5 * sin(twoPi * t / 48.0)
                    moodEclipseDb = -(4.5 + 6.5 * sweep)   // constant shadow + sweep (always present)
                    moodEclipseHz = 700.0 + (2300.0 - 700.0) * sweep
                    moodDetuneCents = 4.0 * sin(twoPi * t / 54.0)
                    orbitGain = 0.090; orbitSemitone = 7; orbitMaxCents = 52; orbitPeriodSec = 28
                case "super": // brightest / largest / radiant: strong air + wide + octave orbit
                    moodBloomDb = 2.2 + 4.3 * sin(twoPi * t / 64.0)
                    moodBright = 1.16
                    moodWidthAdd = 0.27
                    moodDetuneCents = 2.5 * sin(twoPi * t / 70.0)
                    orbitGain = 0.072; orbitSemitone = 12; orbitMaxCents = 38; orbitPeriodSec = 36
                default:
                    break
                }
            }

            // ---- Native Tone Lab mood shaping: soften + rebalance the raw mood identity BEFORE it
            // is smoothed, so a phase change is less intense by default and each part is tunable.
            //  • moodAmount scales the whole identity (bright TILT is scaled toward the neutral 1.0).
            //  • moodResonance scales the resonant "note-like" parts: eclipse notch depth + orbit cents.
            //  • moodOrbit scales the orbit pair level. Binaural already has all-zero mood (no effect). ----
            let mA = self.curMoodAmount
            let mR = self.curMoodResonance
            moodBloomDb *= mA
            moodEclipseDb *= mA * mR
            moodBright = 1.0 + (moodBright - 1.0) * mA
            moodDetuneCents *= mA
            moodWidthAdd *= mA
            orbitGain *= mA * self.curMoodOrbit
            orbitMaxCents *= mR

            // ---- Mood identity ramp: follow the target mood params with a one-pole whose time
            // constant is set by moodTransitionSpeed (0 → ~1.8 s slow … 1 → ~0.4 s snappy) so a
            // PHASE CHANGE settles quicker without ever jumping a shelf/notch/orbit-gain (which
            // popped). Cold start snaps (moodSnapPending). All downstream mood use reads the smoothed
            // mCur* values. The slow per-mood sinusoids are far slower than this, so tracking lag is
            // negligible. ----
            let moodTau = 1.8 - 1.4 * self.curMoodTransSpeed
            let moodCoeff = self.moodSnapPending ? 1.0 : (1.0 - exp(-Double(frameCount) / (max(0.3, moodTau) * sr)))
            self.moodSnapPending = false
            self.mCurBloomDb += (moodBloomDb - self.mCurBloomDb) * moodCoeff
            self.mCurEclipseDb += (moodEclipseDb - self.mCurEclipseDb) * moodCoeff
            self.mCurEclipseHz += (moodEclipseHz - self.mCurEclipseHz) * moodCoeff
            self.mCurBright += (moodBright - self.mCurBright) * moodCoeff
            self.mCurDetuneCents += (moodDetuneCents - self.mCurDetuneCents) * moodCoeff
            self.mCurWidthAdd += (moodWidthAdd - self.mCurWidthAdd) * moodCoeff
            self.mCurOrbitGain += (orbitGain - self.mCurOrbitGain) * moodCoeff
            self.mCurOrbitSemitone += (orbitSemitone - self.mCurOrbitSemitone) * moodCoeff
            self.mCurOrbitMaxCents += (orbitMaxCents - self.mCurOrbitMaxCents) * moodCoeff
            self.mCurOrbitPeriod += (orbitPeriodSec - self.mCurOrbitPeriod) * moodCoeff
            if self.moodXfadeRemaining > 0 { self.moodXfadeRemaining -= Int(frameCount) }

            self.moodShelf.setHighShelf(1600, 0.7, self.mCurBloomDb, sr)
            self.moodNotch.setPeaking(self.mCurEclipseHz, 1.2, self.mCurEclipseDb, sr)
            // Cap upper-layer detune (root/fifth stay fixed) and precompute the factor.
            let moodDetuneFactor = pow(2.0, max(-6.0, min(6.0, self.mCurDetuneCents)) / 1200.0)

            // Effective mid/side width = smoothed preset width + smoothed mood width, capped.
            let effWidth = max(0.0, min(0.85, self.curWidth + self.mCurWidthAdd))

            // ---- Orbit pair precompute (per buffer): symmetric detune around a musical centre,
            // slowly sweeping so the beat rate swells/eases. Level low + panned opposite. All from
            // the smoothed mood identity so a phase change fades the orbit in/out (no gain jump). ----
            self.orbitDriftPhase += twoPi * (Double(frameCount) / sr) / self.mCurOrbitPeriod
            if self.orbitDriftPhase > twoPi { self.orbitDriftPhase -= twoPi }
            let orbitGainSm = self.mCurOrbitGain
            // Glide the mood-root follower toward the target pitch so the orbit centre follows
            // note/register changes smoothly instead of snapping with currentRootHz. The follow time
            // is set by moodPitchFollowSpeed via a geometric map tau = 1.9·(0.11^speed):
            // 0 ≈ 1.9 s (slow dramatic slide), 0.5 ≈ 0.63 s, 0.75 ≈ 0.36 s, 1 ≈ 0.21 s (fast but still
            // smoothed, no pop). SEPARATE from moodTransitionSpeed (phase/mood identity changes).
            let moodRootTau = max(0.18, 1.9 * pow(0.11, self.curMoodPitchFollow))
            let moodRootCoeffBuf = 1.0 - exp(-Double(frameCount) / (moodRootTau * sr))
            self.moodRootHz += (self.targetRootHz - self.moodRootHz) * moodRootCoeffBuf
            let orbitCenterHz = self.moodRootHz * pow(2.0, self.mCurOrbitSemitone / 12.0)
            let orbitSweep = 0.5 + 0.5 * sin(self.orbitDriftPhase)
            let orbitCents = self.mCurOrbitMaxCents * orbitSweep
            let orbitFreqA = orbitCenterHz * pow(2.0, orbitCents / 1200.0)
            let orbitFreqB = orbitCenterHz * pow(2.0, -orbitCents / 1200.0)

            // ---- Strings detuned-ensemble drift (Strings only). ----
            self.stringsDriftPhase += twoPi * (Double(frameCount) / sr) / 30.0  // ~30 s drift
            if self.stringsDriftPhase > twoPi { self.stringsDriftPhase -= twoPi }
            let stringsDetuneFactor = pow(2.0, (3.4 + 1.4 * sin(self.stringsDriftPhase)) / 1200.0)
            let stringsDetuneFactor2 = pow(2.0, -(3.0 + 1.2 * sin(self.stringsDriftPhase * 0.7 + 1.3)) / 1200.0)

            // Mood debug (control-rate) — report the SMOOTHED identity actually in effect.
            self.dbgMoodBloomDb = self.mCurBloomDb
            self.dbgMoodEclipseDb = self.mCurEclipseDb
            self.dbgMoodBright = self.mCurBright
            self.dbgMoodDetuneCents = self.mCurDetuneCents
            self.dbgMoodOrbitActive = self.mCurOrbitGain > 0.001
            // Peak crossfade headroom dip currently in effect (0 dB when no note/register crossfade).
            self.dbgTransitionHeadroomDb = self.xfActive ? (self.transitionRetriggered ? -3.6 : -2.85) : 0.0

            // ---- Intensity resonance (gentle Q rise above ~62%). Cutoff follows the neutral
            // intensity multiplier (0.48×–1.78× preset base), biased by smoothed register
            // brightness + mood tone tilt. ----
            let resoAmt = max(0.0, (Double(self.currentIntensity) - 0.62) / 0.38)
            let fcBaseBuf = self.curFilterBaseHz * self.curRegBright * self.mCurBright
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

                // ---- Note/register crossfade envelope: equal-power overlap (no silence gap).
                // Idle → in = 1, out = 0 (single deck). Active → the frozen outgoing deck fades out
                // while the retuned incoming bank fades in. ----
                var xfIn = 1.0
                var xfOut = 0.0
                if self.xfActive {
                    xfIn = sin(self.xfProgress * halfPi)
                    xfOut = cos(self.xfProgress * halfPi)
                    self.xfProgress += self.xfInc
                    if self.xfProgress >= 1.0 {
                        self.xfProgress = 1.0
                        self.xfActive = false
                        self.transitionRetriggered = false   // crossfade finished cleanly
                    }
                }

                // ---- Incoming voice bank (current preset, at the NEW pitch/register) ----
                var voiceMix = 0.0
                var voiceSide = 0.0
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

                    let sinComp = sin(self.phases[i])
                    var osc: Double
                    // Strings ensemble character is CROSSFADED (curStringsMix 0→1) so switching a
                    // preset to/from Strings morphs sine ↔ saw ensemble instead of snapping (pop).
                    if !custom && i <= 3 && self.curStringsMix > 0.001 {
                        self.stringsDetunePhase[i] += twoPi * (self.currentRootHz * self.activeRatios[i] * stringsDetuneFactor) / sr
                        if self.stringsDetunePhase[i] > twoPi { self.stringsDetunePhase[i] -= twoPi }
                        self.stringsDetunePhase2[i] += twoPi * (self.currentRootHz * self.activeRatios[i] * stringsDetuneFactor2) / sr
                        if self.stringsDetunePhase2[i] > twoPi { self.stringsDetunePhase2[i] -= twoPi }
                        let saw = 0.5 * self.sawApprox(self.phases[i])
                            + 0.3 * self.sawApprox(self.stringsDetunePhase[i])
                            + 0.3 * self.sawApprox(self.stringsDetunePhase2[i])
                        osc = sinComp * (1.0 - self.curStringsMix) + saw * self.curStringsMix
                    } else {
                        osc = sinComp
                    }
                    let v = osc * self.currentGains[i]
                    voiceMix += v
                    if !custom { voiceSide += v * self.curPan[i] }   // smoothed pan → stereo diff
                }

                // ---- Outgoing deck (frozen old pitch/voicing/timbre), only while crossfading ----
                var outMix = 0.0
                var outSide = 0.0
                if xfOut > 0.0001 {
                    for i in 0..<NativeDroneEngine.bankSize {
                        self.xfPhases[i] += twoPi * (self.xfRootHz * self.xfRatios[i]) / sr
                        if self.xfPhases[i] > twoPi { self.xfPhases[i] -= twoPi }
                        var osc: Double
                        if self.xfIsStrings && i <= 3 {
                            self.xfStringsPhase[i] += twoPi * (self.xfRootHz * self.xfRatios[i] * stringsDetuneFactor) / sr
                            if self.xfStringsPhase[i] > twoPi { self.xfStringsPhase[i] -= twoPi }
                            self.xfStringsPhase2[i] += twoPi * (self.xfRootHz * self.xfRatios[i] * stringsDetuneFactor2) / sr
                            if self.xfStringsPhase2[i] > twoPi { self.xfStringsPhase2[i] -= twoPi }
                            osc = 0.5 * self.sawApprox(self.xfPhases[i])
                                + 0.3 * self.sawApprox(self.xfStringsPhase[i])
                                + 0.3 * self.sawApprox(self.xfStringsPhase2[i])
                        } else {
                            osc = sin(self.xfPhases[i])
                        }
                        let v = osc * self.xfGains[i]
                        outMix += v
                        outSide += v * self.xfPan[i]
                    }
                }

                // Overlap the two decks (no silence gap); air bed is continuous (not crossfaded).
                var mix = voiceMix * xfIn + outMix * xfOut
                var side = voiceSide * xfIn + outSide * xfOut

                // Crossfade headroom (COMPUTED here, APPLIED downstream to the whole dry bed — decks
                // + organ + air + orbit + binaural — right before wash + drive; see left/right below).
                // While both decks overlap (note/register change) the summed peaks of two ~uncorrelated
                // pitches, plus the continuous organ body, can exceed either alone. Dip the bed by up to
                // ~-2.85 dB at the 50 % overlap point (fully back to unity at both ends) so the limiter
                // is not the only thing preventing clip/pop. overlap = xfIn·xfOut peaks at 0.25 → ×4.
                var xfHeadroom = 1.0
                if self.xfActive {
                    let overlap = min(1.0, xfIn * xfOut * 4.0)
                    // During a rapid retrigger the incoming bank is gliding (not snapped), so the
                    // overlap peaks can correlate more — dip a little harder (~-3.5 dB) for safety.
                    let dip = self.transitionRetriggered ? 0.34 : 0.28
                    xfHeadroom = 1.0 - dip * overlap    // ×0.72 ≈ -2.85 dB / ×0.66 ≈ -3.6 dB at peak
                }

                // ---- Native Tone Lab organ layer: a soft drawbar/triangle/saw body (mono/centred
                // for a stable glow). Added AFTER the deck blend at full, continuous gain so it never
                // steps with xfIn — its pitch GLIDES (organRootHz, ~0.7 s) toward the target rather
                // than snapping like the crossfade decks, so a note/register change has no organ gain
                // jump, no waveform switch, and no phase reset. Flows through the shared tone chain +
                // wash + limiter below (never bypasses safety). Metronome is added later, untouched.
                // Glide the organ pitch every sample (even when silent) so it's never stale when the
                // organ later fades in (e.g. a moon change into Strings) — no pitch jump on entry.
                self.organRootHz += (self.targetRootHz - self.organRootHz) * self.organGlideCoeff
                if organActive && !custom {
                    var organRaw = 0.0
                    for h in 0..<6 {
                        self.organPhase[h] += twoPi * (self.organRootHz * NativeDroneEngine.organRatios[h]) / sr
                        if self.organPhase[h] > twoPi { self.organPhase[h] -= twoPi }
                        organRaw += NativeDroneEngine.organDrawbar[h] * sin(self.organPhase[h])
                    }
                    // Extra body from the root octave phase: hollow triangle + soft saw density.
                    let body = self.curTriBody * 0.55 * self.triApprox(self.organPhase[1])
                             + self.curSawBody * 0.45 * self.sawApprox(self.organPhase[1])
                    var organ = organRaw * 0.42 + body
                    self.organLp += organLpCoeff * (organ - self.organLp)   // warmth (soft low-pass)
                    organ = self.organFormant.process(self.organLp)         // gentle vowel/organ peak
                    mix += organ * organGain
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
                let fc = min(sr * 0.45, self.curFilterBaseHz * self.curRegBright * self.mCurBright
                                        * self.intensityFilterMult(Double(self.currentIntensity)))
                let w = twoPi * fc / sr
                let lpAlpha = w / (1.0 + w)
                self.lpState += lpAlpha * (x - self.lpState)

                // DC-block high-pass (~3–4 Hz) on the mono body.
                let dcOut = self.lpState - self.dcPrevIn + 0.9995 * self.dcPrevOut
                self.dcPrevIn = self.lpState
                self.dcPrevOut = dcOut

                // ---- Mid/side stereo: pan-weighted difference spreads voices across the field.
                self.sideLp += 0.6 * (side - self.sideLp)   // light LP tames pan sizzle (saws)
                let sideW = self.sideLp * effWidth
                var left = dcOut - sideW
                var right = dcOut + sideW

                // ---- Mood orbit pair: symmetric detuned oscillators panned opposite → slow
                // shimmer/beating with the pitch centre held (added pre-wash so it gets space).
                if orbitGainSm > 0.0008 {
                    self.orbitPhaseA += twoPi * orbitFreqA / sr
                    self.orbitPhaseB += twoPi * orbitFreqB / sr
                    if self.orbitPhaseA > twoPi { self.orbitPhaseA -= twoPi }
                    if self.orbitPhaseB > twoPi { self.orbitPhaseB -= twoPi }
                    left += sin(self.orbitPhaseA) * orbitGainSm
                    right += sin(self.orbitPhaseB) * orbitGainSm
                }

                // Real binaural beat: separate L/R carriers split around the root by beat Hz. Level
                // is gated by curBeatMix (smoothly ramps to/from Binaural — no instant carrier on/off,
                // so switching moon to/from Binaural has no clip/pop). On a key change the incoming
                // carriers also fade in (xfIn) while the frozen outgoing carriers fade out (xfOut).
                if self.curBeatMix > 0.0005 {
                    let half = self.currentBinauralBeatHz * 0.5
                    self.binPhaseL += twoPi * (self.currentRootHz - half) / sr
                    self.binPhaseR += twoPi * (self.currentRootHz + half) / sr
                    if self.binPhaseL > twoPi { self.binPhaseL -= twoPi }
                    if self.binPhaseR > twoPi { self.binPhaseR -= twoPi }
                    left += sin(self.binPhaseL) * 0.16 * xfIn * self.curBeatMix
                    right += sin(self.binPhaseR) * 0.16 * xfIn * self.curBeatMix
                }
                if self.xfActive && self.xfBeatActive && self.curBeatMix > 0.0005 {
                    let halfO = self.xfBinBeatHz * 0.5
                    self.xfBinPhaseL += twoPi * (self.xfRootHz - halfO) / sr
                    self.xfBinPhaseR += twoPi * (self.xfRootHz + halfO) / sr
                    if self.xfBinPhaseL > twoPi { self.xfBinPhaseL -= twoPi }
                    if self.xfBinPhaseR > twoPi { self.xfBinPhaseR -= twoPi }
                    left += sin(self.xfBinPhaseL) * 0.16 * xfOut * self.curBeatMix
                    right += sin(self.xfBinPhaseR) * 0.16 * xfOut * self.curBeatMix
                }

                // Apply transition gain + crossfade headroom to the WHOLE dry bed (decks + organ +
                // air + orbit + binaural) just before the wash reads it — so the wash never gets a
                // sudden input spike and the summed deck+organ energy stays below clip during overlap.
                // The metronome click is added AFTER this (post-drive) and is never dipped.
                let bedGain = self.transitionGain * xfHeadroom
                left *= bedGain
                right *= bedGain

                // ---- Space wash: diffuse stereo reverb, wet-mixed on top of the dry bed. The
                // dry path keeps its own DC block; the master tanh limiter downstream is the
                // clip safety for dry + wet combined.
                let (wetL, wetR) = self.wash.process(left, right)
                // washMakeup compensates for Freeverb's conservative internal scale so the wet
                // reads as a real pad space at the per-preset wet fractions; tanh limits below.
                let wetGain = self.curWashWet * 2.6
                left += wetL * wetGain
                right += wetR * wetGain

                // ---- Native metronome: sample-accurate click scheduling + synthesis. ----
                // Scheduled independently of the drone so it never needs Tone/WebAudio. The click
                // is added AFTER the drone drive but BEFORE the tanh limiter (fixed modest level →
                // stays audible at any drone volume; limiter keeps the sum from clipping).
                if self.metronomeEnabled {
                    if self.metRestartPending {
                        self.metRestartPending = false
                        self.metBeatIndex = 0
                        self.metFramesToNext = 0
                    }
                    if self.metFramesToNext <= 0 {
                        let m = self.metMeter
                        let isDown = m >= 1 && (self.metBeatIndex % m == 0)
                        self.triggerMetronomeClick(down: isDown)
                        self.metBeatIndex += 1
                        if m >= 1 { if self.metBeatIndex >= m { self.metBeatIndex = 0 } }
                        else { self.metBeatIndex = 0 }
                        self.metFramesToNext += Int(60.0 / max(30.0, self.metBpm) * sr)
                    }
                    self.metFramesToNext -= 1
                }
                // Render the active click envelope even after disable so a Stop mid-click decays.
                var click = 0.0
                if self.metClickEnv > 0.00002 {
                    let toneMult = pow(2.0, (self.curMetTone - 0.5) * 1.4)
                    self.metClickInc = twoPi * self.metClickBaseFreq * toneMult / sr
                    click = sin(self.metClickPhase) * self.metClickEnv
                    self.metClickPhase += self.metClickInc
                    if self.metClickPhase > twoPi { self.metClickPhase -= twoPi }
                    self.metClickEnv *= self.metClickDecay
                    if self.metNoiseEnv > 0.00002 {
                        self.rngState ^= self.rngState << 13
                        self.rngState ^= self.rngState >> 17
                        self.rngState ^= self.rngState << 5
                        let n = Double(self.rngState) / Double(UInt32.max) * 2.0 - 1.0
                        click += n * self.metNoiseEnv
                        self.metNoiseEnv *= self.metNoiseDecay
                    }
                }

                // Native metronome level (smoothed, 0…1.5). Applied to the click ONLY — the drone
                // drive is separate, so the click stays audible at any drone volume (incl. 0).
                click *= self.curMetVolume
                // Master: smoothed register trim + makeup gain + tanh soft-clip limiter.
                let drive = Double(self.currentVolume) * 1.68 * 1.1 * self.curRegTrim * toneLabTrimLin
                let sl = Float(tanh(left * drive + click) * 0.97)
                let sr2 = Float(tanh(right * drive + click) * 0.97)
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
        // A real drone start now owns the engine — a later stopMetronome must NOT tear it down,
        // even if the metronome had started the engine silently first.
        metStartedEngine = false
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
        // The user is no longer playing the drone (even though the engine may stay alive for the
        // metronome). Fade only the drone bed; the click level is independent of drone volume.
        droneUserPlaying = false
        targetVolume = 0.0
        startupFadeActive = false
        stopFadeActive = true
        let gen = runGeneration
        // ~3 s later the fade (0.6 s TC) has decayed to < -40 dB — tear down cleanly.
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            guard let self = self else { return }
            // A new start() (or another stop) happened during the fade → do not tear down.
            guard self.runGeneration == gen, self.stopFadeActive else { return }
            // Metronome still running → KEEP the engine + render loop alive so the click keeps
            // sounding; only the drone bed has faded to silence. stopMetronome() tears it down later.
            if self.metronomeEnabled {
                self.stopFadeActive = false
                print("⚡️ [NativeDrone] drone bed faded out; engine kept alive for metronome")
                return
            }
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

    /// Live key/note change: OVERLAPPING equal-power crossfade (no silence gap). The current bank
    /// is snapshotted into a frozen outgoing deck that keeps sounding + fades out while the main
    /// bank retunes to the new pitch + fades in (armed on the render thread). Reference-A tuning
    /// still glides (retune). Register changes reuse this with a slightly longer overlap.
    func changeNote(_ hz: Double) {
        setFrequency(hz)
        guard isRunning, !useCustomPartials else { return }   // stopped/POC: next start() snaps
        // RAPID RE-ENTRY (Option A — robust retargeting): if a note/register crossfade is STILL
        // running (or one is armed for the next buffer), do NOT re-arm. Re-arming would snapshot the
        // half-blended incoming bank into the outgoing deck, discard the current mid-fade outgoing
        // deck, and reset xfProgress to 0 — a one-sample energy step (the clip/pop when tapping fast).
        // Instead just retarget: setFrequency above updates targetRootHz, so the incoming bank (and
        // the mood/organ followers) GLIDE to the newest pitch while the existing crossfade keeps its
        // schedule. Latest target wins; the outgoing deck finishes its fade continuously. No snapshot,
        // no xfProgress reset, no phase reset → no discontinuity.
        if xfActive || xfArmPending {
            lastTransitionKind = registerChangePending ? "register" : "note"
            registerChangePending = false
            transitionRetriggered = true
            return
        }
        xfArmDurationFrames = registerChangePending ? registerXfadeFrames : noteXfadeFrames
        lastTransitionKind = registerChangePending ? "register" : "note"
        registerChangePending = false
        transitionRetriggered = false
        xfArmPending = true
    }

    /// Live reference-A / small tuning step: smooth, audible pitch glide (no crossfade/dip).
    func retune(_ hz: Double) {
        setFrequency(hz)
        if isRunning { lastTransitionKind = "glide" }
    }

    /// Current musical register (2=Low … 5=VeryHigh). A real octave change while playing flags the
    /// paired changeNote to use the longer register-crossfade timing (the pitch/voicing overlap is
    /// what actually crossfades the register voicing; trim/brightness morph per-sample over ~1 s).
    func setRegister(_ octave: Int) {
        let o = max(2, min(5, octave))
        if o != currentOctave && isRunning {
            registerChangePending = true
            lastTransitionKind = "register"
        }
        currentOctave = o
    }

    /// Select the slow-motion Mood (moods.js ids). Ignored while the preset is Binaural. The mood
    /// identity (shelves/notch/orbit/width/detune) RAMPS old→new over ~1.2 s in the control block,
    /// so a phase change never jumps a filter coefficient or orbit gain (no clip/pop).
    func setMood(_ name: String) {
        moodName = name
        if isRunning && presetName != "Binaural" {
            lastTransitionKind = "mood"
            moodXfadeRemaining = moodXfadeTotalFrames
        }
    }

    /// Native Tone Lab (organ-timbre experiment). Merges partial updates; only keys present are
    /// changed. All values clamped; targets glide on the render thread (no clicks). nil = untouched.
    func setToneLab(organToneAmount: Double?, organToneBrightness: Double?, organToneBlend: Double?,
                    triangleBody: Double?, sawBody: Double?, formantBody: Double?, outputTrimDb: Double?,
                    pureOrgan: Double?, shrutiOrgan: Double?, stringsOrgan: Double?,
                    cosmosOrgan: Double?, binauralOrgan: Double?,
                    pureTrimDb: Double?, shrutiTrimDb: Double?, stringsTrimDb: Double?,
                    cosmosTrimDb: Double?, binauralTrimDb: Double?,
                    moodAmount: Double?, moodResonanceAmount: Double?,
                    moodTransitionSpeed: Double?, moodOrbitAmount: Double?,
                    moodPitchFollowSpeed: Double?, nativeMetronomeVolume: Double?,
                    nativeMetronomeTone: Double?) {
        if let v = organToneAmount { tlOrganAmount = clamp01(v) }
        if let v = organToneBrightness { tlOrganBright = clamp01(v) }
        if let v = organToneBlend { tlOrganBlend = clamp01(v) }
        if let v = triangleBody { tlTriBody = clamp01(v) }
        if let v = sawBody { tlSawBody = clamp01(v) }
        if let v = formantBody { tlFormant = clamp01(v) }
        if let v = outputTrimDb { tlOutputTrimDb = max(-6.0, min(6.0, v)) }
        if let v = pureOrgan { tlPresetOrgan["Pure"] = clamp01(v) }
        if let v = shrutiOrgan { tlPresetOrgan["Shruti"] = clamp01(v) }
        if let v = stringsOrgan { tlPresetOrgan["Strings"] = clamp01(v) }
        if let v = cosmosOrgan { tlPresetOrgan["Cosmos"] = clamp01(v) }
        if let v = binauralOrgan { tlPresetOrgan["Binaural"] = clamp01(v) }
        if let v = pureTrimDb { tlPresetTrimDb["Pure"] = max(-6.0, min(6.0, v)) }
        if let v = shrutiTrimDb { tlPresetTrimDb["Shruti"] = max(-6.0, min(6.0, v)) }
        if let v = stringsTrimDb { tlPresetTrimDb["Strings"] = max(-6.0, min(6.0, v)) }
        if let v = cosmosTrimDb { tlPresetTrimDb["Cosmos"] = max(-6.0, min(6.0, v)) }
        if let v = binauralTrimDb { tlPresetTrimDb["Binaural"] = max(-6.0, min(6.0, v)) }
        if let v = moodAmount { tlMoodAmount = clamp01(v) }
        if let v = moodResonanceAmount { tlMoodResonance = clamp01(v) }
        if let v = moodTransitionSpeed { tlMoodTransSpeed = clamp01(v) }
        if let v = moodOrbitAmount { tlMoodOrbit = clamp01(v) }
        if let v = moodPitchFollowSpeed { tlMoodPitchFollow = clamp01(v) }
        if let v = nativeMetronomeVolume { tlMetVolume = max(0.0, min(3.0, v)) }
        if let v = nativeMetronomeTone { tlMetTone = clamp01(v) }
    }

    // ---- Native metronome API (main thread) -------------------------------------------------
    private func clampMetBpm(_ bpm: Double) -> Double { return max(30.0, min(300.0, bpm)) }

    /// Start the native metronome. If the engine is not already running (drone stopped), start it
    /// silently so the click has a render path; that engine is torn down again on stopMetronome.
    func startMetronome(bpm: Double, meter: Int, soundMode: String) {
        metBpm = clampMetBpm(bpm)
        metMeter = max(0, min(12, meter))
        metSoundMode = soundMode
        metRestartPending = true
        metronomeEnabled = true
        if !isRunning {
            metStartedEngine = true
            try? start(volume: 0.0)   // drone bed silent; only the click sounds
            droneUserPlaying = false  // start() set this true; the metronome, not the user, started it
        }
    }

    /// Stop the native metronome only. The in-flight click envelope decays naturally (no pop). The
    /// engine is torn down only if the user is not playing the drone (metronome-only engine, or the
    /// drone was already stopped while the metronome kept the engine alive). A user-playing drone is
    /// left untouched.
    func stopMetronome() {
        metronomeEnabled = false
        metRestartPending = false
        metStartedEngine = false
        if !droneUserPlaying {
            stop()   // nothing else needs the engine → musical fade + deferred teardown
        }
    }

    func setMetronomeBpm(_ bpm: Double) { metBpm = clampMetBpm(bpm) }
    func setMetronomeMeter(_ meter: Int) { metMeter = max(0, min(12, meter)) }
    func setMetronomeSoundMode(_ mode: String) { metSoundMode = mode }

    /// Configure the click envelope for a new beat (render thread). Downbeat is lower + stronger;
    /// regular beats are higher + softer. Wood = short click + noise transient; Triangle = a
    /// brighter, longer sine ring.
    @inline(__always) private func triggerMetronomeClick(down: Bool) {
        let twoPi = 2.0 * Double.pi
        var freq = 1500.0
        var amp = 0.36
        var tc = 0.007      // amplitude time-constant (s)
        var noiseAmp = 0.0
        var noiseTc = 0.002
        if metSoundMode == "triangle" {
            freq = down ? 2100.0 : 2350.0
            amp = down ? 0.50 : 0.34
            tc = down ? 0.030 : 0.014      // brighter, longer ring
            noiseAmp = 0.0
        } else {   // "wood" (default): woodblock-like click + short noise transient
            freq = down ? 900.0 : 1500.0
            amp = down ? 0.55 : 0.36
            tc = down ? 0.010 : 0.007
            noiseAmp = down ? 0.22 : 0.15
            noiseTc = 0.0018
        }
        // Tone lab: 0.5 = current default; lower = darker/woodier, higher = brighter.
        let woodiness = 1.0 + (0.5 - curMetTone) * 0.75
        noiseAmp *= max(0.55, woodiness)
        let brightness = 1.0 + (curMetTone - 0.5) * 0.36
        amp *= brightness
        metClickBaseFreq = freq
        metClickPhase = 0.0
        let toneMult = pow(2.0, (curMetTone - 0.5) * 1.4)
        metClickInc = twoPi * freq * toneMult / sampleRate
        metClickEnv = amp
        metClickDecay = exp(-1.0 / (tc * sampleRate))
        metNoiseEnv = noiseAmp
        metNoiseDecay = exp(-1.0 / (noiseTc * sampleRate))
    }

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

    // Soft, hollow triangle-ish tone from a single phase (2-term Fourier) — for the organ body.
    @inline(__always) private func triApprox(_ p: Double) -> Double {
        return (sin(p) - sin(3.0 * p) / 9.0) * 0.95
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
        pWidth = def.stereoWidth
        pPan = def.voicePan
        targetWashWet = def.washWet
        targetWashRoom = def.washRoom
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
            gainMorphTotalFrames = Int(3.0 * sampleRate)
            gainMorphFramesRemaining = max(gainMorphFramesRemaining, gainMorphTotalFrames)
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
            // Drone is user-playing (not just the engine kept alive silently for the metronome).
            "droneUserActive": droneUserPlaying,
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
            "transitionActive": xfActive || gainMorphFramesRemaining > 0 || moodXfadeRemaining > 0,
            "transitionKind": lastTransitionKind,
            // note/register overlapping crossfade
            "crossfadeProgress": xfActive ? xfProgress : (lastTransitionKind == "note" || lastTransitionKind == "register" ? 1.0 : 0.0),
            "outgoingActive": xfActive,
            "incomingActive": xfActive,
            "transitionHeadroomDb": dbgTransitionHeadroomDb,
            "transitionRetriggered": transitionRetriggered,
            "rapidTransitionActive": xfActive && transitionRetriggered,
            "noteXfadeSeconds": Double(noteXfadeFrames) / sampleRate,
            "registerXfadeSeconds": Double(registerXfadeFrames) / sampleRate,
            // Mood/orbit root follower (glides through note/register changes so it never snaps).
            "moodFollowerHz": moodRootHz,
            "moodTransitionActive": abs(moodRootHz - targetRootHz) > 0.5 || moodXfadeRemaining > 0,
            // preset (voice-gain) morph + mood identity ramp progress (0→1)
            "presetCrossfadeProgress": gainMorphFramesRemaining > 0
                ? (1.0 - Double(gainMorphFramesRemaining) / Double(max(1, gainMorphTotalFrames))) : (lastTransitionKind == "preset" ? 1.0 : 0.0),
            "moodCrossfadeProgress": moodXfadeRemaining > 0
                ? (1.0 - Double(moodXfadeRemaining) / Double(max(1, moodXfadeTotalFrames))) : (lastTransitionKind == "mood" ? 1.0 : 0.0),
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
            // ---- Space wash + mood/phase character ----
            "spaceMode": "freeverb-stereo",
            "reverbMode": "freeverb-stereo",
            "washAmount": curWashWet,
            "spaceWet": curWashWet,
            "washRoom": curWashRoom,
            "stereoWidth": pWidth,
            "moodBloomDb": dbgMoodBloomDb,
            "moodEclipseDb": dbgMoodEclipseDb,
            "moodBrightness": dbgMoodBright,
            "moodDetuneCents": dbgMoodDetuneCents,
            "moodOrbitActive": dbgMoodOrbitActive,
            "presetVoiceCount": 6 + (pFoundationGain > 0 ? 1 : 0) + (pIsCosmos ? 3 : 0),
            // ---- Native metronome ----
            "nativeMetronomePlaying": metronomeEnabled,
            "nativeMetronomeBpm": metBpm,
            "nativeMetronomeMeter": metMeter,
            "nativeMetronomeBeatIndex": metBeatIndex,
            // ---- Native Tone Lab (organ timbre experiment) ----
            "nativeToneLabActive": (curOrganAmount * curPresetOrgan * curOrganBlend) > 0.00005,
            "organToneAmount": curOrganAmount,
            "organToneBrightness": curOrganBright,
            "organToneBlend": curOrganBlend,
            "triangleBody": curTriBody,
            "sawBody": curSawBody,
            "formantBody": curFormant,
            "currentPresetOrgan": curPresetOrgan,
            "currentPresetTrimDb": curPresetTrimDb,
            "outputTrimDb": curOutputTrimDb,
            // ---- Native Tone Lab (mood / phase shaping) ----
            "moodAmount": curMoodAmount,
            "moodResonanceAmount": curMoodResonance,
            "moodTransitionSpeed": curMoodTransSpeed,
            "moodOrbitAmount": curMoodOrbit,
            "moodPitchFollowSpeed": curMoodPitchFollow,
            "moodPitchFollowSeconds": max(0.18, 1.9 * pow(0.11, curMoodPitchFollow)),
            "nativeMetronomeVolume": curMetVolume,
            "nativeMetronomeTone": curMetTone,
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
        CAPPluginMethod(name: "reassertNativeDrone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getNativeDroneSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startNativeMetronome", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopNativeMetronome", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeMetronomeBpm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeMetronomeMeter", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeMetronomeSoundMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeToneLab", returnType: CAPPluginReturnPromise)
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

    /// Read-only engine snapshot (no side effects). Used by lifecycle resume in Native Mode to
    /// rehydrate the UI (isRunning / metronome) after a background/lock instead of leaving it
    /// stopped — the native audio graph keeps playing through background on its own session.
    @objc func getNativeDroneSnapshot(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(self.drone.snapshot())
        }
    }

    // ---- Native metronome (Native Mode only) — no Tone/WebAudio/media-primer. ----
    @objc func startNativeMetronome(_ call: CAPPluginCall) {
        let bpm = call.getDouble("bpm") ?? 100.0
        // JS passes meter as an Int: 0 = straight (no accent, Native Mode default), 2…6 = beats/bar.
        let meter = call.getInt("meter") ?? 0
        let soundMode = call.getString("soundMode") ?? "wood"
        DispatchQueue.main.async {
            // Only touch the audio session if the metronome must start the engine itself (drone
            // stopped). When the drone is already playing its `.playback` session is live — do NOT
            // reconfigure it (that reconfigure was the original interruption bug).
            if !self.drone.isRunning {
                _ = AudioSessionManager.configureForPlayback("native-metronome-start")
            }
            self.drone.startMetronome(bpm: bpm, meter: meter, soundMode: soundMode)
            call.resolve(["metronomePlaying": true, "state": self.drone.snapshot()])
        }
    }

    @objc func stopNativeMetronome(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.drone.stopMetronome()
            call.resolve(["metronomePlaying": false, "state": self.drone.snapshot()])
        }
    }

    @objc func setNativeMetronomeBpm(_ call: CAPPluginCall) {
        guard let bpm = call.getDouble("bpm") else {
            call.reject("setNativeMetronomeBpm requires a numeric 'bpm'")
            return
        }
        drone.setMetronomeBpm(bpm)
        call.resolve(["bpm": bpm])
    }

    @objc func setNativeMetronomeMeter(_ call: CAPPluginCall) {
        guard let meter = call.getInt("meter") else {
            call.reject("setNativeMetronomeMeter requires an integer 'meter' (0=straight, 2…6)")
            return
        }
        drone.setMetronomeMeter(meter)
        call.resolve(["meter": meter])
    }

    @objc func setNativeMetronomeSoundMode(_ call: CAPPluginCall) {
        guard let mode = call.getString("soundMode") else {
            call.reject("setNativeMetronomeSoundMode requires a string 'soundMode' (wood/triangle)")
            return
        }
        drone.setMetronomeSoundMode(mode)
        call.resolve(["soundMode": mode])
    }

    /// Native Tone Lab (organ timbre experiment). Accepts any subset of the tone-lab keys; missing
    /// keys are left untouched (the JS side normally sends the full merged settings object). Values
    /// are re-clamped in the engine. Never affects the metronome or the Tone.js engine.
    @objc func setNativeToneLab(_ call: CAPPluginCall) {
        drone.setToneLab(
            organToneAmount: call.getDouble("organToneAmount"),
            organToneBrightness: call.getDouble("organToneBrightness"),
            organToneBlend: call.getDouble("organToneBlend"),
            triangleBody: call.getDouble("triangleBody"),
            sawBody: call.getDouble("sawBody"),
            formantBody: call.getDouble("formantBody"),
            outputTrimDb: call.getDouble("outputTrimDb"),
            pureOrgan: call.getDouble("pureOrgan"),
            shrutiOrgan: call.getDouble("shrutiOrgan"),
            stringsOrgan: call.getDouble("stringsOrgan"),
            cosmosOrgan: call.getDouble("cosmosOrgan"),
            binauralOrgan: call.getDouble("binauralOrgan"),
            pureTrimDb: call.getDouble("pureTrimDb"),
            shrutiTrimDb: call.getDouble("shrutiTrimDb"),
            stringsTrimDb: call.getDouble("stringsTrimDb"),
            cosmosTrimDb: call.getDouble("cosmosTrimDb"),
            binauralTrimDb: call.getDouble("binauralTrimDb"),
            moodAmount: call.getDouble("moodAmount"),
            moodResonanceAmount: call.getDouble("moodResonanceAmount"),
            moodTransitionSpeed: call.getDouble("moodTransitionSpeed"),
            moodOrbitAmount: call.getDouble("moodOrbitAmount"),
            moodPitchFollowSpeed: call.getDouble("moodPitchFollowSpeed"),
            nativeMetronomeVolume: call.getDouble("nativeMetronomeVolume"),
            nativeMetronomeTone: call.getDouble("nativeMetronomeTone")
        )
        call.resolve(["state": drone.snapshot()])
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
