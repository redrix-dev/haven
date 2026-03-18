import React from 'react';
import { VoiceDrawer as VoiceQuickControlsDrawer } from '@shared/components/voice/VoiceDrawer';
import type { VoicePopoutControlAction, VoicePopoutState } from '@platform/desktop/types';
import { usePlatformRuntime } from '@platform/runtime/PlatformRuntimeContext';

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
  const runtime = usePlatformRuntime();
  const desktop = runtime.desktop;
  const [state, setState] = React.useState<VoicePopoutState>(EMPTY_STATE);
  const [quickSettingsOpen, setQuickSettingsOpen] = React.useState(false);

  React.useEffect(() => {
    if (!desktop?.isAvailable()) return;
    return desktop.onVoicePopoutState((nextState) => {
      setState(nextState);
    });
  }, [desktop]);

  const dispatch = React.useCallback((action: VoicePopoutControlAction) => {
    if (!desktop?.isAvailable()) return;
    void desktop.dispatchVoicePopoutControlAction(action);
  }, [desktop]);

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
        onOpenAdvancedOptions={() => dispatch({ type: 'open_voice_settings' })}
        onOpenVoiceHardwareTest={() =>
          dispatch({ type: 'open_voice_hardware_test' })
        }
      />
    </div>
  );
}
