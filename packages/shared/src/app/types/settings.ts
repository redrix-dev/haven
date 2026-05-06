export type NotificationAudioSettings = {
    masterSoundEnabled: boolean;
    notificationSoundVolume: number;
    voicePresenceSoundEnabled: boolean;
    voicePresenceSoundVolume: number;
    playSoundsWhenFocused: boolean;
  };
  
  export type VoiceTransmissionMode = 'voice_activity' | 'push_to_talk' | 'open_mic';
  
  export type VoicePushToTalkBinding = {
    code: string;
    key: string | null;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    label: string;
  };
  
  export type VoiceSettings = {
    preferredInputDeviceId: string;
    preferredOutputDeviceId: string;
    transmissionMode: VoiceTransmissionMode;
    voiceActivationThreshold: number;
    pushToTalkBinding: VoicePushToTalkBinding | null;
  };
  
  export type AppSettings = {
    schemaVersion: number;
    autoUpdateEnabled: boolean;
    notifications: NotificationAudioSettings;
    voice: VoiceSettings;
  };