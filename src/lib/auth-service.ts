import { UserRole } from "./types";
import { clearClientUserData } from "./clear-user-data";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  studentId?: string;
  campusId?: string;
  campus?: string;
  primaryStopId?: string;
  primaryStopName?: string;
  avatarUrl?: string;
  token?: string;
  createdAt: string;
}

/**
 * Custom Auth Service — Zero Supabase Auth dependency.
 * Uses our own JWT-based API routes for all authentication.
 * Supabase is used ONLY as a database via supabaseClient.ts.
 */
class AuthService {
  private currentUser: AuthUser | null = null;
  private listeners: Set<(user: AuthUser | null) => void> = new Set();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.initPromise = this.initialize();
    }
  }

  private async initialize() {
    // 1. Try to restore from our JWT cookie session via API
    try {
      const res = await fetch("/api/auth/session", {
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          this.currentUser = data.user;
          this.saveLocalSession();
          this.notify();
        }
      } else {
        // No valid cookie session — try localStorage fallback
        this.restoreLocalSession();
      }
    } catch (e) {
      console.warn("Auth init: Session check failed, using local fallback", e);
      this.restoreLocalSession();
    }

    this.initialized = true;
  }

  // ─── Session Persistence (localStorage backup) ────────────────────

  private saveLocalSession() {
    if (typeof window === "undefined") return;
    try {
      if (this.currentUser) {
        localStorage.setItem("campusfleet_auth_user", JSON.stringify(this.currentUser));
      }
    } catch (e) {
      console.warn("Failed to save session", e);
    }
  }

  private restoreLocalSession() {
    try {
      const stored = localStorage.getItem("campusfleet_auth_user") || localStorage.getItem("campusride_auth_user");
      if (stored) {
        this.currentUser = JSON.parse(stored);
        this.notify();
      }
    } catch (e) {
      console.warn("Failed to restore session", e);
    }
  }

  private async clearLocalSession() {
    if (typeof window === "undefined") return;
    try {
      await clearClientUserData();
    } catch (e) {
      console.warn("Failed to clear session", e);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────

  public subscribe(cb: (user: AuthUser | null) => void) {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.currentUser));
  }

  public getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  public getTargetRouteForRole(role: UserRole): string {
    switch (role) {
      case "admin":
        return "/admin";
      case "transport_admin":
        return "/transport-admin";
      case "transport_manager":
        return "/transport-manager";
      case "driver":
        return "/driver";
      case "conductor":
        return "/conductor";
      case "teacher":
        return "/teacher";
      default:
        return "/portal";
    }
  }

  // ─── Auth Methods (Custom JWT — No Supabase Auth) ─────────────────

  /**
   * Sign in with Google OAuth — redirects to our API route which handles
   * the Google OAuth flow directly (no Supabase intermediary).
   */
  public async signInWithGoogle(): Promise<{ success: boolean; message: string }> {
    try {
      // Redirect to our Google OAuth API route
      window.location.href = "/api/auth/google";
      return { success: true, message: "Redirecting to Google..." };
    } catch (e: any) {
      return { success: false, message: e.message || "Google OAuth failed" };
    }
  }

  /**
   * Send a 6-digit OTP to the user's email via our custom API.
   */
  public async sendOtp(email: string): Promise<{ success: boolean; message: string; devCode?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, message: "Please enter a valid email address." };
    }

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
        signal: AbortSignal.timeout(12000),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, message: data.error || "Failed to send verification email." };
      }

      return {
        success: true,
        message: data.message || `Verification code sent to ${cleanEmail}`,
        devCode: data.devCode,
      };
    } catch (e: any) {
      return { success: false, message: e.name === "TimeoutError" ? "Verification request timed out. Please try again." : (e.message || "Failed to send verification email.") };
    }
  }

  /**
   * Verify OTP code via our custom API.
   */
  public async verifyOtp(email: string, token: string): Promise<{ success: boolean; user?: AuthUser; message: string }> {
    const cleanEmail = email.trim().toLowerCase();

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, otp: token }),
        credentials: "include",
        signal: AbortSignal.timeout(12000),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, message: data.error || "Invalid or expired code." };
      }

      if (data.user) {
        this.currentUser = data.user;
        this.saveLocalSession();
        this.notify();
        return { success: true, user: this.currentUser!, message: "Authentication successful!" };
      }

      return { success: false, message: "Verification failed. Please try again." };
    } catch (e: any) {
      return { success: false, message: e.message || "Verification failed." };
    }
  }

  /**
   * Update user profile via our API.
   */
  public async updateProfile(updates: { fullName?: string; campusId?: string; campus?: string; primaryStopId?: string }): Promise<void> {
    if (!this.currentUser) return;

    // Update local state immediately
    this.currentUser = {
      ...this.currentUser,
      fullName: updates.fullName || this.currentUser.fullName,
      campusId: updates.campusId || this.currentUser.campusId,
      campus: updates.campus || this.currentUser.campus,
    };
    this.saveLocalSession();
    this.notify();

    // Persist to server
    try {
      await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
    } catch (e) {
      console.warn("Profile update to server failed:", e);
    }
  }

  /**
   * Sign out — clears JWT cookie and local session.
   */
  public async logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.warn("Logout API call failed:", e);
    }
    this.currentUser = null;
    await this.clearLocalSession();
    this.notify();
  }

  /**
   * Update local user role and persist in session.
   */
  public updateUserRoleLocal(role: UserRole) {
    if (!this.currentUser) return;
    this.currentUser = { ...this.currentUser, role };
    this.saveLocalSession();
    this.notify();
  }

  /**
   * Re-fetches the latest session from /api/auth/session to ensure
   * server and client stay 100% in sync.
   */
  public async refreshSession() {
    try {
      const res = await fetch("/api/auth/session", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          this.currentUser = data.user;
          this.saveLocalSession();
          this.notify();
        }
      }
    } catch (e) {
      console.warn("Session refresh error:", e);
    }
  }
}

export const authService = new AuthService();
