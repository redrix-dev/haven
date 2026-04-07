import { desktopClient } from "@platform/desktop/client";
import { setAppHost, type AppHost } from "@shared/platform/appHost";

/**
 * Wires the Electron preload `desktop` bridge into `@shared/platform/appHost`
 * so `packages/shared` never imports `@platform/desktop/client` directly.
 */
export function registerElectronAppHost(): void {
  if (!desktopClient.isAvailable()) {
    return;
  }

  const host: AppHost = {
    isDesktopApp: () => desktopClient.isAvailable(),
    openExternalUrl: (url) => desktopClient.openExternalUrl(url),
    saveFileFromUrl: ({ url, suggestedName }) =>
      desktopClient.saveFileFromUrl({ url, suggestedName }),
    desktopSettings: {
      getAppSettings: () => desktopClient.getAppSettings(),
      getUpdaterStatus: () => desktopClient.getUpdaterStatus(),
      setAutoUpdateEnabled: (enabled) => desktopClient.setAutoUpdateEnabled(enabled),
      setNotificationAudioSettings: (values) =>
        desktopClient.setNotificationAudioSettings(values),
      setVoiceSettings: (values) => desktopClient.setVoiceSettings(values),
      checkForUpdates: () => desktopClient.checkForUpdates(),
    },
    desktopAuth: {
      onProtocolUrl: (listener) => desktopClient.onProtocolUrl(listener),
      consumeNextProtocolUrl: () => desktopClient.consumeNextProtocolUrl(),
    },
    voicePopout: {
      onVoicePopoutState: (listener) => desktopClient.onVoicePopoutState(listener),
      syncVoicePopoutState: (state) => desktopClient.syncVoicePopoutState(state),
      onVoicePopoutControlAction: (listener) =>
        desktopClient.onVoicePopoutControlAction(listener),
      openVoicePopout: async () => {
        await desktopClient.openVoicePopout();
      },
      requestVoicePopoutStateSync: () => desktopClient.requestVoicePopoutStateSync(),
      dispatchVoicePopoutControlAction: (action) =>
        desktopClient.dispatchVoicePopoutControlAction(action),
    },
    windowChrome: {
      minimizeWindow: () => desktopClient.minimizeWindow(),
      maximizeWindow: () => desktopClient.maximizeWindow(),
      closeWindow: () => desktopClient.closeWindow(),
    },
  };

  setAppHost(host);
}
