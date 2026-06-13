// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VOICE_PORTAL_WINDOW_FEATURES,
  VOICE_PORTAL_WINDOW_NAME,
  openVoicePortalWindow,
} from "../voiceBrowserPortalWindow";

type MockChildWindow = Window & {
  emitBeforeUnload: () => void;
};

function createMockChildWindow(): MockChildWindow {
  const doc = document.implementation.createHTMLDocument("Haven - Voice");
  let closed = false;
  const listeners = new Set<() => void>();
  const location = { href: "about:blank" };

  return {
    document: doc,
    location,
    get closed() {
      return closed;
    },
    close: vi.fn(() => {
      closed = true;
    }),
    focus: vi.fn(),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "beforeunload") {
        listeners.add(() => listener(new Event("beforeunload")));
      }
    }),
    emitBeforeUnload: () => {
      closed = true;
      for (const listener of listeners) listener();
    },
  } as unknown as MockChildWindow;
}

describe("openVoicePortalWindow", () => {
  beforeEach(() => {
    document.documentElement.className = "theme-dark";
    document.documentElement.style.setProperty("--background", "#123456");
    document.body.className = "app-body";
    document.head.innerHTML = '<style id="app-style">.voice{color:red}</style>';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
    document.body.className = "";
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  it("prepares a same-origin child document for portal rendering", () => {
    const child = createMockChildWindow();
    vi.spyOn(window, "open").mockReturnValue(child);

    const target = openVoicePortalWindow({ onClosed: vi.fn() });

    expect(window.open).toHaveBeenCalledWith(
      "about:blank",
      VOICE_PORTAL_WINDOW_NAME,
      VOICE_PORTAL_WINDOW_FEATURES,
    );
    expect(target?.root).toBe(child.document.getElementById("root"));
    expect(child.document.documentElement.className).toBe("theme-dark");
    expect(
      child.document.documentElement.style.getPropertyValue("--background"),
    ).toBe("#123456");
    expect(child.document.body.className).toBe("app-body");
    expect(child.document.head.querySelector("#app-style")).not.toBeNull();
    expect(child.document.head.textContent).toContain(
      "html,body,#root{height:100%",
    );
    expect(child.document.head.textContent).toContain(
      "#root>*{min-height:100%;width:100%;}",
    );
    expect(child.focus).toHaveBeenCalledTimes(1);
    expect(target?.isOpen()).toBe(true);

    target?.close();
  });

  it("closes without reporting a user-initiated close", () => {
    const child = createMockChildWindow();
    const onClosed = vi.fn();
    vi.spyOn(window, "open").mockReturnValue(child);

    const target = openVoicePortalWindow({ onClosed });
    target?.close();

    expect(child.close).toHaveBeenCalledTimes(1);
    expect(target?.isOpen()).toBe(false);
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("reports exactly once when the child window unloads", () => {
    const child = createMockChildWindow();
    const onClosed = vi.fn();
    vi.spyOn(window, "open").mockReturnValue(child);

    const target = openVoicePortalWindow({ onClosed });
    child.emitBeforeUnload();
    child.emitBeforeUnload();

    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(target?.isOpen()).toBe(false);
    expect(child.close).not.toHaveBeenCalled();
  });

  it("can hand the existing child window to the route popout fallback", () => {
    const child = createMockChildWindow();
    const onClosed = vi.fn();
    vi.spyOn(window, "open").mockReturnValue(child);

    const target = openVoicePortalWindow({ onClosed });
    target?.navigateToRoute("/popout/voice");

    expect(child.location.href).toBe("/popout/voice");
    expect(child.focus).toHaveBeenCalledTimes(2);
    expect(child.close).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
    expect(target?.isOpen()).toBe(false);
  });
});
