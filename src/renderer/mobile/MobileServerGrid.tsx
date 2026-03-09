import React, { useState, useRef } from 'react';
import { Plus, Hash, GripVertical, X } from 'lucide-react';

interface Server {
  id: string;
  name: string;
  icon?: string;
}

interface MobileServerGridProps {
  servers: Server[];
  onSelectServer: (id: string) => void;
  onCreateServer: () => void;
  onJoinServer: () => void;
  /** Called with new ordered IDs after user drag-reorders the grid. */
  onReorder?: (orderedIds: string[]) => void;
}

export function MobileServerGrid({
  servers,
  onSelectServer,
  onCreateServer,
  onJoinServer,
  onReorder,
}: MobileServerGridProps) {
  // Reorder mode (entered via long-press on any server tile)
  const [reorderMode, setReorderMode] = useState(false);
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Ref to the grid container for hit-testing during touch moves
  const gridRef = useRef<HTMLDivElement | null>(null);

  const longPressTimerRef = useRef<number | null>(null);

  const startLongPress = (idx: number) => {
    if (!onReorder) return;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      // Haptic if available
      if ('vibrate' in navigator) navigator.vibrate(30);
      setReorderMode(true);
      setDragFromIdx(idx);
    }, 450);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const exitReorderMode = () => {
    setReorderMode(false);
    setDragFromIdx(null);
    setDragOverIdx(null);
  };

  /** Finds which grid item index is under a touch point */
  const indexFromPoint = (clientX: number, clientY: number): number | null => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const tile = (el as HTMLElement).closest('[data-server-idx]') as HTMLElement | null;
    if (!tile) return null;
    const raw = tile.dataset['serverIdx'];
    return raw !== undefined ? Number(raw) : null;
  };

  const commitReorder = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || !onReorder) return;
    const ids = servers.map((s) => s.id);
    const [moved] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, moved);
    onReorder(ids);
  };

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain">
      {reorderMode && (
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <p className="text-xs text-gray-400">Drag servers to reorder</p>
          <button
            type="button"
            onClick={exitReorderMode}
            className="flex items-center gap-1 text-xs text-blue-400 active:opacity-70"
          >
            <X className="w-3 h-3" />
            Done
          </button>
        </div>
      )}

      <div ref={gridRef} className="p-5 grid grid-cols-4 gap-x-3 gap-y-5">
        {servers.map((server, idx) => {
          const isDragging = reorderMode && dragFromIdx === idx;
          const isDragTarget = reorderMode && dragOverIdx === idx && dragFromIdx !== idx;

          return (
            <div
              key={server.id}
              data-server-idx={idx}
              className={`flex flex-col items-center gap-2 group relative ${isDragging ? 'opacity-40' : ''}`}
            >
              <div
                className={`w-full aspect-square rounded-2xl bg-[#1a2840] border flex items-center justify-center text-white font-bold text-2xl transition-all
                  ${isDragTarget
                    ? 'border-blue-500 ring-2 ring-blue-500/50'
                    : 'border-white/10'}
                  ${!reorderMode ? 'group-hover:bg-blue-600 group-active:scale-95' : ''}
                `}
                onTouchStart={(e) => {
                  if (reorderMode) {
                    // Already in reorder mode — start dragging this item
                    setDragFromIdx(idx);
                    e.preventDefault();
                    return;
                  }
                  startLongPress(idx);
                }}
                onTouchMove={(e) => {
                  if (!reorderMode) {
                    cancelLongPress();
                    return;
                  }
                  e.preventDefault();
                  const touch = e.touches[0];
                  if (!touch) return;
                  const overIdx = indexFromPoint(touch.clientX, touch.clientY);
                  if (overIdx !== null && overIdx !== dragOverIdx) {
                    setDragOverIdx(overIdx);
                  }
                }}
                onTouchEnd={() => {
                  cancelLongPress();
                  if (reorderMode && dragFromIdx !== null && dragOverIdx !== null) {
                    commitReorder(dragFromIdx, dragOverIdx);
                    setDragFromIdx(null);
                    setDragOverIdx(null);
                  }
                }}
                onTouchCancel={() => {
                  cancelLongPress();
                  setDragFromIdx(null);
                  setDragOverIdx(null);
                }}
                onClick={() => {
                  if (!reorderMode) {
                    onSelectServer(server.id);
                  }
                }}
              >
                {server.icon ? (
                  <span className="text-2xl leading-none">{server.icon}</span>
                ) : (
                  <span className="text-xl font-bold leading-none">
                    {server.name.charAt(0).toUpperCase()}
                  </span>
                )}

                {/* Reorder mode handle overlay */}
                {reorderMode && (
                  <div className="absolute inset-0 rounded-2xl flex items-center justify-center bg-black/20 pointer-events-none">
                    <GripVertical className="w-5 h-5 text-white/60" />
                  </div>
                )}
              </div>
              <span className={`text-[11px] text-center leading-tight line-clamp-2 w-full break-words transition-colors ${reorderMode ? 'text-gray-500' : 'text-gray-400 group-hover:text-white'}`}>
                {server.name}
              </span>
            </div>
          );
        })}

        {/* These action tiles are hidden during reorder mode */}
        {!reorderMode && (
          <>
            <button
              onClick={onCreateServer}
              className="flex flex-col items-center gap-2 group"
            >
              <div className="w-full aspect-square rounded-2xl bg-[#1a2840] border-2 border-dashed border-white/20 flex items-center justify-center group-hover:border-blue-400 group-hover:bg-blue-600/10 group-active:scale-95 transition-all">
                <Plus className="w-7 h-7 text-gray-500 group-hover:text-blue-400 transition-colors" />
              </div>
              <span className="text-gray-500 text-[11px] text-center leading-tight group-hover:text-gray-400 transition-colors">
                Create
              </span>
            </button>

            <button
              onClick={onJoinServer}
              className="flex flex-col items-center gap-2 group"
            >
              <div className="w-full aspect-square rounded-2xl bg-[#1a2840] border-2 border-dashed border-white/20 flex items-center justify-center group-hover:border-green-400 group-hover:bg-green-600/10 group-active:scale-95 transition-all">
                <Hash className="w-7 h-7 text-gray-500 group-hover:text-green-400 transition-colors" />
              </div>
              <span className="text-gray-500 text-[11px] text-center leading-tight group-hover:text-gray-400 transition-colors">
                Join
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
