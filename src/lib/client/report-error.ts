/** Sends a browser error to /api/client-errors (server log). Never throws. */
export function reportClientError(error: unknown, where: string, digest?: string) {
  try {
    const e = error as { message?: string; stack?: string };
    const body = JSON.stringify({
      message: e?.message || String(error),
      stack: e?.stack,
      digest,
      where,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/client-errors", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    }
  } catch {
    /* ignore */
  }
}
