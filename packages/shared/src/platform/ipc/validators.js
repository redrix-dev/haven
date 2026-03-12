function parseSetAutoUpdatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for auto-update preference.');
  }

  if (typeof payload.enabled !== 'boolean') {
    throw new Error('Invalid auto-update value. Expected a boolean.');
  }

  return {
    enabled: payload.enabled,
  };
}

function parseSetNotificationAudioPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for notification audio preferences.');
  }

  if (typeof payload.masterSoundEnabled !== 'boolean') {
    throw new Error('Invalid masterSoundEnabled value. Expected a boolean.');
  }

  if (typeof payload.playSoundsWhenFocused !== 'boolean') {
    throw new Error('Invalid playSoundsWhenFocused value. Expected a boolean.');
  }

  if (
    typeof payload.notificationSoundVolume !== 'number' ||
    !Number.isFinite(payload.notificationSoundVolume)
  ) {
    throw new Error('Invalid notificationSoundVolume value. Expected a number.');
  }

  const roundedVolume = Math.round(payload.notificationSoundVolume);
  if (roundedVolume < 0 || roundedVolume > 100) {
    throw new Error('Invalid notificationSoundVolume value. Expected 0-100.');
  }

  return {
    masterSoundEnabled: payload.masterSoundEnabled,
    notificationSoundVolume: roundedVolume,
    playSoundsWhenFocused: payload.playSoundsWhenFocused,
  };
}

function parseSetVoiceSettingsPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for voice settings.');
  }

  const transmissionMode = payload.transmissionMode;
  if (
    transmissionMode !== 'open_mic' &&
    transmissionMode !== 'voice_activity' &&
    transmissionMode !== 'push_to_talk'
  ) {
    throw new Error('Invalid transmissionMode value for voice settings.');
  }

  if (
    typeof payload.preferredInputDeviceId !== 'string' ||
    payload.preferredInputDeviceId.trim().length === 0
  ) {
    throw new Error('Invalid preferredInputDeviceId value for voice settings.');
  }

  if (
    typeof payload.preferredOutputDeviceId !== 'string' ||
    payload.preferredOutputDeviceId.trim().length === 0
  ) {
    throw new Error('Invalid preferredOutputDeviceId value for voice settings.');
  }

  if (
    typeof payload.voiceActivationThreshold !== 'number' ||
    !Number.isFinite(payload.voiceActivationThreshold)
  ) {
    throw new Error('Invalid voiceActivationThreshold value. Expected a number.');
  }

  const roundedThreshold = Math.round(payload.voiceActivationThreshold);
  if (roundedThreshold < 0 || roundedThreshold > 100) {
    throw new Error('Invalid voiceActivationThreshold value. Expected 0-100.');
  }

  let pushToTalkBinding = null;
  if (payload.pushToTalkBinding != null) {
    const binding = payload.pushToTalkBinding;
    if (!binding || typeof binding !== 'object') {
      throw new Error('Invalid pushToTalkBinding value for voice settings.');
    }
    if (typeof binding.code !== 'string' || binding.code.trim().length === 0) {
      throw new Error('Invalid pushToTalkBinding.code value for voice settings.');
    }
    const label =
      typeof binding.label === 'string' && binding.label.trim().length > 0
        ? binding.label.trim()
        : binding.code.trim();

    pushToTalkBinding = {
      code: binding.code.trim(),
      key: typeof binding.key === 'string' && binding.key.trim().length > 0 ? binding.key.trim() : null,
      ctrlKey: Boolean(binding.ctrlKey),
      altKey: Boolean(binding.altKey),
      shiftKey: Boolean(binding.shiftKey),
      metaKey: Boolean(binding.metaKey),
      label,
    };
  }

  return {
    preferredInputDeviceId: payload.preferredInputDeviceId.trim(),
    preferredOutputDeviceId: payload.preferredOutputDeviceId.trim(),
    transmissionMode,
    voiceActivationThreshold: roundedThreshold,
    pushToTalkBinding,
  };
}

function parseSaveFileFromUrlPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for save file request.');
  }

  if (typeof payload.url !== 'string' || payload.url.trim().length === 0) {
    throw new Error('Invalid URL for save file request.');
  }

  const suggestedName =
    typeof payload.suggestedName === 'string' ? payload.suggestedName.trim() : '';

  return {
    url: payload.url.trim(),
    suggestedName: suggestedName.length > 0 ? suggestedName : null,
  };
}

module.exports = {
  parseSetAutoUpdatePayload,
  parseSetNotificationAudioPayload,
  parseSetVoiceSettingsPayload,
  parseSaveFileFromUrlPayload,
};
