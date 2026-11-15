/**
 * Browser navigation around sign-in and sign-out.
 *
 * Both directions use `location.replace` so the page being left is removed from
 * the history stack: Back after sign-in never lands on /login, and Back after
 * sign-out never shows a cached portal page.
 */
import type { UserRole } from "@/lib/types";

const ROLE_HOME: Record<string, string> = {
  admin: "/admin",
  transport_admin: "/transport-admin",
  transport_manager: "/transport-manager",
  driver: "/driver",
  conductor: "/conductor",
  teacher: "/teacher",
};

export function homeForRole(role: UserRole | string | null | undefined): string {
  return (role && ROLE_HOME[role]) || "/portal";
}

/** Leave the current page without keeping it in history (full page load). */
export function replaceLocation(target: string): void {
  window.location.replace(target);
}

/**
 * Ask the server whether this browser has a session. If it does, swap the
 * current page (the login page) for the role's home. Returns true when it
 * redirected.
 */
export async function redirectIfSignedIn(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json()) as { user?: { role?: string } | null };
    if (!body.user) return false;
    replaceLocation(homeForRole(body.user.role));
    return true;
  } catch {
    return false;
  }
}

// ─── Google sign-in in a popup ────────────────────────────────────────────
// A full-page redirect leaves Google's account chooser in this tab's history,
// so Back from the portal lands on it. Opening Google in a popup keeps the
// main tab's history clean. The popup ends on /auth/google-done, which
// announces the result on a BroadcastChannel (window.opener is cut by
// Google's Cross-Origin-Opener-Policy) and closes itself.

export const AUTH_CHANNEL = "campusfleet-auth";
export type AuthChannelMessage = { type: "google-done"; next: string };

/** Only same-site paths, so a crafted `next` can't send anyone off-site. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/login";
  return next;
}

function isStandaloneApp(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Start Google sign-in. Uses a popup when possible; falls back to a full-page
 * redirect when the popup is blocked or in the installed app (where a popup
 * may open a separate browser without our cookie).
 * Returns "popup" while the popup is open, or "redirect".
 */
export function startGoogleSignIn(): "popup" | "redirect" {
  if (!isStandaloneApp() && typeof BroadcastChannel !== "undefined") {
    const w = 480;
    const h = 640;
    const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - h) / 2);
    const popup = window.open(
      "/api/auth/google?mode=popup",
      "campusfleet-google",
      `popup=yes,width=${w},height=${h},left=${left},top=${top}`
    );
    if (popup) {
      listenForPopupSignIn();
      return "popup";
    }
  }
  replaceLocation("/api/auth/google");
  return "redirect";
}

let listening = false;
function listenForPopupSignIn(): void {
  if (listening) return;
  listening = true;
  const channel = new BroadcastChannel(AUTH_CHANNEL);
  channel.onmessage = (event: MessageEvent<AuthChannelMessage>) => {
    if (event.data?.type !== "google-done") return;
    channel.close();
    listening = false;
    replaceLocation(safeNextPath(event.data.next));
  };
  // Backup if the message is missed: when the user comes back to this tab,
  // ask the server whether the popup finished signing in.
  const onFocus = () => {
    void redirectIfSignedIn().then((done) => {
      if (done) window.removeEventListener("focus", onFocus);
    });
  };
  window.addEventListener("focus", onFocus);
}
