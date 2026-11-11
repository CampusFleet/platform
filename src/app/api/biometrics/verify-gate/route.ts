import { NextResponse } from "next/server";

/**
 * RETIRED. The v1 gate endpoint trusted client-computed embeddings and a client-chosen match
 * threshold. Gate cameras (bus devices and crew phones) now upload face crops to
 * POST /api/gate/captures; templates, matching and decisions happen on the server.
 */
export async function POST() {
  return NextResponse.json(
    { success: false, code: "ENDPOINT_RETIRED", message: "Gate verification moved to /api/gate/captures." },
    { status: 410 }
  );
}
