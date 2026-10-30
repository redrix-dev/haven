internal import Expo
import React
import UIKit

/// Scene delegate (UIScene lifecycle). iOS 27 terminates apps that have not adopted scenes, and
/// Expo SDK 55 ships no scene delegate (SDK 57 adds `ExpoAppSceneDelegate`; this mirrors it).
/// Info.plist points `UIApplicationSceneManifest` at this class; see `withHavenIOSNative.js`.
///
/// Under scenes UIKit stops calling the app delegate's window, URL, user-activity and lifecycle
/// methods. This class owns the window and re-feeds those events to `AppDelegate`, whose overrides
/// already reach Expo subscribers (expo-dev-launcher, expo-linking) and `RCTLinkingManager`.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate, let factory = appDelegate.reactNativeFactory else {
      fatalError("SceneDelegate: AppDelegate must create reactNativeFactory in didFinishLaunching")
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Code that reads `UIApplication.shared.delegate?.window` (expo-system-ui) keeps working.
    appDelegate.window = window

    // A link that cold-starts the app arrives in connectionOptions, not launch options, but
    // `Linking.getInitialURL()` (and the dev launcher) only read launch options. Rebuild them.
    let browsingWebActivity = connectionOptions.userActivities.first {
      $0.activityType == NSUserActivityTypeBrowsingWeb
    }
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: Self.launchOptions(
        url: connectionOptions.urlContexts.first?.url,
        userActivity: browsingWebActivity
      )
    )

    connectionOptions.urlContexts.forEach { open($0) }
    connectionOptions.userActivities.forEach { continueActivity($0) }
  }

  func sceneDidDisconnect(_ scene: UIScene) {
    window = nil
  }

  // MARK: - Lifecycle (forward to Expo subscribers via ExpoAppDelegate)

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }

  // MARK: - Linking

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    URLContexts.forEach { open($0) }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    continueActivity(userActivity)
  }

  private func open(_ context: UIOpenURLContext) {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    if let sourceApplication = context.options.sourceApplication {
      options[.sourceApplication] = sourceApplication
    }
    if let annotation = context.options.annotation {
      options[.annotation] = annotation
    }
    options[.openInPlace] = context.options.openInPlace
    _ = appDelegate?.application(UIApplication.shared, open: context.url, options: options)
  }

  private func continueActivity(_ userActivity: NSUserActivity) {
    _ = appDelegate?.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }

  /// The launch options `Linking.getInitialURL()` reads, built from their raw key strings: the
  /// `UIApplication.LaunchOptionsKey` accessors are deprecated in favor of the scene APIs, but
  /// React Native still looks the values up by these exact keys. `nil` when no link launched us.
  private static func launchOptions(
    url: URL?,
    userActivity: NSUserActivity?
  ) -> [UIApplication.LaunchOptionsKey: Any]? {
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url {
      launchOptions[UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsURLKey")] = url
    }
    if let userActivity {
      let key = UIApplication.LaunchOptionsKey(
        rawValue: "UIApplicationLaunchOptionsUserActivityDictionaryKey"
      )
      launchOptions[key] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": userActivity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": userActivity,
      ]
    }
    return launchOptions.isEmpty ? nil : launchOptions
  }
}
