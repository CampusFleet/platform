"use client";

import React, { useEffect, useRef } from "react";
import {
  CornerUpLeft,
  Share2,
  CheckSquare,
  Pin,
  Star,
  Copy,
  Trash2,
} from "lucide-react";

export const EMOJI_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface MessageActionsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onForward?: () => void;
  onSelect?: () => void;
  onPin?: () => void;
  onStar?: () => void;
  onCopy: () => void;
  onDelete?: () => void;
  isMe?: boolean;
}

export function MessageActionsMenu({
  isOpen,
  onClose,
  onReact,
  onReply,
  onForward,
  onSelect,
  onPin,
  onStar,
  onCopy,
  onDelete,
  isMe,
}: MessageActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 z-40 w-48 bg-white dark:bg-gray-850 rounded-2xl shadow-xl border border-gray-150 dark:border-gray-800 p-1.5 animate-in fade-in zoom-in-95 duration-100 text-left select-none"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Emoji Quick Reaction Bar (Matching Screenshot 5) */}
      <div className="flex items-center justify-between px-2 py-1.5 pb-2 mb-1 border-b border-gray-100 dark:border-gray-800">
        {EMOJI_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onReact(emoji);
              onClose();
            }}
            className="text-base hover:scale-125 transition-transform p-0.5 cursor-pointer"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Menu Actions */}
      <div className="space-y-0.5">
        <button
          type="button"
          onClick={() => {
            onReply();
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <CornerUpLeft className="w-3.5 h-3.5 text-gray-500" />
          <span>Reply</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onForward?.();
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5 text-gray-500" />
          <span>Forward</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onSelect?.();
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <CheckSquare className="w-3.5 h-3.5 text-gray-500" />
          <span>Select</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onPin?.();
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <Pin className="w-3.5 h-3.5 text-gray-500" />
          <span>Pin message</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onStar?.();
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <Star className="w-3.5 h-3.5 text-gray-500" />
          <span>Star message</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onCopy();
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <Copy className="w-3.5 h-3.5 text-gray-500" />
          <span>Copy</span>
        </button>

        {onDelete && (
          <button
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isMe ? "Delete" : "Delete for me"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
