export const VOICE_PORTAL_WINDOW_NAME = "voice-popout-portal";
export const VOICE_PORTAL_WINDOW_FEATURES =
  "popup=yes,width=340,height=520,resizable=yes,scrollbars=no";

export type VoicePortalWindowTarget = {
  win: Window;
  root: HTMLElement;
  close: () => void;
  focus: () => void;
  isOpen: () => boolean;
  navigateToRoute: (path: string) => void;
};

type PreparedPortalDocument = {
  root: HTMLElement;
  dispose: () => void;
};

export function openVoicePortalWindow(options: {
  onClosed: () => void;
}): VoicePortalWindowTarget | null {
  const child = window.open(
    "about:blank",
    VOICE_PORTAL_WINDOW_NAME,
    VOICE_PORTAL_WINDOW_FEATURES,
  );
  if (!child) return null;

  const prepared = preparePortalDocument(child);
  if (!prepared) {
    child.close();
    return null;
  }

  const listeners = new AbortController();
  let closed = false;
  const closedCheck = window.setInterval(() => {
    if (!child.closed) return;
    markClosed();
  }, 500);

  const dispose = () => {
    window.clearInterval(closedCheck);
    listeners.abort();
    prepared.dispose();
  };

  const stopManaging = () => {
    if (closed) return false;
    closed = true;
    dispose();
    return true;
  };

  const markClosed = () => {
    if (!stopManaging()) return;
    options.onClosed();
  };

  child.addEventListener("beforeunload", markClosed, {
    signal: listeners.signal,
  });
  child.focus();

  return {
    win: child,
    root: prepared.root,
    close: () => {
      if (!stopManaging()) return;
      if (!child.closed) child.close();
    },
    focus: () => child.focus(),
    isOpen: () => !closed && !child.closed,
    navigateToRoute: (path: string) => {
      if (!stopManaging()) return;
      child.location.href = path;
      child.focus();
    },
  };
}

function preparePortalDocument(child: Window): PreparedPortalDocument | null {
  const doc = child.document;

  doc.open();
  doc.write(
    '<!doctype html><html><head><title>Haven - Voice</title></head><body><div id="root"></div></body></html>',
  );
  doc.close();

  syncDocumentShell(doc);
  const themeObserver = syncThemeAttributes(doc);
  const root = doc.getElementById("root");
  if (!root) {
    themeObserver.disconnect();
    return null;
  }

  return {
    root,
    dispose: () => themeObserver.disconnect(),
  };
}

function syncDocumentShell(doc: Document) {
  for (const node of Array.from(document.head.children)) {
    if (
      !(node instanceof HTMLLinkElement || node instanceof HTMLStyleElement)
    ) {
      continue;
    }
    doc.head.appendChild(node.cloneNode(true));
  }

  const baseStyle = doc.createElement("style");
  baseStyle.textContent = [
    "html,body,#root{height:100%;margin:0;overflow:hidden;background:var(--background);color:var(--foreground);font-family:var(--font-sans);}",
    "#root{display:flex;min-height:100%;}",
    "#root>*{min-height:100%;width:100%;}",
  ].join("");
  doc.head.appendChild(baseStyle);
}

function syncThemeAttributes(doc: Document): MutationObserver {
  const copy = () => {
    doc.documentElement.className = document.documentElement.className;
    doc.documentElement.style.cssText = document.documentElement.style.cssText;
    doc.body.className = document.body.className;
  };

  copy();
  const observer = new MutationObserver(copy);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return observer;
}
