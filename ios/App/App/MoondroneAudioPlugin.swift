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

/// Slightly-more-Moondrone-like native drone. Renders a summed set of sine partials
/// (root + fifth + octave preset by default) in real time with click-free, one-pole
/// smoothed parameters:
///   • volume        — master gain 0…1
///   • rootHz         — fundamental; partials track it as ratios so pitch glides smoothly
///   • partials       — [(ratio, gain)] set, up to `maxPartials`
///   • breath         — slow tremolo depth 0…1 (gentle amplitude "breathing")
///   • intensity      — 0…1 upper-partial emphasis + low-pass brightness
///
/// Signal chain (per sample): summed partials → intensity-driven one-pole low-pass →
/// DC-blocking high-pass → master volume → tanh soft-clip limiter.
///
/// Preset changes morph click-free: when a slot's ratio changes, that slot fades to
/// silence, swaps ratio (phase reset only while inaudible), then fades back in.
///
/// Thread model: the render callback is the ONLY writer of the `current*`/`active*`
/// state, phases, and filter memory. The main thread writes `target*` scalars
/// (word-sized, benign race) and the pending partial set under `paramLock`. The render
/// callback snapshots the partial set into preallocated scratch under the lock once per
/// buffer (no per-sample locking, no heap allocation on the audio thread).
final class NativeDroneEngine {
    struct Partial { var ratio: Double; var gain: Float }

    private let engine = AVAudioEngine()
    private var sourceNode: AVAudioSourceNode?
    private(set) var isRunning = false

    private let sampleRate: Double = 44100.0
    private static let maxPartials = 8

    // Pending partial set (guarded by paramLock — written on main, snapshotted on render thread).
    private let paramLock = NSLock()
    private var pendingRatios = [Double](repeating: 0, count: maxPartials)
    private var requestedGains = [Float](repeating: 0, count: maxPartials)
    private var activeCount = 0

    // Render-thread-only state.
    private var activeRatios = [Double](repeating: 0, count: maxPartials)
    private var currentGains = [Float](repeating: 0, count: maxPartials)
    private var phases = [Double](repeating: 0, count: maxPartials)
    private var scratchPending = [Double](repeating: 0, count: maxPartials)
    private var scratchRequested = [Float](repeating: 0, count: maxPartials)
    private var breathPhase = 0.0
    // Tone-shaping filter memory (render thread only).
    private var lpState = 0.0
    private var dcPrevIn = 0.0
    private var dcPrevOut = 0.0

    // Smoothed scalar params: target* set on main, current* ramped on render thread.
    private var targetRootHz = 110.0     // A2
    private var currentRootHz = 110.0
    private var targetVolume: Float = 0.0
    private var currentVolume: Float = 0.0
    private var targetBreath: Float = 0.0
    private var currentBreath: Float = 0.0
    private var targetIntensity: Float = 0.4
    private var currentIntensity: Float = 0.4

    // One-pole smoothing coefficients (per sample). ~35 ms gain/param, ~80 ms pitch glide.
    private lazy var ampCoeff: Float = 1.0 - exp(-1.0 / Float(0.035 * sampleRate))
    private lazy var freqCoeff = 1.0 - exp(-1.0 / (0.080 * sampleRate))
    private let breathRateHz = 0.12  // ~8 s breathing cycle

    init() {
        applyDefaultPreset()
    }

    /// Simple Moondrone-like preset: root + fifth + octave.
    func applyDefaultPreset() {
        setPartials([
            Partial(ratio: 1.0, gain: 0.5),
            Partial(ratio: 1.5, gain: 0.3),
            Partial(ratio: 2.0, gain: 0.2),
        ])
    }

    func start(volume: Float?) throws {
        if isRunning {
            if let volume = volume { setVolume(volume) }
            return
        }

        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2) else {
            throw NSError(domain: "NativeDrone", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "could not create AVAudioFormat"])
        }

        // Start silent and ramp up so there is no onset click. Reset filter memory.
        currentVolume = 0.0
        targetVolume = max(0.0, min(1.0, volume ?? 0.2))
        lpState = 0.0
        dcPrevIn = 0.0
        dcPrevOut = 0.0

        let twoPi = 2.0 * Double.pi

        let node = AVAudioSourceNode { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self else { return noErr }
            let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)

            // Snapshot the partial set once per buffer (COW retain only; no deep copy).
            self.paramLock.lock()
            let count = self.activeCount
            for i in 0..<count {
                self.scratchPending[i] = self.pendingRatios[i]
                self.scratchRequested[i] = self.requestedGains[i]
            }
            self.paramLock.unlock()

            let ampCoeff = self.ampCoeff
            let freqCoeff = self.freqCoeff
            let breathInc = twoPi * self.breathRateHz / self.sampleRate

            for frame in 0..<Int(frameCount) {
                // Smooth scalar params toward targets (click-free).
                self.currentVolume += (self.targetVolume - self.currentVolume) * ampCoeff
                self.currentBreath += (self.targetBreath - self.currentBreath) * ampCoeff
                self.currentIntensity += (self.targetIntensity - self.currentIntensity) * ampCoeff
                self.currentRootHz += (self.targetRootHz - self.currentRootHz) * freqCoeff

                // Gentle breathing tremolo: at full depth the level dips ~55%.
                self.breathPhase += breathInc
                if self.breathPhase > twoPi { self.breathPhase -= twoPi }
                let breathLfo = 0.5 - 0.5 * cos(self.breathPhase)
                let ampMod = 1.0 - Double(self.currentBreath) * 0.55 * breathLfo

                var mix = 0.0
                for i in 0..<count {
                    // Click-free preset morph: if the ratio for this slot changed, fade the slot
                    // out, then swap the ratio (and reset phase) only once it is inaudible.
                    if self.activeRatios[i] != self.scratchPending[i] {
                        self.currentGains[i] += (0.0 - self.currentGains[i]) * ampCoeff
                        if self.currentGains[i] < 0.0008 {
                            self.activeRatios[i] = self.scratchPending[i]
                            self.phases[i] = 0.0
                        }
                    } else {
                        self.currentGains[i] += (self.scratchRequested[i] - self.currentGains[i]) * ampCoeff
                    }

                    let inc = twoPi * (self.currentRootHz * self.activeRatios[i]) / self.sampleRate
                    self.phases[i] += inc
                    if self.phases[i] > twoPi { self.phases[i] -= twoPi }
                    // Intensity tilt: upper partials (ratio > 1) fade in with brightness.
                    let tilt = self.activeRatios[i] <= 1.0 ? 1.0 : Double(0.35 + 0.65 * self.currentIntensity)
                    mix += sin(self.phases[i]) * Double(self.currentGains[i]) * tilt
                }

                let raw = mix * ampMod

                // Tone shaping: one-pole low-pass whose cutoff opens with intensity (600 Hz → 5800 Hz).
                let fc = 600.0 + Double(self.currentIntensity) * 5200.0
                let w = twoPi * fc / self.sampleRate
                let lpAlpha = w / (1.0 + w)
                self.lpState += lpAlpha * (raw - self.lpState)

                // DC-blocking high-pass (~3–4 Hz) removes any offset / subsonic buildup.
                let dcOut = self.lpState - self.dcPrevIn + 0.9995 * self.dcPrevOut
                self.dcPrevIn = self.lpState
                self.dcPrevOut = dcOut

                // Master volume + tanh soft-clip limiter (transparent at low level, tames peaks).
                let sample = Float(tanh(dcOut * Double(self.currentVolume) * 1.1))
                for buffer in ablPointer {
                    guard let dst = buffer.mData?.assumingMemoryBound(to: Float.self) else { continue }
                    dst[frame] = sample
                }
            }
            return noErr
        }

        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: format)
        sourceNode = node

        engine.prepare()
        try engine.start()
        isRunning = true
        print("⚡️ [NativeDrone] engine started (targetVolume \(targetVolume))")
    }

    /// Ramp volume to 0, then tear the engine down so there is no stop click.
    func stop() {
        guard isRunning else { return }
        targetVolume = 0.0
        let node = sourceNode
        sourceNode = nil
        isRunning = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
            guard let self = self else { return }
            self.engine.stop()
            if let node = node { self.engine.detach(node) }
            print("⚡️ [NativeDrone] engine stopped")
        }
    }

    func setVolume(_ value: Float) {
        targetVolume = max(0.0, min(1.0, value))
    }

    func setFrequency(_ hz: Double) {
        targetRootHz = max(20.0, min(2000.0, hz))
    }

    func setBreath(_ value: Float) {
        targetBreath = max(0.0, min(1.0, value))
    }

    func setIntensity(_ value: Float) {
        targetIntensity = max(0.0, min(1.0, value))
    }

    /// Replace the partial set. Slots whose ratio changes morph click-free (fade out →
    /// swap ratio → fade in) on the render thread; extra partials beyond `maxPartials`
    /// are ignored.
    func setPartials(_ partials: [Partial]) {
        let count = min(partials.count, NativeDroneEngine.maxPartials)
        paramLock.lock()
        for i in 0..<count {
            pendingRatios[i] = partials[i].ratio
            requestedGains[i] = max(0.0, min(1.0, partials[i].gain))
        }
        // Fade unused slots to silence rather than dropping them abruptly.
        if count < activeCount {
            for i in count..<activeCount { requestedGains[i] = 0.0 }
        }
        activeCount = max(count, activeCount)
        // Once faded, shrink the active range on the next set; keep summing the fading tails now.
        paramLock.unlock()
    }

    func snapshot() -> [String: Any] {
        paramLock.lock()
        let count = activeCount
        var partialInfo: [[String: Any]] = []
        for i in 0..<count {
            partialInfo.append(["ratio": pendingRatios[i], "gain": requestedGains[i]])
        }
        paramLock.unlock()
        return [
            "isRunning": isRunning,
            "rootHz": targetRootHz,
            "volume": targetVolume,
            "breath": targetBreath,
            "intensity": targetIntensity,
            "partials": partialInfo,
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
        CAPPluginMethod(name: "setNativeDroneIntensity", returnType: CAPPluginReturnPromise)
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
        drone.setFrequency(hz)
        call.resolve(["rootHz": hz])
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
