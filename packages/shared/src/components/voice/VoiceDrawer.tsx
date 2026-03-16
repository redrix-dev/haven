import React from 'react';
import { Headphones, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { Button } from '@shared/components/ui/button';

type VoiceDrawerProps = {
  channelName: string;
  serverName: string;
  connected: boolean;
  joined: boolean;
  muted: boolean;
  onNavigateToChannel: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onOpenAdvanced: () => void;
};

export function VoiceDrawer(props: VoiceDrawerProps) {
  return (
    <div className="px-2 pt-2 pb-1 border-b border-[#22334f]">
      <div className="rounded-md border border-[#304867] bg-[#142033] px-2 py-2 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <button type="button" className="min-w-0 text-left" onClick={props.onNavigateToChannel}>
            <p className="text-[11px] uppercase tracking-wide text-[#8ea4c7]">Voice Connected</p>
            <p className="text-xs font-semibold text-white truncate flex items-center gap-1">
              <Headphones className="size-3.5" />
              {props.channelName}
            </p>
            <p className="text-[11px] text-[#95a5bf] truncate">{props.serverName}</p>
          </button>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${props.connected ? 'bg-[#2f9f73]/20 text-[#6dd5a6]' : 'bg-[#44546f]/40 text-[#b5c4de]'}`}>
            {props.connected ? 'Live' : 'Connecting'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!props.joined ? (
            <Button type="button" size="icon-xs" variant="ghost" onClick={props.onJoin}><Headphones className="size-4" /></Button>
          ) : (
            <>
              <Button type="button" size="icon-xs" variant="ghost" onClick={props.onToggleMute}>{props.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}</Button>
              <Button type="button" size="icon-xs" variant="ghost" onClick={props.onToggleDeafen}><Volume2 className="size-4" /></Button>
              <Button type="button" size="icon-xs" variant="ghost" onClick={props.onLeave}><PhoneOff className="size-4" /></Button>
            </>
          )}
          <Button type="button" size="sm" variant="outline" onClick={props.onOpenAdvanced}>Advanced</Button>
        </div>
      </div>
    </div>
  );
}
