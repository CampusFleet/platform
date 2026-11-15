import { db } from "@/lib/supabaseClient";
import { formatClock } from "@/lib/students/leave-early";

/**
 * Gate passes (teacher side). Server-only.
 * Teachers see requests from their own classes (class_teachers); admin, transport admin and
 * transport manager see all. Decisions go through review_early_departure (migration 20261119),
 * which re-checks who may decide and books the bus in one transaction.
 */

export const REVIEW_ALL_ROLES = ["admin", "transport_admin", "transport_manager"] as const;
const canReviewAll = (role: string) => (REVIEW_ALL_ROLES as readonly string[]).includes(role);

export interface GatePassItem {
  id: string;
  studentName: string | null;
  studentPhoto: string | null;
  studentPhone: string | null;
  classId: string | null;
  className: string | null;
  shiftName: string | null;
  departs: string | null;
  busNumber: number | null;
  requestDate: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "EXPIRED";
  teacherRemarks: string | null;
  createdAt: string | null;
}

export async function listGatePasses(userId: string, role: string): Promise<{ items: GatePassItem[]; classes: { id: string; name: string }[] }> {
  let classIds: string[] | null = null;
  if (!canReviewAll(role)) {
    const { data } = await db.from("class_teachers").select("class_id").eq("teacher_id", userId);
    classIds = (data || []).map((a) => a.class_id).filter(Boolean) as string[];
    if (classIds.length === 0) return { items: [], classes: [] };
  }

  let q = db
    .from("early_departure_requests")
    .select(
      "id, class_id, request_date, reason, status, teacher_remarks, created_at, booked_trip_id, student:students(full_name, photo_url, phone), class:classes(id, name), shift:shifts(name, start_time)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (classIds) q = q.in("class_id", classIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data || []) as unknown as {
    id: string; class_id: string | null; request_date: string | null; reason: string | null; status: string | null;
    teacher_remarks: string | null; created_at: string | null; booked_trip_id: string | null;
    student: { full_name: string | null; photo_url: string | null; phone: string | null } | null;
    class: { id: string; name: string | null } | null;
    shift: { name: string | null; start_time: string | null } | null;
  }[];

  const tripIds = Array.from(new Set(rows.map((r) => r.booked_trip_id).filter(Boolean) as string[]));
  const busByTrip = new Map<string, number>();
  if (tripIds.length) {
    const { data: trips } = await db.from("trips").select("id, bus:buses(bus_number)").in("id", tripIds);
    for (const t of (trips || []) as unknown as { id: string; bus: { bus_number: number } | null }[]) {
      if (t.bus?.bus_number != null) busByTrip.set(t.id, t.bus.bus_number);
    }
  }

  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const classes = new Map<string, string>();
  const items = rows.map((r) => {
    if (r.class?.id) classes.set(r.class.id, r.class.name || "Class");
    return {
      id: r.id,
      studentName: r.student?.full_name ?? null,
      studentPhoto: r.student?.photo_url ?? null,
      studentPhone: r.student?.phone ?? null,
      classId: r.class_id,
      className: r.class?.name ?? null,
      shiftName: r.shift?.name ?? null,
      departs: formatClock(r.shift?.start_time),
      busNumber: r.booked_trip_id ? busByTrip.get(r.booked_trip_id) ?? null : null,
      requestDate: r.request_date,
      reason: r.reason || "",
      // A request is only for its own day; one never decided is shown as expired.
      status: (r.status === "PENDING" && r.request_date && r.request_date < today ? "EXPIRED" : r.status || "PENDING") as GatePassItem["status"],
      teacherRemarks: r.teacher_remarks,
      createdAt: r.created_at,
    };
  });
  return { items, classes: Array.from(classes, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)) };
}

export type ReviewResult = { ok: true; status: "APPROVED" | "REJECTED" } | { ok: false; error: string; status: number };

export async function reviewGatePass(
  requestId: string,
  approve: boolean,
  remarks: string,
  actor: { userId: string; role: string }
): Promise<ReviewResult> {
  const { data, error } = await db.rpc("review_early_departure" as never, {
    p_request_id: requestId,
    p_approve: approve,
    p_remarks: remarks,
    p_actor: actor.userId,
    p_actor_role: actor.role,
  } as never);
  if (error) {
    if (error.code === "PGRST202") return { ok: false, error: "Gate passes need the 20261119 database update. Ask the admin to run it.", status: 503 };
    console.error("[gate-pass] review:", error.message);
    return { ok: false, error: "Could not save the decision.", status: 500 };
  }
  const res = data as unknown as { ok?: boolean; error?: string; status?: "APPROVED" | "REJECTED" } | null;
  if (!res?.ok) return { ok: false, error: res?.error || "Could not save the decision.", status: 409 };
  return { ok: true, status: res.status || (approve ? "APPROVED" : "REJECTED") };
}
