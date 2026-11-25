internal import Expo
import os
import PushKit
import React
import ReactAppDependencyProvider
import UIKit

// haven-perf native boot marks are DEBUG-only — compiled out of release builds
// so the tracer never runs or logs in production.
#if DEBUG
private let havenPerfLog = Logger(
  subsystem: "com.redrix.haven.mobile",
  category: "haven-perf"
)

/// Points of Interest signpost log for the Instruments timeline. `OSLog.pointsOfInterest`
/// is not a real member; the Points of Interest category is built explicitly.
private let havenSignpostLog = OSLog(
  subsystem: "com.redrix.haven.mobile",
  category: .pointsOfInterest
)

/// Dot decimal, independent of the device locale. `String(format:)` would print `12,3` in de_DE.
private func havenPerfMilliseconds(_ ms: Double) -> String {
  let tenths = Int((ms * 10).rounded())
  let sign = tenths < 0 ? "-" : ""
  let absolute = abs(tenths)
  return "\(sign)\(absolute / 10).\(absolute % 10)"
}
#endif

/// iOS app delegate (Expo SDK 55 template + VoIP + UIScene lifecycle). It creates the React Native
/// factory; `SceneDelegate` owns the window and calls `startReactNative` when the scene connects,
/// and forwards links back to the overrides below (UIKit no longer calls them under scenes).
@main
class AppDelegate: ExpoAppDelegate {
  /// Set by `SceneDelegate`; kept for code that reads `UIApplication.shared.delegate?.window`.
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    #if DEBUG
    let signpostLog = havenSignpostLog
    let signpostId = OSSignpostID(log: signpostLog)
    let started = CFAbsoluteTimeGetCurrent()
    os_signpost(.begin, log: signpostLog, name: "did-finish-launching", signpostID: signpostId)
    defer {
      os_signpost(.end, log: signpostLog, name: "did-finish-launching", signpostID: signpostId)
      let durationMs = (CFAbsoluteTimeGetCurrent() - started) * 1000
      let line =
        "[haven-perf] kind=span name=did-finish-launching duration=\(havenPerfMilliseconds(durationMs)) origin=native"
      havenPerfLog.notice("\(line, privacy: .public)")
    }
    #endif

    let reactDelegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: reactDelegate)
    reactDelegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = reactDelegate
    reactNativeFactory = factory

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // MARK: - Linking (called by SceneDelegate)

  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    super.application(app, open: url, options: options)
      || RCTLinkingManager.application(app, open: url, options: options)
  }

  override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
    return super.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    ) || result
  }

  // MARK: - Remote notifications (forward to Expo subscribers)

  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
  }

  override func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    super.application(
      application,
      didReceiveRemoteNotification: userInfo,
      fetchCompletionHandler: completionHandler
    )
  }
}

// MARK: - PushKit (react-native-voip-push-notification)

extension AppDelegate: PKPushRegistryDelegate {
  func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate pushCredentials: PKPushCredentials,
    for type: PKPushType
  ) {
    HavenVoipPushBridge.handleUpdatedPushCredentials(
      pushCredentials,
      typeString: type.rawValue
    )
  }

  func pushRegistry(
    _ registry: PKPushRegistry,
    didInvalidatePushTokenFor type: PKPushType
  ) {}

  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    HavenVoipPushBridge.handleIncomingPushPayload(
      payload,
      typeString: type.rawValue,
      completion: completion
    )
  }
}

// MARK: - Bundle / JS runtime

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
