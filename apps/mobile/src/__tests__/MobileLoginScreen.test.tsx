// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MobileLoginScreen } from '@mobile/mobile/MobileLoginScreen';
import { MobileViewportProvider } from '@mobile/mobile/layout/MobileViewportContext';

const loginControllerMocks = vi.hoisted(() => ({
  useLoginScreenController: vi.fn(),
}));

vi.mock('@shared/components/auth/useLoginScreenController', () => ({
  useLoginScreenController: loginControllerMocks.useLoginScreenController,
}));

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
      bottom: 56,
      height: 56,
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

function createControllerMock() {
  return {
    state: {
      email: '',
      error: '',
      forgotPasswordEmail: '',
      forgotPasswordError: '',
      forgotPasswordSending: false,
      forgotPasswordStatus: '',
      isSignUp: false,
      loading: false,
      password: '',
      pendingVerificationEmail: 'user@example.com',
      showForgotPasswordModal: false,
      showVerificationModal: false,
      username: '',
      verificationChecking: false,
      verificationError: '',
      verificationStatus: '',
    },
    derived: {
      canRecheckVerification: true,
    },
    actions: {
      closeForgotPasswordModal: vi.fn(),
      closeVerificationModal: vi.fn(),
      handleForgotPasswordSubmit: vi.fn().mockResolvedValue(undefined),
      handleSubmit: vi.fn(),
      handleVerificationRecheck: vi.fn().mockResolvedValue(undefined),
      openForgotPasswordModal: vi.fn(),
      setEmail: vi.fn(),
      setForgotPasswordEmail: vi.fn(),
      setPassword: vi.fn(),
      setUsername: vi.fn(),
      toggleMode: vi.fn(),
    },
  };
}

describe('MobileLoginScreen', () => {
  beforeEach(() => {
    installViewportStubs();
    loginControllerMocks.useLoginScreenController.mockReturnValue(createControllerMock());
  });

  afterEach(() => {
    vi.clearAllMocks();
    restoreViewportStubs();
  });

  it('renders mobile auth inside the shell with a single scene scroll owner', () => {
    const { container } = render(
      <MobileViewportProvider>
        <MobileLoginScreen />
      </MobileViewportProvider>
    );

    expect(container.querySelector('[data-mobile-shell="true"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-mobile-scene-scroll="true"]').length).toBe(1);
    expect(container.querySelector('.h-screen')).toBeNull();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
  });

  it('uses mobile sheets for verification and forgot-password flows', () => {
    const controllerMock = createControllerMock();
    controllerMock.state.showVerificationModal = true;
    controllerMock.state.showForgotPasswordModal = true;
    loginControllerMocks.useLoginScreenController.mockReturnValue(controllerMock);

    render(
      <MobileViewportProvider>
        <MobileLoginScreen />
      </MobileViewportProvider>
    );

    expect(screen.getByText('Check your email')).toBeTruthy();
    expect(screen.getByText('Reset password')).toBeTruthy();
    expect(screen.getByText(/Verification email sent to user@example.com/i)).toBeTruthy();
  });
});
