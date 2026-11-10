import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.toLowerCase() || "";

    // 1. Fetch users
    const { data: users, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id, full_name, email, role")
      .limit(60);

    if (userErr) throw userErr;

    // 2. Fetch students for student roll / ID codes
    const { data: students } = await supabaseAdmin
      .from("students_full")
      .select("id, user_id, full_name, student_id_code, department, semester")
      .limit(60);

    const studentMap = new Map();
    (students || []).forEach((s) => {
      if (s.user_id) studentMap.set(s.user_id, s);
      studentMap.set(s.id, s);
    });

    const contacts = (users || []).map((u) => {
      const stud = studentMap.get(u.id);
      return {
        id: u.id,
        name: u.full_name || stud?.full_name || "Campus Member",
        email: u.email || "",
        role: u.role,
        studentIdCode: stud?.student_id_code || null,
        department: stud?.department || null,
        semester: stud?.semester || null,
      };
    });

    // Filter by query if present
    const filtered = query
      ? contacts.filter((c) =>
          c.name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query) ||
          c.role.toLowerCase().includes(query) ||
          (c.studentIdCode && c.studentIdCode.toLowerCase().includes(query))
        )
      : contacts;

    return NextResponse.json({ success: true, contacts: filtered });
  } catch (error: any) {
    console.error("GET /api/chat/contacts error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
