import { db } from "@/lib/supabaseClient";
import { generateSeatLayout } from "@/lib/utils";
import { allocateSeatWithPreferences } from "@/lib/seat-allocation-engine";
import type { Bus } from "@/lib/types";

/**
 * Boarding-chart seats. Server-only.
 *
 * Every reservation on the chart gets a seat (bus_reservations.chosen_seat) chosen with the
 * student's saved preferences (row, window/aisle, seat partner) and keeping teacher seats free.
 * The seat is final: students do not pick or change it; the conductor can move a student on the
 * seat map. Students see the number only after check-in.
 *
 * The unique index uq_bus_reservations_trip_seat (trip_id, chosen_seat) stops two reservations
 * getting the same seat when two callers assign at once; on a clash the next free seat is tried.
 * Called whenever the trip's passenger list is read (conductor duty poll, student ride), so seats
 * appear within seconds of the chart adding a student.
 */

const MAX_TRIES = 4;

export async function assignTripSeats(tripId: string, busId: number | null): Promise<number> {
  if (busId == null) return 0;
  const { data: rows } = await db
    .from("bus_reservations")
    .select("id, student_id, chosen_seat, status")
    .eq("trip_id", tripId)
    .not("status", "in", "(CANCELLED,SWITCHED)");
  const all = rows || [];
  const unseated = all.filter((r) => !r.chosen_seat && r.student_id);
  if (unseated.length === 0) return 0;

  const { data: bus } = await db.from("buses").select("id, capacity, seat_layout, total_rows, teacher_seats_count").eq("id", busId).maybeSingle();
  if (!bus) return 0;
  const busModel = {
    id: bus.id,
    capacity: Number(bus.capacity) || 0,
    seatLayout: bus.seat_layout || "NONE",
    totalRows: bus.total_rows ?? undefined,
    teacherSeatsCount: bus.teacher_seats_count ?? 0,
  } as unknown as Bus;
  const seats = generateSeatLayout(busModel.capacity, busModel.seatLayout, busModel.totalRows);
  if (seats.length === 0) return 0; // no seat layout configured: the conductor seats people by hand

  const ids = unseated.map((r) => r.student_id as string);
  const { data: prefs } = await db
    .from("students")
    .select("id, full_name, seat_row_preference, seat_position_preference, preferred_partner_student_id, preferred_partner_name")
    .in("id", ids);
  const prefById = new Map((prefs || []).map((p) => [p.id, p]));

  const occupied = new Set(all.map((r) => r.chosen_seat).filter(Boolean) as string[]);
  const tripRes = all.map((r) => ({ student_id: r.student_id as string, chosen_seat: r.chosen_seat, status: r.status ?? undefined }));
  let assigned = 0;

  // Students whose partner is already seated go first, so they can sit next to them.
  unseated.sort((a, b) => {
    const pa = prefById.get(a.student_id as string)?.preferred_partner_student_id;
    const pb = prefById.get(b.student_id as string)?.preferred_partner_student_id;
    const sa = pa && tripRes.some((r) => r.student_id === pa && r.chosen_seat) ? 0 : 1;
    const sb = pb && tripRes.some((r) => r.student_id === pb && r.chosen_seat) ? 0 : 1;
    return sa - sb;
  });

  for (const r of unseated) {
    const p = prefById.get(r.student_id as string);
    for (let i = 0; i < MAX_TRIES; i++) {
      if (seats.every((s) => occupied.has(s))) return assigned; // bus is full
      const alloc = allocateSeatWithPreferences({
        bus: busModel,
        student: {
          id: r.student_id as string,
          fullName: p?.full_name ?? undefined,
          seatRowPreference: (p?.seat_row_preference as any) || undefined,
          seatPositionPreference: (p?.seat_position_preference as any) || undefined,
          preferredPartnerStudentId: p?.preferred_partner_student_id ?? null,
          preferredPartnerName: p?.preferred_partner_name ?? null,
        },
        occupiedSeats: Array.from(occupied),
        allTripReservations: tripRes,
      });
      const seat = alloc.allocatedSeat;
      if (!seat || occupied.has(seat)) return assigned; // only teacher seats left
      const { data, error } = await db
        .from("bus_reservations")
        .update({ chosen_seat: seat, auto_assigned_seat: seat })
        .eq("id", r.id)
        .is("chosen_seat", null)
        .select("id")
        .maybeSingle();
      occupied.add(seat);
      if (error?.code === "23505") continue; // someone else took it a moment ago
      if (data) {
        assigned++;
        const row = tripRes.find((x) => x.student_id === r.student_id);
        if (row) row.chosen_seat = seat;
      }
      break;
    }
  }
  return assigned;
}
