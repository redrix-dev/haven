import React from 'react';
import { X, Mic, Volume2 } from 'lucide-react';
import type { VoiceSettings, VoiceTransmissionMode } from '@platform/desktop/types';

interface MobileVoiceSettingsSheetProps {
  open: boolean;
  onClose: () => void;
  settings: VoiceSettings;
  saving: boolean;
  error?: string | null;
  onUpdateSettings: (next: VoiceSettings) => void;
}

const TRANSMISSION_MODES: Array<{ value: VoiceTransmissionMode; label: string; description: string }> = [
  {
    value: 'voice_activity',
    label: 'Voice Activity',
    description: 'Mic opens automatically when you speak above the threshold.',
  },
  {
    value: 'open_mic',
    label: 'Open Mic',
    description: 'Mic is always transmitting while you are unmuted.',
  },
];

const isAudioInput = (d: MediaDeviceInfo) => d.kind === 'audioinput';
const isAudioOutput = (d: MediaDeviceInfo) => d.kind === 'audiooutput';
const hasDeviceId = (d: MediaDeviceInfo) => d.deviceId.trim().length > 0;

function DeviceOption({ device, index, kind }: { device: MediaDeviceInfo; index: number; kind: 'input' | 'output' }) {
  const label = device.label || (kind === 'input' ? `Microphone ${index + 1}` : `Speaker ${index + 1}`);
  return (
    <option key={device.deviceId} value={device.deviceId}>
      {label}
    </option>
  );
}

export function MobileVoiceSettingsSheet({
  open,
  onClose,
  settings,
  saving,
  error = null,
  onUpdateSettings,
}: MobileVoiceSettingsSheetProps) {
  const [inputDevices, setInputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [supportsOutputSelection, setSupportsOutputSelection] = React.useState(false);

  const refreshDevices = React.useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devices.filter((d) => isAudioInput(d) && hasDeviceId(d)));
      setOutputDevices(devices.filter((d) => isAudioOutput(d) && hasDeviceId(d)));
    } catch {
      // Device enumeration unavailable — silently ignore
    }
  }, []);

  React.useEffect(() => {
    setSupportsOutputSelection(
      typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
    );
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void refreshDevices();
    const media = navigator.mediaDevices;
    if (!media?.addEventListener) return;
    const handler = () => void refreshDevices();
    media.addEventListener('devicechange', handler);
    return () => media.removeEventListener('devicechange', handler);
  }, [open, refreshDevices]);

  if (!open) return null;

  const activeMode = settings.transmissionMode === 'push_to_talk' ? 'voice_activity' : settings.transmissionMode;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 touch-none" onClick={onClose} />

      {/* Sheet */}
      <div className="mobile-bottom-sheet fixed inset-x-0 bottom-0 z-50 bg-[#0d1525] rounded-t-2xl flex flex-col">
        {/* Drag handle */}
        <div className="shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 pb-3 border-b border-white/5">
          <h2 className="text-base font-semibold text-white">Voice Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">

          {/* Transmission mode */}
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
              Transmission Mode
            </p>
            <div className="space-y-2">
              {TRANSMISSION_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => onUpdateSettings({ ...settings, transmissionMode: mode.value })}
                  disabled={saving}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors ${
                    activeMode === mode.value
                      ? 'border-blue-500 bg-blue-600/10'
                      : 'border-white/10 bg-white/3 hover:bg-white/5'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    activeMode === mode.value ? 'border-blue-500' : 'border-gray-600'
                  }`}>
                    {activeMode === mode.value && (
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{mode.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{mode.description}</p>
                  </div>
                </button>
              ))}
            </div>

            {activeMode === 'voice_activity' && (
              <div className="space-y-2 px-1">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>Voice threshold</span>
                  <span className="text-white font-medium">{settings.voiceActivationThreshold}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={settings.voiceActivationThreshold}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, voiceActivationThreshold: Number(e.target.value) })
                  }
                  disabled={saving}
                  className="w-full accent-blue-500"
                  aria-label="Voice activation threshold"
                />
                <p className="text-[11px] text-gray-500">
                  Lower values open the mic more easily.
                </p>
              </div>
            )}
          </div>

          {/* Preferred Microphone */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Mic className="w-3.5 h-3.5 text-gray-500" />
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
                Microphone
              </p>
            </div>
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <select
                value={settings.preferredInputDeviceId || 'default'}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, preferredInputDeviceId: e.target.value })
                }
                disabled={saving}
                className="w-full bg-transparent text-white text-sm px-4 py-3 appearance-none outline-none"
              >
                <option value="default">System default microphone</option>
                {inputDevices.map((d, i) => (
                  <DeviceOption key={d.deviceId} device={d} index={i} kind="input" />
                ))}
              </select>
            </div>
          </div>

          {/* Preferred Speaker */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Volume2 className="w-3.5 h-3.5 text-gray-500" />
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
                Speaker
              </p>
            </div>
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <select
                value={settings.preferredOutputDeviceId || 'default'}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, preferredOutputDeviceId: e.target.value })
                }
                disabled={saving || !supportsOutputSelection}
                className="w-full bg-transparent text-white text-sm px-4 py-3 appearance-none outline-none disabled:opacity-50"
              >
                <option value="default">System default speaker</option>
                {outputDevices.map((d, i) => (
                  <DeviceOption key={d.deviceId} device={d} index={i} kind="output" />
                ))}
              </select>
            </div>
            {!supportsOutputSelection && (
              <p className="text-[11px] text-gray-500 px-1">
                Output device routing is not supported by this browser.
              </p>
            )}
          </div>

          {saving && <p className="text-sm text-gray-400 text-center">Saving...</p>}
          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        </div>
      </div>
    </>
  );
}
