"use client";

import React from "react";
import { XCircle, RefreshCw } from "lucide-react";

interface CancelSeatModalProps {
  isOpen: boolean;
  seatNumber?: string;
  isCancelling: boolean;
  onClose: () => void;
  onConfirmCancel: () => void;
}

export function CancelSeatModal({
  isOpen,
  seatNumber,
  isCancelling,
  onClose,
  onConfirmCancel,
}: CancelSeatModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 pb-8 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full sm:max-w-md p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Cancel Seat & Rollback
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              This action releases your reserved seat
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/50">
          <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            Your {seatNumber ? <span className="font-bold text-zinc-900 dark:text-white">Seat {seatNumber}</span> : <span className="font-bold">seat</span>} will be released back into the available pool, and today's attendance record will be rolled back.
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold transition-all cursor-pointer"
          >
            Keep Seat
          </button>
          <button
            type="button"
            onClick={onConfirmCancel}
            disabled={isCancelling}
            className="flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-md shadow-red-600/20"
          >
            {isCancelling ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Cancelling...</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                <span>Release Seat</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
