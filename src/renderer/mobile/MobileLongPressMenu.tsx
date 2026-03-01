import React from 'react';
import { Reply, Pencil, Trash2, Flag, X } from 'lucide-react';

const PINCH_ZOOM_LONG_PRESS_THRESHOLD = 1.01;

interface MobileLongPressMenuProps {
  open: boolean;
  onClose: () => void;
  isOwnMessage: boolean;
  canManageMessages: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
}

export function MobileLongPressMenu({
  open,
  onClose,
  isOwnMessage,
  canManageMessages,
  onReply,
  onEdit,
  onDelete,
  onReport,
}: MobileLongPressMenuProps) {
  React.useEffect(() => {
    if (!open) return;

    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const handleViewportResize = () => {
      if (visualViewport.scale > PINCH_ZOOM_LONG_PRESS_THRESHOLD) {
        onClose();
      }
    };

    visualViewport.addEventListener('resize', handleViewportResize);
    return () => {
      visualViewport.removeEventListener('resize', handleViewportResize);
    };
  }, [onClose, open]);

  if (!open) return null;

  const canDelete = isOwnMessage || canManageMessages;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50 touch-auto overscroll-none"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0d1525] rounded-t-2xl border-t border-white/10">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="py-2 pb-6">
          <button
            onClick={() => { onReply(); onClose(); }}
            className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            <Reply className="w-5 h-5 text-gray-300" />
            <span className="text-white text-sm">Reply</span>
          </button>

          {isOwnMessage && (
            <button
              onClick={() => { onEdit(); onClose(); }}
              className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <Pencil className="w-5 h-5 text-gray-300" />
              <span className="text-white text-sm">Edit Message</span>
            </button>
          )}

          {canDelete && (
            <button
              onClick={() => { onDelete(); onClose(); }}
              className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <Trash2 className="w-5 h-5 text-red-400" />
              <span className="text-red-400 text-sm">Delete Message</span>
            </button>
          )}

          {!isOwnMessage && (
            <button
              onClick={() => { onReport(); onClose(); }}
              className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 active:bg-white/10 transition-colors"
            >
              <Flag className="w-5 h-5 text-gray-400" />
              <span className="text-gray-400 text-sm">Report</span>
            </button>
          )}

          <div className="mx-5 mt-2 pt-2 border-t border-white/10">
            <button
              onClick={onClose}
              className="w-full flex items-center gap-4 py-3 hover:bg-white/5 active:bg-white/10 transition-colors rounded-xl px-1"
            >
              <X className="w-5 h-5 text-gray-500" />
              <span className="text-gray-500 text-sm">Cancel</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
