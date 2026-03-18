import React, { useRef, useState } from 'react';
import { GripVertical, Hash, Plus, X } from 'lucide-react';
import { MobileSceneScaffold } from '@web-mobile/mobile/layout/MobileSceneScaffold';

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
  onReorder?: (orderedIds: string[]) => void;
}

export function MobileServerGrid({
  servers,
  onSelectServer,
  onCreateServer,
  onJoinServer,
  onReorder,
}: MobileServerGridProps) {
  const [reorderMode, setReorderMode] = useState(false);
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const startLongPress = (idx: number) => {
    if (!onReorder) return;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
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

  const indexFromPoint = (clientX: number, clientY: number): number | null => {
    const element = document.elementFromPoint(clientX, clientY);
    if (!element) return null;
    const tile = (element as HTMLElement).closest('[data-server-idx]') as HTMLElement | null;
    if (!tile) return null;
    const raw = tile.dataset['serverIdx'];
    return raw !== undefined ? Number(raw) : null;
  };

  const commitReorder = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || !onReorder) return;
    const ids = servers.map((server) => server.id);
    const [moved] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, moved);
    onReorder(ids);
  };

  return (
    <MobileSceneScaffold
      header={
        reorderMode ? (
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <p className="text-xs text-gray-400">Drag servers to reorder</p>
            <button
              type="button"
              onClick={exitReorderMode}
              className="flex items-center gap-1 text-xs text-blue-400 active:opacity-70"
            >
              <X className="h-3 w-3" />
              Done
            </button>
          </div>
        ) : undefined
      }
      body={
        <div ref={gridRef} className="grid grid-cols-4 gap-x-3 gap-y-5 p-5">
          {servers.map((server, idx) => {
            const isDragging = reorderMode && dragFromIdx === idx;
            const isDragTarget = reorderMode && dragOverIdx === idx && dragFromIdx !== idx;

            return (
              <div
                key={server.id}
                data-server-idx={idx}
                className={`group relative flex flex-col items-center gap-2 ${isDragging ? 'opacity-40' : ''}`}
              >
                <div
                  className={`flex aspect-square w-full items-center justify-center rounded-2xl border bg-[#1a2840] text-2xl font-bold text-white transition-all ${
                    isDragTarget
                      ? 'border-blue-500 ring-2 ring-blue-500/50'
                      : 'border-white/10'
                  } ${!reorderMode ? 'group-hover:bg-blue-600 group-active:scale-95' : ''}`}
                  onTouchStart={(event) => {
                    if (reorderMode) {
                      setDragFromIdx(idx);
                      event.preventDefault();
                      return;
                    }
                    startLongPress(idx);
                  }}
                  onTouchMove={(event) => {
                    if (!reorderMode) {
                      cancelLongPress();
                      return;
                    }
                    event.preventDefault();
                    const touch = event.touches[0];
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

                  {reorderMode && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-black/20">
                      <GripVertical className="h-5 w-5 text-white/60" />
                    </div>
                  )}
                </div>
                <span
                  className={`w-full break-words text-center text-[11px] leading-tight line-clamp-2 transition-colors ${
                    reorderMode ? 'text-gray-500' : 'text-gray-400 group-hover:text-white'
                  }`}
                >
                  {server.name}
                </span>
              </div>
            );
          })}

          {!reorderMode && (
            <>
              <button onClick={onCreateServer} className="group flex flex-col items-center gap-2">
                <div className="flex aspect-square w-full items-center justify-center rounded-2xl border-2 border-dashed border-white/20 bg-[#1a2840] transition-all group-hover:border-blue-400 group-hover:bg-blue-600/10 group-active:scale-95">
                  <Plus className="h-7 w-7 text-gray-500 transition-colors group-hover:text-blue-400" />
                </div>
                <span className="text-center text-[11px] leading-tight text-gray-500 transition-colors group-hover:text-gray-400">
                  Create
                </span>
              </button>

              <button onClick={onJoinServer} className="group flex flex-col items-center gap-2">
                <div className="flex aspect-square w-full items-center justify-center rounded-2xl border-2 border-dashed border-white/20 bg-[#1a2840] transition-all group-hover:border-green-400 group-hover:bg-green-600/10 group-active:scale-95">
                  <Hash className="h-7 w-7 text-gray-500 transition-colors group-hover:text-green-400" />
                </div>
                <span className="text-center text-[11px] leading-tight text-gray-500 transition-colors group-hover:text-gray-400">
                  Join
                </span>
              </button>
            </>
          )}
        </div>
      }
    />
  );
}
