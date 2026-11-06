#import <React/RCTBridgeModule.h>
#import <os/log.h>

// JS-callable bridge that mirrors `perfTrace` lines into the iOS unified log.
// It logs on the SAME subsystem/category as the native boot marks
// (`AppDelegate`/`SceneDelegate` use `Logger(subsystem: "com.redrix.haven.mobile",
// category: "haven-perf")`), so one Console.app filter shows the native marks
// and the JS events together. This is additive: JS still logs to Metro via
// console.log. The mobile entry tags the lines it sends here with `origin=js`
// so they stay distinguishable from the native `origin=native` marks.
@interface HavenPerfLog : NSObject <RCTBridgeModule>
@end

@implementation HavenPerfLog
RCT_EXPORT_MODULE();

// Logging needs no main-thread setup; keep it off the main queue so the trace
// disturbs the measured startup as little as possible.
+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

// Fire-and-forget. `os_log` at default level is persisted and shown in
// Console.app without enabling debug/info; `%{public}@` keeps the line
// un-redacted (the lines carry no PII — ids and timings only).
RCT_EXPORT_METHOD(log:(NSString *)line)
{
#if DEBUG
  static os_log_t perfLog;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    perfLog = os_log_create("com.redrix.haven.mobile", "haven-perf");
  });
  os_log(perfLog, "%{public}@", line);
#else
  // Release builds never register the JS sink that calls this; no-op to be safe.
  (void)line;
#endif
}

@end
