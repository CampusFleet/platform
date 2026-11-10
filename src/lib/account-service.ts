import { supabaseAdmin } from "@/lib/supabaseClient";
import { createStudentId, createUserId } from "@/lib/id";

export interface FindOrCreateUserParams {
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  provider: "google" | "email_otp" | "password" | "sso";
}

export interface AuthUserResult {
  id: string;
  email: string;
  full_name: string;
  role: string;
  campus_id?: string | null;
  campus?: string | null;
  photo_url?: string | null;
  avatar_url?: string | null; // Backwards-compatible alias mapped directly to photo_url
  provider?: string;
  created_at?: string;
}

/**
 * Centralized Account Service
 * Single source of truth for user and student account creation:
 * - If user is signing in for the first time:
 *     - Automatically creates account in `users` (default role "student", or "admin" if admin email)
 *     - If role is "student", automatically creates matching record in `students` with real data (no mock data)
 * - If account is already present:
 *     - Signs in as normal, returning the existing user record
 */
export async function findOrCreateUser({
  email,
  fullName,
  avatarUrl,
  provider,
}: FindOrCreateUserParams): Promise<{ user: AuthUserResult; isNewUser: boolean }> {
  const cleanEmail = (email || "").trim().toLowerCase();
  // Server-only bootstrap admin identity (not NEXT_PUBLIC_*: it must not ship in the browser bundle)
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

  // For conductor security and student verification, reject casual Google OAuth avatars (lh3.googleusercontent.com)
  // Only accept genuine institutional student photos.
  const isGoogleAvatar = Boolean(avatarUrl && avatarUrl.includes("googleusercontent.com"));
  const validPhoto = (!isGoogleAvatar && avatarUrl) ? avatarUrl : null;

  // 1. Check if user already exists
  const { data: existingUser } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("email", cleanEmail)
    .maybeSingle();

  if (existingUser) {
    // Already present account: sign in as normal
    const updates: Record<string, any> = {};
    if (validPhoto && !existingUser.photo_url) {
      updates.photo_url = validPhoto;
    }
    if (fullName && !existingUser.full_name) updates.full_name = fullName;

    if (Object.keys(updates).length > 0) {
      await supabaseAdmin.from("users").update(updates).eq("id", existingUser.id);
    }

    // Ensure student record exists if role is student (for legacy accounts)
    if (existingUser.role === "student") {
      const { data: existingStudents } = await supabaseAdmin
        .from("students")
        .select("id, user_id, campus_id, campus, full_name")
        .or(`user_id.eq.${existingUser.id}`)
        .limit(1);

      const existingStudent = existingStudents?.[0];

      if (!existingStudent) {
        const newStudentId = createStudentId();
        const { error: studErr2 } = await supabaseAdmin.from("students").upsert({
          id: newStudentId,
          user_id: existingUser.id,
          full_name: existingUser.full_name || cleanEmail.split("@")[0],
          created_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (studErr2) {
          console.warn("Auto-create student for existing user failed:", studErr2.message);
        }
      } else {
        if (!existingStudent.user_id || existingStudent.user_id !== existingUser.id) {
          // Link existing student row with this user's primary key
          await supabaseAdmin
            .from("students")
            .update({ user_id: existingUser.id })
            .eq("id", existingStudent.id);
        }

        // Sync campus_id to user record if missing in users table
        const userSync: Record<string, any> = {};
        if (!existingUser.campus_id && existingStudent.campus_id) userSync.campus_id = existingStudent.campus_id;
        if (Object.keys(userSync).length > 0) {
          await supabaseAdmin.from("users").update(userSync).eq("id", existingUser.id);
          Object.assign(existingUser, userSync);
        }
      }
    }

    const effectiveUserPhoto = existingUser.photo_url || null;

    return {
      user: {
        id: existingUser.id,
        email: existingUser.email,
        full_name: existingUser.full_name,
        role: existingUser.role || "student",
        campus_id: existingUser.campus_id || null,
        campus: existingUser.campus,
        photo_url: effectiveUserPhoto,
        avatar_url: effectiveUserPhoto, // mapped to photo_url
        provider: existingUser.provider || provider,
        created_at: existingUser.created_at,
      },
      isNewUser: false,
    };
  }

  // 2. First-time sign-in: automatically create user account
  const role = adminEmail && cleanEmail === adminEmail ? "admin" : "student";
  const userId = createUserId();

  const realName =
    fullName?.trim() ||
    cleanEmail
      .split("@")[0]
      .replace(/[._]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  // Check if a pre-existing student record already exists in database for this user
  let existingStudentForNewUser: any = null;
  if (role === "student") {
    const { data: matchedStudents } = await supabaseAdmin
      .from("students")
      .select("id, user_id, campus_id, campus, full_name")
      .or(`user_id.eq.${userId}`)
      .limit(1);

    existingStudentForNewUser = matchedStudents?.[0];
  }

  const effectiveCampusId = existingStudentForNewUser?.campus_id || null;
  const effectiveCampus = existingStudentForNewUser?.campus || null;
  const effectiveFullName = existingStudentForNewUser?.full_name || realName;
  const effectivePhotoUrl = validPhoto || null;

  const { data: newUser, error: createErr } = await supabaseAdmin
    .from("users")
    .insert({
      id: userId,
      email: cleanEmail,
      full_name: effectiveFullName,
      role,
      campus_id: effectiveCampusId,
      photo_url: effectivePhotoUrl,
      provider,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (createErr) {
    console.error("Failed to create user in findOrCreateUser:", createErr);
    throw new Error(`Failed to create institutional user account: ${createErr.message}`);
  }

  // If role is student, link existing student record or create new one with user_id conflict handling
  if (role === "student") {
    if (existingStudentForNewUser) {
      // LINK existing student record to this user's primary key (user_id)
      await supabaseAdmin
        .from("students")
        .update({
          user_id: userId,
          full_name: effectiveFullName,
        })
        .eq("id", existingStudentForNewUser.id);
    } else {
      const studentId = createStudentId();
      const { error: studErr } = await supabaseAdmin.from("students").upsert({
        id: studentId,
        user_id: userId,
        full_name: realName,
        created_at: new Date().toISOString(),
        campus_id: effectiveCampusId,
        campus: effectiveCampus,
      }, { onConflict: "user_id" });

      if (studErr) {
        console.warn("Auto-create student record notice:", studErr.message);
      }
    }
  }

  const createdUser: AuthUserResult = newUser || {
    id: userId,
    email: cleanEmail,
    full_name: effectiveFullName,
    role,
    campus_id: effectiveCampusId,
    campus: effectiveCampus,
    photo_url: effectivePhotoUrl,
    avatar_url: effectivePhotoUrl,
    provider,
    created_at: new Date().toISOString(),
  };

  return {
    user: createdUser,
    isNewUser: true,
  };
}
