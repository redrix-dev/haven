import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeBrowserWindow {
  webContents: {
    on: ReturnType<typeof vi.fn>;
    openDevTools: ReturnType<typeof vi.fn>;
    getURL: ReturnType<typeof vi.fn>;
  };

  private readonly listeners = new Map<string, () => void>();
  loadURL = vi.fn();

  constructor() {
    this.webContents = {
      on: vi.fn(),
      openDevTools: vi.fn(),
      getURL: vi.fn(() => 'http://127.0.0.1:3000/main_window'),
    };
  }

  on(event: string, listener: () => void) {
    this.listeners.set(event, listener);
  }
}

let createMainWindow: any;

describe('createMainWindow', () => {
  beforeAll(async () => {
    ({ createMainWindow } = await import('../app/create-main-window.js'));
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the main window directly from the Forge renderer entry URL', () => {
    const debugContextMenu = vi.fn();
    const registerNativeContextMenuFn = vi.fn();

    const window = createMainWindow({
      app: { isPackaged: true },
      preloadEntry: 'preload.js',
      rendererEntryUrl: 'http://127.0.0.1:3000/main_window',
      shouldDebugWindowFocus: false,
      debugWindowFocus: vi.fn(),
      debugContextMenu,
      onClosed: vi.fn(),
      BrowserWindowClass: FakeBrowserWindow,
      registerNativeContextMenuFn,
    });

    expect(window.loadURL).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/main_window',
    );
    expect(registerNativeContextMenuFn).toHaveBeenCalledWith({
      window,
      debugContextMenu,
    });
  });
});
