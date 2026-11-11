import { NextResponse } from "next/server";

/**
 * RETIRED. The v1 endpoint accepted face embeddings computed in the browser (with a
 * non-commercial model) and client-reported liveness scores. Enrollment now goes through
 * POST /api/biometrics/enroll-v2, where the server creates templates from camera frames.
 */
export async function POST() {
  return NextResponse.json(
    { success: false, code: "ENDPOINT_RETIRED", message: "Face ID enrollment moved to /api/biometrics/enroll-v2. Please update the app." },
    { status: 410 }
  );
}
