if (typeof window !== 'undefined') {
  const noop = () => {};
  const matchMedia = window.matchMedia ?? ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: noop,
    removeListener: noop,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => false,
  }));

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  });

  if (typeof window.HTMLElement !== 'undefined' && !window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = noop;
  }

  if (typeof (window as unknown as { ResizeObserver?: unknown }).ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
      ResizeObserverStub;
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
      ResizeObserverStub;
  }
}

