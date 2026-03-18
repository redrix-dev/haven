// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import webIndexTemplate from '../../../web/src/index.template.html?raw';
import { MobileAppShell } from '@mobile/mobile/layout/MobileAppShell';
import { MobileSceneScaffold } from '@mobile/mobile/layout/MobileSceneScaffold';
import { MobileViewportProvider } from '@mobile/mobile/layout/MobileViewportContext';
import {
  MobileAnchoredPanel,
  MobilePopoverCard,
  MobileScrollableBody,
  MobileSheet,
  MobileSheetFooter,
  MobileSheetHandle,
  MobileSheetHeader,
  MobileSheetTitle,
} from '@mobile/mobile/layout/MobileSurfacePrimitives';

type VisualViewportStub = {
  addEventListener: ReturnType<typeof vi.fn>;
  height: number;
  offsetTop: number;
  removeEventListener: ReturnType<typeof vi.fn>;
  scale: number;
};

const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollTo = window.scrollTo;
const originalVisualViewport = window.visualViewport;
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

function installViewportStubs() {
  const visualViewport: VisualViewportStub = {
    addEventListener: vi.fn(),
    height: 780,
    offsetTop: 0,
    removeEventListener: vi.fn(),
    scale: 1,
  };

  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 812,
    writable: true,
  });

  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: visualViewport,
  });

  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });

  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const testId = this.getAttribute('data-testid');
    const slot = this.getAttribute('data-mobile-slot');
    const heightMap: Record<string, number> = {
      'mobile-header': 56,
      'mobile-subheader': 40,
      'primary-header': 56,
      'secondary-header': 40,
      'scene-dock': 68,
    };
    const height = heightMap[testId ?? slot ?? ''] ?? 0;

    return {
      bottom: height,
      height,
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
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

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

  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    value: originalScrollTo,
    writable: true,
  });
}

function MobileShellHarness({
  body = <div data-testid="mobile-body">Body</div>,
  children,
}: {
  body?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <MobileViewportProvider>
      <MobileAppShell
        primaryHeader={<div data-testid="mobile-header">Header</div>}
        secondaryHeader={<div data-testid="mobile-subheader">Subheader</div>}
        body={body}
      >
        {children}
      </MobileAppShell>
    </MobileViewportProvider>
  );
}

function MobileSurfaceHarness() {
  const [sheetOpen, setSheetOpen] = React.useState(true);
  const [panelOpen, setPanelOpen] = React.useState(true);
  const [cardOpen, setCardOpen] = React.useState(true);

  return (
    <MobileShellHarness>
      <MobileSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        label="Settings Sheet"
        id="test-sheet"
        size="auto"
        className="h-auto"
      >
        <MobileSheetHandle />
        <MobileSheetHeader>
          <MobileSheetTitle>Settings Sheet</MobileSheetTitle>
        </MobileSheetHeader>
        <MobileScrollableBody className="px-4 py-3">
          <p>Sheet Content</p>
        </MobileScrollableBody>
        <MobileSheetFooter>
          <button type="button">Save Settings</button>
        </MobileSheetFooter>
      </MobileSheet>

      <MobileAnchoredPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        anchor="below-primary-header"
        label="Server Drawer"
        id="test-panel"
      >
        <div className="px-4 py-3">Panel Content</div>
      </MobileAnchoredPanel>

      <MobilePopoverCard
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        label="Confirm Card"
        id="test-card"
      >
        <div className="p-4">Popover Content</div>
      </MobilePopoverCard>
    </MobileShellHarness>
  );
}

function KeyboardViewportHarness() {
  return (
    <MobileViewportProvider>
      <input data-testid="mobile-keyboard-input" />
    </MobileViewportProvider>
  );
}

function KeyboardShellHarness() {
  return (
    <MobileViewportProvider>
      <MobileAppShell body={<input data-testid="mobile-shell-keyboard-input" />} />
    </MobileViewportProvider>
  );
}

describe('mobile layout primitives', () => {
  beforeEach(() => {
    installViewportStubs();
  });

  afterEach(() => {
    restoreViewportStubs();
  });

  it('publishes viewport height and shell measurements through the style contract', async () => {
    render(<MobileShellHarness />);

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--mobile-shell-height')).toBe('780px');
    });

    const shell = document.querySelector('[data-mobile-shell="true"]') as HTMLElement | null;
    expect(shell).toBeTruthy();
    expect(shell?.style.getPropertyValue('--mobile-header-height')).toBe('56px');
    expect(shell?.style.getPropertyValue('--mobile-subheader-height')).toBe('40px');
    expect(shell?.style.getPropertyValue('--mobile-bottom-dock-height')).toBe('0px');
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('keeps the shell body as a flex column and lets scene scaffolds own scroll and dock regions', () => {
    render(
      <MobileShellHarness
        body={
          <MobileSceneScaffold
            body={<div data-testid="mobile-scene-content">Scene Body</div>}
            dock={<div data-testid="scene-dock">Scene Dock</div>}
          />
        }
      />
    );

    const shell = document.querySelector('[data-mobile-shell="true"]') as HTMLElement;
    const shellContent = shell.firstElementChild as HTMLElement;
    const bodyWrapper = shellContent.lastElementChild as HTMLElement;
    const sceneScroll = document.querySelector('[data-mobile-scene-scroll="true"]') as HTMLElement;
    const sceneDock = document.querySelector('[data-mobile-scene-dock="true"]') as HTMLElement;

    expect(bodyWrapper.className).toContain('flex');
    expect(bodyWrapper.className).toContain('min-h-0');
    expect(bodyWrapper.className).toContain('overflow-hidden');
    expect(sceneScroll.contains(screen.getByTestId('mobile-scene-content'))).toBe(true);
    expect(sceneDock.contains(screen.getByTestId('scene-dock'))).toBe(true);
  });

  it('switches to the visual viewport height when the keyboard opens', async () => {
    render(<KeyboardViewportHarness />);

    const input = screen.getByTestId('mobile-keyboard-input');
    const visualViewport = window.visualViewport as unknown as VisualViewportStub;
    const scrollToSpy = vi.mocked(window.scrollTo);

    document.documentElement.scrollTop = 18;
    document.body.scrollTop = 24;

    visualViewport.height = 520;
    fireEvent.focusIn(input);
    (input as HTMLInputElement).focus();

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--mobile-shell-height')).toBe('520px');
    });

    expect(document.documentElement.style.getPropertyValue('--mobile-keyboard-inset')).toBe('292px');
    expect(document.documentElement.dataset.mobileKeyboardOpen).toBe('true');
    expect(scrollToSpy).not.toHaveBeenCalled();
    expect(document.documentElement.scrollTop).toBe(18);
    expect(document.body.scrollTop).toBe(24);
  });

  it('keeps the shell anchored even when the visual viewport reports an offset', async () => {
    render(<KeyboardShellHarness />);

    const input = screen.getByTestId('mobile-shell-keyboard-input');
    const visualViewport = window.visualViewport as unknown as VisualViewportStub;
    const shell = document.querySelector('[data-mobile-shell="true"]') as HTMLElement;

    visualViewport.height = 520;
    visualViewport.offsetTop = 42;
    fireEvent.focusIn(input);
    (input as HTMLInputElement).focus();

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--mobile-shell-height')).toBe('520px');
    });

    expect(shell.style.transform).toBe('');
  });

  it('renders sheets, anchored panels, and popover cards through the shared host with stable geometry', async () => {
    const user = userEvent.setup();

    render(<MobileSurfaceHarness />);

    expect(await screen.findByText('Sheet Content')).toBeTruthy();
    expect(screen.getByText('Panel Content')).toBeTruthy();
    expect(screen.getByText('Popover Content')).toBeTruthy();

    const sheetSurface = document.querySelector(
      '[data-mobile-surface="test-sheet"]'
    ) as HTMLElement | null;
    const popoverSurface = document.querySelector(
      '[data-mobile-surface="test-card"]'
    ) as HTMLElement | null;
    const footer = screen.getByText('Save Settings').parentElement as HTMLElement | null;

    expect(sheetSurface?.style.maxHeight).toBe(
      'calc(var(--mobile-shell-height) - var(--mobile-safe-top))'
    );
    expect(popoverSurface?.style.bottom).toBe('calc(var(--mobile-safe-bottom) + 1rem)');
    expect(footer?.style.paddingBottom).toBe('calc(var(--mobile-safe-bottom) + 0.75rem)');

    await user.click(screen.getByRole('button', { name: /dismiss confirm card/i }));
    await waitFor(() => {
      expect(screen.queryByText('Popover Content')).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: /dismiss server drawer/i }));
    await waitFor(() => {
      expect(screen.queryByText('Panel Content')).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: /dismiss settings sheet/i }));
    await waitFor(() => {
      expect(screen.queryByText('Sheet Content')).toBeNull();
    });
  });

  it('declares interactive-widget=resizes-content in the mobile viewport meta template', () => {
    expect(webIndexTemplate).toContain('interactive-widget=resizes-content');
  });
});
