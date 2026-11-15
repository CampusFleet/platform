import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/google
 *
 * Redirects to Google's OAuth 2.0 consent screen.
 * Generates a cryptographic CSRF state token stored in a cookie
 * to prevent cross-site request forgery on the callback.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    // If Google OAuth is not configured, return error
    return NextResponse.json(
      { error: "Google OAuth is not configured on this server. Please use Email OTP or Password login." },
      { status: 503 }
    );
  }

  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  // ── Generate CSRF State Token ──────────────────────────────────────
  // Cryptographically random string to prevent CSRF attacks on OAuth callback
  const statePayload = JSON.stringify({
    csrfToken: crypto.randomUUID(),
    origin,
    timestamp: Date.now(),
    // Popup sign-in (see src/lib/client/auth-navigation.ts): the callback then
    // lands on /auth/google-done instead of the portal.
    popup: req.nextUrl.searchParams.get("mode") === "popup",
  });
  const stateBase64 = Buffer.from(statePayload).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state: stateBase64,
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  // ── Set CSRF State Cookie ──────────────────────────────────────────
  const response = NextResponse.redirect(googleAuthUrl);
  const isProduction = process.env.NODE_ENV === "production";
  const cookieParts = [
    `oauth_csrf_state=${stateBase64}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600", // 10 minutes — enough for OAuth flow
  ];
  if (isProduction) {
    cookieParts.push("Secure");
  }
  response.headers.append("Set-Cookie", cookieParts.join("; "));

  return response;
}
