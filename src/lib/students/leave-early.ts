import { db } from "@/lib/supabaseClient";
import { getDayOfWeekIST, getCurrentTimeIST } from "@/lib/time-manager";

/**
 * Leave early (student side). Server-only; every function takes the session user id.
 *
 * Options are the outgoing (campus → home) shifts that leave later than now but earlier than the
 * student's usual ride home, and have a run with a bus on the student's route today.
 * Students see shift name, time and bus numbers only; never trip ids. The run is picked when the
 * teacher approves (review_early_departure, migration 20261119).
 */

export interface LeaveEarlyOption {
  shiftId: string;
  shiftName: string;
  departs: string; // "1:30 PM"
  buses: number[];
}

export interface LeaveEarlyRequest {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  reason: string;
  shiftName: string | null;
  departs: string | null;
  busNumber: number | null; // booked bus, after approval
  teacherRemarks: string | null;
  createdAt: string | null;
}

export interface LeaveEarlyState {
  /** Why a new request can't be made right now (null when it can). */
  blocked: string | null;
  usualRide: { shiftName: string; departs: string } | null;
  options: LeaveEarlyOption[];
  today: LeaveEarlyRequest[];
}

export type LeaveEarlyError = Error & { status: number };
const fail = (message: string, status = 400): LeaveEarlyError => Object.assign(new Error(message), { status });
export const isLeaveEarlyError = (e: unknown): e is LeaveEarlyError => e instanceof Error && typeof (e as LeaveEarlyError).status === "number";

const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export function formatClock(t: string | null | undefined): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

async function loadStudent(userId: string) {
  const { data } = await db
    .from("students")
    .select("id, class_id, primary_route_id, primary_stop_id, auto_assigned_stop_id, transport_access_suspended")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function routeFor(student: NonNullable<Awaited<ReturnType<typeof loadStudent>>>): Promise<string | null> {
  if (student.primary_route_id) return student.primary_route_id;
  const stopId = student.auto_assigned_stop_id || student.primary_stop_id;
  if (!stopId) return null;
  const { data } = await db.from("route_stops").select("route_id").eq("stop_id", stopId).limit(1).maybeSingle();
  return data?.route_id ?? null;
}

async function usualOutgoing(classId: string | null) {
  if (!classId) return null;
  const { data } = await db
    .from("class_shift_schedules")
    .select("is_today_off, outgoing:shifts!outgoing_shift_id(id, name, start_time)")
    .eq("class_id", classId)
    .eq("day_of_week", getDayOfWeekIST().toUpperCase())
    .maybeSingle();
  if (!data || data.is_today_off) return null;
  const s = data.outgoing as unknown as { id: string; name: string | null; start_time: string | null } | null;
  return s?.id ? s : null;
}

async function computeOptions(routeId: string, usual: { id: string; start_time: string | null } | null): Promise<LeaveEarlyOption[]> {
  const now = getCurrentTimeIST(true);
  const { data: shifts } = await db
    .from("shifts")
    .select("id, name, start_time")
    .eq("is_active", true)
    .eq("direction", "CAMPUS_TO_HOME")
    .gt("start_time", now)
    .order("start_time");
  const earlier = (shifts || []).filter(
    (s) => s.id !== usual?.id && s.start_time && (!usual?.start_time || s.start_time < usual.start_time)
  );
  if (earlier.length === 0) return [];
  const { data: trips } = await db
    .from("trips")
    .select("shift_id, bus_id, status")
    .eq("route_id", routeId)
    .eq("trip_date", todayIst())
    .in("shift_id", earlier.map((s) => s.id))
    .not("bus_id", "is", null);
  const running = (trips || []).filter((t) => t.status === "SCHEDULED" || t.status === "DELAYED");
  const busIds = Array.from(new Set(running.map((t) => t.bus_id as number)));
  const { data: buses } = busIds.length ? await db.from("buses").select("id, bus_number").in("id", busIds) : { data: [] };
  const busNo = new Map((buses || []).map((b) => [b.id, b.bus_number]));
  return earlier
    .map((s) => ({
      shiftId: s.id,
      shiftName: s.name || "Ride home",
      departs: formatClock(s.start_time) || "",
      buses: Array.from(new Set(running.filter((t) => t.shift_id === s.id).map((t) => busNo.get(t.bus_id as number)).filter((n): n is number => n != null))).sort((a, b) => a - b),
    }))
    .filter((o) => o.buses.length > 0);
}

async function todaysRequests(studentId: string): Promise<LeaveEarlyRequest[]> {
  const { data } = await db
    .from("early_departure_requests")
    .select("id, status, reason, teacher_remarks, created_at, booked_trip_id, shift:shifts(name, start_time)")
    .eq("student_id", studentId)
    .eq("request_date", todayIst())
    .order("created_at", { ascending: false });
  const rows = (data || []) as unknown as {
    id: string; status: string | null; reason: string | null; teacher_remarks: string | null; created_at: string | null;
    booked_trip_id: string | null; shift: { name: string | null; start_time: string | null } | null;
  }[];
  const tripIds = rows.map((r) => r.booked_trip_id).filter(Boolean) as string[];
  const busByTrip = new Map<string, number>();
  if (tripIds.length) {
    const { data: trips } = await db.from("trips").select("id, bus:buses(bus_number)").in("id", tripIds);
    for (const t of (trips || []) as unknown as { id: string; bus: { bus_number: number } | null }[]) {
      if (t.bus?.bus_number != null) busByTrip.set(t.id, t.bus.bus_number);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    status: (r.status || "PENDING") as LeaveEarlyRequest["status"],
    reason: r.reason || "",
    shiftName: r.shift?.name ?? null,
    departs: formatClock(r.shift?.start_time),
    busNumber: r.booked_trip_id ? busByTrip.get(r.booked_trip_id) ?? null : null,
    teacherRemarks: r.teacher_remarks,
    createdAt: r.created_at,
  }));
}

export async function getLeaveEarly(userId: string): Promise<LeaveEarlyState> {
  const student = await loadStudent(userId);
  if (!student) return { blocked: "Your student profile isn't set up yet.", usualRide: null, options: [], today: [] };
  const [today, usual, routeId] = await Promise.all([todaysRequests(student.id), usualOutgoing(student.class_id), routeFor(student)]);
  const usualRide = usual ? { shiftName: usual.name || "Ride home", departs: formatClock(usual.start_time) || "" } : null;
  let blocked: string | null = null;
  if (student.transport_access_suspended) blocked = "Your bus access is suspended. Contact the transport office.";
  else if (!student.class_id) blocked = "Your class isn't set, so there's no teacher to approve this. Contact the transport office.";
  else if (!routeId) blocked = "Your stop isn't set yet. Set it in Settings first.";
  else if (today.some((r) => r.status === "PENDING" || r.status === "APPROVED")) blocked = "You already have a leave-early request today.";
  const options = blocked || !routeId ? [] : await computeOptions(routeId, usual);
  return { blocked, usualRide, options, today };
}

export async function requestLeaveEarly(userId: string, shiftId: string, reason: string): Promise<{ studentId: string; classId: string }> {
  const student = await loadStudent(userId);
  if (!student) throw fail("Your student profile isn't set up yet.", 404);
  const state = await getLeaveEarly(userId);
  if (state.blocked) throw fail(state.blocked, 409);
  if (!state.options.some((o) => o.shiftId === shiftId)) {
    throw fail("That bus isn't available any more. Pick another one.", 409);
  }
  const { error } = await db.from("early_departure_requests").insert({
    student_id: student.id,
    class_id: student.class_id,
    shift_id: shiftId,
    request_date: todayIst(),
    reason,
    status: "PENDING",
  });
  if (error) {
    if (error.code === "23505") throw fail("You already have a leave-early request today.", 409);
    console.error("[leave-early] insert:", error.message);
    throw fail("Could not send the request.", 500);
  }
  return { studentId: student.id, classId: student.class_id as string };
}

export async function withdrawLeaveEarly(userId: string, requestId: string): Promise<void> {
  const student = await loadStudent(userId);
  if (!student) throw fail("Your student profile isn't set up yet.", 404);
  const { data, error } = await db
    .from("early_departure_requests")
    .update({ status: "WITHDRAWN" })
    .eq("id", requestId)
    .eq("student_id", student.id)
    .eq("status", "PENDING")
    .select("id")
    .maybeSingle();
  if (error) throw fail("Could not withdraw the request.", 500);
  if (!data) throw fail("Only a request that is still waiting can be withdrawn.", 409);
}

/** Class teachers; if the class has none, the managers who can also decide. */
export async function notifyLeaveEarlyReviewers({ studentId, classId }: { studentId: string; classId: string }) {
  const [{ data: teachers }, { data: s }] = await Promise.all([
    db.from("class_teachers").select("teacher_id").eq("class_id", classId),
    db.from("students").select("full_name").eq("id", studentId).maybeSingle(),
  ]);
  let ids = (teachers || []).map((t) => t.teacher_id).filter(Boolean) as string[];
  if (ids.length === 0) {
    const { data: managers } = await db.from("users").select("id").in("role", ["admin", "transport_admin", "transport_manager"]);
    ids = (managers || []).map((m) => m.id);
  }
  if (ids.length === 0) return;
  const who = s?.full_name || "A student";
  await db.from("notifications").insert(
    Array.from(new Set(ids)).map((user_id) => ({
      user_id,
      title: "Leave-early request",
      message: `${who} asked to leave early today. Review it in Gate Passes.`,
      type: "LEAVE_EARLY",
      is_read: false,
    }))
  );
}
