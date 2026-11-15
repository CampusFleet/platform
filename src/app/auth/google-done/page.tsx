"use client";
import { useEffect } from "react";
import { AUTH_CHANNEL, replaceLocation, safeNextPath, type AuthChannelMessage } from "@/lib/client/auth-navigation";

/**
 * Last page of the Google sign-in popup. Tells the tab that opened it where to
 * go, then closes. If it can't close (opened directly, or the browser refuses),
 * it continues in this window instead.
 */
export default function GoogleDonePage() {
  useEffect(() => {
    const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
    try {
      const channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.postMessage({ type: "google-done", next } satisfies AuthChannelMessage);
      channel.close();
    } catch {
      // No BroadcastChannel: the main tab re-checks the session on focus.
    }
    window.close();
    const fallback = window.setTimeout(() => replaceLocation(next), 400);
    return () => window.clearTimeout(fallback);
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center text-sm text-gray-500">
      Signed in. You can close this window.
    </main>
  );
}
