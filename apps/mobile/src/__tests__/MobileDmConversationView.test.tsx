// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MobileDmConversationView } from '@mobile/mobile/MobileDmConversationView';
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

function createDirectMessage(id: string, content: string) {
  return {
    attachments: [],
    authorAvatarUrl: null,
    authorUserId: 'user-2',
    authorUsername: 'Taylor',
    content,
    createdAt: new Date(`2026-03-17T10:1${id.length}:00.000Z`).toISOString(),
    editedAt: null,
    messageId: id,
  } as never;
}

function renderConversation(
  messages = [createDirectMessage('1', 'hello'), createDirectMessage('2', 'world')]
) {
  return render(
    <MobileViewportProvider>
      <MobileDmConversationView
        currentUserId="user-1"
        conversationTitle="Taylor"
        messages={messages}
        loading={false}
        sendPending={false}
        error={null}
        isMuted={false}
        onSendMessage={async () => {}}
        onMuteToggle={async () => {}}
        onBlock={async () => {}}
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

describe('MobileDmConversationView', () => {
  beforeEach(() => {
    installViewportStubs();
  });

  afterEach(() => {
    restoreViewportStubs();
  });

  it('keeps the composer docked outside the scroll owner even with no messages', () => {
    const { container } = renderConversation([]);

    const scrollRoot = container.querySelector('[data-mobile-scene-scroll="true"]');
    const dock = container.querySelector('[data-mobile-scene-dock="true"]');
    const composer = screen.getByPlaceholderText('Message...');

    expect(scrollRoot).toBeTruthy();
    expect(dock).toBeTruthy();
    expect(dock?.contains(composer)).toBe(true);
    expect(scrollRoot?.contains(composer)).toBe(false);
  });

  it('keeps DM messages bottom-pinned when the keyboard opens near the latest messages', async () => {
    const { container } = renderConversation();

    const scrollRoot = container.querySelector('[data-mobile-scene-scroll="true"]') as HTMLDivElement;
    const composer = screen.getByPlaceholderText('Message...');
    const scrollState = installScrollMetrics(scrollRoot, 600);
    const visualViewport = window.visualViewport as VisualViewport;

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--mobile-shell-height')).toBe('812px');
    });

    fireEvent.scroll(scrollRoot);
    (visualViewport as { height: number }).height = 520;
    fireEvent.focusIn(composer);
    (composer as HTMLTextAreaElement).focus();
    scrollState.value = 260;

    await waitFor(() => {
      expect(scrollState.value).toBe(600);
    });
  });

  it('preserves the DM reading position when the keyboard opens away from the latest messages', async () => {
    const { container } = renderConversation();

    const scrollRoot = container.querySelector('[data-mobile-scene-scroll="true"]') as HTMLDivElement;
    const composer = screen.getByPlaceholderText('Message...');
    const scrollState = installScrollMetrics(scrollRoot, 160);
    const visualViewport = window.visualViewport as VisualViewport;

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--mobile-shell-height')).toBe('812px');
    });

    fireEvent.scroll(scrollRoot);
    (visualViewport as { height: number }).height = 520;
    fireEvent.focusIn(composer);
    (composer as HTMLTextAreaElement).focus();
    scrollState.value = 340;

    await waitFor(() => {
      expect(scrollState.value).toBe(160);
    });
  });
});
