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

/// Custom bridge view controller whose sole job is to register the local `MoondroneAudioPlugin`.
///
/// Wired in Base.lproj/Main.storyboard (customClass=MainViewController, module=App). This is the
/// documented Capacitor 6+ way to register a plugin that lives in the app target rather than in
/// an npm package.
public class MainViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        print("⚡️ [MoondroneAudio] MainViewController.capacitorDidLoad — registering MoondroneAudioPlugin")
        bridge?.registerPluginInstance(MoondroneAudioPlugin())
    }
}
