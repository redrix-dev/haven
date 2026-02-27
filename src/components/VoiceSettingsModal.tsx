import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { VoiceSettings, VoiceTransmissionMode } from '@/shared/desktop/types';
import { PushToTalkBindingField } from '@/components/PushToTalkBindingField';

type VoiceSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: VoiceSettings;
  saving: boolean;
  error?: string | null;
  onUpdateSettings: (next: VoiceSettings) => void;
  onOpenVoiceHardwareTest?: () => void;
};

const isAudioInput = (device: MediaDeviceInfo) => device.kind === 'audioinput';
const isAudioOutput = (device: MediaDeviceInfo) => device.kind === 'audiooutput';
const hasSelectableDeviceId = (device: MediaDeviceInfo) => device.deviceId.trim().length > 0;

const TRANSMISSION_MODE_OPTIONS: Array<{ value: VoiceTransmissionMode; label: string; description: string }> = [
  {
    value: 'voice_activity',
    label: 'Voice Activity',
    description: 'Transmits only when your mic level exceeds the gate threshold.',
  },
  {
    value: 'push_to_talk',
    label: 'Push to Talk',
    description: 'Transmits only while your configured hotkey is held.',
  },
  {
    value: 'open_mic',
    label: 'Open Mic',
    description: 'Always transmits when unmuted (legacy behavior).',
  },
];

export function VoiceSettingsModal({
  open,
  onOpenChange,
  settings,
  saving,
  error = null,
  onUpdateSettings,
  onOpenVoiceHardwareTest,
}: VoiceSettingsModalProps) {
  const [inputDevices, setInputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [supportsOutputSelection, setSupportsOutputSelection] = React.useState(false);

  const refreshAudioDevices = React.useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devices.filter((device) => isAudioInput(device) && hasSelectableDeviceId(device)));
      setOutputDevices(devices.filter((device) => isAudioOutput(device) && hasSelectableDeviceId(device)));
    } catch (deviceError) {
      console.error('Failed to enumerate audio devices in voice settings:', deviceError);
    }
  }, []);

  React.useEffect(() => {
    setSupportsOutputSelection(
      typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
    );
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void refreshAudioDevices();

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;

    const handleDeviceChange = () => {
      void refreshAudioDevices();
    };
    mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [open, refreshAudioDevices]);

  const selectedTransmissionMode = TRANSMISSION_MODE_OPTIONS.find(
    (option) => option.value === settings.transmissionMode
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        className="scrollbar-inset max-h-[88vh] overflow-y-auto bg-[#18243a] border-[#142033] text-white"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Voice Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-[#304867] bg-[#142033] p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-white">Transmission Mode</p>
              <p className="text-xs text-[#9fb2cf]">
                Choose how your microphone transmits while you are unmuted in voice channels.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-[#a9b8cf]">Mode</Label>
              <Select
                value={settings.transmissionMode}
                onValueChange={(value) =>
                  onUpdateSettings({
                    ...settings,
                    transmissionMode: value as VoiceTransmissionMode,
                  })
                }
                disabled={saving}
              >
                <SelectTrigger className="w-full bg-[#111a2b] border-[#304867] text-white">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent className="bg-[#142033] border-[#304867] text-white">
                  {TRANSMISSION_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTransmissionMode && (
                <p className="text-xs text-[#8fa6c8]">{selectedTransmissionMode.description}</p>
              )}
            </div>

            {(settings.transmissionMode === 'voice_activity' || settings.transmissionMode === 'open_mic') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs text-[#a9b8cf]">
                  <span>Voice activity threshold</span>
                  <span>{settings.voiceActivationThreshold}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={settings.voiceActivationThreshold}
                  onChange={(event) =>
                    onUpdateSettings({
                      ...settings,
                      voiceActivationThreshold: Number(event.target.value),
                    })
                  }
                  disabled={saving || settings.transmissionMode !== 'voice_activity'}
                  className="w-full accent-[#4f8df5]"
                  aria-label="Voice activation threshold"
                />
                <p className="text-[11px] text-[#90a5c4]">
                  Used when mode is Voice Activity. Lower values open the mic more easily.
                </p>
              </div>
            )}

            {(settings.transmissionMode === 'push_to_talk' || settings.pushToTalkBinding) && (
              <PushToTalkBindingField
                value={settings.pushToTalkBinding}
                disabled={saving}
                onChange={(nextBinding) =>
                  onUpdateSettings({
                    ...settings,
                    pushToTalkBinding: nextBinding,
                  })
                }
                helperText="Works while Haven is focused. Browser/runtime support for F13-F24 depends on the device driver and OS key mapping."
              />
            )}
          </div>

          <div className="rounded-xl border border-[#304867] bg-[#142033] p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-white">Preferred Devices</p>
              <p className="text-xs text-[#9fb2cf]">
                Your preferred microphone and speaker for voice controls. These are used as the default
                selection when opening voice panels/tests on this device.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-[#a9b8cf]">Microphone</Label>
                <Select
                  value={settings.preferredInputDeviceId || 'default'}
                  onValueChange={(value) =>
                    onUpdateSettings({
                      ...settings,
                      preferredInputDeviceId: value,
                    })
                  }
                  disabled={saving}
                >
                  <SelectTrigger className="w-full bg-[#111a2b] border-[#304867] text-white">
                    <SelectValue placeholder="Select microphone" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#142033] border-[#304867] text-white">
                    {inputDevices.length === 0 ? (
                      <SelectItem value="default">Default microphone</SelectItem>
                    ) : (
                      <>
                        <SelectItem value="default">System default microphone</SelectItem>
                        {inputDevices.map((device, index) => (
                          <SelectItem key={device.deviceId} value={device.deviceId}>
                            {device.label || `Microphone ${index + 1}`}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-[#a9b8cf]">Speaker</Label>
                <Select
                  value={settings.preferredOutputDeviceId || 'default'}
                  onValueChange={(value) =>
                    onUpdateSettings({
                      ...settings,
                      preferredOutputDeviceId: value,
                    })
                  }
                  disabled={saving || !supportsOutputSelection}
                >
                  <SelectTrigger className="w-full bg-[#111a2b] border-[#304867] text-white">
                    <SelectValue placeholder="Select speaker" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#142033] border-[#304867] text-white">
                    {outputDevices.length === 0 ? (
                      <SelectItem value="default">Default speaker</SelectItem>
                    ) : (
                      <>
                        <SelectItem value="default">System default speaker</SelectItem>
                        {outputDevices.map((device, index) => (
                          <SelectItem key={device.deviceId} value={device.deviceId}>
                            {device.label || `Speaker ${index + 1}`}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                {!supportsOutputSelection && (
                  <p className="text-[11px] text-[#90a5c4]">
                    Output device routing is not supported by this runtime. System default output is used.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#304867] bg-[#142033] p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-white">Voice Testing</p>
              <p className="text-xs text-[#9fb2cf]">
                Test microphone capture, meter activity, and speaker playback before joining a call.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={onOpenVoiceHardwareTest}
                disabled={saving || !onOpenVoiceHardwareTest}
                className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
              >
                Open Voice Hardware Test
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-[#304867] text-white"
                onClick={() => {
                  void refreshAudioDevices();
                }}
                disabled={saving}
              >
                Refresh Devices
              </Button>
            </div>
            <p className="text-[11px] text-[#90a5c4]">
              The hardware test runs locally and does not connect to a voice channel.
            </p>
          </div>

          {saving && <p className="text-sm text-[#a9b8cf]">Saving voice settings...</p>}
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            variant="ghost"
            className="text-white hover:underline"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
