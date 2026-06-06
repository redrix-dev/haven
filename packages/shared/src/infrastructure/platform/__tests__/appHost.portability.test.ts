import {
  getAppHost,
  resetAppHostToWebDefaults,
  setAppHost,
  type AppHost,
} from "@shared/infrastructure/platform/appHost";

describe("appHost portability runtime", () => {
  afterEach(() => {
    resetAppHostToWebDefaults();
  });

  it("leaves runtimes undefined when host override omits them", () => {
    const host: AppHost = {
      isDesktopApp: () => false,
      openExternalUrl: async () => {},
      saveFileFromUrl: async () => ({ saved: false, filePath: null }),
    };

    setAppHost(host);
    const resolvedHost = getAppHost();

    // Platform-specific runtimes are only available when the platform
    // explicitly registers them (e.g. registerWebAppHost, registerElectronAppHost).
    expect(resolvedHost.browserRuntime).toBeUndefined();
    expect(resolvedHost.voiceRuntime).toBeUndefined();
  });

  it("supports no-op browser runtime for non-browser hosts", () => {
    const host: AppHost = {
      isDesktopApp: () => false,
      openExternalUrl: async () => {},
      saveFileFromUrl: async () => ({ saved: false, filePath: null }),
      browserRuntime: {
        getVisibilityState: () => null,
        addVisibilityChangeListener: () => () => {},
        addFocusListener: () => () => {},
        addBlurListener: () => () => {},
        getLocationHref: () => null,
        getLocationOrigin: () => null,
        replaceHistoryUrl: () => {},
        getDocumentTitle: () => "",
        storageGetItem: () => null,
        storageSetItem: () => {},
        storageRemoveItem: () => {},
      },
    };

    setAppHost(host);
    const resolvedHost = getAppHost();

    expect(resolvedHost.browserRuntime?.getLocationHref()).toBeNull();
    expect(resolvedHost.browserRuntime?.getVisibilityState()).toBeNull();
  });
});
