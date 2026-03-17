import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const browserWindows: FakeBrowserWindow[] = [];

class FakeBrowserWindow {
  webContents: {
    send: ReturnType<typeof vi.fn>;
    once: ReturnType<typeof vi.fn>;
    openDevTools: ReturnType<typeof vi.fn>;
  };

  private destroyed = false;
  private minimized = false;
  private readonly listeners = new Map<string, () => void>();
  private readonly loadListeners = new Map<string, () => void>();
  loadURL = vi.fn();
  focus = vi.fn();
  restore = vi.fn(() => {
    this.minimized = false;
  });

  constructor() {
    this.webContents = {
      send: vi.fn(),
      once: vi.fn((event: string, listener: () => void) => {
        this.loadListeners.set(event, listener);
      }),
      openDevTools: vi.fn(),
    };
    browserWindows.push(this);
  }

  on(event: string, listener: () => void) {
    this.listeners.set(event, listener);
  }

  isDestroyed() {
    return this.destroyed;
  }

  isMinimized() {
    return this.minimized;
  }

  close() {
    this.destroyed = true;
    this.listeners.get('closed')?.();
  }

  emitDidFinishLoad() {
    this.loadListeners.get('did-finish-load')?.();
  }
}

const DESKTOP_IPC_KEYS = {
  VOICE_POPOUT_STATE_EVENT: 'haven:voice-popout:state',
  VOICE_POPOUT_CONTROL_EVENT: 'haven:voice-popout:control',
} as const;

let createVoicePopoutWindowManager: any;

describe('createVoicePopoutWindowManager', () => {
  beforeAll(async () => {
    ({ createVoicePopoutWindowManager } = await import('../app/create-voice-popout-window.js'));
  });

  beforeEach(() => {
    browserWindows.splice(0, browserWindows.length);
  });

  it('replays the latest synced voice state when the popout opens and broadcasts open/close state', () => {
    const mainWindow = {
      isDestroyed: () => false,
      webContents: {
        send: vi.fn(),
      },
    };

    const manager = createVoicePopoutWindowManager({
      app: { isPackaged: true },
      preloadEntry: 'preload.js',
      rendererEntryService: {
        getEntryUrl: () => 'http://127.0.0.1:3000/voice_popout/',
      },
      getMainWindow: () => mainWindow,
      desktopIpcKeys: DESKTOP_IPC_KEYS,
      BrowserWindowClass: FakeBrowserWindow,
    });

    manager.sendState({
      isOpen: false,
      serverName: 'Guild',
      channelName: 'Lobby',
      connected: true,
      joined: true,
      joining: false,
      isMuted: false,
      isDeafened: false,
      transmissionMode: 'voice_activity',
      participantCount: 2,
      selectedInputDeviceId: 'mic-1',
      selectedOutputDeviceId: 'speaker-1',
      inputDevices: [{ deviceId: 'mic-1', label: 'Mic 1' }],
      outputDevices: [{ deviceId: 'speaker-1', label: 'Speaker 1' }],
      supportsOutputSelection: true,
      members: [
        {
          userId: 'user-2',
          displayName: 'Remote User',
          isMuted: false,
          isDeafened: false,
          volume: 100,
        },
      ],
    });

    expect(mainWindow.webContents.send).toHaveBeenLastCalledWith(
      'haven:voice-popout:state',
      expect.objectContaining({
        isOpen: false,
        channelName: 'Lobby',
        participantCount: 2,
      }),
    );

    manager.open();

    expect(browserWindows).toHaveLength(1);
    expect(mainWindow.webContents.send).toHaveBeenLastCalledWith(
      'haven:voice-popout:state',
      expect.objectContaining({
        isOpen: true,
        channelName: 'Lobby',
        participantCount: 2,
      }),
    );

    browserWindows[0]?.emitDidFinishLoad();

    expect(browserWindows[0]?.webContents.send).toHaveBeenCalledWith(
      'haven:voice-popout:state',
      expect.objectContaining({
        isOpen: true,
        serverName: 'Guild',
        channelName: 'Lobby',
        selectedInputDeviceId: 'mic-1',
        selectedOutputDeviceId: 'speaker-1',
      }),
    );

    manager.close();

    expect(mainWindow.webContents.send).toHaveBeenLastCalledWith(
      'haven:voice-popout:state',
      expect.objectContaining({
        isOpen: false,
        channelName: 'Lobby',
      }),
    );
  });
});
