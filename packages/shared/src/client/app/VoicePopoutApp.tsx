import React from 'react';
import { VoiceDrawer as VoiceQuickControlsDrawer } from '@shared/components/voice/VoiceDrawer';
import { desktopClient } from '@platform/desktop/client';
import type { VoicePopoutControlAction, VoicePopoutState } from '@platform/desktop/types';

const EMPTY_STATE: VoicePopoutState = {
  isOpen: false,
  serverName: null,
  channelName: null,
  connected: false,
  joined: false,
  joining: false,
  isMuted: false,
  isDeafened: false,
  transmissionMode: 'voice_activity',
  participantCount: 0,
  selectedInputDeviceId: 'default',
  selectedOutputDeviceId: 'default',
  inputDevices: [],
  outputDevices: [],
  supportsOutputSelection: false,
  members: [],
};

export function VoicePopoutApp() {
  const [state, setState] = React.useState<VoicePopoutState>(EMPTY_STATE);
  const [quickSettingsOpen, setQuickSettingsOpen] = React.useState(false);

  React.useEffect(() => {
    if (!desktopClient.isAvailable()) return;
    const unsubscribe = desktopClient.onVoicePopoutState((nextState) => {
      setState(nextState);
    });
    void desktopClient.requestVoicePopoutStateSync();
    return unsubscribe;
  }, []);

  const dispatch = React.useCallback((action: VoicePopoutControlAction) => {
    if (!desktopClient.isAvailable()) return;
    void desktopClient.dispatchVoicePopoutControlAction(action);
  }, []);

  return (
    <div className="min-h-screen bg-[#0f1726] p-3">
      <VoiceQuickControlsDrawer
        surface="popout"
        serverName={state.serverName ?? 'Voice'}
        channelName={state.channelName ?? 'No active call'}
        participantCount={state.participantCount}
        participantPreview={state.members.map((member) => ({
          userId: member.userId,
          displayName: member.displayName,
        }))}
        memberControls={state.members.map((member) => ({
          userId: member.userId,
          displayName: member.displayName,
          isMuted: member.isMuted,
          isDeafened: member.isDeafened,
          volume: member.volume,
        }))}
        voiceConnected={state.connected}
        voicePanelOpen={quickSettingsOpen}
        joining={state.joining}
        voiceSessionState={{
          joined: state.joined,
          isMuted: state.isMuted,
          isDeafened: state.isDeafened,
        }}
        transmissionMode={state.transmissionMode}
        inputDevices={state.inputDevices}
        outputDevices={state.outputDevices}
        selectedInputDeviceId={state.selectedInputDeviceId}
        selectedOutputDeviceId={state.selectedOutputDeviceId}
        supportsOutputSelection={state.supportsOutputSelection}
        canOpenVoicePopout={false}
        onOpenChange={setQuickSettingsOpen}
        onJoin={() => dispatch({ type: 'join_voice' })}
        onToggleMute={() => dispatch({ type: 'toggle_mute' })}
        onToggleDeafen={() => dispatch({ type: 'toggle_deafen' })}
        onDisconnect={() => dispatch({ type: 'leave_voice' })}
        onSelectTransmissionMode={(mode) =>
          dispatch({ type: 'set_transmission_mode', mode })
        }
        onSelectInputDevice={(deviceId) =>
          dispatch({ type: 'set_input_device', deviceId })
        }
        onSelectOutputDevice={(deviceId) =>
          dispatch({ type: 'set_output_device', deviceId })
        }
        onSetMemberVolume={(userId, volume) =>
          dispatch({ type: 'set_member_volume', userId, volume })
        }
        onResetMemberVolume={(userId) =>
          dispatch({ type: 'set_member_volume', userId, volume: 100 })
        }
        onResetAllMemberVolumes={() => {
          for (const member of state.members) {
            dispatch({
              type: 'set_member_volume',
              userId: member.userId,
              volume: 100,
            });
          }
        }}
        onOpenAdvancedOptions={() => dispatch({ type: 'open_voice_settings' })}
        onOpenVoiceHardwareTest={() =>
          dispatch({ type: 'open_voice_hardware_test' })
        }
      />
    </div>
  );
}
