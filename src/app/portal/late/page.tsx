"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Hand, RefreshCw, ArrowRight } from "lucide-react";

export default function RunningLatePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/portal/radar?action=sos");
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-xl text-center space-y-5 animate-in fade-in duration-300">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto shadow-inner">
          <Hand className="w-8 h-8 animate-bounce text-rose-600" />
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-black text-zinc-900 dark:text-white">
            Opening Live Radar & Bus Hold
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Emergency 2-minute hold request has been consolidated directly into the Full-Screen Live Radar map.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs font-mono text-zinc-400">
          <RefreshCw className="w-4 h-4 animate-spin text-rose-500" />
          <span>Redirecting to Live Radar...</span>
        </div>

        <Link
          href="/portal/radar?action=sos"
          className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg transition-all active:scale-95"
        >
          <span>Go to Live Radar & Hold Bus Now</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
