import { getStaffServerData } from "@/lib/transport-admin-data";
import { supabaseAdmin } from "@/lib/supabaseClient";
import StaffReportsView from "@/components/transport-admin/StaffReportsView";
import type { Booking } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StaffSystemReportsPage() {
  const data = await getStaffServerData("/transport-admin/system/reports");

  const [
    { data: dbBookings },
    { data: dbPayments },
  ] = await Promise.all([
    supabaseAdmin.from("bus_reservations_full").select("*").order("created_at", { ascending: false }).limit(500),
    // The legacy `payments` table was dropped; report on payment_submissions instead.
    supabaseAdmin
      .from("payment_submissions_full")
      .select("id, receipt_number, transaction_id, full_name, student_name, zone_code, amount, verified_amount, gateway_source, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const payments = (dbPayments || []).map((p: any) => ({
    id: p.id,
    receiptNumber: p.receipt_number || p.transaction_id || p.id,
    studentName: p.full_name || p.student_name || "",
    planName: p.zone_code || "",
    amount: Number(p.verified_amount ?? p.amount) || 0,
    paymentMethod: p.gateway_source || "UPI",
    createdAt: p.created_at,
    status: p.status === "APPROVED" ? "PAID" : p.status,
  }));

  const bookings: Booking[] = (dbBookings || []).map((b: any) => ({
    id: b.id,
    bookingCode: b.booking_code || b.booking_ref || `BK-${b.id.slice(0, 6)}`,
    studentId: b.student_id,
    tripId: b.trip_id,
    busId: b.bus_id || "",
    bookingDate: b.booking_date || (b.created_at ? b.created_at.split("T")[0] : ""),
    boardingStopId: b.boarding_stop_id || b.stop_id || "",
    status: b.status || "CONFIRMED",
    seatNumber: b.seat_number,
    waitlistPosition: b.waitlist_position,
    passengerType: b.passenger_type,
    createdAt: b.created_at || new Date().toISOString(),
  }));

  return (
    <StaffReportsView
      initialBookings={bookings}
      initialStudents={data.students}
      initialBuses={data.buses}
      initialPayments={payments}
      initialMaintenance={[]}
    />
  );
}
