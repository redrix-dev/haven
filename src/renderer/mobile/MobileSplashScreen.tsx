import React from 'react';
import { Loader2 } from 'lucide-react';

export function MobileSplashScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#111a2b] gap-6">
      <img
        src="/icon-192.png"
        alt="Haven"
        className="w-20 h-20 rounded-2xl shadow-lg"
      />
      <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
    </div>
  );
}
