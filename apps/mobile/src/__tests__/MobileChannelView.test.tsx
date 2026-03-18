// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MobileChannelView } from '@mobile/mobile/MobileChannelView';
import { MobileViewportProvider } from '@mobile/mobile/layout/MobileViewportContext';

const originalResizeObserver = globalThis.ResizeObserver;
const originalVisualViewport = window.visualViewport;
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

function installViewportStubs() {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 812,
    writable: true,
  });

  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: {
      addEventListener: vi.fn(),
      height: 812,
      offsetTop: 0,
      removeEventListener: vi.fn(),
      scale: 1,
    },
  });

  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      bottom: 68,
      height: 68,
      left: 0,
      right: 320,
      top: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };

  globalThis.ResizeObserver = class ResizeObserverMock {
    constructor(private readonly callback: ResizeObserverCallback) {}

    disconnect() {}

    observe = (target: Element) => {
      this.callback(
        [
          {
            borderBoxSize: [],
            contentBoxSize: [],
            contentRect: target.getBoundingClientRect(),
            devicePixelContentBoxSize: [],
            target,
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver
      );
    };

    unobserve() {}
  } as typeof ResizeObserver;
}

function restoreViewportStubs() {
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;

  if (originalResizeObserver) {
    globalThis.ResizeObserver = originalResizeObserver;
  } else {
    delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  }

  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: originalVisualViewport,
  });
}

function createMessage(id: string, content: string) {
  return {
    id,
    author_type: 'user',
    author_user_id: 'user-2',
    content,
    created_at: new Date(`2026-03-17T10:0${id.length}:00.000Z`).toISOString(),
  } as never;
}

function renderChannelView(messages = [createMessage('1', 'hello'), createMessage('2', 'world')]) {
  return render(
    <MobileViewportProvider>
      <MobileChannelView
        useEnhancedComposer
        channelName="general"
        currentUserId="user-1"
        messages={messages}
        messageReactions={[]}
        messageLinkPreviews={[]}
        authorProfiles={{}}
        hasOlderMessages={false}
        isLoadingOlderMessages={false}
        canManageMessages={false}
        onRequestOlderMessages={() => {}}
        onSendMessage={async () => {}}
        onEditMessage={async () => {}}
        onDeleteMessage={async () => {}}
        onReportMessage={() => {}}
      />
    </MobileViewportProvider>
  );
}

function installScrollMetrics(node: HTMLDivElement, initialScrollTop: number) {
  let scrollTopValue = initialScrollTop;

  Object.defineProperty(node, 'clientHeight', {
    configurable: true,
    get: () => 400,
  });
  Object.defineProperty(node, 'scrollHeight', {
    configurable: true,
    get: () => 1000,
  });
  Object.defineProperty(node, 'scrollTop', {
    configurable: true,
    get: () => scrollTopValue,
    set: (value: number) => {
      scrollTopValue = value;
    },
  });

  node.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
    if (typeof options === 'number') {
      scrollTopValue = options;
      return;
    }

    scrollTopValue = options?.top ?? scrollTopValue;
  });

  return {
    get value() {
      return scrollTopValue;
    },
    set value(next: number) {
      scrollTopValue = next;
    },
  };
}

describe('MobileChannelView', () => {
  beforeEach(() => {
    installViewportStubs();
  });

  afterEach(() => {
    restoreViewportStubs();
  });

  it('uses the legacy mobile composer and keeps it docked outside the scroll owner', () => {
    const { container } = renderChannelView([]);

    const scrollRoot = container.querySelector('[data-mobile-scene-scroll="true"]');
    const dock = container.querySelector('[data-mobile-scene-dock="true"]');
    const composer = screen.getByPlaceholderText('Message #general');

    expect(scrollRoot).toBeTruthy();
    expect(dock).toBeTruthy();
    expect(dock?.contains(composer)).toBe(true);
    expect(scrollRoot?.contains(composer)).toBe(false);
    expect(screen.getByRole('button', { name: /send message/i })).toBeTruthy();
  });

  it('keeps the latest messages pinned when the keyboard opens near the bottom', async () => {
    const { container } = renderChannelView();

    const scrollRoot = container.querySelector('[data-mobile-scene-scroll="true"]') as HTMLDivElement;
    const composer = screen.getByPlaceholderText('Message #general');
    const scrollState = installScrollMetrics(scrollRoot, 600);
    const visualViewport = window.visualViewport as VisualViewport;

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--mobile-shell-height')).toBe('812px');
    });

    fireEvent.scroll(scrollRoot);
    (visualViewport as { height: number }).height = 520;
    fireEvent.focusIn(composer);
    (composer as HTMLTextAreaElement).focus();
    scrollState.value = 250;

    await waitFor(() => {
      expect(scrollState.value).toBe(600);
    });
  });

  it('preserves the current reading position when the keyboard opens away from the bottom', async () => {
    const { container } = renderChannelView();

    const scrollRoot = container.querySelector('[data-mobile-scene-scroll="true"]') as HTMLDivElement;
    const composer = screen.getByPlaceholderText('Message #general');
    const scrollState = installScrollMetrics(scrollRoot, 180);
    const visualViewport = window.visualViewport as VisualViewport;

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--mobile-shell-height')).toBe('812px');
    });

    fireEvent.scroll(scrollRoot);
    (visualViewport as { height: number }).height = 520;
    fireEvent.focusIn(composer);
    (composer as HTMLTextAreaElement).focus();
    scrollState.value = 320;

    await waitFor(() => {
      expect(scrollState.value).toBe(180);
    });
  });
});
