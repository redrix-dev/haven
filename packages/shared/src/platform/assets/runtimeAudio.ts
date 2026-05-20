import notificationDefaultUrl from '@web-client/assets/audio/notifications/haven-notification.mp3';
import voiceJoinUrl from '@web-client/assets/audio/voice/haven-connected.mp3';
import voiceLeaveUrl from '@web-client/assets/audio/voice/haven-disconnected.mp3';
import voiceSpeakerTestUrl from '@web-client/assets/audio/voice/voice-debug-speaker-test.mp3';

export const RUNTIME_AUDIO_URLS = {
  notifications: {
    default: notificationDefaultUrl,
  },
  voicePresence: {
    join: voiceJoinUrl,
    leave: voiceLeaveUrl,
  },
  voice: {
    speakerTest: voiceSpeakerTestUrl,
  },
} as const;
