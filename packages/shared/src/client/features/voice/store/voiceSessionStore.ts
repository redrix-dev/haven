import type { Channel } from '@shared/lib/backend/types';

export type VoiceConnectionPhase =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'switching'
  | 'disconnecting'
  | 'error';

export type VoiceChannelReference = Pick<Channel, 'id' | 'name' | 'community_id'>;

export type VoiceSessionStoreState = {
  phase: VoiceConnectionPhase;
  activeChannel: VoiceChannelReference | null;
  pendingChannel: VoiceChannelReference | null;
  error: string | null;
};

export type VoiceSessionStoreEvent =
  | { type: 'START_CONNECT'; channel: VoiceChannelReference }
  | { type: 'CONNECTED' }
  | { type: 'START_SWITCH'; channel: VoiceChannelReference }
  | { type: 'START_DISCONNECT' }
  | { type: 'COMPLETE_DISCONNECT' }
  | { type: 'ERROR'; message: string }
  | { type: 'CLEAR_ERROR' };

export const createInitialVoiceSessionStoreState = (): VoiceSessionStoreState => ({
  phase: 'idle',
  activeChannel: null,
  pendingChannel: null,
  error: null,
});

export const reduceVoiceSessionStoreState = (
  state: VoiceSessionStoreState,
  event: VoiceSessionStoreEvent
): VoiceSessionStoreState => {
  switch (event.type) {
    case 'START_CONNECT':
      return {
        phase: 'connecting',
        activeChannel: event.channel,
        pendingChannel: null,
        error: null,
      };
    case 'CONNECTED':
      return {
        ...state,
        phase: 'connected',
        error: null,
      };
    case 'START_SWITCH':
      return {
        ...state,
        phase: 'switching',
        pendingChannel: event.channel,
        error: null,
      };
    case 'START_DISCONNECT':
      return {
        ...state,
        phase: 'disconnecting',
        error: null,
      };
    case 'COMPLETE_DISCONNECT':
      if (state.pendingChannel) {
        return {
          phase: 'connecting',
          activeChannel: state.pendingChannel,
          pendingChannel: null,
          error: null,
        };
      }
      return {
        phase: 'idle',
        activeChannel: null,
        pendingChannel: null,
        error: null,
      };
    case 'ERROR':
      return {
        ...state,
        phase: 'error',
        error: event.message,
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
        phase: state.activeChannel ? 'connected' : 'idle',
      };
    default:
      return state;
  }
};
