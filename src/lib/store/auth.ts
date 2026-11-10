import { CampusFleetStore } from "./_base";
import { authService } from "../auth-service";
import { createUserId, createStudentId } from "../id";
import type { UserRole } from "../types";

// ── Module Augmentation ─────────────────────────────────────────────────────
declare module "./_base" {
  interface CampusFleetStore {
    initAuthSync(): void;
    logout(): Promise<void>;
    setCurrentUser(user: { id: string; email: string; fullName: string; role: UserRole; studentId?: string } | null): void;
    switchRole(newRole: UserRole): typeof CampusFleetStore.prototype.currentUser;
  }
}

// ── Implementations ─────────────────────────────────────────────────────────

/** Subscribe to authService for user changes — single source of truth */
CampusFleetStore.prototype.initAuthSync = function (this: CampusFleetStore) {
  // Sync initial user from authService
  const authUser = authService.getCurrentUser();
  if (authUser) {
    this.currentUser = {
      id: authUser.id,
      email: authUser.email,
      fullName: authUser.fullName,
      role: authUser.role,
      studentId: authUser.studentId,
    };
    this.saveToLocalStorage();
    this.notify();
  }

  // Listen for future auth changes
  authService.subscribe((user) => {
    if (user) {
      this.currentUser = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        studentId: user.studentId,
      };
    } else {
      this.currentUser = null;
    }
    this.saveToLocalStorage();
    this.notify();
  });
};

CampusFleetStore.prototype.logout = async function (this: CampusFleetStore) {
  await authService.logout();
  this.currentUser = null;
  this.saveToLocalStorage();
  this.notify();
};

CampusFleetStore.prototype.setCurrentUser = function (
  this: CampusFleetStore,
  user: { id: string; email: string; fullName: string; role: UserRole; studentId?: string } | null
) {
  this.currentUser = user;
  this.saveToLocalStorage();
  this.notify();
};

CampusFleetStore.prototype.switchRole = function (this: CampusFleetStore, newRole: UserRole) {
  if (this.currentUser) {
    this.currentUser = {
      ...this.currentUser,
      role: newRole,
      studentId: newRole === "student" ? (this.currentUser.studentId || this.currentUser.id) : undefined,
    };
  } else {
    // Direct PostgreSQL lookup: select real user registered for this role
    const dbUser = this.users.find(u => u.role === newRole);
    if (dbUser) {
      this.currentUser = {
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.fullName || `${newRole.toUpperCase()} User`,
        role: newRole,
        studentId: newRole === "student" ? dbUser.id : undefined,
      };
    } else {
      this.currentUser = {
        id: createUserId(),
        email: `${newRole}@gehu.ac.in`,
        fullName: `${newRole.charAt(0).toUpperCase() + newRole.slice(1)} User`,
        role: newRole,
        studentId: newRole === "student" ? createStudentId() : undefined,
      };
    }
  }
  this.saveToLocalStorage();
  this.notify();
  return this.currentUser;
};
