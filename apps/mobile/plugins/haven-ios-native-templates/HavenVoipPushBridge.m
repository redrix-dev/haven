#import "HavenVoipPushBridge.h"

#import <PushKit/PushKit.h>
#import <RNVoipPushNotificationManager.h>

@implementation HavenVoipPushBridge

+ (void)handleUpdatedPushCredentials:(id)credentials typeString:(NSString *)type
{
  [RNVoipPushNotificationManager didUpdatePushCredentials:(PKPushCredentials *)credentials
                                                 forType:type];
}

+ (void)handleIncomingPushPayload:(id)payload
                       typeString:(NSString *)type
                       completion:(void (^)(void))completion
{
  PKPushPayload *pushPayload = (PKPushPayload *)payload;
  NSString *uuid = pushPayload.dictionaryPayload[@"uuid"];
  if (uuid != nil) {
    [RNVoipPushNotificationManager addCompletionHandler:uuid completionHandler:completion];
  }
  [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:pushPayload forType:type];
  if (uuid == nil) {
    completion();
  }
}

@end
