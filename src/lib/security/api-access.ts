/**
 * Central API access table, enforced by src/middleware.ts for every /api/* request.
 *
 * Previously middleware let all /api routes through and ~48 handlers had no
 * session check of their own. Now every API route requires a valid session
 * unless it is explicitly listed as public (with its own authentication,
 * e.g. webhook signatures, cron secret or device key). Role rules are matched
 * by longest prefix; handlers may still apply finer checks.
 *
 * Edge-runtime safe (no Node APIs).
 */

export const ADMIN = ["admin"] as const;
export const MANAGE = ["admin", "transport_admin", "transport_manager"] as const;
export const CREW = ["conductor", "driver"] as const;
export const STAFF = [...MANAGE, ...CREW] as const;
export const TEACHING = ["teacher", "admin"] as const;

type Roles = readonly string[];

/** No session required. Each of these authenticates in its own handler. */
const PUBLIC_PREFIXES = [
  "/api/auth", // login/OTP/OAuth (handlers check session where needed)
  "/api/payments/razorpay/webhook", // HMAC signature verified in handler
  "/api/webhooks/", // shared secret verified in handler
  "/api/cron/", // CRON_SECRET verified in handler
  "/api/photo-proxy", // allow-listed public image hosts only
  "/api/gate/captures", // per-device HMAC signature OR crew session, verified in handler
  "/api/gate/heartbeat", // per-device HMAC signature, verified in handler
];

/** Public only for the given methods. */
const PUBLIC_METHOD_PATHS: Record<string, string[]> = {
  "/api/students/verify": ["GET"], // public ID-card verification page (non-sensitive fields)
};

/** Device endpoints: session OR a valid x-device-key header. */
export const DEVICE_PATHS = ["/api/telematics/live", "/api/telematics/rfid"];

interface RoleRule {
  prefix: string;
  /** Roles for all methods unless `write` is given. */
  roles?: Roles;
  /** Roles required for non-GET methods (GET then only needs a session). */
  write?: Roles;
}

const ROLE_RULES: RoleRule[] = [
  { prefix: "/api/admin", roles: ADMIN },
  { prefix: "/api/gate/devices", roles: MANAGE },
  { prefix: "/api/gate/process", roles: MANAGE },
  { prefix: "/api/ops/stream", roles: [...STAFF] },
  { prefix: "/api/biometrics/evidence", roles: MANAGE },
  { prefix: "/api/biometrics/metrics", roles: MANAGE },
  { prefix: "/api/biometrics/calibration", roles: ["admin", "transport_admin"] },
  { prefix: "/api/staff/salary/admin", roles: ["admin", "transport_admin"] },
  { prefix: "/api/staff/salary/profile", roles: STAFF },
  { prefix: "/api/staff", roles: MANAGE },
  { prefix: "/api/audit-logs", roles: MANAGE },
  { prefix: "/api/merges", roles: MANAGE },
  { prefix: "/api/transport-manager", roles: MANAGE },
  { prefix: "/api/payments/approvals", write: MANAGE }, // GET is scoped to own rows in the handler
  { prefix: "/api/telematics/devices", roles: MANAGE },
  { prefix: "/api/telematics/rfid/map", roles: MANAGE },
  { prefix: "/api/telematics/rfid/latest-tap", roles: STAFF },
  { prefix: "/api/dispatch/halt-requests", write: [...STAFF, "student", "teacher"] },
  { prefix: "/api/dispatch", roles: STAFF },
  { prefix: "/api/boarding/scan", roles: STAFF },
  { prefix: "/api/boarding/rolling-token", roles: STAFF },
  { prefix: "/api/conductor", roles: STAFF },
  { prefix: "/api/crew", roles: STAFF },
  { prefix: "/api/biometrics/verify-gate", roles: STAFF },
  { prefix: "/api/maintenance", roles: STAFF },
  { prefix: "/api/teacher", roles: [...TEACHING, "transport_admin", "transport_manager"] },
  { prefix: "/api/fleet/settings", write: MANAGE },
  { prefix: "/api/shifts", write: MANAGE },
  { prefix: "/api/stops", write: MANAGE },
  { prefix: "/api/zones", write: MANAGE },
  { prefix: "/api/campus", write: MANAGE },
  { prefix: "/api/rest-zones", write: MANAGE },
  { prefix: "/api/classes", write: [...MANAGE, "teacher"] },
  { prefix: "/api/sync/state", write: MANAGE },
];

export type ApiAccessDecision =
  | { kind: "public" }
  | { kind: "device" }
  | { kind: "session"; roles: Roles | null };

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : prefix + "/");
}

export function resolveApiAccess(pathname: string, method: string): ApiAccessDecision {
  if (PUBLIC_PREFIXES.some((p) => matches(pathname, p) || pathname.startsWith(p))) return { kind: "public" };
  const publicMethods = PUBLIC_METHOD_PATHS[pathname];
  if (publicMethods && publicMethods.includes(method)) return { kind: "public" };
  if (DEVICE_PATHS.includes(pathname)) return { kind: "device" };

  const rule = ROLE_RULES.filter((r) => matches(pathname, r.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!rule) return { kind: "session", roles: null };
  if (rule.roles) return { kind: "session", roles: rule.roles };
  const isRead = method === "GET" || method === "HEAD" || method === "OPTIONS";
  return { kind: "session", roles: isRead ? null : rule.write || null };
}

/** Constant-time string compare usable in the edge runtime. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
