import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ActionMenuContent } from '@/components/menus/ActionMenuContent';
import { ChevronDown, ChevronRight, Hash, Headphones, Plus, Settings } from 'lucide-react';
import { Database } from '@/types/database';
import { resolveContextMenuIntent } from '@/lib/contextMenu';
import { traceContextMenuEvent } from '@/lib/contextMenu/debugTrace';
import type { MenuActionNode } from '@/lib/contextMenu/types';

const SIDEBAR_BASE_MIN_WIDTH = 240;
const SIDEBAR_MAX_WIDTH = 640;
const SIDEBAR_WIDTH_STORAGE_KEY = 'haven:sidebar-width';

type ChannelKind = Database['public']['Enums']['channel_kind'];

type SidebarChannel = {
  id: string;
  name: string;
  kind: ChannelKind;
};

type SidebarChannelGroup = {
  id: string;
  name: string;
  channelIds: string[];
  isCollapsed: boolean;
};

interface SidebarProps {
  serverName: string;
  userName: string;
  channels: SidebarChannel[];
  channelGroups?: SidebarChannelGroup[];
  ungroupedChannelIds?: string[];
  currentChannelId: string | null;
  onChannelClick: (channelId: string) => void;
  onVoiceChannelClick?: (channelId: string) => void;
  activeVoiceChannelId?: string | null;
  voiceChannelParticipants?: Record<string, Array<{ userId: string; displayName: string }>>;
  voiceStatusPanel?: React.ReactNode;
  canManageChannels?: boolean;
  onCreateChannel?: () => void;
  onRenameChannel?: (channelId: string) => void;
  onDeleteChannel?: (channelId: string) => void;
  onOpenChannelSettings?: (channelId: string) => void;
  onAddChannelToGroup?: (channelId: string, groupId: string) => void;
  onRemoveChannelFromGroup?: (channelId: string) => void;
  onCreateChannelGroup?: (channelId?: string) => void;
  onToggleChannelGroup?: (groupId: string, isCollapsed: boolean) => void;
  onRenameChannelGroup?: (groupId: string) => void;
  onDeleteChannelGroup?: (groupId: string) => void;
  onOpenServerSettings?: () => void;
  composerHeight?: number | null;
  footerStatusActions?: React.ReactNode;
}

export function Sidebar({
  serverName,
  userName,
  channels,
  channelGroups = [],
  ungroupedChannelIds = [],
  currentChannelId,
  onChannelClick,
  onVoiceChannelClick,
  activeVoiceChannelId = null,
  voiceChannelParticipants = {},
  voiceStatusPanel,
  canManageChannels = false,
  onCreateChannel,
  onRenameChannel,
  onDeleteChannel,
  onOpenChannelSettings,
  onAddChannelToGroup,
  onRemoveChannelFromGroup,
  onCreateChannelGroup,
  onToggleChannelGroup,
  onRenameChannelGroup,
  onDeleteChannelGroup,
  onOpenServerSettings,
  composerHeight = null,
  footerStatusActions,
}: SidebarProps) {
  const sidebarRef = React.useRef<HTMLDivElement | null>(null);
  const serverNameRef = React.useRef<HTMLSpanElement | null>(null);

  const [autoMinWidth, setAutoMinWidth] = React.useState(SIDEBAR_BASE_MIN_WIDTH);
  const [isResizing, setIsResizing] = React.useState(false);
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(() => {
    if (typeof window === 'undefined') return SIDEBAR_BASE_MIN_WIDTH;
    const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    if (!Number.isFinite(stored) || stored <= 0) return SIDEBAR_BASE_MIN_WIDTH;
    return Math.max(SIDEBAR_BASE_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, stored));
  });

  const computedMinWidth = React.useMemo(
    () => Math.max(SIDEBAR_BASE_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, autoMinWidth)),
    [autoMinWidth]
  );
  const linkedComposerHeight = React.useMemo(() => {
    if (!composerHeight || composerHeight <= 0) return null;
    // MessageInput measurement includes its top border; sidebar wrapper has its own top border.
    // Subtract one pixel so the visual content area aligns exactly.
    return Math.max(0, Math.ceil(composerHeight) - 1);
  }, [composerHeight]);

  const clampSidebarWidth = React.useCallback(
    (value: number) => Math.max(computedMinWidth, Math.min(SIDEBAR_MAX_WIDTH, value)),
    [computedMinWidth]
  );

  React.useLayoutEffect(() => {
    const measure = () => {
      const nextServerNameWidth = serverNameRef.current?.scrollWidth ?? 0;
      const reservedHeaderWidth = 120;
      setAutoMinWidth(Math.ceil(nextServerNameWidth + reservedHeaderWidth));
    };

    measure();

    if (typeof ResizeObserver === 'undefined' || !serverNameRef.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(serverNameRef.current);

    return () => observer.disconnect();
  }, [serverName]);

  React.useEffect(() => {
    if (sidebarWidth >= computedMinWidth) return;
    setSidebarWidth(computedMinWidth);
  }, [computedMinWidth, sidebarWidth]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const handleResizePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizing(true);
  }, []);

  const handleResizePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizing || !sidebarRef.current) return;
      const sidebarLeft = sidebarRef.current.getBoundingClientRect().left;
      const nextWidth = clampSidebarWidth(event.clientX - sidebarLeft);
      setSidebarWidth(nextWidth);
    },
    [clampSidebarWidth, isResizing]
  );

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  const channelsById = React.useMemo(
    () => new Map(channels.map((channel) => [channel.id, channel])),
    [channels]
  );

  const groupedChannelIds = React.useMemo(() => {
    const next = new Set<string>();
    for (const group of channelGroups) {
      for (const channelId of group.channelIds) {
        next.add(channelId);
      }
    }
    return next;
  }, [channelGroups]);

  const orderedUngroupedChannels = React.useMemo(() => {
    const ungroupedOrder = new Map(
      ungroupedChannelIds.map((channelId, index) => [channelId, index])
    );
    const ungroupedChannels = channels.filter((channel) => !groupedChannelIds.has(channel.id));
    return ungroupedChannels.sort((left, right) => {
      const leftOrder = ungroupedOrder.get(left.id);
      const rightOrder = ungroupedOrder.get(right.id);
      if (typeof leftOrder === 'number' && typeof rightOrder === 'number') {
        return leftOrder - rightOrder;
      }
      if (typeof leftOrder === 'number') return -1;
      if (typeof rightOrder === 'number') return 1;
      return 0;
    });
  }, [channels, groupedChannelIds, ungroupedChannelIds]);

  const renderChannelButton = (channel: SidebarChannel) => {
    const isVoiceChannel = channel.kind === 'voice';
    const isActive =
      activeVoiceChannelId === channel.id || currentChannelId === channel.id;
    const assignedGroup =
      channelGroups.find((group) => group.channelIds.includes(channel.id)) ?? null;

    const button = (
      <Button
        type="button"
        variant="ghost"
        onClick={() =>
          isVoiceChannel
            ? onVoiceChannelClick
              ? onVoiceChannelClick(channel.id)
              : onChannelClick(channel.id)
            : onChannelClick(channel.id)
        }
        className={`w-full px-2 py-1.5 rounded text-left text-sm transition-colors justify-start ${
          isActive
            ? 'bg-[#3f79d8] text-white'
            : 'text-[#95a5bf] hover:bg-[#22334f] hover:text-[#e6edf7]'
        }`}
      >
        {isVoiceChannel ? <Headphones className="size-4" /> : <Hash className="size-4" />}
        <span>{channel.name}</span>
      </Button>
    );

    const participantsRow =
      isVoiceChannel &&
      voiceChannelParticipants[channel.id] &&
      voiceChannelParticipants[channel.id].length > 0 ? (
        <div className="px-2 pt-1 flex items-center gap-1">
          {voiceChannelParticipants[channel.id].slice(0, 4).map((participant) => {
            const initial = participant.displayName.trim().charAt(0).toUpperCase() || '?';
            return (
              <Tooltip key={participant.userId}>
                <TooltipTrigger asChild>
                  <span className="size-5 rounded-full bg-[#304867] text-[10px] text-white font-semibold flex items-center justify-center">
                    {initial}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={6}>
                  {participant.displayName}
                </TooltipContent>
              </Tooltip>
            );
          })}
          {voiceChannelParticipants[channel.id].length > 4 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="size-5 rounded-full bg-[#22334f] text-[10px] text-[#d1dff4] font-semibold flex items-center justify-center">
                  ...
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={6}>
                {voiceChannelParticipants[channel.id]
                  .map((participant) => participant.displayName)
                  .join(', ')}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      ) : null;

    const addToGroupItems: MenuActionNode[] =
      channelGroups.length === 0
        ? [
            {
              kind: 'item',
              key: `group-empty-${channel.id}`,
              label: 'No groups available',
              disabled: true,
              onSelect: () => undefined,
            },
          ]
        : channelGroups.map((group) => ({
            kind: 'item',
            key: `group-${group.id}`,
            label: group.name,
            disabled: !canManageChannels || !onAddChannelToGroup,
            onSelect: () => onAddChannelToGroup?.(channel.id, group.id),
          }));

    const channelActions: MenuActionNode[] = [
      {
        kind: 'item',
        key: 'rename-channel',
        label: 'Rename Channel',
        disabled: !canManageChannels || !onRenameChannel,
        onSelect: () => onRenameChannel?.(channel.id),
      },
      {
        kind: 'item',
        key: 'delete-channel',
        label: 'Delete Channel',
        destructive: true,
        disabled: !canManageChannels || !onDeleteChannel,
        onSelect: () => onDeleteChannel?.(channel.id),
      },
      {
        kind: 'submenu',
        key: 'add-to-group',
        label: 'Add To Group',
        disabled: !canManageChannels || !onAddChannelToGroup,
        items: addToGroupItems,
      },
      {
        kind: 'item',
        key: 'remove-from-group',
        label: 'Remove From Group',
        disabled: !canManageChannels || !onRemoveChannelFromGroup || !assignedGroup,
        onSelect: () => onRemoveChannelFromGroup?.(channel.id),
      },
      {
        kind: 'item',
        key: 'create-group',
        label: 'Create Group',
        disabled: !canManageChannels || !onCreateChannelGroup,
        onSelect: () => onCreateChannelGroup?.(channel.id),
      },
      {
        kind: 'separator',
        key: 'channel-separator-settings',
      },
      {
        kind: 'item',
        key: 'channel-settings',
        label: 'Open Channel Settings',
        disabled: !canManageChannels || !onOpenChannelSettings,
        onSelect: () => onOpenChannelSettings?.(channel.id),
      },
    ];

    return (
      <ContextMenu
        key={channel.id}
        onOpenChange={(nextOpen) => {
          traceContextMenuEvent('channel', 'open-change', { channelId: channel.id, open: nextOpen });
        }}
      >
        <ContextMenuTrigger
          asChild
          onContextMenuCapture={(event) => {
            const intent = resolveContextMenuIntent(event.target);
            traceContextMenuEvent('channel', 'contextmenu-trigger', { channelId: channel.id, intent });
            if (intent === 'native_text') {
              event.stopPropagation();
            }
          }}
        >
          <div className="mb-1" data-menu-scope="channel">
            <div data-channel-entity-surface="true">
              {button}
              {participantsRow}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-[#18243a] border-[#304867] text-white">
          <ActionMenuContent mode="context" scope="channel" actions={channelActions} />
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderChannelGroupSection = (group: SidebarChannelGroup) => {
    const groupedChannels = group.channelIds
      .map((channelId) => channelsById.get(channelId))
      .filter((channel): channel is SidebarChannel => Boolean(channel));

    const groupActions: MenuActionNode[] = [
      {
        kind: 'item',
        key: `rename-group-${group.id}`,
        label: 'Rename Group',
        disabled: !canManageChannels || !onRenameChannelGroup,
        onSelect: () => onRenameChannelGroup?.(group.id),
      },
      {
        kind: 'item',
        key: `delete-group-${group.id}`,
        label: 'Delete Group',
        destructive: true,
        disabled: !canManageChannels || !onDeleteChannelGroup,
        onSelect: () => onDeleteChannelGroup?.(group.id),
      },
    ];

    return (
      <div key={group.id} className="mb-3">
        <ContextMenu
          onOpenChange={(nextOpen) => {
            traceContextMenuEvent('channel', 'group-open-change', { groupId: group.id, open: nextOpen });
          }}
        >
          <ContextMenuTrigger
            asChild
            onContextMenuCapture={(event) => {
              const intent = resolveContextMenuIntent(event.target);
              traceContextMenuEvent('channel', 'group-contextmenu-trigger', { groupId: group.id, intent });
              if (intent === 'native_text') {
                event.stopPropagation();
              }
            }}
          >
            <button
              data-channel-entity-surface="true"
              data-menu-scope="channel"
              type="button"
              onClick={() => onToggleChannelGroup?.(group.id, !group.isCollapsed)}
              className="w-full px-2 pb-1 text-left text-[10px] uppercase tracking-wide font-semibold text-[#7f90ac] hover:text-[#c8d5ea] inline-flex items-center gap-1"
            >
              {group.isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
              <span className="truncate">{group.name}</span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="bg-[#18243a] border-[#304867] text-white">
            <ActionMenuContent mode="context" scope="channel" actions={groupActions} />
          </ContextMenuContent>
        </ContextMenu>
        {!group.isCollapsed && groupedChannels.map(renderChannelButton)}
      </div>
    );
  };

  const hasAnyGroups = channelGroups.length > 0;

  const viewportActions = React.useMemo<MenuActionNode[]>(
    () => [
      {
        kind: 'item',
        key: 'viewport-add-channel',
        label: 'Add Channel',
        disabled: !onCreateChannel,
        onSelect: () => onCreateChannel?.(),
      },
      {
        kind: 'item',
        key: 'viewport-create-group',
        label: 'Create Group',
        disabled: !canManageChannels || !onCreateChannelGroup,
        onSelect: () => onCreateChannelGroup?.(),
      },
    ],
    [canManageChannels, onCreateChannel, onCreateChannelGroup]
  );

  return (
    <div
      ref={sidebarRef}
      className={`relative shrink-0 bg-[#1c2a43] flex flex-col ${isResizing ? 'select-none' : ''}`}
      style={{
        width: `${sidebarWidth}px`,
        minWidth: `${computedMinWidth}px`,
        maxWidth: `${SIDEBAR_MAX_WIDTH}px`,
      }}
    >
      <div className="h-12 px-3 flex items-center justify-between font-semibold text-white border-b border-[#263a58]">
        <span ref={serverNameRef} className="min-w-0 whitespace-nowrap pr-2">
          {serverName}
        </span>
        <div className="flex items-center gap-1">
          {onCreateChannel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onCreateChannel}
                  className="text-[#a9b8cf] hover:text-white hover:bg-[#304867]"
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                Create channel
              </TooltipContent>
            </Tooltip>
          )}
          {onOpenServerSettings && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onOpenServerSettings}
                  className="text-[#a9b8cf] hover:text-white hover:bg-[#304867]"
                >
                  <Settings className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8}>
                Server settings
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <ContextMenu
        onOpenChange={(nextOpen) => {
          traceContextMenuEvent('channel', 'viewport-open-change', { open: nextOpen });
        }}
      >
        <ContextMenuTrigger
          asChild
          onContextMenuCapture={(event) => {
            const target = event.target instanceof Element ? event.target : null;
            const intent = resolveContextMenuIntent(event.target);
            const isEntitySurface = Boolean(target?.closest('[data-channel-entity-surface="true"]'));

            traceContextMenuEvent('channel', 'viewport-contextmenu-trigger', {
              intent,
              isEntitySurface,
            });

            if (intent === 'native_text') {
              event.stopPropagation();
            }
          }}
        >
          <ScrollArea className="flex-1">
            <div className="p-2">
              {channelGroups.map(renderChannelGroupSection)}

              {(orderedUngroupedChannels.length > 0 || !hasAnyGroups) && (
                <div className="mb-3">
                  <p className="px-2 pb-1 text-[10px] uppercase tracking-wide font-semibold text-[#7f90ac]">
                    {hasAnyGroups ? 'Ungrouped Channels' : 'Channels'}
                  </p>
                  {orderedUngroupedChannels.map(renderChannelButton)}
                </div>
              )}
            </div>
          </ScrollArea>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-[#18243a] border-[#304867] text-white">
          <ActionMenuContent mode="context" scope="channel" actions={viewportActions} />
        </ContextMenuContent>
      </ContextMenu>

      <div className="bg-[#172338] border-t border-[#263a58]" data-component="sidebar">
        {voiceStatusPanel}
        <div
          className="px-4 pt-[11px] pb-[13px] flex items-start justify-between gap-2"
          style={linkedComposerHeight ? { minHeight: `${linkedComposerHeight}px` } : undefined}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white leading-5 truncate">{userName}</p>
            <p className="text-xs text-[#44b894] leading-4">Online</p>
          </div>
          {footerStatusActions ? <div className="flex items-center gap-1">{footerStatusActions}</div> : null}
        </div>
      </div>

      <div
        role="separator"
        aria-label="Resize Sidebar"
        aria-orientation="vertical"
        className={`absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize ${
          isResizing ? 'bg-[#3f79d8]/40' : 'bg-transparent hover:bg-[#3f79d8]/20'
        }`}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          stopResizing();
        }}
        onPointerCancel={stopResizing}
        onLostPointerCapture={stopResizing}
      />
    </div>
  );
}
