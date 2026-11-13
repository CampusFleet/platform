import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/jwt";
import { resolveApiAccess, safeEqual, STAFF } from "@/lib/security/api-access";

/**
 * Next.js Middleware — Route Protection via JWT validation.
 * Protects portal, admin, staff, driver, conductor routes.
 * API routes require a session by default; see src/lib/security/api-access.ts
 * for the public / device / role rules.
 *
 * Security features (Cloudflare Audit compliant):
 * - CSRF origin verification on state-changing requests
 * - Cross-portal guard (prevents role-based portal hopping)
 * - Request ID injection for audit trail correlation
 */

const PROTECTED_PREFIXES = [
  "/portal",
  "/admin",
  "/transport-admin",
  "/transport-manager",
  "/driver",
  "/conductor",
  "/teacher",
];

// Allowed origins for CSRF checks — configured from environment
const ALLOWED_ORIGINS: string[] = [
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
].filter(Boolean);

function getTargetRouteForRole(role?: string): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "transport_admin":
      return "/transport-admin";
    case "transport_manager":
      return "/transport-manager";
    case "driver":
      return "/driver";
    case "conductor":
      return "/conductor";
    case "teacher":
      return "/teacher";
    default:
      return "/portal";
  }
}

/**
 * Validates that the request origin is allowed.
 * More restrictive than previous implementation which allowed any *.vercel.app subdomain.
 */
function isOriginAllowed(origin: string, host: string): boolean {
  try {
    const originHost = new URL(origin).host;

    // Same host — always allowed
    if (originHost === host) return true;

    // Check against configured allowed origins
    for (const allowed of ALLOWED_ORIGINS) {
      try {
        if (new URL(allowed).host === originHost) return true;
      } catch {
        continue;
      }
    }

    // Allow Vercel preview deployments for the same project
    // Only when BOTH origin and host are on vercel.app
    if (originHost.endsWith(".vercel.app") && host.endsWith(".vercel.app")) {
      return true;
    }

    // Allow localhost in development only
    if (process.env.NODE_ENV !== "production") {
      if (originHost.includes("localhost") && host.includes("localhost")) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow static files and Next.js internal bundles
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname === "/manifest.webmanifest" ||
    (pathname.includes(".") && !pathname.startsWith("/api"))
  ) {
    return NextResponse.next();
  }

  // ── Permanent Migration Redirects (Staff -> Transport Admin, Transport Head -> Transport Manager) ──
  if (pathname === "/staff" || pathname.startsWith("/staff/")) {
    const newPath = pathname.replace(/^\/staff/, "/transport-admin");
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = newPath;
    return NextResponse.redirect(redirectUrl, { status: 301 });
  }
  if (pathname === "/transport-head" || pathname.startsWith("/transport-head/")) {
    const newPath = pathname.replace(/^\/transport-head/, "/transport-manager");
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = newPath;
    return NextResponse.redirect(redirectUrl, { status: 301 });
  }

  // ── Auth callback routes must COMPLETELY bypass middleware ──────────
  // NextResponse.next({ request: { headers } }) can strip Set-Cookie headers
  // from route handler responses in Next.js 14, breaking OAuth login flows.
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // ── CSRF & Origin Verification on State-Changing API Routes ─────────
  if (pathname.startsWith("/api") && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");

    if (origin && host) {
      if (!isOriginAllowed(origin, host)) {
        return NextResponse.json(
          { error: "Cross-Origin request blocked by security policy" },
          { status: 403 }
        );
      }
    }
  }

  // Validate JWT from cookie if present
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  // ── API authentication & role gate (deny by default) ────────────────
  if (pathname.startsWith("/api")) {
    const access = resolveApiAccess(pathname, req.method);

    if (access.kind === "device") {
      // Bus hardware (ESP32 / GPS) authenticates with x-device-key; people with a session.
      const deviceKey = process.env.TELEMATICS_DEVICE_KEY || "";
      const presented = req.headers.get("x-device-key") || "";
      // Per-device signed requests (x-cf-device + x-cf-signature) are verified in the handler
      // against the MAC-derived key; the shared key remains for not-yet-migrated firmware.
      const isSignedDevice = Boolean(req.headers.get("x-cf-device") && req.headers.get("x-cf-signature"));
      const isDevice = isSignedDevice || (deviceKey.length >= 32 && safeEqual(presented, deviceKey));
      const isRead = req.method === "GET" || req.method === "HEAD";
      const sessionAllowed = session && (isRead || (STAFF as readonly string[]).includes(session.role));
      if (!isDevice && !sessionAllowed) {
        return NextResponse.json(
          { success: false, error: session ? "Forbidden." : "Authentication required." },
          { status: session ? 403 : 401 }
        );
      }
    } else if (access.kind === "session") {
      if (!session) {
        return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
      }
      if (access.roles && !access.roles.includes(session.role)) {
        return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
      }
    }

    // Add request ID header for audit trail correlation
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-request-id", crypto.randomUUID());
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Root Homepage ("/") & Login ("/login") Handling
  if (pathname === "/" || pathname === "/login") {
    // If authenticated, redirect directly to assigned role console
    if (session) {
      const targetRoute = getTargetRouteForRole(session.role);
      const targetUrl = new URL(targetRoute, req.url);
      return NextResponse.redirect(targetUrl);
    }

    // If on root "/" and unauthenticated, redirect directly to /login
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    return NextResponse.next();
  }

  // Check if the route is protected
  const isProtected = PROTECTED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + "/"));
  if (!isProtected) {
    return NextResponse.next();
  }

  if (!token || !session) {
    // No valid session — redirect to login
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    const response = NextResponse.redirect(loginUrl);
    if (token && !session) {
      response.cookies.delete(COOKIE_NAME);
    }
    return response;
  }

  // Pass user info via headers for server components
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-user-id", session.userId);
  requestHeaders.set("x-user-email", session.email);
  requestHeaders.set("x-user-role", session.role);
  requestHeaders.set("x-request-id", crypto.randomUUID());

  // ── Cross-portal guard ─────────────────────────────────────────────
  // If the user is on the wrong portal for their role, redirect to the correct one.
  // This catches stale JWT sessions after an admin role change.
  const correctPortal = getTargetRouteForRole(session.role);

  // Portals each role is allowed to access
  // Hierarchy:
  // - Admin can access Admin, Transport Admin (staff), and Transport Head
  // - Transport Admin (staff) can access Transport Admin and Transport Head
  // - Transport Head can access Transport Head
  const allowedPortalsForRole: Record<string, string[]> = {
    student: ["/portal"],
    admin: ["/admin", "/transport-admin", "/transport-manager", "/portal", "/conductor", "/driver", "/teacher"],
    transport_admin: ["/transport-admin", "/transport-manager", "/portal"],
    transport_manager: ["/transport-manager"],
    driver: ["/driver"],
    conductor: ["/conductor"],
    teacher: ["/teacher"],
  };

  const myAllowedPortals = allowedPortalsForRole[session.role] || ["/portal"];

  // Check if they're on a portal that is NOT in their allowed list
  const allPortals = [
    "/portal",
    "/admin",
    "/transport-admin",
    "/transport-manager",
    "/driver",
    "/conductor",
    "/teacher"
  ];
  const isOnWrongPortal = allPortals
    .filter(p => !myAllowedPortals.includes(p))
    .some(p => pathname === p || pathname.startsWith(p + "/"));

  if (isOnWrongPortal) {
    return NextResponse.redirect(new URL(correctPortal, req.url));
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
