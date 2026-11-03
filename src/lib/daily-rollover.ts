import { supabaseAdmin } from "./supabaseClient";
import { getTodayIST } from "./time-manager";
import { createTripId } from "./id";
import { categorizeShifts } from "./duty-blocks";

export interface DailyRolloverResult {
  success: boolean;
  targetDate: string;
  alreadyInitialized?: boolean;
  archivedTripsCount: number;
  archivedBookingsCount: number;
  newTripsCount: number;
  resetBusesCount: number;
  message: string;
}

/**
 * Executes the daily operational rollover:
 * 1. Archives yesterday's incomplete trips to COMPLETED.
 * 2. Marks unboarded CONFIRMED bookings on past trips as NO_SHOW (preserving historical records).
 * 3. Generates today's operational trips across active routes and morning/evening daily shifts.
 * 4. Resets bus occupancy to 0.
 * 5. Records an immutable audit log entry.
 */
export async function executeDailyRollover(
  targetDateParam?: string,
  options: { force?: boolean; triggeredBy?: string } = {}
): Promise<DailyRolloverResult> {
  const targetDate = targetDateParam || getTodayIST();

  try {
    // 1. Check if trips already exist for targetDate
    const { data: existingTrips, error: checkErr } = await supabaseAdmin
      .from("trips")
      .select("id, trip_code, status")
      .eq("trip_date", targetDate);

    if (checkErr) {
      console.error("[DailyRollover] Error checking existing trips:", checkErr);
    }

    if (existingTrips && existingTrips.length > 0 && !options.force) {
      return {
        success: true,
        targetDate,
        alreadyInitialized: true,
        archivedTripsCount: 0,
        archivedBookingsCount: 0,
        newTripsCount: existingTrips.length,
        resetBusesCount: 0,
        message: `Operational trips for ${targetDate} are already active (${existingTrips.length} trips).`,
      };
    }

    // 2. Archive past incomplete trips (trip_date < targetDate)
    let archivedTripsCount = 0;
    let archivedBookingsCount = 0;

    const { data: pastIncompleteTrips } = await supabaseAdmin
      .from("trips")
      .select("id, trip_code, trip_date, status")
      .lt("trip_date", targetDate)
      .in("status", ["SCHEDULED", "IN_PROGRESS", "DELAYED"]);

    if (pastIncompleteTrips && pastIncompleteTrips.length > 0) {
      const pastTripIds = pastIncompleteTrips.map((t) => t.id);

      // Transition past trips to COMPLETED
      const { error: archiveTripErr } = await supabaseAdmin
        .from("trips")
        .update({
          status: "COMPLETED",
          completed_at: new Date().toISOString(),
        })
        .in("id", pastTripIds);

      if (!archiveTripErr) {
        archivedTripsCount = pastTripIds.length;
      }

      // Transition unboarded reservations on those past trips from CONFIRMED to NO_SHOW
      const { data: pastConfirmedBookings } = await supabaseAdmin
        .from("bus_reservations")
        .select("id")
        .in("trip_id", pastTripIds)
        .eq("status", "CONFIRMED");

      if (pastConfirmedBookings && pastConfirmedBookings.length > 0) {
        const bkIds = pastConfirmedBookings.map((b) => b.id);
        const { error: bkErr } = await supabaseAdmin
          .from("bus_reservations")
          .update({ status: "NO_SHOW" })
          .in("id", bkIds);

        if (!bkErr) {
          archivedBookingsCount = bkIds.length;
        }
      }
    }

    // 3. Pull Master Templates: Routes, Shifts, Buses, Staff
    const { data: routes } = await supabaseAdmin
      .from("routes")
      .select("id, code, name, is_active")
      .eq("is_active", true);

    const { data: shifts } = await supabaseAdmin
      .from("shifts")
      .select("*")
      .eq("is_active", true);

    const { data: buses } = await supabaseAdmin
      .from("buses")
      .select("id, bus_number, current_route_id, status, capacity")
      .neq("status", "MAINTENANCE");

    const { data: staffList } = await supabaseAdmin
      .from("staff")
      .select("id, employee_code, full_name, role, is_active");

    const drivers = (staffList || []).filter((s: any) => s.role === "driver" || s.role === "transport_staff");
    const conductors = (staffList || []).filter((s: any) => s.role === "conductor" || s.role === "transport_staff");

    // 4. Dynamically categorize active shifts into Inbound (Home -> Campus) and Outbound (Campus -> Home)
    const { incomingShifts, outgoingShifts } = categorizeShifts(
      (shifts || []).map((s: any) => ({
        ...s,
        shiftType: s.type,
      }))
    );

    const inboundShift = incomingShifts[0];

    // 5. Only active operational buses (exclude vehicles in workshop / maintenance)
    const operationalBuses = (buses || []).filter((b) => b.status === "ACTIVE");
    const activeRoutes = (routes || []).filter((r) => r.is_active !== false);
    const newTripsToInsert: any[] = [];

    // Date parity for cyclic rotation: ensures buses rotate between outgoing shifts daily
    const dayNumber = parseInt(targetDate.replace(/[^0-9]/g, "").slice(-2), 10) || 1;

    // 6. Generate scheduled trips strictly via 1-Inbound + 1-Outbound Vehicle Duty Block protocol
    activeRoutes.forEach((route) => {
      // Find bus mapped to this corridor via database foreign key
      const assignedBus = operationalBuses.find((b) => b.current_route_id === route.id);

      if (!assignedBus) {
        console.warn(`[DailyRollover] Route ${route.code || route.id} has no ACTIVE vehicle assigned. Skipping.`);
        return;
      }

      const busIdx = operationalBuses.findIndex((b) => b.id === assignedBus.id);

      // Resolve primary crew assigned to this vehicle
      const busNum = Number(assignedBus.bus_number);
      const busNumPad = String(busNum).padStart(2, "0");
      const busNumRaw = String(busNum);

      const driver = drivers.find((d) => 
        d.employee_code === `DRV-${busNumPad}` || 
        d.employee_code === `DRV-${busNumRaw}` ||
        d.id === `staff-drv-${busNumPad}` ||
        (busNum === 51 && (d.employee_code?.includes("TMP") || d.id?.includes("tempo")))
      ) || null;

      const conductor = conductors.find((c) => 
        c.employee_code === `CND-${busNumPad}` || 
        c.employee_code === `CND-${busNumRaw}` ||
        c.id === `staff-cnd-${busNumPad}` ||
        (busNum === 51 && (c.employee_code?.includes("TMP") || c.id?.includes("tempo")))
      ) || null;

      const routeClean = (route.code || route.id).toUpperCase().replace(/[^a-zA-Z0-9]/g, "");
      const dateClean = targetDate.replace(/[^0-9]/g, "");

      // 1. Inbound Morning Run (07:15, Home -> Campus)
      if (inboundShift) {
        const rawTime = (inboundShift as any).start_time || inboundShift.startTime || "";
        const timeCode = rawTime ? rawTime.substring(0, 5).replace(":", "") : "0715";
        const inboundTripId = createTripId();
        const inboundTripCode = `TRIP-${routeClean}-${timeCode}-${dateClean}`;

        newTripsToInsert.push({
          id: inboundTripId,
          trip_code: inboundTripCode,
          route_id: route.id,
          bus_id: assignedBus.id,
          shift_id: inboundShift.id,
          driver_id: driver?.id || null,
          conductor_id: conductor?.id || null,
          trip_date: targetDate,
          status: "SCHEDULED",
          delay_minutes: 0,
          manifest_locked: false,
          current_stop_index: 0,
        });
      }

      // 2. Outbound Run (Campus -> Home): Dynamic Rotation across active outgoing shifts
      const assignedOutshift =
        outgoingShifts.length > 0
          ? outgoingShifts[(busIdx + dayNumber) % outgoingShifts.length]
          : null;

      if (assignedOutshift) {
        const timeCode = (assignedOutshift as any).start_time
          ? (assignedOutshift as any).start_time.substring(0, 5).replace(":", "")
          : assignedOutshift.startTime
          ? assignedOutshift.startTime.substring(0, 5).replace(":", "")
          : "1645";
        const outboundTripId = createTripId();
        const outboundTripCode = `TRIP-${routeClean}-${timeCode}-${dateClean}`;

        newTripsToInsert.push({
          id: outboundTripId,
          trip_code: outboundTripCode,
          route_id: route.id,
          bus_id: assignedBus.id,
          shift_id: assignedOutshift.id,
          driver_id: driver?.id || null,
          conductor_id: conductor?.id || null,
          trip_date: targetDate,
          status: "SCHEDULED",
          delay_minutes: 0,
          manifest_locked: false,
          current_stop_index: 0,
        });
      }
    });

    // Deduplicate by trip id
    const uniqueTripsToInsert = Array.from(new Map(newTripsToInsert.map((t) => [t.id, t])).values());

    let newTripsCount = 0;
    if (uniqueTripsToInsert.length > 0) {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("trips")
        .upsert(uniqueTripsToInsert, { onConflict: "id" })
        .select("id");

      if (insertErr) {
        console.error("[DailyRollover] Trip upsert error:", insertErr);
        throw insertErr;
      }
      newTripsCount = inserted ? inserted.length : newTripsToInsert.length;
    }

    // 5. Reset Bus Occupancy to 0
    let resetBusesCount = 0;
    const { error: resetBusErr } = await supabaseAdmin
      .from("buses")
      .update({ occupancy: 0 })
      .neq("status", "MAINTENANCE");

    if (!resetBusErr) {
      resetBusesCount = operationalBuses.length;
    }

    // 6. Expire past dynamic bus merge suggestions
    try {
      await supabaseAdmin
        .from("bus_merge_suggestions")
        .update({ status: "EXPIRED" })
        .eq("status", "PENDING")
        .lt("created_at", targetDate);
    } catch {
      // Non-critical if table doesn't have created_at column
    }

    // 7. Record Immutable Audit Log Entry
    await supabaseAdmin.from("audit_logs").insert({
      user_role: "system",
      action: "DAILY_ROLLOVER_SUCCESS",
      entity: "DailyTransitLifecycle",
      entity_id: targetDate,
      reason: `Rollover to operational date ${targetDate} triggered by ${options.triggeredBy || "SYSTEM_CRON"}. Archived ${archivedTripsCount} past trips and ${archivedBookingsCount} bookings. Generated ${newTripsCount} fresh scheduled trips.`,
      new_value: {
        targetDate,
        archivedTripsCount,
        archivedBookingsCount,
        newTripsCount,
        resetBusesCount,
      },
      created_at: new Date().toISOString(),
    });

    return {
      success: true,
      targetDate,
      alreadyInitialized: false,
      archivedTripsCount,
      archivedBookingsCount,
      newTripsCount,
      resetBusesCount,
      message: `Successfully rolled over to ${targetDate}! Created ${newTripsCount} fresh operational trips. Bus capacity 100% available for booking.`,
    };
  } catch (error: any) {
    console.error("[DailyRollover] Fatal error during daily rollover:", error);
    return {
      success: false,
      targetDate,
      archivedTripsCount: 0,
      archivedBookingsCount: 0,
      newTripsCount: 0,
      resetBusesCount: 0,
      message: `Failed to complete daily rollover: ${error.message || error}`,
    };
  }
}
