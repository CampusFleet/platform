"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client/report-error";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, "global-error", error.digest);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <h2 style={{ fontWeight: 900 }}>Something went wrong</h2>
          <p style={{ color: "#6b7280", fontSize: 14 }}>The error has been reported.</p>
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: "10px 16px", borderRadius: 12, background: "#2563eb", color: "white", fontWeight: 700, border: 0 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
