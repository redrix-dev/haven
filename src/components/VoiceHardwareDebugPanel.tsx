import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import voiceDebugSpeakerTestUrl from '@/assets/audio/voice-debug-speaker-test.mp3';
import { Headphones, Mic, Play, Square, Volume2, VolumeX, Waves } from 'lucide-react';

const DEFAULT_SPEAKER_TEST_AUDIO_PATH = voiceDebugSpeakerTestUrl;
const MIC_METER_BAR_COUNT = 28;
const MIC_METER_MIN_BAR = 0.06;
const INPUT_GAIN_MIN = 0;
const INPUT_GAIN_MAX = 200;
const SPEAKER_VOLUME_MIN = 0;
const SPEAKER_VOLUME_MAX = 100;

type MicStatus = 'idle' | 'requesting' | 'active' | 'error';

type VoiceHardwareDebugPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hotkeyLabel?: string | null;
  speakerTestAudioPath?: string;
  title?: string;
  description?: string;
  showDebugWorkflow?: boolean;
};

type MeterSnapshot = {
  bars: number[];
  level: number;
  peak: number;
};

const createIdleMeterBars = () => Array.from({ length: MIC_METER_BAR_COUNT }, () => MIC_METER_MIN_BAR);

const isAudioInput = (device: MediaDeviceInfo) => device.kind === 'audioinput';
const isAudioOutput = (device: MediaDeviceInfo) => device.kind === 'audiooutput';
const hasSelectableDeviceId = (device: MediaDeviceInfo) => device.deviceId.trim().length > 0;

export function VoiceHardwareDebugPanel({
  open,
  onOpenChange,
  hotkeyLabel,
  speakerTestAudioPath = DEFAULT_SPEAKER_TEST_AUDIO_PATH,
  title = 'Voice Hardware Debug Panel',
  description = 'Test microphone capture and speaker playback locally before joining a voice session.',
  showDebugWorkflow = true,
}: VoiceHardwareDebugPanelProps) {
  const [inputDevices, setInputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = React.useState('default');
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = React.useState('default');
  const [supportsOutputSelection, setSupportsOutputSelection] = React.useState(false);
  const [micStatus, setMicStatus] = React.useState<MicStatus>('idle');
  const [micError, setMicError] = React.useState<string | null>(null);
  const [speakerError, setSpeakerError] = React.useState<string | null>(null);
  const [inputGainPercent, setInputGainPercent] = React.useState(100);
  const [speakerVolumePercent, setSpeakerVolumePercent] = React.useState(80);
  const [meterSnapshot, setMeterSnapshot] = React.useState<MeterSnapshot>({
    bars: createIdleMeterBars(),
    level: 0,
    peak: 0,
  });
  const [speakerTestPlaying, setSpeakerTestPlaying] = React.useState(false);

  const micStreamRef = React.useRef<MediaStream | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const sourceNodeRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = React.useRef<GainNode | null>(null);
  const analyserNodeRef = React.useRef<AnalyserNode | null>(null);
  const rafIdRef = React.useRef<number | null>(null);
  const frequencyDataRef = React.useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timeDomainDataRef = React.useRef<Uint8Array<ArrayBuffer> | null>(null);
  const lastMeterCommitAtRef = React.useRef<number>(0);
  const speakerAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const micActiveRef = React.useRef(false);

  const refreshAudioDevices = React.useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextInputDevices = devices.filter(
        (device) => isAudioInput(device) && hasSelectableDeviceId(device)
      );
      const nextOutputDevices = devices.filter(
        (device) => isAudioOutput(device) && hasSelectableDeviceId(device)
      );
      setInputDevices(nextInputDevices);
      setOutputDevices(nextOutputDevices);

      if (
        nextInputDevices.length > 0 &&
        !nextInputDevices.some((device) => device.deviceId === selectedInputDeviceId)
      ) {
        setSelectedInputDeviceId(nextInputDevices[0].deviceId);
      } else if (nextInputDevices.length === 0 && selectedInputDeviceId !== 'default') {
        setSelectedInputDeviceId('default');
      }

      if (
        nextOutputDevices.length > 0 &&
        !nextOutputDevices.some((device) => device.deviceId === selectedOutputDeviceId)
      ) {
        setSelectedOutputDeviceId(nextOutputDevices[0].deviceId);
      } else if (nextOutputDevices.length === 0 && selectedOutputDeviceId !== 'default') {
        setSelectedOutputDeviceId('default');
      }
    } catch (error) {
      console.error('Failed to enumerate audio devices for debug panel:', error);
    }
  }, [selectedInputDeviceId, selectedOutputDeviceId]);

  const stopMeterLoop = React.useCallback(() => {
    if (rafIdRef.current != null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const resetMeter = React.useCallback(() => {
    setMeterSnapshot({
      bars: createIdleMeterBars(),
      level: 0,
      peak: 0,
    });
  }, []);

  const stopMicTest = React.useCallback(
    async ({ preserveError = true }: { preserveError?: boolean } = {}) => {
      stopMeterLoop();
      micActiveRef.current = false;

      sourceNodeRef.current?.disconnect();
      sourceNodeRef.current = null;
      gainNodeRef.current?.disconnect();
      gainNodeRef.current = null;
      analyserNodeRef.current?.disconnect();
      analyserNodeRef.current = null;
      frequencyDataRef.current = null;
      timeDomainDataRef.current = null;

      if (micStreamRef.current) {
        for (const track of micStreamRef.current.getTracks()) {
          track.stop();
        }
        micStreamRef.current = null;
      }

      if (audioContextRef.current) {
        try {
          await audioContextRef.current.close();
        } catch (error) {
          console.warn('Failed to close debug audio context cleanly:', error);
        }
        audioContextRef.current = null;
      }

      setMicStatus((prev) => (prev === 'error' && preserveError ? 'error' : 'idle'));
      if (!preserveError) {
        setMicError(null);
      }
      resetMeter();
    },
    [resetMeter, stopMeterLoop]
  );

  const applySpeakerSinkId = React.useCallback(async (audioElement: HTMLAudioElement) => {
    const audioWithSink = audioElement as HTMLAudioElement & {
      setSinkId?: (sinkId: string) => Promise<void>;
    };

    if (!audioWithSink.setSinkId) return;
    try {
      await audioWithSink.setSinkId(selectedOutputDeviceId || 'default');
    } catch (error) {
      console.error('Failed to set debug speaker output device:', error);
      setSpeakerError('Failed to route test audio to the selected speaker.');
    }
  }, [selectedOutputDeviceId]);

  const ensureSpeakerAudio = React.useCallback(() => {
    if (speakerAudioRef.current) return speakerAudioRef.current;

    const audio = new Audio(speakerTestAudioPath);
    audio.preload = 'auto';
    audio.volume = speakerVolumePercent / 100;
    audio.loop = false;
    audio.onplay = () => {
      setSpeakerTestPlaying(true);
      setSpeakerError(null);
    };
    audio.onpause = () => {
      setSpeakerTestPlaying(false);
    };
    audio.onended = () => {
      setSpeakerTestPlaying(false);
    };
    audio.onerror = () => {
      setSpeakerTestPlaying(false);
      setSpeakerError(
        `Speaker test audio failed to load. Ensure the bundled test clip is present in src/assets/audio.`
      );
    };
    speakerAudioRef.current = audio;
    return audio;
  }, [speakerTestAudioPath, speakerVolumePercent]);

  const stopSpeakerTest = React.useCallback(() => {
    const audio = speakerAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setSpeakerTestPlaying(false);
  }, []);

  const playSpeakerTest = React.useCallback(async () => {
    setSpeakerError(null);

    const audio = ensureSpeakerAudio();
    audio.volume = speakerVolumePercent / 100;
    audio.src = speakerTestAudioPath;
    audio.load();

    if (supportsOutputSelection) {
      await applySpeakerSinkId(audio);
    }

    try {
      await audio.play();
      setSpeakerTestPlaying(true);
    } catch (error) {
      console.error('Failed to play speaker test audio:', error);
      setSpeakerTestPlaying(false);
      setSpeakerError(
        'Unable to play speaker test audio. Verify the imported test clip exists and rebuild the app.'
      );
    }
  }, [
    applySpeakerSinkId,
    ensureSpeakerAudio,
    speakerTestAudioPath,
    speakerVolumePercent,
    supportsOutputSelection,
  ]);

  const startMeterLoop = React.useCallback(() => {
    const analyser = analyserNodeRef.current;
    const frequencyData = frequencyDataRef.current;
    const timeDomainData = timeDomainDataRef.current;
    if (!analyser || !frequencyData || !timeDomainData) return;

    const frame = (now: number) => {
      if (!micActiveRef.current) {
        rafIdRef.current = null;
        return;
      }

      analyser.getByteFrequencyData(frequencyData);
      analyser.getByteTimeDomainData(timeDomainData);

      let rmsAccumulator = 0;
      for (let index = 0; index < timeDomainData.length; index += 1) {
        const centered = (timeDomainData[index] - 128) / 128;
        rmsAccumulator += centered * centered;
      }
      const rms = Math.sqrt(rmsAccumulator / timeDomainData.length);

      const bars: number[] = [];
      const binsPerBar = Math.max(1, Math.floor(frequencyData.length / MIC_METER_BAR_COUNT));
      let peak = 0;

      for (let barIndex = 0; barIndex < MIC_METER_BAR_COUNT; barIndex += 1) {
        const start = barIndex * binsPerBar;
        const end =
          barIndex === MIC_METER_BAR_COUNT - 1
            ? frequencyData.length
            : Math.min(frequencyData.length, start + binsPerBar);

        let total = 0;
        let samples = 0;
        for (let binIndex = start; binIndex < end; binIndex += 1) {
          total += frequencyData[binIndex];
          samples += 1;
        }

        const normalized = samples > 0 ? total / samples / 255 : 0;
        const smoothed = Math.max(MIC_METER_MIN_BAR, Math.min(1, normalized * 1.35));
        bars.push(smoothed);
        if (smoothed > peak) peak = smoothed;
      }

      if (now - lastMeterCommitAtRef.current >= 33) {
        lastMeterCommitAtRef.current = now;
        setMeterSnapshot({
          bars,
          level: Math.min(1, rms * 3),
          peak,
        });
      }

      rafIdRef.current = window.requestAnimationFrame(frame);
    };

    stopMeterLoop();
    rafIdRef.current = window.requestAnimationFrame(frame);
  }, [stopMeterLoop]);

  const startMicTest = React.useCallback(async (deviceIdOverride?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus('error');
      setMicError('Microphone testing is not supported in this runtime.');
      return;
    }

    setMicError(null);
    setMicStatus('requesting');

    try {
      await stopMicTest({ preserveError: false });

      const constraints: MediaTrackConstraints =
        (deviceIdOverride ?? selectedInputDeviceId) &&
        (deviceIdOverride ?? selectedInputDeviceId) !== 'default'
          ? {
              deviceId: { exact: deviceIdOverride ?? selectedInputDeviceId },
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error('No audio track available from selected microphone.');
      }

      const AudioContextCtor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error('Web Audio API is not available.');
      }

      const audioContext = new AudioContextCtor();
      await audioContext.resume();

      const source = audioContext.createMediaStreamSource(stream);
      const gainNode = audioContext.createGain();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      gainNode.gain.value = inputGainPercent / 100;

      source.connect(gainNode);
      gainNode.connect(analyser);

      micStreamRef.current = stream;
      audioContextRef.current = audioContext;
      sourceNodeRef.current = source;
      gainNodeRef.current = gainNode;
      analyserNodeRef.current = analyser;
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      timeDomainDataRef.current = new Uint8Array(analyser.fftSize);
      micActiveRef.current = true;

      setMicStatus('active');
      startMeterLoop();
      await refreshAudioDevices();
    } catch (error) {
      console.error('Failed to start microphone debug test:', error);
      micActiveRef.current = false;
      await stopMicTest({ preserveError: false });
      setMicStatus('error');
      setMicError(
        error instanceof Error ? error.message : 'Unable to start microphone test. Check permissions.'
      );
    }
  }, [inputGainPercent, refreshAudioDevices, selectedInputDeviceId, startMeterLoop, stopMicTest]);

  React.useEffect(() => {
    setSupportsOutputSelection(
      typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
    );
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
  }, [refreshAudioDevices]);

  React.useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = inputGainPercent / 100;
    }
  }, [inputGainPercent]);

  React.useEffect(() => {
    const audio = speakerAudioRef.current;
    if (!audio) return;
    audio.volume = speakerVolumePercent / 100;
  }, [speakerVolumePercent]);

  React.useEffect(() => {
    const audio = speakerAudioRef.current;
    if (!audio || !supportsOutputSelection) return;
    void applySpeakerSinkId(audio);
  }, [applySpeakerSinkId, selectedOutputDeviceId, supportsOutputSelection]);

  React.useEffect(() => {
    if (!open) {
      stopSpeakerTest();
      void stopMicTest({ preserveError: true });
    } else {
      void refreshAudioDevices();
    }
  }, [open, refreshAudioDevices, stopMicTest, stopSpeakerTest]);

  React.useEffect(() => {
    return () => {
      stopSpeakerTest();
      void stopMicTest({ preserveError: true });
      if (speakerAudioRef.current) {
        speakerAudioRef.current.onplay = null;
        speakerAudioRef.current.onpause = null;
        speakerAudioRef.current.onended = null;
        speakerAudioRef.current.onerror = null;
        speakerAudioRef.current = null;
      }
    };
  }, [stopMicTest, stopSpeakerTest]);

  const micConnected = micStatus === 'active';
  const micResponsive = micConnected && meterSnapshot.level > 0.03;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="app"
        className="border-[#304867] bg-[#101929] text-white p-0 overflow-hidden"
      >
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="px-5 py-4 border-b border-[#263a58] bg-[linear-gradient(135deg,#16233a_0%,#0f1828_65%,#101929_100%)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <Waves className="size-5 text-[#87b5ff]" />
                  {title}
                </DialogTitle>
                <DialogDescription className="text-[#a9b8cf]">
                  {description}
                </DialogDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {hotkeyLabel && (
                  <Badge variant="outline" className="border-[#355077] text-[#d5e4ff]">
                    Hotkey: {hotkeyLabel}
                  </Badge>
                )}
                <Badge
                  variant={micResponsive ? 'default' : 'outline'}
                  className={
                    micResponsive
                      ? 'bg-[#1c8b63] text-white border-transparent'
                      : 'border-[#355077] text-[#d5e4ff]'
                  }
                >
                  Mic {micConnected ? (micResponsive ? 'Active' : 'Connected') : 'Idle'}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <div className="scrollbar-inset flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-4">
              <Card className="border-[#263a58] bg-[#152239] text-white">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Mic className="size-4 text-[#a7c8ff]" />
                    Microphone Test
                  </CardTitle>
                  <CardDescription className="text-[#9fb2cf]">
                    Live meter checks microphone signal, permissions, and client-side input gain.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Input device</p>
                      <Select
                        value={selectedInputDeviceId}
                        onValueChange={(value) => {
                          setSelectedInputDeviceId(value);
                          if (micStatus === 'active') {
                            void startMicTest(value);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full bg-[#0f1828] border-[#304867] text-white">
                          <SelectValue placeholder="Select microphone" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#142033] border-[#304867] text-white">
                          {inputDevices.length === 0 ? (
                            <SelectItem value="default">Default microphone</SelectItem>
                          ) : (
                            inputDevices.map((device, index) => (
                              <SelectItem key={device.deviceId} value={device.deviceId}>
                                {device.label || `Microphone ${index + 1}`}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">
                        Input volume ({inputGainPercent}%)
                      </p>
                      <input
                        type="range"
                        min={INPUT_GAIN_MIN}
                        max={INPUT_GAIN_MAX}
                        step={1}
                        value={inputGainPercent}
                        onChange={(event) => setInputGainPercent(Number(event.target.value))}
                        className="w-full accent-[#4f8df5]"
                        aria-label="Microphone input volume"
                      />
                      <p className="text-[11px] text-[#90a5c4]">
                        Debug-only gain for local meter testing. Does not change the OS device level.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#2a4162] bg-[#0f1828] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            micStatus === 'active' ? 'default' : micStatus === 'error' ? 'destructive' : 'outline'
                          }
                        >
                          {micStatus === 'requesting'
                            ? 'Requesting mic permission...'
                            : micStatus === 'active'
                              ? 'Microphone test running'
                              : micStatus === 'error'
                                ? 'Microphone test error'
                                : 'Microphone test stopped'}
                        </Badge>
                        <span className="text-xs text-[#a9b8cf]">
                          Level: {Math.round(meterSnapshot.level * 100)}% | Peak:{' '}
                          {Math.round(meterSnapshot.peak * 100)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {micStatus === 'active' ? (
                          <Button type="button" variant="outline" onClick={() => void stopMicTest()}>
                            <Square className="size-4" />
                            Stop Mic Test
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            onClick={() => void startMicTest()}
                            disabled={micStatus === 'requesting'}
                            className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
                          >
                            <Mic className="size-4" />
                            {micStatus === 'requesting' ? 'Starting...' : 'Start Mic Test'}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="relative overflow-hidden rounded-md border border-[#2a4162] bg-[radial-gradient(circle_at_20%_20%,rgba(79,141,245,0.12),transparent_55%),linear-gradient(180deg,#09101b_0%,#111b2b_100%)] px-2 py-4">
                        <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,rgba(140,169,211,0.08)_1px,transparent_1px)] [background-size:10px_100%]" />
                        <div className="relative flex h-28 items-end gap-[3px]">
                          {meterSnapshot.bars.map((barLevel, index) => {
                            const heightPercent = Math.max(8, Math.round(barLevel * 100));
                            const isHot = barLevel >= 0.75;
                            const isWarm = barLevel >= 0.45 && barLevel < 0.75;

                            return (
                              <div
                                key={index}
                                className="flex-1 rounded-t-sm transition-[height,background-color] duration-75 ease-out"
                                style={{
                                  height: `${heightPercent}%`,
                                  backgroundColor: isHot
                                    ? 'rgba(248, 113, 113, 0.95)'
                                    : isWarm
                                      ? 'rgba(251, 191, 36, 0.95)'
                                      : 'rgba(99, 179, 255, 0.95)',
                                  boxShadow:
                                    micStatus === 'active'
                                      ? '0 0 10px rgba(99, 179, 255, 0.18)'
                                      : 'none',
                                }}
                                aria-hidden="true"
                              />
                            );
                          })}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#96abc8]">
                        <span>Speak normally to confirm live response.</span>
                        <span className="text-[#6f87ab]">|</span>
                        <span>
                          {micConnected
                            ? micResponsive
                              ? 'Signal is moving.'
                              : 'Mic connected. Waiting for signal.'
                            : 'Start the mic test to request device access.'}
                        </span>
                      </div>
                    </div>

                    {micError && <p className="mt-3 text-sm text-red-300">{micError}</p>}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-[#263a58] bg-[#152239] text-white">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Headphones className="size-4 text-[#a7c8ff]" />
                    Speaker Test
                  </CardTitle>
                  <CardDescription className="text-[#9fb2cf]">
                    Route a local test clip to your selected output device and adjust playback volume.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Output device</p>
                    <Select
                      value={selectedOutputDeviceId}
                      onValueChange={setSelectedOutputDeviceId}
                      disabled={!supportsOutputSelection}
                    >
                      <SelectTrigger className="w-full bg-[#0f1828] border-[#304867] text-white">
                        <SelectValue placeholder="Select speaker" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#142033] border-[#304867] text-white">
                        {outputDevices.length === 0 ? (
                          <SelectItem value="default">Default speaker</SelectItem>
                        ) : (
                          outputDevices.map((device, index) => (
                            <SelectItem key={device.deviceId} value={device.deviceId}>
                              {device.label || `Speaker ${index + 1}`}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {!supportsOutputSelection && (
                      <p className="text-[11px] text-[#90a5c4]">
                        This runtime does not support output device routing (`setSinkId`). System
                        default output will be used.
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-[#2a4162] bg-[#0f1828] p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={speakerTestPlaying ? 'default' : 'outline'}>
                          {speakerTestPlaying ? 'Speaker test playing' : 'Speaker test idle'}
                        </Badge>
                        <span className="text-xs text-[#a9b8cf] truncate max-w-[260px]">
                          File: {speakerTestAudioPath}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {speakerTestPlaying ? (
                          <Button type="button" variant="outline" onClick={stopSpeakerTest}>
                            <Square className="size-4" />
                            Stop
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            onClick={() => void playSpeakerTest()}
                            className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
                          >
                            <Play className="size-4" />
                            Test Speakers
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#a9b8cf]">
                        <span className="inline-flex items-center gap-1">
                          {speakerVolumePercent === 0 ? (
                            <VolumeX className="size-3.5" />
                          ) : (
                            <Volume2 className="size-3.5" />
                          )}
                          Speaker volume
                        </span>
                        <span>{speakerVolumePercent}%</span>
                      </div>
                      <input
                        type="range"
                        min={SPEAKER_VOLUME_MIN}
                        max={SPEAKER_VOLUME_MAX}
                        step={1}
                        value={speakerVolumePercent}
                        onChange={(event) => setSpeakerVolumePercent(Number(event.target.value))}
                        className="w-full accent-[#4f8df5]"
                        aria-label="Speaker volume"
                      />
                    </div>

                    <p className="text-[11px] text-[#90a5c4]">
                      Test clip is bundled from `src/assets/audio` so it ships with the app.
                    </p>
                    {speakerError && <p className="text-sm text-red-300">{speakerError}</p>}
                  </div>

                  {showDebugWorkflow && (
                    <div className="rounded-lg border border-dashed border-[#304867] bg-[#111a2b]/70 p-3 text-xs text-[#9fb2cf] space-y-1">
                      <p className="font-medium text-white">Debug workflow</p>
                      <p>1. Start mic test and confirm the meter reacts.</p>
                      <p>2. Adjust input volume to reproduce clipping/low-gain client issues.</p>
                      <p>3. Run speaker test and confirm output routing + volume behavior.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
