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
  parseSaveFileFromUrlPayload,
};
