import { NextRequest, NextResponse } from "next/server";
import { isBoardingMethodOn, methodDisabledBody } from "@/lib/attendance/server-policy";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { cacheGet, cacheSet, cacheDel } from "@/lib/redis";
import { authenticateDevice, hasDeviceSignature, touchDevice } from "@/lib/gate/device-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/telematics/rfid
 * Ingests physical RFID card tap events from ESP32 / IoT hardware mounted on campus buses.
 * 
 * Payload:
 * {
 *   "busId": "bus-44",
 *   "rfidCardId": "93A24B1F",        // Physical RFID tag UID (HEX)
 *   "studentIdCode": "GEHU/2022/1042", // Optional fallback identifier
 *   "timestamp": "2026-10-21T09:30:00Z"
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = Buffer.from(await req.arrayBuffer());
    const body = JSON.parse(rawBody.toString("utf8") || "{}");

    // Per-device signed request (MAC-derived key): identity and bus come from the verified device,
    // never from the body. Unsigned requests are only accepted with the legacy shared key (middleware).
    let signedBusId: string | null = null;
    let signedMac: string | null = null;
    if (hasDeviceSignature(req.headers)) {
      const auth = await authenticateDevice(req.headers, "POST", new URL(req.url).pathname, rawBody);
      if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
      signedMac = auth.device.device_mac;
      signedBusId = auth.device.bus_id ? String(auth.device.bus_id) : null;
      void touchDevice(auth.device.id);
    }

    const { deviceId, deviceMac, mac, rfidCardId, rfidUid, studentIdCode, rollNo } = body;
    const busId = signedMac ? signedBusId : body.busId;
    if (signedMac) {
      body.bus_id = undefined;
      body.busNumber = undefined;
      body.vehicle_no = undefined;
    }
    const effectiveStudentIdCode = (studentIdCode || rollNo || body.studentId || body.student_id || "").trim().toUpperCase();
    const effectiveRfid = (
      rfidCardId ||
      rfidUid ||
      body.card_uid ||
      body.cardUid ||
      body.rfid ||
      body.tag_id ||
      body.rfid_data?.card_uid ||
      ""
    ).trim();

    const rawDeviceId = (
      signedMac ||
      deviceId ||
      deviceMac ||
      mac ||
      body.imei ||
      body.device_id ||
      body.vehicle_reg_no ||
      body.device_info?.imei ||
      ""
    ).trim();

    let effectiveBusId = (
      busId ||
      body.bus_id ||
      body.busNumber ||
      body.vehicle_no ||
      ""
    ).trim();
    let resolvedBusNumber = "";

    // 1. Resolve Bus Dynamically if deviceId is provided or busId is missing (pure Redis-backed)
    if (rawDeviceId) {
      // Check cache first for rapid sub-millisecond resolution
      const [cachedBusId, cachedBusNumber] = await Promise.all([
        cacheGet<string>(`telematics:device_bus_map:${rawDeviceId}`),
        cacheGet<string>(`telematics:device_bus_number:${rawDeviceId}`),
      ]);

      if (cachedBusId === "UNMAPPED") {
        effectiveBusId = "";
        resolvedBusNumber = "";
      } else if (cachedBusId) {
        effectiveBusId = cachedBusId;
        resolvedBusNumber = cachedBusNumber || "";
      } else {
        // Query database: check rfid_device_id, gps_device_id, or bus id (avoiding bigint cast error on MACs)
        const cleanDevId = rawDeviceId.trim();
        const isNumeric = /^\d+$/.test(cleanDevId);
        const busQuery = supabaseAdmin
          .from("buses")
          .select("id, bus_number");

        const { data: matchedBus, error: busLookupErr } = isNumeric
          ? await busQuery.or(`rfid_device_id.eq.${cleanDevId},gps_device_id.eq.${cleanDevId},id.eq.${cleanDevId}`).limit(1).maybeSingle()
          : await busQuery.or(`rfid_device_id.eq.${cleanDevId},gps_device_id.eq.${cleanDevId}`).limit(1).maybeSingle();

        if (busLookupErr) {
          console.error("[api/telematics/rfid] Error resolving bus for deviceId:", cleanDevId, busLookupErr);
        }

        if (matchedBus?.id) {
          effectiveBusId = matchedBus.id;
          resolvedBusNumber = matchedBus.bus_number;
          await Promise.all([
            cacheSet(`telematics:device_bus_map:${rawDeviceId}`, effectiveBusId, 300),
            cacheSet(`telematics:device_bus_number:${rawDeviceId}`, resolvedBusNumber, 300),
          ]);

          // Clean up this device from unmapped list if it was previously cached as unmapped
          try {
            const unmappedDevices = (await cacheGet<any[]>("telematics:unmapped_device_list")) || [];
            const cleanLower = cleanDevId.toLowerCase();
            if (unmappedDevices.some((d: any) => d.deviceId && d.deviceId.toLowerCase().trim() === cleanLower)) {
              const cleaned = unmappedDevices.filter((d: any) => !d.deviceId || d.deviceId.toLowerCase().trim() !== cleanLower);
              await cacheSet("telematics:unmapped_device_list", cleaned, 86400);
            }
          } catch (_) {}
        } else {
          // Explicitly unmapped in database: cache as UNMAPPED for 60s
          effectiveBusId = "";
          resolvedBusNumber = "";
          await cacheSet(`telematics:device_bus_map:${rawDeviceId}`, "UNMAPPED", 60);
          await cacheDel(`telematics:device_bus_number:${rawDeviceId}`);
        }
      }
    }

    // If busId was provided directly without deviceId, query bus number for display
    if (effectiveBusId && effectiveBusId !== "UNMAPPED" && !resolvedBusNumber) {
      const cachedNumber = await cacheGet<string>(`telematics:bus_number:${effectiveBusId}`);
      if (cachedNumber) {
        resolvedBusNumber = cachedNumber;
      } else {
        const { data: b } = await supabaseAdmin
          .from("buses")
          .select("bus_number")
          .eq("id", effectiveBusId)
          .limit(1)
          .maybeSingle();
        resolvedBusNumber = b?.bus_number || effectiveBusId;
        await cacheSet(`telematics:bus_number:${effectiveBusId}`, resolvedBusNumber, 86400);
      }
    }

    // 2. Track hardware heartbeat / online status in Redis (60s TTL so turning off power reflects within 60s)
    if (rawDeviceId || effectiveBusId) {
      const isDeviceMapped = Boolean(effectiveBusId && effectiveBusId !== "UNMAPPED");
      const hwStatus = {
        deviceId: rawDeviceId || `ESP32-${effectiveBusId}`,
        busId: isDeviceMapped ? effectiveBusId : "UNMAPPED",
        busNumber: isDeviceMapped ? (resolvedBusNumber || effectiveBusId) : null,
        isMapped: isDeviceMapped,
        lastSeen: new Date().toISOString(),
      };
      await cacheSet("telematics:latest_esp32_status", hwStatus, 60);
      if (rawDeviceId) {
        await cacheSet(`telematics:device_status:${rawDeviceId}`, hwStatus, 60);
      }
    }

    // 3. If live GPS coordinates were bundled by tracker, update live bus location cache
    const rawLat = body.latitude ?? body.lat ?? body.location_data?.latitude;
    const rawLng = body.longitude ?? body.lng ?? body.location_data?.longitude;
    if (typeof rawLat === "number" && typeof rawLng === "number" && effectiveBusId && effectiveBusId !== "UNMAPPED") {
      await cacheSet(`telematics:bus:${effectiveBusId}`, {
        latitude: rawLat,
        longitude: rawLng,
        timestamp: new Date().toISOString(),
        speed: body.speed ?? body.location_data?.speed_kmph ?? 0,
      }, 300);
    }

    // If device is not mapped to any bus yet
    if (!effectiveBusId || effectiveBusId === "UNMAPPED") {
      const nowIso = new Date().toISOString();

      if (rawDeviceId) {
        // 1. Save unmapped device so Transport Admin can bind it with 1 click (newest first)
        const unmappedDevices = (await cacheGet<any[]>("telematics:unmapped_device_list")) || [];
        const filtered = unmappedDevices.filter((d: any) => d.deviceId !== rawDeviceId);
        filtered.unshift({
          deviceId: rawDeviceId,
          detectedAt: nowIso,
          lastCardUid: effectiveRfid || null,
        });
        await cacheSet("telematics:unmapped_device_list", filtered.slice(0, 30), 86400);
      }

      // 2. CRITICAL: Save the tapped card to unmapped_rfid_list so it appears in RFID Card Issuance!
      if (effectiveRfid) {
        try {
          const existingList = (await cacheGet<any[]>("telematics:unmapped_rfid_list")) || [];
          const filteredCards = existingList.filter((item: any) => item.rfidCardId !== effectiveRfid);
          const updatedCards = [
            {
              rfidCardId: effectiveRfid,
              busId: "UNMAPPED",
              busNumber: rawDeviceId ? `ESP32 (${rawDeviceId})` : "Unassigned Bus",
              deviceId: rawDeviceId || null,
              scannedAt: nowIso,
            },
            ...filteredCards,
          ].slice(0, 30);
          await cacheSet("telematics:unmapped_rfid_list", updatedCards, 86400);
          await cacheSet("telematics:unmapped_rfid_last", updatedCards[0], 900);
        } catch (_) {}
      }

      return NextResponse.json(
        {
          success: true,
          status: "CARD_DETECTED_BUS_UNASSIGNED",
          message: `✓ RFID Card [${effectiveRfid || "Ping"}] received from ESP32 [${rawDeviceId || "Reader"}]. Ready to assign to a student and bus in Transport Admin.`,
          rfidCardId: effectiveRfid || undefined,
          deviceId: rawDeviceId || undefined,
          busId: null,
          timestamp: nowIso,
        },
        { status: 200 }
      );
    }

    if (!effectiveRfid && !effectiveStudentIdCode) {
      return NextResponse.json(
        {
          success: true,
          status: "HEARTBEAT_ACK",
          message: `✓ Heartbeat acknowledged for ESP32 [${rawDeviceId || "Reader"}] on ${resolvedBusNumber || effectiveBusId || "Bus"}.`,
          deviceId: rawDeviceId || undefined,
          busId: effectiveBusId || null,
          busNumber: resolvedBusNumber || effectiveBusId || null,
          timestamp: new Date().toISOString(),
        },
        { status: 200 }
      );
    }

    // 1. Resolve student by rfid_card_id or Student ID
    let studentQuery = supabaseAdmin.from("students_full").select("id, user_id, full_name, student_id_code, rfid_card_id, email");

    if (effectiveRfid && effectiveStudentIdCode) {
      studentQuery = studentQuery.or(`rfid_card_id.eq.${effectiveRfid},student_id_code.eq.${effectiveStudentIdCode}`);
    } else if (effectiveRfid) {
      studentQuery = studentQuery.eq("rfid_card_id", effectiveRfid);
    } else {
      studentQuery = studentQuery.eq("student_id_code", effectiveStudentIdCode);
    }

    const { data: students, error: studentErr } = await studentQuery.limit(1);

    if (studentErr || !students || students.length === 0) {
      console.warn(`[telematics/rfid] Unregistered RFID card ${effectiveRfid} on bus ${effectiveBusId} (device: ${rawDeviceId || "N/A"})`);
      if (effectiveRfid) {
        try {
          const nowIso = new Date().toISOString();
          const existingList = (await cacheGet<any[]>("telematics:unmapped_rfid_list")) || [];
          const filtered = existingList.filter((item: any) => item.rfidCardId !== effectiveRfid);
          const updatedList = [
            {
              rfidCardId: effectiveRfid,
              busId: effectiveBusId,
              busNumber: resolvedBusNumber || effectiveBusId,
              deviceId: rawDeviceId || null,
              scannedAt: nowIso,
            },
            ...filtered,
          ].slice(0, 30);
          await cacheSet("telematics:unmapped_rfid_list", updatedList, 86400);
          await cacheSet("telematics:unmapped_rfid_last", updatedList[0], 900);
        } catch (_) {}
      }
      return NextResponse.json(
        {
          success: true,
          status: "CARD_DETECTED_STUDENT_UNASSIGNED",
          message: `✓ RFID card [${effectiveRfid}] captured live on ${resolvedBusNumber || effectiveBusId}. Ready to link to a student in Transport Admin.`,
          rfidCardId: effectiveRfid,
          busId: effectiveBusId,
          busNumber: resolvedBusNumber,
          deviceId: rawDeviceId || undefined,
        },
        { status: 200 }
      );
    }

    const student = students[0];
    const studentId = student.id;

    // Resolve all linked student IDs (e.g. legacy seed ID, current active profile, user_id)
    const linkedStudentIds = new Set<string>([student.id]);
    if (student.user_id) {
      linkedStudentIds.add(student.user_id);
      const { data: siblings } = await supabaseAdmin
        .from("students_full")
        .select("id, user_id, rfid_card_id")
        .eq("user_id", student.user_id);
      if (siblings) {
        for (const s of siblings) {
          if (s.id) linkedStudentIds.add(s.id);
        }
      }
    }
    if (student.email) {
      const { data: emailSiblings } = await supabaseAdmin
        .from("students_full")
        .select("id, user_id, rfid_card_id")
        .eq("email", student.email);
      if (emailSiblings) {
        for (const s of emailSiblings) {
          if (s.id) linkedStudentIds.add(s.id);
          if (s.user_id) linkedStudentIds.add(s.user_id);
        }
      }
    }
    const allLinkedIds = Array.from(linkedStudentIds);

    // Sync rfid_card_id across all student records under the same user_id in the background
    if (student.user_id && effectiveRfid) {
      (async () => {
        try {
          await supabaseAdmin
            .from("students")
            .update({ rfid_card_id: effectiveRfid })
            .eq("user_id", student.user_id);
        } catch (_) {}
      })();
    }

    // RFID switched off: card registration above still works (for issuing cards), but no attendance.
    if (!(await isBoardingMethodOn("rfid"))) {
      return NextResponse.json(methodDisabledBody("rfid"), { status: 403 });
    }
    // 2. Resolve Today's Date in IST (UTC+5:30)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const today = istDate.toISOString().split("T")[0];
    const utcToday = now.toISOString().split("T")[0];
    const allowedDates = Array.from(new Set([today, utcToday]));
    const nowIso = now.toISOString();

    // 3. Resolve active trip for this bus today
    const { data: activeTrips } = await supabaseAdmin
      .from("trips")
      .select("id, trip_code, shift_id, route_id, status")
      .eq("bus_id", effectiveBusId)
      .in("trip_date", allowedDates)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false })
      .limit(1);

    const activeTrip = activeTrips?.[0] || null;
    const tripId = activeTrip?.id || null;

    // 4. Resolve or update active bus reservation across all linked student IDs
    const { data: reservations } = await supabaseAdmin
      .from("bus_reservations")
      .select("*")
      .in("student_id", allLinkedIds)
      .in("reservation_date", allowedDates)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false })
      .limit(1);

    const reservation = reservations?.[0] || null;
    const effectiveStudentId = reservation?.student_id || studentId;

    // ── PROFESSIONAL AFC BUS ASSIGNMENT VALIDATION ──────────────────────────
    // Check if the RFID-tapped bus matches the student's assigned bus.
    // If mismatch: record the tap for audit, but do NOT overwrite bus_id on reservation.
    // This prevents a morning Bus 37 tap from hijacking an evening Bus 45 reservation.
    const isCorrectBus = !reservation || reservation.bus_id === effectiveBusId;

    if (reservation) {
      if (isCorrectBus) {
        // ✅ Correct bus: Mark as BOARDED with full unlock
        await supabaseAdmin
          .from("bus_reservations")
          .update({
            status: "BOARDED",
            boarded_at: nowIso,
            lock_status: "UNLOCKED",
            unlocked_by: "RFID",
            unlock_timestamp: nowIso,
            ...(tripId ? { trip_id: tripId } : {}),
          })
          .eq("id", reservation.id);
      } else {
        // ⚠️ Wrong bus: Log for audit but do NOT overwrite bus_id or unlock the reservation.
        // The student's attendance lock for their assigned bus remains LOCKED.
        console.warn(
          `[telematics/rfid] Bus mismatch: Student ${student.full_name} (${effectiveStudentId}) ` +
          `tapped RFID on bus ${resolvedBusNumber || effectiveBusId} but is assigned to bus ${reservation.bus_id}. ` +
          `Recording tap for audit but NOT unlocking reservation.`
        );
      }
    }

    // 5. Anti-Passback / Rapid Double-Tap Guardrail
    // Check if attendance has already been recorded for this student on this SPECIFIC bus today
    // Scoped by bus_id to prevent cross-bus RFID reuse (professional AFC standard)
    let existingTapQuery = supabaseAdmin
      .from("attendance_records")
      .select("id, timestamp")
      .in("student_id", allLinkedIds)
      .eq("method", "RFID_VERIFIED")
      .eq("bus_id", effectiveBusId)
      .gte("timestamp", `${today}T00:00:00.000Z`);

    if (tripId) {
      existingTapQuery = existingTapQuery.eq("trip_id", tripId);
    }

    const { data: existingTap } = await existingTapQuery.limit(1).maybeSingle();

    if (!existingTap) {
      // Create new verified attendance record linked directly to reservation
      const attendanceId = `att-rfid-${Date.now()}`;
      await supabaseAdmin.from("attendance_records").insert({
        id: attendanceId,
        student_id: effectiveStudentId,
        reservation_id: reservation?.id || null,
        trip_id: tripId,
        bus_id: effectiveBusId,
        method: "RFID_VERIFIED",
        status: isCorrectBus ? "BOARDED" : "WRONG_BUS_TAP",
        verified_by: rawDeviceId ? `ESP32 [${rawDeviceId}] RFID Gate` : "ESP32 Hardware RFID Gate",
        notes: isCorrectBus
          ? `Tapped RFID card [${effectiveRfid || effectiveStudentIdCode}] at bus ${resolvedBusNumber || effectiveBusId} entry reader`
          : `⚠️ Wrong bus tap: Card [${effectiveRfid || effectiveStudentIdCode}] tapped on bus ${resolvedBusNumber || effectiveBusId} but assigned to ${reservation?.bus_id}`,
        signature_token: `RFID-${effectiveRfid || effectiveStudentIdCode}`,
        timestamp: nowIso,
        lock_status: isCorrectBus ? "UNLOCKED" : "LOCKED",
        unlocked_by: isCorrectBus ? "RFID" : null,
        rfid_card_id: effectiveRfid || student.rfid_card_id || null,
        unlock_timestamp: isCorrectBus ? nowIso : null,
      });
    }

    // 6. Fast-path cache in Redis: ONLY unlock if student tapped on their CORRECT assigned bus
    // Professional AFC: RFID tap on wrong bus must NOT auto-unlock attendance for the assigned bus.
    if (isCorrectBus) {
      const lockPayload = {
        verified: true,
        lockStatus: "UNLOCKED",
        unlockedBy: "RFID",
        rfidCardId: effectiveRfid || student.rfid_card_id || null,
        busId: effectiveBusId,
        tripId,
        timestamp: nowIso,
        method: "RFID_VERIFIED",
      };

      await Promise.all(
        allLinkedIds.flatMap((id) => [
          cacheSet(`attendance:rfid:${id}:${today}`, lockPayload, 86400),
          cacheSet(`attendance:lock:${id}:${today}`, lockPayload, 86400),
        ])
      );
    }

    // 7. Store latest in-bus RFID event for Driver Cockpit Live Feed (5 min TTL)
    await cacheSet(`telematics:rfid:latest:${effectiveBusId}`, {
      studentId,
      studentName: student.full_name,
      studentIdCode: student.student_id_code,
      seatNumber: reservation?.chosen_seat || reservation?.seat_number || null,
      rfidCardId: effectiveRfid,
      timestamp: nowIso,
      alreadyBoarded: Boolean(existingTap),
    }, 300);

    return NextResponse.json({
      success: true,
      alreadyBoarded: Boolean(existingTap),
      isCorrectBus,
      message: !isCorrectBus
        ? `⚠️ Wrong bus: ${student.full_name} is assigned to a different bus. Tap recorded for audit.`
        : existingTap
        ? `✓ Attendance already recorded for this trip. Welcome aboard, ${student.full_name}!`
        : `✓ Attendance Verified via In-Bus RFID Tap. Welcome aboard, ${student.full_name}!`,
      student: {
        id: student.id,
        name: student.full_name,
        studentIdCode: student.student_id_code,
      },
      reservation: {
        id: reservation?.id || null,
        seatNumber: reservation?.chosen_seat || null,
        status: isCorrectBus ? "BOARDED" : "WRONG_BUS",
        assignedBusId: reservation?.bus_id || null,
      },
      busId: effectiveBusId,
      busNumber: resolvedBusNumber,
      deviceId: rawDeviceId || undefined,
      tripId,
      timestamp: nowIso,
    });
  } catch (err: any) {
    console.error("[api/telematics/rfid] POST error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
