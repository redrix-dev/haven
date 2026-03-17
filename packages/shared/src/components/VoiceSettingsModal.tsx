import React from "react";
import { Button } from "@shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/components/ui/dialog";
import type { VoiceSettings } from "@platform/desktop/types";

type VoiceSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: VoiceSettings;
  saving: boolean;
  error?: string | null;
  onUpdateSettings: (next: VoiceSettings) => void;
  onOpenVoiceHardwareTest?: () => void;
};

export function VoiceSettingsModal({
  open,
  onOpenChange,
  saving,
  error = null,
  onOpenVoiceHardwareTest,
}: VoiceSettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        className="max-h-[88vh] bg-[#18243a] border-[#142033] text-white md:w-[min(92vw,700px)] md:max-w-none min-h-0 flex flex-col gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0 border-b border-[#233753] px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="text-2xl font-bold text-white">
            Voice Settings
          </DialogTitle>
        </DialogHeader>

        <div className="scrollbar-inset min-h-0 flex-1 overflow-y-auto space-y-4 px-4 py-4 sm:px-6 sm:py-5">
          <div className="rounded-xl border border-[#304867] bg-[#142033] p-4 space-y-3">
            <p className="text-sm font-semibold text-white">
              In-channel voice controls
            </p>
            <p className="text-xs text-[#9fb2cf]">
              Microphone/speaker selection and transmission mode tuning now live
              in the expanded voice drawer so you can adjust them while
              connected.
            </p>
            <p className="text-[11px] text-[#90a5c4]">
              Open voice controls from a voice channel to configure open mic,
              voice activity threshold, and push-to-talk binding with live meter
              feedback.
            </p>
          </div>

          <div className="rounded-xl border border-[#304867] bg-[#142033] p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-white">Voice Testing</p>
              <p className="text-xs text-[#9fb2cf]">
                Test microphone capture, meter activity, and speaker playback
                before joining a call.
              </p>
            </div>
            <Button
              type="button"
              onClick={onOpenVoiceHardwareTest}
              disabled={saving || !onOpenVoiceHardwareTest}
              className="bg-[#3f79d8] hover:bg-[#325fae] text-white"
            >
              Open Voice Hardware Test
            </Button>
            <p className="text-[11px] text-[#90a5c4]">
              The hardware test runs locally and does not connect to a voice
              channel.
            </p>
          </div>

          {saving && (
            <p className="text-sm text-[#a9b8cf]">Saving voice settings...</p>
          )}
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>

        <DialogFooter className="shrink-0 border-t border-[#233753] px-4 py-3 sm:px-6 sm:py-4">
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
