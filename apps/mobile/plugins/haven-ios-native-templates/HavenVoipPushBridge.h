#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Forwards PushKit events to `react-native-voip-push-notification` without importing that API from Swift.
@interface HavenVoipPushBridge : NSObject
+ (void)handleUpdatedPushCredentials:(id)credentials typeString:(NSString *)type;
+ (void)handleIncomingPushPayload:(id)payload
                       typeString:(NSString *)type
                       completion:(void (^)(void))completion;
@end

NS_ASSUME_NONNULL_END
