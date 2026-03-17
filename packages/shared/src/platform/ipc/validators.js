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

  if (typeof payload.voicePresenceSoundEnabled !== 'boolean') {
    throw new Error('Invalid voicePresenceSoundEnabled value. Expected a boolean.');
  }

  if (
    typeof payload.voicePresenceSoundVolume !== 'number' ||
    !Number.isFinite(payload.voicePresenceSoundVolume)
  ) {
    throw new Error('Invalid voicePresenceSoundVolume value. Expected a number.');
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

  const roundedVoicePresenceVolume = Math.round(payload.voicePresenceSoundVolume);
  if (roundedVoicePresenceVolume < 0 || roundedVoicePresenceVolume > 100) {
    throw new Error('Invalid voicePresenceSoundVolume value. Expected 0-100.');
  }

  return {
    masterSoundEnabled: payload.masterSoundEnabled,
    notificationSoundVolume: roundedVolume,
    voicePresenceSoundEnabled: payload.voicePresenceSoundEnabled,
    voicePresenceSoundVolume: roundedVoicePresenceVolume,
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


function parseVoicePopoutMemberState(member) {
  if (!member || typeof member !== 'object') {
    throw new Error('Invalid voice popout member state.');
  }

  if (typeof member.userId !== 'string' || member.userId.trim().length === 0) {
    throw new Error('Invalid voice popout member userId.');
  }

  const displayName = typeof member.displayName === 'string' ? member.displayName.trim() : '';
  if (displayName.length === 0) {
    throw new Error('Invalid voice popout member displayName.');
  }

  if (typeof member.volume !== 'number' || !Number.isFinite(member.volume)) {
    throw new Error('Invalid voice popout member volume.');
  }

  const volume = Math.max(0, Math.min(200, Math.round(member.volume)));

  return {
    userId: member.userId.trim(),
    displayName,
    isMuted: Boolean(member.isMuted),
    isDeafened: Boolean(member.isDeafened),
    volume,
  };
}

function parseVoicePopoutDeviceOption(option) {
  if (!option || typeof option !== 'object') {
    throw new Error('Invalid voice popout device option.');
  }

  if (typeof option.deviceId !== 'string' || option.deviceId.trim().length === 0) {
    throw new Error('Invalid voice popout device deviceId.');
  }

  const label = typeof option.label === 'string' ? option.label.trim() : '';
  if (label.length === 0) {
    throw new Error('Invalid voice popout device label.');
  }

  return {
    deviceId: option.deviceId.trim(),
    label,
  };
}

function parseVoicePopoutStatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for voice popout state sync.');
  }

  const serverName =
    typeof payload.serverName === 'string' && payload.serverName.trim().length > 0
      ? payload.serverName.trim()
      : null;
  const channelName =
    typeof payload.channelName === 'string' && payload.channelName.trim().length > 0
      ? payload.channelName.trim()
      : null;

  const transmissionMode = payload.transmissionMode;
  if (
    transmissionMode !== 'open_mic' &&
    transmissionMode !== 'voice_activity' &&
    transmissionMode !== 'push_to_talk'
  ) {
    throw new Error('Invalid transmissionMode for voice popout state.');
  }

  if (typeof payload.selectedInputDeviceId !== 'string') {
    throw new Error('Invalid selectedInputDeviceId for voice popout state.');
  }

  if (typeof payload.selectedOutputDeviceId !== 'string') {
    throw new Error('Invalid selectedOutputDeviceId for voice popout state.');
  }

  const members = Array.isArray(payload.members)
    ? payload.members.map(parseVoicePopoutMemberState)
    : [];
  const inputDevices = Array.isArray(payload.inputDevices)
    ? payload.inputDevices.map(parseVoicePopoutDeviceOption)
    : [];
  const outputDevices = Array.isArray(payload.outputDevices)
    ? payload.outputDevices.map(parseVoicePopoutDeviceOption)
    : [];
  const participantCount =
    typeof payload.participantCount === 'number' && Number.isFinite(payload.participantCount)
      ? Math.max(0, Math.trunc(payload.participantCount))
      : 0;

  return {
    isOpen: Boolean(payload.isOpen),
    serverName,
    channelName,
    connected: Boolean(payload.connected),
    joined: Boolean(payload.joined),
    joining: Boolean(payload.joining),
    isMuted: Boolean(payload.isMuted),
    isDeafened: Boolean(payload.isDeafened),
    transmissionMode,
    participantCount,
    selectedInputDeviceId: payload.selectedInputDeviceId.trim() || 'default',
    selectedOutputDeviceId: payload.selectedOutputDeviceId.trim() || 'default',
    inputDevices,
    outputDevices,
    supportsOutputSelection: Boolean(payload.supportsOutputSelection),
    members,
  };
}

function parseVoicePopoutControlActionPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload for voice popout control action.');
  }

  if (
    payload.type === 'join_voice' ||
    payload.type === 'leave_voice' ||
    payload.type === 'toggle_mute' ||
    payload.type === 'toggle_deafen' ||
    payload.type === 'open_voice_settings' ||
    payload.type === 'open_voice_hardware_test'
  ) {
    return { type: payload.type };
  }

  if (payload.type === 'set_transmission_mode') {
    if (
      payload.mode !== 'open_mic' &&
      payload.mode !== 'voice_activity' &&
      payload.mode !== 'push_to_talk'
    ) {
      throw new Error('Invalid mode for voice popout transmission action.');
    }
    return {
      type: payload.type,
      mode: payload.mode,
    };
  }

  if (payload.type === 'set_input_device' || payload.type === 'set_output_device') {
    if (typeof payload.deviceId !== 'string' || payload.deviceId.trim().length === 0) {
      throw new Error('Invalid deviceId for voice popout control action.');
    }
    return {
      type: payload.type,
      deviceId: payload.deviceId.trim(),
    };
  }

  if (payload.type === 'set_member_volume') {
    if (typeof payload.userId !== 'string' || payload.userId.trim().length === 0) {
      throw new Error('Invalid userId for voice popout member volume action.');
    }
    if (typeof payload.volume !== 'number' || !Number.isFinite(payload.volume)) {
      throw new Error('Invalid volume for voice popout member volume action.');
    }

    return {
      type: 'set_member_volume',
      userId: payload.userId.trim(),
      volume: Math.max(0, Math.min(200, Math.round(payload.volume))),
    };
  }

  throw new Error('Invalid type for voice popout control action.');
}

module.exports = {
  parseSetAutoUpdatePayload,
  parseSetNotificationAudioPayload,
  parseSetVoiceSettingsPayload,
  parseSaveFileFromUrlPayload,
  parseVoicePopoutStatePayload,
  parseVoicePopoutControlActionPayload,
};
