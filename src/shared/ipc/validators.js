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
  parseSaveFileFromUrlPayload,
};
