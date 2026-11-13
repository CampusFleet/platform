"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

/**
 * Dialog that is a bottom sheet on phones and a centred card on larger screens.
 * Height is capped to the dynamic viewport and the body scrolls; respects the safe area.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-[28px] sm:rounded-3xl bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200",
          className
        )}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100 dark:border-zinc-900">
            <h2 className="text-base font-black text-gray-900 dark:text-white min-w-0 truncate">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] border-t border-gray-100 dark:border-zinc-900">{footer}</div>}
      </div>
    </div>
  );
}
