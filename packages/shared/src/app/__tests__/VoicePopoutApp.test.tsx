// @vitest-environment jsdom
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoicePopoutApp } from '@shared/app/VoicePopoutApp';
import type { VoicePopoutControlAction, VoicePopoutState } from '@shared/platform/desktop/types';
import type { AppHost } from '@shared/platform/appHost';

const { popoutMocks, makeTestAppHost } = vi.hoisted(() => {
  const listeners: Array<(state: VoicePopoutState) => void> = [];
  const dispatchVoicePopoutControlAction = vi.fn();
  const requestVoicePopoutStateSync = vi.fn();

  const popoutMocks = {
    listeners,
    dispatchVoicePopoutControlAction,
    requestVoicePopoutStateSync,
    reset: () => {
      listeners.splice(0, listeners.length);
      dispatchVoicePopoutControlAction.mockClear();
      requestVoicePopoutStateSync.mockClear();
    },
  };

  function makeTestAppHost(): AppHost {
    return {
      isDesktopApp: () => true,
      openExternalUrl: async () => {},
      saveFileFromUrl: async () => ({ saved: false, filePath: null }),
      voicePopout: {
        onVoicePopoutState: (listener: (state: VoicePopoutState) => void) => {
          popoutMocks.listeners.push(listener);
          return () => {
            const index = popoutMocks.listeners.indexOf(listener);
            if (index >= 0) {
              popoutMocks.listeners.splice(index, 1);
            }
          };
        },
        syncVoicePopoutState: async () => {},
        onVoicePopoutControlAction: () => () => {},
        openVoicePopout: async () => {},
        requestVoicePopoutStateSync: () => popoutMocks.requestVoicePopoutStateSync(),
        dispatchVoicePopoutControlAction: (action: VoicePopoutControlAction) =>
          popoutMocks.dispatchVoicePopoutControlAction(action),
      },
    };
  }

  return { popoutMocks, makeTestAppHost };
});

vi.mock('@shared/platform/appHost', () => ({
  getAppHost: vi.fn(() => makeTestAppHost()),
}));

import { getAppHost } from '@shared/platform/appHost';

describe('VoicePopoutApp', () => {
  beforeEach(() => {
    popoutMocks.reset();
    vi.mocked(getAppHost).mockReturnValue(makeTestAppHost());
  });

  it('renders synced call state immediately and reuses the quick settings popover', async () => {
    const user = userEvent.setup();

    render(<VoicePopoutApp />);

    expect(popoutMocks.requestVoicePopoutStateSync).toHaveBeenCalledTimes(1);

    await act(async () => {
      popoutMocks.listeners[0]?.({
        isOpen: true,
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
    });

    expect(screen.getByText('Lobby')).toBeTruthy();
    expect(screen.getByText('Guild')).toBeTruthy();
    expect(screen.getByText('2 in call')).toBeTruthy();

    await user.click(screen.getByLabelText(/open voice quick settings/i));

    expect(screen.getByText('Voice Quick Settings')).toBeTruthy();
    expect(screen.getByText('Member Volume')).toBeTruthy();

    const memberVolumeSlider = screen.getByRole('slider', {
      name: /volume for remote user/i,
    });
    memberVolumeSlider.focus();
    await user.keyboard('{ArrowRight}');

    expect(popoutMocks.dispatchVoicePopoutControlAction).toHaveBeenCalledWith({
      type: 'set_member_volume',
      userId: 'user-2',
      volume: 125,
    });

    await user.click(screen.getByRole('button', { name: /open voice settings/i }));
    expect(popoutMocks.dispatchVoicePopoutControlAction).toHaveBeenCalledWith({
      type: 'open_voice_settings',
    });

    await user.click(screen.getByLabelText(/^mute$/i));
    expect(popoutMocks.dispatchVoicePopoutControlAction).toHaveBeenCalledWith({
      type: 'toggle_mute',
    });
  });
});
