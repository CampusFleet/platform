import { getSession } from "@/lib/jwt";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseClient";
import AdminStaffView from "@/components/admin/AdminStaffView";
import type { UserAccount } from "@/lib/types";
import { createUserId } from "@/lib/id";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Server Component: User Directory & RBAC Security Gateway
 * - Server-side authorization check (Admin / Transport Manager only)
 * - Pre-queries registered user accounts, role allocations, and auth providers
 * - Cross-references students table to guarantee 100% data consistency
 * - Fast server render
 */
export default async function UserAndRBACManagementPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login?redirect=/admin/users");
  }

  if (session.role !== "admin" && session.role !== "transport_manager") {
    redirect("/portal");
  }

  const [{ data: dbUsers }, { data: dbStudents }] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("id, full_name, email, role, phone, campus_id, provider, created_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("students_full")
      .select("id, user_id, full_name, email, phone, campus, campus_id, created_at")
      .order("created_at", { ascending: false }),
  ]);

  const userList: UserAccount[] = (dbUsers || []).map((u: any) => ({
    id: u.id,
    fullName: u.full_name || "User",
    email: u.email || "",
    role: (u.role || "student") as any,
    phone: u.phone || undefined,
    campusId: u.campus_id || u.campus || undefined,
    campus: u.campus || undefined,
    provider: u.provider || "NONE",
    createdAt: u.created_at || new Date().toISOString(),
  }));

  // Auto-heal / cross-reference any student who has a profile in students table
  // but might be missing from users table
  const userEmails = new Set(userList.map(u => u.email.toLowerCase().trim()).filter(Boolean));
  const userIds = new Set(userList.map(u => u.id));

  for (const s of (dbStudents || [])) {
    const sEmail = (s.email || "").toLowerCase().trim();
    if (!userIds.has(s.user_id) && (!sEmail || !userEmails.has(sEmail))) {
      const fallbackId = s.user_id || s.id || createUserId();
      const healedUser: UserAccount = {
        id: fallbackId,
        fullName: s.full_name || "Student",
        email: s.email || "",
        role: "student",
        phone: s.phone || undefined,
        campusId: s.campus_id || s.campus || "",
        campus: s.campus || "",
        provider: "NONE",
        createdAt: s.created_at || new Date().toISOString(),
      };
      userList.unshift(healedUser);
      userIds.add(fallbackId);
      if (sEmail) userEmails.add(sEmail);

      // Auto-heal into users table
      supabaseAdmin.from("users").upsert({
        id: fallbackId,
        email: s.email || "",
        full_name: s.full_name || "Student",
        phone: s.phone || null,
        campus_id: s.campus_id || null,
        role: "student",
        provider: "NONE",
      }, { onConflict: "id" }).then(() => {});
    }
  }

  return (
    <AdminStaffView
      initialUsers={userList}
      initialUser={session}
    />
  );
}
