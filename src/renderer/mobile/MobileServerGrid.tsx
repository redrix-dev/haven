import React from 'react';
import { Plus, Hash } from 'lucide-react';

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
}

export function MobileServerGrid({
  servers,
  onSelectServer,
  onCreateServer,
  onJoinServer,
}: MobileServerGridProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-5 grid grid-cols-4 gap-x-3 gap-y-5">
        {servers.map((server) => (
          <button
            key={server.id}
            onClick={() => onSelectServer(server.id)}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-full aspect-square rounded-2xl bg-[#1a2840] border border-white/10 flex items-center justify-center text-white font-bold text-2xl group-hover:bg-blue-600 group-active:scale-95 transition-all">
              {server.icon ? (
                <span className="text-2xl leading-none">{server.icon}</span>
              ) : (
                <span className="text-xl font-bold leading-none">
                  {server.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <span className="text-gray-400 text-[11px] text-center leading-tight line-clamp-2 group-hover:text-white transition-colors w-full break-words">
              {server.name}
            </span>
          </button>
        ))}

        {/* Create server */}
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

        {/* Join server */}
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
      </div>
    </div>
  );
}
