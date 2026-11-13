import { db as supabaseAdmin } from "@/lib/supabaseClient";
import { cacheDel, getOrFetchWithCache } from "@/lib/redis";
import type { TransitAttendanceMode, ValidationLocksConfig } from "@/lib/types";

/** Server-only: the transport office's active boarding methods (transport_settings.validation_locks). */
export interface AttendancePolicy {
  mode: TransitAttendanceMode;
  locks: ValidationLocksConfig;
}

const KEY = "policy:attendance";

export async function getAttendancePolicy(): Promise<AttendancePolicy | null> {
  try {
    return await getOrFetchWithCache<AttendancePolicy | null>({
      key: KEY,
      ttl: 30,
      fetchFn: async () => {
        const { data } = await supabaseAdmin.from("transport_settings").select("attendance_mode, validation_locks").limit(1).maybeSingle();
        if (!data?.validation_locks) return null;
        const l = data.validation_locks as Record<string, unknown>;
        return {
          mode: (data.attendance_mode || "ALL") as TransitAttendanceMode,
          locks: { faceId: Boolean(l.faceId), dynamicQr: Boolean(l.dynamicQr), rfid: Boolean(l.rfid), staticQr: Boolean(l.staticQr) },
        };
      },
    });
  } catch {
    return null;
  }
}

export async function invalidateAttendancePolicy(): Promise<void> {
  await cacheDel(KEY);
}
