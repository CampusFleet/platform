import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/classes/[id]/teachers
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const classId = params.id;
    const { data: allocations, error } = await supabaseAdmin
      .from("class_teachers")
      .select("id, is_primary, created_at:assigned_at, users(id, full_name, email, phone, role)")
      .eq("class_id", classId);

    if (error) throw error;

    const formatted = (allocations || []).map((a) => ({
      id: a.id,
      teacherId: (a.users as any)?.id,
      fullName: (a.users as any)?.full_name || "Unknown Teacher",
      email: (a.users as any)?.email,
      phone: (a.users as any)?.phone,
      isPrimary: a.is_primary,
      createdAt: a.created_at,
    }));

    return NextResponse.json(
      { success: true, teachers: formatted },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load class teachers." },
      { status: 500 }
    );
  }
}

// POST /api/classes/[id]/teachers - Allocate teacher to class
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const classId = params.id;
    const body = await req.json();
    const { teacherId, isPrimary } = body;

    if (!teacherId) {
      return NextResponse.json(
        { success: false, message: "teacherId is required." },
        { status: 400 }
      );
    }

    // Verify teacher exists and has teacher or admin role
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("id, full_name, email, role")
      .eq("id", teacherId)
      .single();

    if (userErr || !user) {
      return NextResponse.json(
        { success: false, message: "Selected teacher was not found in the system." },
        { status: 404 }
      );
    }

    // Check if already assigned
    const { data: existing } = await supabaseAdmin
      .from("class_teachers")
      .select("id")
      .eq("class_id", classId)
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { success: false, message: `${user.full_name} is already assigned to this class.` },
        { status: 400 }
      );
    }

    const { data: allocation, error } = await supabaseAdmin
      .from("class_teachers")
      .insert({
        class_id: classId,
        teacher_id: teacherId,
        is_primary: !!isPrimary,
      })
      .select()
      .single();

    if (error) throw error;

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      action: "ALLOCATE_TEACHER_CLASS",
      entity: "ClassTeacher",
      entity_id: allocation.id,
      reason: `Allocated teacher ${user.full_name} (${teacherId}) to class ${classId}`,
      new_value: allocation,
    });

    return NextResponse.json({
      success: true,
      allocation,
      teacher: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        isPrimary: !!isPrimary,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to allocate teacher." },
      { status: 500 }
    );
  }
}

// DELETE /api/classes/[id]/teachers?teacherId=...
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const classId = params.id;
    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get("teacherId");

    if (!teacherId) {
      return NextResponse.json(
        { success: false, message: "teacherId query param is required." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("class_teachers")
      .delete()
      .eq("class_id", classId)
      .eq("teacher_id", teacherId);

    if (error) throw error;

    await supabaseAdmin.from("audit_logs").insert({
      action: "DEALLOCATE_TEACHER_CLASS",
      entity: "ClassTeacher",
      entity_id: `${classId}-${teacherId}`,
      reason: `Removed teacher ${teacherId} from class ${classId}`,
    });

    return NextResponse.json({ success: true, message: "Teacher unallocated successfully." });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to unallocate teacher." },
      { status: 500 }
    );
  }
}
