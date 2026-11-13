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

export type BoardingMethod = keyof ValidationLocksConfig;

export const BOARDING_METHOD_LABEL: Record<BoardingMethod, string> = {
  faceId: "Face ID",
  dynamicQr: "Phone pass QR",
  rfid: "RFID card",
  staticQr: "Bus / seat QR",
};

/**
 * Is this boarding method switched on by the transport office? Every boarding API calls this.
 * When the setting cannot be read (no row, database down) the method is treated as on, so an
 * outage of the settings table never stops buses from boarding. The conductor's manual check is not
 * a method here and is always available.
 */
export async function isBoardingMethodOn(method: BoardingMethod): Promise<boolean> {
  const policy = await getAttendancePolicy();
  if (!policy) return true;
  return Boolean(policy.locks[method]);
}

/** Standard refusal body for a switched-off method (HTTP 403, code METHOD_DISABLED). */
export function methodDisabledBody(method: BoardingMethod) {
  return {
    success: false,
    status: "METHOD_DISABLED",
    code: "METHOD_DISABLED",
    method,
    message: `${BOARDING_METHOD_LABEL[method]} boarding is switched off by the transport office.`,
    error: `${BOARDING_METHOD_LABEL[method]} boarding is switched off by the transport office.`,
  };
}
