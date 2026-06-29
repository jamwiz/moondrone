import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Launch-time configuration is a baseline only. The authoritative override happens in
        // MoondroneAudioPlugin.configurePlaybackSession(), which JS calls immediately before
        // every Play (WKWebView can reset the shared session when WebAudio first starts).
        AudioSessionManager.configureForPlayback("launch")
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // WKWebView may have reset the shared session while we were inactive; re-assert `.playback`
        // so Silent Mode stays overridden and lock-screen/background audio keeps working.
        AudioSessionManager.configureForPlayback("did-become-active")
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

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
        do {
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            print("[Moondrone audio-session] Failed to configure AVAudioSession (\(reason)):", error)
        }
        let state = currentState()
        print("[Moondrone audio-session] state (\(reason)):", state)
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
/// Registered automatically by Capacitor via the Obj-C runtime (CAPBridgedPlugin); no
/// project.pbxproj change is needed because this file is already in the App target.
/// JS side: `registerPlugin('MoondroneAudio')`.
@objc(MoondroneAudioPlugin)
public class MoondroneAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MoondroneAudioPlugin"
    public let jsName = "MoondroneAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configurePlaybackSession", returnType: CAPPluginReturnPromise)
    ]

    private var observersRegistered = false

    public override func load() {
        registerObservers()
    }

    /// Called from JS right before Tone.start / drone start / metronome start.
    @objc func configurePlaybackSession(_ call: CAPPluginCall) {
        registerObservers()
        let state = AudioSessionManager.configureForPlayback("js-configure")
        call.resolve(state)
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
            print("[Moondrone audio-session] interruption began")
            notifyListeners("audioSessionInterrupted", data: ["reason": "interruption-began"])
        case .ended:
            // Re-assert `.playback` so a fresh, user-initiated Play works again. Playback itself
            // is never auto-resumed — the web layer requires a new Play.
            print("[Moondrone audio-session] interruption ended")
            AudioSessionManager.configureForPlayback("interruption-ended")
            notifyListeners("audioSessionInterruptionEnded", data: AudioSessionManager.currentState())
        @unknown default:
            break
        }
    }

    @objc private func handleMediaServicesReset() {
        // Media server restarted; every audio object is invalid. Rebuild the session and tell JS
        // to hard-reset its graph.
        print("[Moondrone audio-session] media services were reset — reconfiguring")
        AudioSessionManager.configureForPlayback("media-services-reset")
        notifyListeners("audioSessionInterrupted", data: ["reason": "media-services-reset"])
    }
}
