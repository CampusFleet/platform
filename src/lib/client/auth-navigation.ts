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
