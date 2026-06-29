import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureAudioSessionForPlayback()
        registerAudioSessionObservers()
        return true
    }

    /// `.playback` with an active session is required so Moondrone stays audible when the
    /// Ring/Silent switch is ON and continues on the lock screen (with `UIBackgroundModes: audio`).
    /// Does not start playback — WebAudio/Tone.js still waits for the user to tap Play.
    ///
    /// No `.mixWithOthers` option: Moondrone takes the active audio focus so iOS delivers
    /// proper interruption notifications (calls, other apps, Siri). Mixing would suppress them.
    private func configureAudioSessionForPlayback(_ reason: String = "launch") {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
            logAudioSessionState(reason)
        } catch {
            print("[Moondrone audio-session] Failed to configure AVAudioSession (\(reason)):", error)
        }
    }

    /// Logs the live category / mode / active intent so Silent Mode behaviour can be verified
    /// from device logs. `.playback` here is what makes audio ignore the Ring/Silent switch.
    private func logAudioSessionState(_ reason: String) {
        let session = AVAudioSession.sharedInstance()
        print("[Moondrone audio-session] state (\(reason)):",
              "category=\(session.category.rawValue)",
              "mode=\(session.mode.rawValue)",
              "options=\(session.categoryOptions.rawValue)",
              "sampleRate=\(session.sampleRate)",
              "outputVolume=\(session.outputVolume)")
    }

    /// WKWebView / Capacitor can reset the shared audio session to a Silent-Mode-respecting
    /// category when WebAudio first starts, and iOS resets it after a media-services crash.
    /// Re-assert `.playback` on those events and after interruptions so we never silently
    /// fall back to `ambient`/`soloAmbient`.
    private func registerAudioSessionObservers() {
        let center = NotificationCenter.default

        center.addObserver(self,
                           selector: #selector(handleAudioSessionInterruption(_:)),
                           name: AVAudioSession.interruptionNotification,
                           object: nil)

        center.addObserver(self,
                           selector: #selector(handleMediaServicesReset),
                           name: AVAudioSession.mediaServicesWereResetNotification,
                           object: nil)
    }

    @objc private func handleAudioSessionInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let rawType = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: rawType) else {
            return
        }

        switch type {
        case .began:
            // iOS has paused our audio (call/other app/Siri). The web layer detects the matching
            // AudioContext "interrupted" state and resets the UI; we do not fight for focus here.
            print("[Moondrone audio-session] interruption began")
        case .ended:
            // Re-activate so a subsequent Play works; honour the system's resume hint.
            let options = (info[AVAudioSessionInterruptionOptionKey] as? UInt).map(AVAudioSession.InterruptionOptions.init(rawValue:))
            let shouldResume = options?.contains(.shouldResume) ?? false
            print("[Moondrone audio-session] interruption ended shouldResume=\(shouldResume)")
            configureAudioSessionForPlayback("interruption-ended")
        @unknown default:
            break
        }
    }

    @objc private func handleMediaServicesReset() {
        // The media server restarted; all audio objects are invalid until the session is rebuilt.
        print("[Moondrone audio-session] media services were reset — reconfiguring")
        configureAudioSessionForPlayback("media-services-reset")
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

    func applicationDidBecomeActive(_ application: UIApplication) {
        // WKWebView may have reset the shared session while we were inactive; re-assert `.playback`
        // so Silent Mode stays overridden and lock-screen/background audio keeps working.
        configureAudioSessionForPlayback("did-become-active")
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
