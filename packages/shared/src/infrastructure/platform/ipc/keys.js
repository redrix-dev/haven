const DESKTOP_IPC_KEYS = Object.freeze({
  SETTINGS_GET: 'haven:settings:get',
  SETTINGS_SET_AUTO_UPDATE: 'haven:settings:set-auto-update',
  SETTINGS_SET_NOTIFICATION_AUDIO: 'haven:settings:set-notification-audio',
  SETTINGS_SET_VOICE: 'haven:settings:set-voice',
  UPDATER_STATUS_GET: 'haven:updater:status',
  UPDATER_CHECK_NOW: 'haven:updater:check',
  MEDIA_SAVE_FROM_URL: 'haven:media:save-from-url',
  EXTERNAL_URL_OPEN: 'haven:external-url:open',
  PROTOCOL_URL_CONSUME_NEXT: 'haven:protocol:consume-next-url',
  PROTOCOL_URL_EVENT: 'haven:protocol:url',
  WINDOW_MINIMIZE: 'haven:window:minimize',
  WINDOW_MAXIMIZE_TOGGLE: 'haven:window:maximize-toggle',
  WINDOW_CLOSE: 'haven:window:close',

  VOICE_POPOUT_OPEN: 'haven:voice-popout:open',
  VOICE_POPOUT_CLOSE: 'haven:voice-popout:close',
  VOICE_POPOUT_STATE_SYNC: 'haven:voice-popout:state-sync',
  VOICE_POPOUT_REQUEST_SYNC: 'haven:voice-popout:request-sync',
  VOICE_POPOUT_STATE_EVENT: 'haven:voice-popout:state',
  VOICE_POPOUT_CONTROL_DISPATCH: 'haven:voice-popout:control-dispatch',
  VOICE_POPOUT_CONTROL_EVENT: 'haven:voice-popout:control',
});

module.exports = {
  DESKTOP_IPC_KEYS,
};
