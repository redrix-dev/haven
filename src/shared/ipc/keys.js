const DESKTOP_IPC_KEYS = Object.freeze({
  SETTINGS_GET: 'haven:settings:get',
  SETTINGS_SET_AUTO_UPDATE: 'haven:settings:set-auto-update',
  SETTINGS_SET_NOTIFICATION_AUDIO: 'haven:settings:set-notification-audio',
  SETTINGS_SET_VOICE: 'haven:settings:set-voice',
  UPDATER_STATUS_GET: 'haven:updater:status',
  UPDATER_CHECK_NOW: 'haven:updater:check',
  MEDIA_SAVE_FROM_URL: 'haven:media:save-from-url',
  PROTOCOL_URL_CONSUME_NEXT: 'haven:protocol:consume-next-url',
  PROTOCOL_URL_EVENT: 'haven:protocol:url',
});

module.exports = {
  DESKTOP_IPC_KEYS,
};
