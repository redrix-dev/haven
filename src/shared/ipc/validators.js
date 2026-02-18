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

module.exports = {
  parseSetAutoUpdatePayload,
};
