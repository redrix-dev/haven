import React from 'react';
import { Button } from '@shared/components/ui/button';
import { VoiceDrawer } from '@shared/components/VoiceDrawer';
import { VoicePanel } from '@shared/components/VoicePanel';
import { desktopClient } from '@platform/desktop/client';
import type { VoicePopoutControlAction, VoicePopoutState } from '@platform/desktop/types';

const EMPTY_STATE: VoicePopoutState = {
  isOpen: false,
  channelName: null,
  connected: false,
  joined: false,
  isMuted: false,
  isDeafened: false,
  selectedInputDeviceId: 'default',
  selectedOutputDeviceId: 'default',
  members: [],
};

export function VoicePopoutApp() {
  const [state, setState] = React.useState<VoicePopoutState>(EMPTY_STATE);

  React.useEffect(() => {
    if (!desktopClient.isAvailable()) return;
    return desktopClient.onVoicePopoutState((nextState) => {
      setState(nextState);
    });
  }, []);

  const dispatch = React.useCallback((action: VoicePopoutControlAction) => {
    if (!desktopClient.isAvailable()) return;
    void desktopClient.dispatchVoicePopoutControlAction(action);
  }, []);

  return (
    <VoiceDrawer layout="popout" open>
      <VoicePanel
        layout="popout"
        title={state.channelName ?? 'Voice'}
        subtitle={state.connected ? 'Connected' : 'Disconnected'}
      >
        <div className="space-y-3 p-3">
          <div className="flex gap-2">
            <Button type="button" onClick={() => dispatch({ type: 'toggle_mute' })}>
              {state.isMuted ? 'Unmute' : 'Mute'}
            </Button>
            <Button type="button" onClick={() => dispatch({ type: 'toggle_deafen' })}>
              {state.isDeafened ? 'Undeafen' : 'Deafen'}
            </Button>
          </div>
          <div className="space-y-2 text-sm text-[#a9b8cf]">
            {state.members.map((member) => (
              <div key={member.userId} className="rounded border border-[#304867] bg-[#142033] p-2">
                <div className="text-white">{member.displayName}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span>{member.volume}%</span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={25}
                    value={member.volume}
                    onChange={(event) => {
                      dispatch({
                        type: 'set_member_volume',
                        userId: member.userId,
                        volume: Number(event.currentTarget.value),
                      });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </VoicePanel>
    </VoiceDrawer>
  );
}
