import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cacheSet, cacheDel } from "@/lib/redis";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

/**
 * GET /api/telematics/rfid/latest-tap
 * Returns the live list of unassigned RFID cards tapped on ESP32 bus terminals,
 * ordered with the newest tapped card FIRST at the top of the list.
 */
export async function GET(req: NextRequest) {
  try {
    const unmappedList = (await cacheGet<any[]>("telematics:unmapped_rfid_list")) || [];
    const rawUnmappedDevices = (await cacheGet<any[]>("telematics:unmapped_device_list")) || [];
    const latestTap = await cacheGet<any>("telematics:latest_rfid_tap");
    let hardwareStatus = await cacheGet<any>("telematics:latest_esp32_status");

    let mappedStudent = null;
    if (latestTap?.studentId) {
      const { data: st } = await supabaseAdmin
        .from("students_full")
        .select("id, full_name, student_id_code, photo_url, class_name")
        .eq("id", latestTap.studentId)
        .limit(1);
      mappedStudent = st?.[0] || null;
    }

    const { data: dbBuses } = await supabaseAdmin
      .from("buses")
      .select("id, bus_number, registration_no, model, capacity, status, gps_device_id, rfid_device_id")
      .order("bus_number", { ascending: true });

    // Deduplicate: if a device is mapped to a bus in the database, it must never appear in unmappedDevices
    const mappedDeviceMacs = new Set(
      (dbBuses || [])
        .flatMap((b: any) => [
          b.rfid_device_id ? String(b.rfid_device_id).toLowerCase().trim() : null,
          b.gps_device_id ? String(b.gps_device_id).toLowerCase().trim() : null,
        ])
        .filter(Boolean)
    );

    const unmappedDevices = rawUnmappedDevices.filter(
      (d: any) => d?.deviceId && !mappedDeviceMacs.has(String(d.deviceId).toLowerCase().trim())
    );

    // Prune Redis cache if stale unmapped items were removed
    if (unmappedDevices.length !== rawUnmappedDevices.length) {
      await cacheSet("telematics:unmapped_device_list", unmappedDevices, 86400).catch(() => {});
    }

    // Auto-heal hardware status if the active device is actually mapped to a bus
    if (hardwareStatus?.deviceId) {
      const cleanDevId = String(hardwareStatus.deviceId).toLowerCase().trim();
      const matchedBus = (dbBuses || []).find(
        (b: any) =>
          (b.rfid_device_id && String(b.rfid_device_id).toLowerCase().trim() === cleanDevId) ||
          (b.gps_device_id && String(b.gps_device_id).toLowerCase().trim() === cleanDevId)
      );
      if (matchedBus && (!hardwareStatus.isMapped || hardwareStatus.busId !== matchedBus.id)) {
        hardwareStatus = {
          ...hardwareStatus,
          busId: matchedBus.id,
          busNumber: matchedBus.bus_number,
          isMapped: true,
        };
        await cacheSet("telematics:latest_esp32_status", hardwareStatus, 60).catch(() => {});
        await cacheSet(`telematics:device_bus_map:${hardwareStatus.deviceId}`, matchedBus.id, 300).catch(() => {});
        await cacheSet(`telematics:device_bus_number:${hardwareStatus.deviceId}`, matchedBus.bus_number, 300).catch(() => {});
      }
    }

    return NextResponse.json(
      {
        success: true,
        buses: (dbBuses || []).map((b: any) => ({
          id: b.id,
          busNumber: b.bus_number,
          registrationNo: b.registration_no || b.bus_number,
          model: b.model || "",
          capacity: Number(b.capacity || 0),
          status: b.status || "ACTIVE",
          gpsDeviceId: b.gps_device_id || "",
          rfidDeviceId: b.rfid_device_id || "",
        })),
        unmappedList,
        unmappedTap: unmappedList[0] || null,
        unmappedDevices,
        latestTap: latestTap || null,
        mappedStudent,
        hardwareStatus: hardwareStatus || null,
        timestamp: new Date().toISOString(),
      },
      {
        headers: NO_CACHE_HEADERS,
      }
    );
  } catch (err: any) {
    console.error("[api/telematics/rfid/latest-tap] GET error:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

/**
 * DELETE /api/telematics/rfid/latest-tap
 * Dismisses or deletes an unassigned card or unassigned ESP32 device from the detected list.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rfidCardId = searchParams.get("rfidCardId");
    const deviceId = searchParams.get("deviceId");
    const clearStatus = searchParams.get("clearStatus") === "true";

    // If clearing active ESP32 heartbeat status
    if (clearStatus) {
      const latestHw = await cacheGet<any>("telematics:latest_esp32_status");
      if (latestHw?.deviceId) {
        await cacheDel(`telematics:device_bus_map:${latestHw.deviceId}`);
        await cacheDel(`telematics:device_bus_number:${latestHw.deviceId}`);
        await cacheDel(`telematics:device_status:${latestHw.deviceId}`);
      }
      await cacheDel("telematics:latest_esp32_status");
      return NextResponse.json(
        { success: true, message: "ESP32 live status reset to offline." },
        { headers: NO_CACHE_HEADERS }
      );
    }

    // If dismissing an unmapped ESP32 device
    if (deviceId) {
      const unmappedDevices = (await cacheGet<any[]>("telematics:unmapped_device_list")) || [];
      const updatedDevices = unmappedDevices.filter((d: any) => d.deviceId !== deviceId);
      await cacheSet("telematics:unmapped_device_list", updatedDevices, 86400);

      await cacheDel(`telematics:device_bus_map:${deviceId}`);
      await cacheDel(`telematics:device_bus_number:${deviceId}`);
      await cacheDel(`telematics:device_status:${deviceId}`);

      const latestHw = await cacheGet<any>("telematics:latest_esp32_status");
      if (latestHw?.deviceId === deviceId) {
        await cacheDel("telematics:latest_esp32_status");
      }

      return NextResponse.json(
        { success: true, message: `ESP32 reader ${deviceId} dismissed from detected list.`, unmappedDevices: updatedDevices },
        { headers: NO_CACHE_HEADERS }
      );
    }

    let updatedList: any[] = [];
    if (rfidCardId) {
      const unmappedList = (await cacheGet<any[]>("telematics:unmapped_rfid_list")) || [];
      updatedList = unmappedList.filter((item: any) => item.rfidCardId !== rfidCardId);
      await cacheSet("telematics:unmapped_rfid_list", updatedList, 86400);

      const latest = await cacheGet<any>("telematics:unmapped_rfid_last");
      if (latest?.rfidCardId === rfidCardId) {
        if (updatedList.length > 0) {
          await cacheSet("telematics:unmapped_rfid_last", updatedList[0], 900);
        } else {
          await cacheDel("telematics:unmapped_rfid_last");
        }
      }
    } else {
      // Clear all unmapped cards
      await cacheDel("telematics:unmapped_rfid_list");
      await cacheDel("telematics:unmapped_rfid_last");
    }

    return NextResponse.json(
      { success: true, message: "Card deleted from detected list.", unmappedList: updatedList },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
