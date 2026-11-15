"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client/report-error";

/** Shown instead of Next's blank "Application error" when a page crashes; the error is logged on the server. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, "app/error", error.digest);
  }, [error]);
  return (
    <div className="min-h-[60dvh] flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center space-y-3 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6">
        <h2 className="text-lg font-black">Something went wrong</h2>
        <p className="text-sm text-gray-500">This screen hit an error. It has been reported. Your saved details are safe.</p>
        <div className="flex gap-2 justify-center">
          <button type="button" onClick={reset} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold">Try again</button>
          <button type="button" onClick={() => window.location.reload()} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 text-sm font-bold">Reload</button>
        </div>
      </div>
    </div>
  );
}
