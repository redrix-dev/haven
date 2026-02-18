import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/shared/lib/errors';

interface MessageInputProps {
  onSendMessage: (content: string, options?: { replyToMessageId?: string }) => Promise<void>;
  onSendHavenDeveloperMessage?: (content: string) => Promise<void>;
  channelName: string;
  replyTarget?: {
    id: string;
    authorLabel: string;
    preview: string;
  } | null;
  onClearReplyTarget?: () => void;
}

export function MessageInput({
  onSendMessage,
  onSendHavenDeveloperMessage,
  channelName,
  replyTarget = null,
  onClearReplyTarget,
}: MessageInputProps) {
  const [input, setInput] = useState('');
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [sendingMode, setSendingMode] = useState<'user' | 'haven_dev' | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!onSendHavenDeveloperMessage && isDeveloperMode) {
      setIsDeveloperMode(false);
    }
  }, [isDeveloperMode, onSendHavenDeveloperMessage]);

  const runCommand = (content: string) => {
    const command = content.trim().toLowerCase();

    if (command === '#dev' || command === '/dev') {
      if (!onSendHavenDeveloperMessage) {
        setSendError('You do not have permission to use Haven developer messaging here.');
        return true;
      }
      setIsDeveloperMode(true);
      setSendError(null);
      setInput('');
      return true;
    }

    if (command === '#devoff' || command === '/devoff') {
      setIsDeveloperMode(false);
      setSendError(null);
      setInput('');
      return true;
    }

    return false;
  };

  const handleSubmit = async () => {
    const content = input.trim();
    if (!content || sendingMode) return;

    if (runCommand(content)) return;

    const mode: 'user' | 'haven_dev' =
      isDeveloperMode && onSendHavenDeveloperMessage ? 'haven_dev' : 'user';

    setSendingMode(mode);
    setSendError(null);

    try {
      if (mode === 'haven_dev') {
        if (!onSendHavenDeveloperMessage) {
          throw new Error('Haven developer messaging is unavailable in this channel.');
        }
        await onSendHavenDeveloperMessage(content);
      } else {
        await onSendMessage(content, {
          replyToMessageId: replyTarget?.id,
        });
      }
      setInput('');
      onClearReplyTarget?.();
    } catch (error: unknown) {
      console.error('Failed to send message:', error);
      setSendError(getErrorMessage(error, 'Failed to send message.'));
    } finally {
      setSendingMode(null);
    }
  };

  return (
    <div className="p-4 space-y-2">
      {replyTarget && (
        <div className="rounded-md border border-[#304867] bg-[#142033] px-3 py-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-[#a9b8cf]">Replying to {replyTarget.authorLabel}</p>
            <p className="text-xs text-[#d2dcef] truncate">{replyTarget.preview}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearReplyTarget}
            className="text-[#a9b8cf] hover:text-white"
          >
            Cancel
          </Button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={
            isDeveloperMode
              ? `Haven Developer mode in #${channelName}`
              : `Message #${channelName}`
          }
          className="bg-[#243754] border-none text-[#e6edf7] placeholder:text-[#8897b1]"
        />
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!input.trim() || sendingMode !== null}
          className={
            isDeveloperMode
              ? 'bg-[#d6a24a] hover:bg-[#d89f2c] text-[#142033]'
              : 'bg-[#3f79d8] hover:bg-[#325fae] text-white'
          }
        >
          {sendingMode !== null
            ? 'Sending...'
            : isDeveloperMode
              ? 'Send as Haven Dev'
              : 'Send'}
        </Button>
      </div>
      {onSendHavenDeveloperMessage && !isDeveloperMode && (
        <p className="text-xs text-[#a9b8cf]">Type `#dev` to enable Haven developer mode.</p>
      )}
      {isDeveloperMode && (
        <p className="text-xs text-[#d6a24a]">
          Haven developer mode enabled. Type `#devoff` to return to normal messaging.
        </p>
      )}
      {sendError && <p className="text-xs text-[#f87171]">{sendError}</p>}
    </div>
  );
}

