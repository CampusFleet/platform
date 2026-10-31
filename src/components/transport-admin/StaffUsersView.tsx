"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { store } from "@/lib/store";
import { authService } from "@/lib/auth-service";
import { UserAccount, UserRole, Campus } from "@/lib/types";
import {
  Users,
  ShieldCheck,
  Search,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Mail,
  UserCheck,
  Shield,
  BusFront,
  GraduationCap,
  Sparkles,
  Phone,
  Building2,
  Key,
  BookOpen,
  Briefcase,
  X,
} from "lucide-react";
import { CustomDropdown } from "@/components/common/CustomDropdown";

export interface StaffStaffProps {
  initialUsers?: UserAccount[];
  initialUser?: any;
}

export default function StaffUsersView({
  initialUsers = [],
  initialUser,
}: StaffStaffProps = {}) {
  const router = useRouter();
  const [users, setUsers] = useState<UserAccount[]>(initialUsers || []);
  const [currentUser, setCurrentUser] = useState(initialUser || store.getCurrentUser());
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>(() => store.getCampuses());
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "transport_manager" || currentUser?.role === "transport_admin";

  const [newUser, setNewUser] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "student" as UserRole,
    campus: store.getPrimaryCampus()?.name || "Main Campus",
    campusId: store.getPrimaryCampus()?.id || "",
    provider: "Institutional SSO",
  });

  useEffect(() => {
    if (initialUsers && initialUsers.length > 0) {
      setUsers(initialUsers);
    }
  }, [initialUsers]);

  useEffect(() => {
    const unsub = store.subscribe(() => {
      if (!initialUsers || initialUsers.length === 0) {
        setUsers(store.getUsers());
      }
      setCurrentUser(store.getCurrentUser());
    });
    return unsub;
  }, [initialUsers]);

  const adminCount = users.filter(u => u.role === "admin").length;
  const transportManagerCount = users.filter(u => u.role === "transport_manager").length;
  const transportAdminCount = users.filter(u => u.role === "transport_admin").length;
  const teacherCount = users.filter(u => u.role === "teacher").length;
  const conductorCount = users.filter(u => u.role === "conductor").length;
  const driverCount = users.filter(u => u.role === "driver").length;
  const studentCount = users.filter(u => u.role === "student").length;

  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.phone && u.phone.includes(searchQuery));
    const matchesRole =
      roleFilter === "ALL" ||
      u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleRoleChange = async (userId: string, newRole: UserRole, userName: string) => {
    setUpdatingUserId(userId);
    const previousUsers = [...users];

    // Optimistic UI update
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));

    try {
      const res = await fetch("/api/admin/update-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update role in database");
      }

      // Update store local state only (no extra Supabase call — API already used admin client)
      store.updateUserRoleLocal(userId, newRole);

      // If the admin is modifying their own role, update authService immediately
      const currentAuthUser = authService.getCurrentUser();
      const targetUser = users.find(u => u.id === userId);
      if (
        currentAuthUser &&
        (currentAuthUser.id === userId ||
          (targetUser?.email && currentAuthUser.email.toLowerCase() === targetUser.email.toLowerCase()))
      ) {
        authService.updateUserRoleLocal(newRole);
      }

      setToastMessage(`✓ ${userName}'s access updated to ${newRole.toUpperCase()}`);
      setTimeout(() => setToastMessage(null), 3500);

      // Re-fetch fresh user list from server to confirm DB state
      router.refresh();

      // Also re-fetch via our users API to update local list immediately
      try {
        const usersRes = await fetch("/api/admin/users", { credentials: "include" });
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          if (usersData.users && Array.isArray(usersData.users)) {
            setUsers(usersData.users);
          }
        }
      } catch {
        // Non-fatal — optimistic update already applied above
      }
    } catch (e: any) {
      console.error("Failed to update role via API:", e);
      setUsers(previousUsers);
      alert(`Could not update access level: ${e.message || "Network error"}`);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.fullName || !newUser.email) {
      alert("Please enter full name and email");
      return;
    }

    const createdUser: UserAccount = {
      id: `usr-${Date.now()}`,
      fullName: newUser.fullName,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      campus: newUser.campus,
      provider: newUser.provider,
      createdAt: new Date().toISOString(),
    };

    // Update in store and supabase
    const updated = [createdUser, ...users];
    (store as any).users = updated;
    (store as any).notify();

    setIsAddUserOpen(false);
    setNewUser({
      fullName: "",
      email: "",
      phone: "+91 98765 43210",
      role: "student",
      campus: store.getPrimaryCampus()?.name || "Main Campus",
      campusId: store.getPrimaryCampus()?.id || "",
      provider: "Institutional SSO",
    });
    setToastMessage(`Added new user ${createdUser.fullName} (${createdUser.role.toUpperCase()})`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case "admin":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60">
            <Shield className="w-3.5 h-3.5" />
            Administrator
          </span>
        );
      case "transport_manager":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800/60">
            <Briefcase className="w-3.5 h-3.5" />
            Transport Manager
          </span>
        );
      case "transport_admin":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
            <ShieldCheck className="w-3.5 h-3.5" />
            Transport Admin
          </span>
        );
      case "teacher":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
            <BookOpen className="w-3.5 h-3.5" />
            Teacher / Faculty
          </span>
        );
      case "driver":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
            <BusFront className="w-3.5 h-3.5" />
            Fleet Driver
          </span>
        );
      case "conductor":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 border border-pink-200 dark:border-pink-800/60">
            <ShieldCheck className="w-3.5 h-3.5" />
            Conductor
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-green-50 dark:bg-green-950/60 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800/60">
            <GraduationCap className="w-3.5 h-3.5" />
            Student Commuter
          </span>
        );
    }
  };

  const getAvatarBg = (name: string, role: UserRole) => {
    if (role === "admin") return "bg-red-500 text-white";
    if (role === "transport_manager") return "bg-purple-600 text-white";
    if (role === "transport_admin") return "bg-blue-600 text-white";
    if (role === "teacher") return "bg-emerald-600 text-white";
    if (role === "driver") return "bg-amber-600 text-white";
    if (role === "conductor") return "bg-pink-600 text-white";
    const colors = ["bg-green-500", "bg-green-500", "bg-blue-500", "bg-blue-500"];
    const charCode = name.charCodeAt(0) || 0;
    return `${colors[charCode % colors.length]} text-white`;
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 p-4 bg-gray-900 dark:bg-gray-800 text-white border border-gray-700 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4">
          <CheckCircle2 className="w-5 h-5 text-green-400" />
          <span className="text-xs font-bold">{toastMessage}</span>
        </div>
      )}

      {/* Top 7 Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {/* Administrator */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center text-center space-y-1">
          <div className="text-2xl font-black text-red-600 dark:text-red-400">
            {adminCount}
          </div>
          <div className="text-[11px] font-bold text-gray-500">Administrator</div>
        </div>

        {/* Transport Manager */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center text-center space-y-1">
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
            {transportManagerCount}
          </div>
          <div className="text-[11px] font-bold text-gray-500">Transport Manager</div>
        </div>

        {/* Transport Admin */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center text-center space-y-1">
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
            {transportAdminCount}
          </div>
          <div className="text-[11px] font-bold text-gray-500">Transport Admin</div>
        </div>

        {/* Fleet Driver */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center text-center space-y-1">
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
            {driverCount}
          </div>
          <div className="text-[11px] font-bold text-gray-500">Fleet Driver</div>
        </div>

        {/* Conductor */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center text-center space-y-1">
          <div className="text-2xl font-black text-pink-600 dark:text-pink-400">
            {conductorCount}
          </div>
          <div className="text-[11px] font-bold text-gray-500">Conductor</div>
        </div>

        {/* Teacher / Faculty */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center text-center space-y-1">
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {teacherCount}
          </div>
          <div className="text-[11px] font-bold text-gray-500">Teacher / Faculty</div>
        </div>

        {/* Student Commuter */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center text-center space-y-1">
          <div className="text-2xl font-black text-green-600 dark:text-green-400">
            {studentCount}
          </div>
          <div className="text-[11px] font-bold text-gray-500">Student Commuter</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            placeholder="Search by name, email, phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none focus:border-blue-500 text-gray-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <CustomDropdown
            value={roleFilter}
            onChange={val => setRoleFilter(val)}
            size="sm"
            options={[
              { value: "ALL", label: `All Roles (${users.length})` },
              { value: "admin", label: `Administrator (${adminCount})` },
              { value: "transport_manager", label: `Transport Manager (${transportManagerCount})` },
              { value: "transport_admin", label: `Transport Admin (${transportAdminCount})` },
              { value: "driver", label: `Fleet Driver (${driverCount})` },
              { value: "conductor", label: `Conductor (${conductorCount})` },
              { value: "teacher", label: `Teacher / Faculty (${teacherCount})` },
              { value: "student", label: `Student Commuter (${studentCount})` },
            ]}
            containerClassName="w-full sm:w-60"
          />

          <button
            onClick={() => setIsAddUserOpen(true)}
            className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-2xl flex items-center gap-2 shadow-md shadow-green-600/20 whitespace-nowrap transition-transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            + Add User
          </button>
        </div>
      </div>

      {/* Main User Management Table matching Image 2 */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 text-[11px] font-black uppercase tracking-wider text-gray-400">
                <th className="py-4 px-6">User Profile</th>
                <th className="py-4 px-6">Email Address</th>
                <th className="py-4 px-6">Login Provider</th>
                <th className="py-4 px-6">Current Role</th>
                <th className="py-4 px-6 text-right">Modify Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">
                    No matching users found in the institutional registry.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => {
                  const initials = user.fullName
                    .split(" ")
                    .map(n => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                  const isCurrentUser = currentUser?.id === user.id;

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      {/* USER PROFILE */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-2xl flex items-center justify-center font-black text-xs shadow-xs ${getAvatarBg(
                              user.fullName,
                              user.role
                            )}`}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                              <span>{user.fullName}</span>
                              {isCurrentUser && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400">{user.campus || store.getPrimaryCampus()?.name || "Campus Terminal"}</div>
                          </div>
                        </div>
                      </td>

                      {/* EMAIL ADDRESS */}
                      <td className="py-4 px-6 font-mono text-gray-600 dark:text-gray-300">
                        {user.email}
                      </td>

                      {/* LOGIN PROVIDER */}
                      <td className="py-4 px-6">
                        <span className="px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold text-[11px]">
                          {user.provider || "Google"}
                        </span>
                      </td>

                      {/* CURRENT ROLE */}
                      <td className="py-4 px-6">{getRoleBadge(user.role)}</td>

                      {/* MODIFY ACCESS DROPDOWN */}
                      <td className="py-4 px-6 text-right">
                        <CustomDropdown
                          disabled={updatingUserId === user.id}
                          value={user.role}
                          onChange={val =>
                            handleRoleChange(user.id, val as UserRole, user.fullName)
                          }
                          size="sm"
                          options={[
                            { value: "student", label: "Student Commuter" },
                            { value: "teacher", label: "Teacher / Faculty" },
                            { value: "transport_admin", label: "Transport Admin" },
                            { value: "transport_manager", label: "Transport Manager" },
                            { value: "conductor", label: "Conductor" },
                            { value: "driver", label: "Fleet Driver" },
                            ...(isAdmin ? [{ value: "admin", label: "Administrator" }] : []),
                          ]}
                          containerClassName="w-48 ml-auto"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {isAddUserOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-800 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-green-600" />
                Add Institutional User
              </h3>
              <button
                onClick={() => setIsAddUserOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Chandra"
                  value={newUser.fullName}
                  onChange={e => setNewUser({ ...newUser, fullName: e.target.value })}
                  className="w-full text-xs p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none mt-1"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Institutional Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. name@gehu.ac.in"
                  value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full text-xs p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl outline-none mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Role
                  </label>
                  <CustomDropdown
                    value={newUser.role}
                    onChange={val => setNewUser({ ...newUser, role: val as UserRole })}
                    options={[
                      { value: "student", label: "Student Commuter" },
                      { value: "teacher", label: "Teacher / Faculty" },
                      { value: "transport_admin", label: "Transport Admin" },
                      { value: "transport_manager", label: "Transport Manager" },
                      { value: "conductor", label: "Conductor" },
                      { value: "driver", label: "Fleet Driver" },
                      ...(isAdmin ? [{ value: "admin", label: "Administrator" }] : []),
                    ]}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Campus
                  </label>
                  <CustomDropdown
                    value={newUser.campus}
                    onChange={val => {
                      const c = campuses.find(camp => camp.name === val || camp.id === val);
                      setNewUser({ ...newUser, campus: c?.name || val, campusId: c?.id || "" });
                    }}
                    options={campuses.map(c => ({
                      value: c.name,
                      label: `${c.name} ${c.isPrimary ? "(Primary)" : ""}`,
                    }))}
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-2xl shadow-md shadow-green-600/20"
                >
                  Register User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
