#import <React/RCTBridgeModule.h>
#import <AVFoundation/AVFoundation.h>

@interface HavenVoiceSounds : NSObject <RCTBridgeModule, AVAudioPlayerDelegate>
@property(nonatomic, strong) NSMapTable<AVAudioPlayer *, NSArray *> *pending;
@end

@implementation HavenVoiceSounds
RCT_EXPORT_MODULE();
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }

RCT_REMAP_METHOD(play,
                 playURI:(NSString *)uri volume:(double)volume
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  // LiveKit owns the shared AVAudioSession category, mode and selected route.
  // Do not configure or deactivate that session for a confirmation cue.
  NSError *error;
  AVAudioPlayer *player = [[AVAudioPlayer alloc] initWithContentsOfURL:[NSURL URLWithString:uri] error:&error];
  if (!player) { reject(@"voice_sound", @"Could not load voice sound", error); return; }
  if (!self.pending) self.pending = [NSMapTable strongToStrongObjectsMapTable];
  player.volume = MAX(0, MIN(1, volume));
  player.delegate = self;
  [self.pending setObject:@[[resolve copy], [reject copy]] forKey:player];
  if (![player play]) {
    [self.pending removeObjectForKey:player];
    reject(@"voice_sound", @"Could not start voice sound", nil);
  }
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    if ([self.pending objectForKey:player]) {
      [player stop];
      [self.pending removeObjectForKey:player];
      reject(@"voice_sound", @"Voice sound interrupted", nil);
    }
  });
}

- (void)audioPlayerDidFinishPlaying:(AVAudioPlayer *)player successfully:(BOOL)success
{
  NSArray *callbacks = [self.pending objectForKey:player];
  [self.pending removeObjectForKey:player];
  if (!callbacks) return;
  if (success) { ((RCTPromiseResolveBlock)callbacks[0])(@YES); }
  else { ((RCTPromiseRejectBlock)callbacks[1])(@"voice_sound", @"Voice sound interrupted", nil); }
}

- (void)audioPlayerDecodeErrorDidOccur:(AVAudioPlayer *)player error:(NSError *)error
{
  NSArray *callbacks = [self.pending objectForKey:player];
  [self.pending removeObjectForKey:player];
  if (callbacks) ((RCTPromiseRejectBlock)callbacks[1])(@"voice_sound", @"Voice sound decode failed", error);
}

- (void)invalidate
{
  for (AVAudioPlayer *player in self.pending.keyEnumerator.allObjects) {
    [player stop];
    ((RCTPromiseRejectBlock)[self.pending objectForKey:player][1])(@"voice_sound", @"Voice sound player stopped", nil);
  }
  [self.pending removeAllObjects];
}
@end
