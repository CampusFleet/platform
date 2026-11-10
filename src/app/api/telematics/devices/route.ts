import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { getSessionFromRequest } from "@/lib/jwt";
import { cacheDel, cacheGet, cacheSet } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * GET /api/telematics/devices
 * Retrieves fleet buses and their mapped IoT hardware (ESP32 RFID & GPS),
 * along with recent hardware heartbeats and any unmapped ESP32 devices detected.
 */
export async function GET(req: NextRequest) {
  try {
    const { data: buses, error } = await supabaseAdmin
      .from("buses")
      .select("id, bus_number, registration_no, model, status, gps_device_id, rfid_device_id")
      .order("bus_number", { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    let latestHardwareStatus = await cacheGet<any>("telematics:latest_esp32_status");
    const rawUnmapped = (await cacheGet<any[]>("telematics:unmapped_device_list")) || [];

    const mappedMacs = new Set(
      (buses || [])
        .flatMap((b) => [
          b.rfid_device_id ? String(b.rfid_device_id).toLowerCase().trim() : null,
          b.gps_device_id ? String(b.gps_device_id).toLowerCase().trim() : null,
        ])
        .filter(Boolean)
    );

    const unmappedDevices = rawUnmapped.filter(
      (d) => d?.deviceId && !mappedMacs.has(String(d.deviceId).toLowerCase().trim())
    );

    if (latestHardwareStatus?.deviceId) {
      const cleanDevId = String(latestHardwareStatus.deviceId).toLowerCase().trim();
      const matchedBus = (buses || []).find(
        (b) =>
          (b.rfid_device_id && String(b.rfid_device_id).toLowerCase().trim() === cleanDevId) ||
          (b.gps_device_id && String(b.gps_device_id).toLowerCase().trim() === cleanDevId)
      );
      if (matchedBus && (!latestHardwareStatus.isMapped || latestHardwareStatus.busId !== matchedBus.id)) {
        latestHardwareStatus = {
          ...latestHardwareStatus,
          busId: matchedBus.id,
          busNumber: matchedBus.bus_number,
          isMapped: true,
        };
      }
    }

    return NextResponse.json({
      success: true,
      buses: (buses || []).map((b) => ({
        id: b.id,
        busNumber: b.bus_number,
        registrationNo: b.registration_no,
        model: b.model,
        status: b.status,
        gpsDeviceId: b.gps_device_id,
        rfidDeviceId: b.rfid_device_id,
        isOnline:
          latestHardwareStatus?.busId === b.id ||
          Boolean(
            latestHardwareStatus?.deviceId &&
              b.rfid_device_id &&
              String(latestHardwareStatus.deviceId).toLowerCase().trim() === String(b.rfid_device_id).toLowerCase().trim()
          ),
      })),
      latestHardwareStatus: latestHardwareStatus || null,
      unmappedDevices,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/telematics/devices
 * Maps or unbinds an ESP32 RFID hardware device (MAC address or Device ID) to a bus asset.
 * 
 * Body:
 * {
 *   "busId": "bus-44",
 *   "deviceId": "24:6F:28:AB:12:CD" // null or empty string to unbind
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const isAuthorized = ["admin", "transport_admin", "transport_manager"].includes(session.role);
    if (!isAuthorized) {
      return NextResponse.json({ success: false, error: "Unauthorized access" }, { status: 403 });
    }

    const body = await req.json();
    const { busId, deviceId } = body;

    if (!busId) {
      return NextResponse.json({ success: false, error: "busId is required" }, { status: 400 });
    }

    const cleanDeviceId = deviceId ? String(deviceId).trim() : null;

    // 1. Fetch current bus to capture previously mapped device (for cache invalidation & reassignment)
    const { data: currentBus } = await supabaseAdmin
      .from("buses")
      .select("id, bus_number, rfid_device_id")
      .eq("id", busId)
      .maybeSingle();

    const previousDeviceId = currentBus?.rfid_device_id ? String(currentBus.rfid_device_id).trim() : null;

    // 2. If mapping a new device, check if already mapped to another bus and unbind it
    if (cleanDeviceId) {
      const { data: existingBus } = await supabaseAdmin
        .from("buses")
        .select("id, bus_number")
        .eq("rfid_device_id", cleanDeviceId)
        .neq("id", busId)
        .limit(1);

      if (existingBus && existingBus.length > 0) {
        await supabaseAdmin
          .from("buses")
          .update({ rfid_device_id: null })
          .eq("id", existingBus[0].id);

        await cacheDel(`telematics:device_bus_map:${cleanDeviceId}`);
        await cacheDel(`telematics:device_bus_number:${cleanDeviceId}`);
      }
    }

    // 3. Update target bus in database
    const { data: updatedBus, error: updateErr } = await supabaseAdmin
      .from("buses")
      .update({ rfid_device_id: cleanDeviceId })
      .eq("id", busId)
      .select("id, bus_number, registration_no, rfid_device_id")
      .single();

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    // 4. Manage Redis Cache & Unmapped Devices List
    if (cleanDeviceId) {
      // If bus was previously mapped to a different device, invalidate old device cache
      if (previousDeviceId && previousDeviceId !== cleanDeviceId) {
        await cacheDel(`telematics:device_bus_map:${previousDeviceId}`);
        await cacheDel(`telematics:device_bus_number:${previousDeviceId}`);
        await cacheDel(`telematics:device_status:${previousDeviceId}`);

        // Add old device to unmapped list so it is immediately detectable
        const unmapped = (await cacheGet<any[]>("telematics:unmapped_device_list")) || [];
        const filtered = unmapped.filter((d) => d.deviceId !== previousDeviceId);
        filtered.unshift({
          deviceId: previousDeviceId,
          detectedAt: new Date().toISOString(),
          lastCardUid: null,
        });
        await cacheSet("telematics:unmapped_device_list", filtered.slice(0, 30), 86400);
      }

      await cacheSet(`telematics:device_bus_map:${cleanDeviceId}`, busId, 300);
      await cacheSet(`telematics:device_bus_number:${cleanDeviceId}`, updatedBus.bus_number, 300);

      // Remove newly paired device from unmapped list
      const unmapped = (await cacheGet<any[]>("telematics:unmapped_device_list")) || [];
      const filtered = unmapped.filter((d) => d.deviceId !== cleanDeviceId);
      await cacheSet("telematics:unmapped_device_list", filtered, 86400);

      // Update latest hardware status if matching
      const latest = await cacheGet<any>("telematics:latest_esp32_status");
      if (latest && latest.deviceId === cleanDeviceId) {
        await cacheSet("telematics:latest_esp32_status", {
          ...latest,
          busId,
          busNumber: updatedBus.bus_number,
          isMapped: true,
        }, 60);
      }
    } else {
      // Unlinking / deleting ESP32 assignment from this bus
      const detachedDeviceId = previousDeviceId;
      if (detachedDeviceId) {
        await cacheDel(`telematics:device_bus_map:${detachedDeviceId}`);
        await cacheDel(`telematics:device_bus_number:${detachedDeviceId}`);
        await cacheDel(`telematics:device_status:${detachedDeviceId}`);

        // Add unlinked device to unmapped list so user can see it under "New Devices" immediately!
        const unmapped = (await cacheGet<any[]>("telematics:unmapped_device_list")) || [];
        const filtered = unmapped.filter((d) => d.deviceId !== detachedDeviceId);
        filtered.unshift({
          deviceId: detachedDeviceId,
          detectedAt: new Date().toISOString(),
          lastCardUid: null,
        });
        await cacheSet("telematics:unmapped_device_list", filtered.slice(0, 30), 86400);

        // Update latest hardware status: reset to unmapped so top badge does NOT show Bus 37
        const latest = await cacheGet<any>("telematics:latest_esp32_status");
        if (latest && (latest.deviceId === detachedDeviceId || latest.busId === busId)) {
          await cacheSet("telematics:latest_esp32_status", {
            ...latest,
            busId: "UNMAPPED",
            busNumber: null,
            isMapped: false,
          }, 60);
        }
      }
    }

    await cacheDel("telematics:hardware_desk_server_data");

    // 5. Audit Log
    try {
      await supabaseAdmin.from("audit_logs").insert({
        user_role: session.role,
        action: cleanDeviceId ? "MAP_ESP32_TO_BUS" : "UNMAP_ESP32_FROM_BUS",
        new_value: {
          adminUserId: session.userId,
          busId,
          busNumber: updatedBus.bus_number,
          deviceId: cleanDeviceId,
          previousDeviceId,
        },
      });
    } catch (_) {}

    return NextResponse.json({
      success: true,
      message: cleanDeviceId
        ? `✓ ESP32 Reader [${cleanDeviceId}] successfully paired with ${updatedBus.bus_number}.`
        : `✓ ESP32 Reader unmapped from ${updatedBus.bus_number} and moved to detected list.`,
      bus: updatedBus,
      unmappedDevices: await cacheGet("telematics:unmapped_device_list"),
      latestHardwareStatus: await cacheGet("telematics:latest_esp32_status"),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
