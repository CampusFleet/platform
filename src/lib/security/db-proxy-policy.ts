/**
 * Access policy for the browser → /api/db/rest/v1/<table> PostgREST proxy.
 *
 * The browser store (src/lib/store/*) used to call Supabase directly with the
 * public anon key while Row Level Security was disabled, which let anyone with
 * the key read password hashes and rewrite any table. All browser traffic now
 * goes through the proxy, which authenticates the session cookie and applies
 * the rules below before forwarding with the service-role key.
 *
 * Anything not listed is denied.
 */

export type ProxyMethod = "GET" | "HEAD" | "POST" | "PATCH" | "DELETE";

export const MANAGE_ROLES = ["admin", "transport_admin", "transport_manager"] as const;
export const CREW_ROLES = ["conductor", "driver"] as const;
export const STAFF_ROLES = [...MANAGE_ROLES, ...CREW_ROLES] as const;

export function isManage(role: string) {
  return (MANAGE_ROLES as readonly string[]).includes(role);
}
export function isStaff(role: string) {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

/** Tables any signed-in user may read (rows may be scoped/sanitized per role). */
export const READABLE_TABLES = new Set([
  "transit_zones",
  "stops",
  "subscription_plans",
  "route_stops",
  "routes",
  "shifts",
  "buses",
  "trips",
  "special_shift_allocations",
  "users",
  "students_full",
  "staff_full",
  "bus_reservations_full",
  "campuses",
]);

type WriteRule = { methods: ProxyMethod[]; roles: readonly string[] };

/** Staff write permissions by table. */
export const STAFF_WRITE_RULES: Record<string, WriteRule[]> = {
  attendance_records: [{ methods: ["POST"], roles: STAFF_ROLES }],
  bus_reservations: [{ methods: ["PATCH"], roles: STAFF_ROLES }],
  audit_logs: [{ methods: ["POST"], roles: STAFF_ROLES }],
  special_shift_allocations: [{ methods: ["POST", "DELETE"], roles: MANAGE_ROLES }],
  students: [{ methods: ["POST", "PATCH"], roles: MANAGE_ROLES }],
  users: [{ methods: ["PATCH"], roles: MANAGE_ROLES }],
  buses: [
    { methods: ["POST", "PATCH", "DELETE"], roles: MANAGE_ROLES },
    { methods: ["PATCH"], roles: CREW_ROLES }, // breakdown → MAINTENANCE
  ],
  stops: [{ methods: ["POST", "PATCH", "DELETE"], roles: MANAGE_ROLES }],
  route_stops: [{ methods: ["POST", "PATCH", "DELETE"], roles: MANAGE_ROLES }],
  routes: [{ methods: ["POST", "PATCH", "DELETE"], roles: MANAGE_ROLES }],
  campuses: [{ methods: ["POST", "PATCH", "DELETE"], roles: MANAGE_ROLES }],
  trips: [
    { methods: ["POST", "PATCH", "DELETE"], roles: MANAGE_ROLES },
    { methods: ["PATCH"], roles: CREW_ROLES },
  ],
  vehicle_issues: [{ methods: ["POST"], roles: STAFF_ROLES }],
  maintenance_logs: [{ methods: ["POST"], roles: STAFF_ROLES }],
};

/** Columns nobody may set through the proxy (use the dedicated API routes instead). */
export const FORBIDDEN_WRITE_COLUMNS: Record<string, string[]> = {
  users: ["id", "role", "email", "password_hash", "provider", "rfid_card_id"],
  students: ["rfid_card_id", "transport_access_suspended"],
};

/** Columns crew may change on buses / trips. */
export const CREW_PATCH_COLUMNS: Record<string, string[]> = {
  buses: ["status"],
  trips: ["status", "started_at", "completed_at", "current_stop_index", "delay_minutes"],
};

/** Self-service writes allowed for end users (students / teachers). */
export const SELF_PATCH_COLUMNS: Record<string, string[]> = {
  users: ["full_name", "phone", "campus_id", "notification_preferences"],
  bus_reservations: ["status", "cancelled_at"],
};

/** Columns stripped from every proxied response. */
export const ALWAYS_STRIPPED = ["password_hash", "code_hash", "bank_account_encrypted", "upi_id_encrypted", "face_embedding"];

/** Columns stripped for end users (students / teachers). AGENTS.md: trip_code is internal-only. */
export const END_USER_STRIPPED = ["trip_code", "rfid_card_id"];

/** For bus_reservations_full, end users only see identity fields on their own rows. */
export const OTHER_RIDER_STRIPPED = ["student_name", "student_photo_url", "student_id_code", "booking_code"];
