import { describe, expect, it } from 'vitest';
import {
  createInitialVoiceSessionStoreState,
  reduceVoiceSessionStoreState,
  type VoiceChannelReference,
} from '@client/features/voice/store/voiceSessionStore';

const buildChannel = (overrides: Partial<VoiceChannelReference>): VoiceChannelReference => ({
  id: 'voice-a',
  name: 'Voice A',
  community_id: 'server-a',
  ...overrides,
});

describe('voiceSessionStore state transitions', () => {
  it('switches to a different channel in the same server deterministically', () => {
    const firstChannel = buildChannel({ id: 'voice-a', name: 'Alpha', community_id: 'server-1' });
    const secondChannel = buildChannel({ id: 'voice-b', name: 'Bravo', community_id: 'server-1' });

    const connecting = reduceVoiceSessionStoreState(createInitialVoiceSessionStoreState(), {
      type: 'START_CONNECT',
      channel: firstChannel,
    });
    const connected = reduceVoiceSessionStoreState(connecting, { type: 'CONNECTED' });
    const switching = reduceVoiceSessionStoreState(connected, {
      type: 'START_SWITCH',
      channel: secondChannel,
    });
    const leaveComplete = reduceVoiceSessionStoreState(switching, { type: 'COMPLETE_DISCONNECT' });

    expect(connected.phase).toBe('connected');
    expect(switching.phase).toBe('switching');
    expect(switching.activeChannel?.id).toBe('voice-a');
    expect(switching.pendingChannel?.id).toBe('voice-b');
    expect(leaveComplete.phase).toBe('connecting');
    expect(leaveComplete.activeChannel?.id).toBe('voice-b');
    expect(leaveComplete.pendingChannel).toBeNull();
  });

  it('switches to a channel in a different server deterministically', () => {
    const firstChannel = buildChannel({ id: 'voice-a', community_id: 'server-1' });
    const secondChannel = buildChannel({ id: 'voice-z', community_id: 'server-2', name: 'Zulu' });

    const connected = reduceVoiceSessionStoreState(
      reduceVoiceSessionStoreState(createInitialVoiceSessionStoreState(), {
        type: 'START_CONNECT',
        channel: firstChannel,
      }),
      { type: 'CONNECTED' }
    );

    const switching = reduceVoiceSessionStoreState(connected, {
      type: 'START_SWITCH',
      channel: secondChannel,
    });
    const reconnecting = reduceVoiceSessionStoreState(switching, { type: 'COMPLETE_DISCONNECT' });

    expect(switching.phase).toBe('switching');
    expect(switching.pendingChannel?.community_id).toBe('server-2');
    expect(reconnecting.phase).toBe('connecting');
    expect(reconnecting.activeChannel?.community_id).toBe('server-2');
  });

  it('disconnects to idle and then reconnects', () => {
    const channel = buildChannel({ id: 'voice-a', community_id: 'server-1' });

    const connected = reduceVoiceSessionStoreState(
      reduceVoiceSessionStoreState(createInitialVoiceSessionStoreState(), {
        type: 'START_CONNECT',
        channel,
      }),
      { type: 'CONNECTED' }
    );

    const disconnecting = reduceVoiceSessionStoreState(connected, { type: 'START_DISCONNECT' });
    const idle = reduceVoiceSessionStoreState(disconnecting, { type: 'COMPLETE_DISCONNECT' });
    const reconnecting = reduceVoiceSessionStoreState(idle, {
      type: 'START_CONNECT',
      channel,
    });

    expect(disconnecting.phase).toBe('disconnecting');
    expect(idle.phase).toBe('idle');
    expect(idle.activeChannel).toBeNull();
    expect(reconnecting.phase).toBe('connecting');
    expect(reconnecting.activeChannel?.id).toBe('voice-a');
  });
});
