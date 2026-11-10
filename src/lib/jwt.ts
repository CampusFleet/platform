import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

/**
 * Signing key for session JWTs. There is no hardcoded fallback in production:
 * a committed default would let anyone forge an admin session.
 * Outside production a fixed dev-only key is allowed so the edge middleware and
 * Node route handlers agree; it is never accepted when NODE_ENV === "production".
 */
const DEV_FALLBACK_SECRET =
  process.env.NODE_ENV === "production" ? "" : "campusfleet-local-development-only-jwt-key";
let cachedSecret: Uint8Array | null = null;
function getJwtSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.JWT_SECRET || DEV_FALLBACK_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters.");
  }
  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

const COOKIE_NAME = "campusfleet_session";
const TOKEN_EXPIRY = "24h"; // Reduced from 7d for security — silent refresh handles UX
const COOKIE_MAX_AGE = 24 * 60 * 60; // 24 hours in seconds

const ISSUER = "campusfleet";
const AUDIENCE = "campusfleet-app";

export interface SessionPayload extends JWTPayload {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  campusId?: string;
  campus?: string;
  avatarUrl?: string;
}

/**
 * Create a signed JWT token from user data.
 * Includes jti (JWT ID) for token uniqueness and revocation support,
 * iss (issuer) and aud (audience) for validation.
 */
export async function signToken(payload: Omit<SessionPayload, "iat" | "exp" | "jti">): Promise<string> {
  const jti = crypto.randomUUID(); // Unique token ID for revocation support

  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(jti)
    .sign(getJwtSecret());
}

/**
 * Verify and decode a JWT token.
 * Validates issuer, audience, and expiration.
 */
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Get session from request cookies (for API routes).
 */
export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Get session from Next.js cookies (for server components/actions).
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Create a Set-Cookie header value for the session.
 * HttpOnly + SameSite=Lax + Secure (in production) for maximum security.
 */
export function createSessionCookie(token: string): string {
  const isProduction = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE}`,
  ];
  if (isProduction) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/**
 * Create a Set-Cookie header to clear the session.
 */
export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export { COOKIE_NAME };
