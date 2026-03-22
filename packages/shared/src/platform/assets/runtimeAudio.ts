import notificationDefaultUrl from '@shared/assets/audio/notifications/haven-notification.mp3';
import voiceJoinUrl from '@shared/assets/audio/voice/haven-connected.mp3';
import voiceLeaveUrl from '@shared/assets/audio/voice/haven-disconnected.mp3';
import voiceSpeakerTestUrl from '@shared/assets/audio/voice/voice-debug-speaker-test.mp3';

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
