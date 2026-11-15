import { supabaseAdmin } from "@/lib/supabaseClient";
import { executeDailyRollover } from "@/lib/daily-rollover";
import { formatClock } from "@/lib/students/leave-early";
import { toMinutes } from "@/lib/trip-planner";

/**
 * What a shift change does to today's runs. Server-only. See docs/CODEMAP.md → "Shift and timetable changes".
 *
 * Trips point at the shift, so a new time or cutoff applies to today's runs at once. The rules:
 *   time / cutoff  refused once a run of the shift has left or its final chart is locked today;
 *                  otherwise riders already booked are told the new time, and buses whose next run
 *                  now overlaps are reported to the manager.
 *   direction      refused while the shift has runs today or later (riders are booked by direction).
 *   deactivate     refused while a run of the shift today has not finished (cancel it on the dispatch
 *                  board first: that moves or notifies its riders).
 *   activate       today's missing runs are added (executeDailyRollover with force: only missing ones).
 *   delete         a shift used by any trip is retired (is_active = false), never deleted, because
 *                  deleting it would blank the shift on past trips and bookings (ON DELETE SET NULL).
 */

export type ShiftRow = {
  id: string;
  name: string | null;
  start_time: string | null;
  end_time: string | null;
  booking_cutoff_minutes: number | null;
  direction: string | null;
  is_active: boolean | null;
};

export type ShiftUpdate = Partial<Pick<ShiftRow, "start_time" | "end_time" | "booking_cutoff_minutes" | "direction" | "is_active">>;

const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

type Run = { id: string; bus_id: number | null; status: string | null; manifest_locked: boolean | null; started_at: string | null };

async function runsOf(shiftId: string, from: "today" | "today-and-later"): Promise<Run[]> {
  let q = supabaseAdmin
    .from("trips")
    .select("id, bus_id, status, manifest_locked, started_at")
    .eq("shift_id", shiftId)
    .neq("status", "CANCELLED");
  q = from === "today" ? q.eq("trip_date", todayIst()) : q.gte("trip_date", todayIst());
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []) as Run[];
}

const finished = (r: Run) => r.status === "COMPLETED";
const departedOrFinal = (r: Run) => r.status === "IN_PROGRESS" || r.status === "COMPLETED" || Boolean(r.started_at) || Boolean(r.manifest_locked);

/** Returns a reason the change is not allowed, or null. */
export async function checkShiftChange(old: ShiftRow, next: ShiftUpdate): Promise<string | null> {
  const timeChanged =
    (next.start_time !== undefined && next.start_time !== old.start_time) ||
    (next.end_time !== undefined && next.end_time !== old.end_time) ||
    (next.booking_cutoff_minutes !== undefined && next.booking_cutoff_minutes !== old.booking_cutoff_minutes);
  const directionChanged = next.direction !== undefined && next.direction !== old.direction;
  const deactivated = next.is_active === false && old.is_active !== false;
  if (!timeChanged && !directionChanged && !deactivated) return null;

  if (directionChanged) {
    const upcoming = await runsOf(old.id, "today-and-later");
    if (upcoming.some((r) => !finished(r))) {
      return "This shift has runs today or later. Riders are booked by direction, so cancel those runs on the dispatch board first, or create a new shift.";
    }
  }
  const today = await runsOf(old.id, "today");
  if (deactivated && today.some((r) => !finished(r))) {
    return "This shift still has runs today. Cancel them on the dispatch board first (their riders are moved or told), then switch the shift off.";
  }
  if (timeChanged && today.some(departedOrFinal)) {
    return "A run of this shift has already left or its final boarding chart is out today. Change the time after today's runs finish.";
  }
  return null;
}

export interface ShiftChangeEffects {
  ridersTold: number;
  tripsAdded: number;
  /** Buses whose runs today now overlap in time (manager should re-assign on the dispatch board). */
  overlappingBuses: number[];
}

/** After the update is saved: tell riders, add missing runs, report bus clashes. */
export async function applyShiftChangeEffects(old: ShiftRow, saved: ShiftRow, actor: { userId: string; role: string }): Promise<ShiftChangeEffects> {
  const effects: ShiftChangeEffects = { ridersTold: 0, tripsAdded: 0, overlappingBuses: [] };

  if (saved.is_active !== false && old.is_active === false) {
    const roll = await executeDailyRollover(undefined, { force: true, triggeredBy: "SHIFT_ACTIVATED" });
    effects.tripsAdded = roll.success ? roll.newTripsCount : 0;
  }

  const timeChanged = saved.start_time !== old.start_time || saved.end_time !== old.end_time;
  if (!timeChanged) return effects;

  const runs = (await runsOf(saved.id, "today")).filter((r) => !departedOrFinal(r));
  if (runs.length === 0) return effects;
  const runIds = runs.map((r) => r.id);

  // Riders booked on today's runs of this shift.
  const { data: res } = await supabaseAdmin
    .from("bus_reservations")
    .select("student:students(user_id)")
    .in("trip_id", runIds)
    .in("status", ["ASSIGNED", "SEAT_SELECTED"]);
  const userIds = Array.from(
    new Set(((res || []) as unknown as { student: { user_id: string | null } | null }[]).map((r) => r.student?.user_id).filter(Boolean) as string[])
  );
  const { data: teachers } = await supabaseAdmin.from("teacher_reservations").select("user_id").in("trip_id", runIds).neq("status", "CANCELLED");
  for (const t of teachers || []) if (t.user_id) userIds.push(t.user_id);
  const unique = Array.from(new Set(userIds));
  if (unique.length) {
    const when = formatClock(saved.start_time) || "a new time";
    const { error } = await supabaseAdmin.from("notifications").insert(
      unique.map((user_id) => ({
        user_id,
        title: "Bus time changed today",
        message: `${saved.name || "Your shift"} now starts at ${when} today (was ${formatClock(old.start_time) || "different"}). Your pick-up time moves with it.`,
        type: "SHIFT_CHANGED",
        is_read: false,
        url: "/portal",
      })) as never
    );
    if (!error) effects.ridersTold = unique.length;
  }

  // Buses on these runs that now clash with another run of theirs today.
  const busIds = Array.from(new Set(runs.map((r) => r.bus_id).filter((b): b is number => b != null)));
  if (busIds.length) {
    const { data: sameBus } = await supabaseAdmin
      .from("trips")
      .select("id, bus_id, shift:shifts(start_time, end_time)")
      .in("bus_id", busIds)
      .eq("trip_date", todayIst())
      .neq("status", "CANCELLED")
      .neq("shift_id", saved.id);
    const s0 = toMinutes(saved.start_time) ?? 0;
    const e0 = toMinutes(saved.end_time) ?? s0 + 90;
    for (const t of (sameBus || []) as unknown as { bus_id: number; shift: { start_time: string | null; end_time: string | null } | null }[]) {
      const s1 = toMinutes(t.shift?.start_time ?? null);
      if (s1 == null) continue;
      const e1 = toMinutes(t.shift?.end_time ?? null) ?? s1 + 90;
      if (s0 < e1 && s1 < e0 && !effects.overlappingBuses.includes(t.bus_id)) effects.overlappingBuses.push(t.bus_id);
    }
  }

  await supabaseAdmin.from("audit_logs").insert({
    user_id: actor.userId,
    user_role: actor.role,
    action: "SHIFT_TIME_CHANGED",
    entity: "Shift",
    entity_id: saved.id,
    previous_value: { start_time: old.start_time, end_time: old.end_time },
    new_value: { start_time: saved.start_time, end_time: saved.end_time, riders_told: effects.ridersTold, overlapping_buses: effects.overlappingBuses },
  });
  return effects;
}

/** Delete a shift no trip has ever used; otherwise retire it (refused while it has runs today or later). */
export async function deleteOrRetireShift(shiftId: string): Promise<{ deleted: boolean; retired: boolean } | { error: string }> {
  const upcoming = await runsOf(shiftId, "today-and-later");
  if (upcoming.some((r) => !finished(r))) {
    return { error: "This shift has runs today or later. Cancel them on the dispatch board first." };
  }
  const { count } = await supabaseAdmin.from("trips").select("id", { count: "exact", head: true }).eq("shift_id", shiftId);
  if ((count || 0) > 0) {
    const { error } = await supabaseAdmin.from("shifts").update({ is_active: false }).eq("id", shiftId);
    if (error) return { error: error.message };
    return { deleted: false, retired: true };
  }
  const { error } = await supabaseAdmin.from("shifts").delete().eq("id", shiftId);
  if (error) return { error: error.message };
  return { deleted: true, retired: false };
}
