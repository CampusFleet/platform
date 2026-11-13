import { NextRequest, NextResponse } from "next/server";
import { redis, cacheSet, cacheGet } from "@/lib/redis";
import type { HaltRequest, HaltRequestStatus } from "@/lib/types";
import { createHaltRequest } from "@/lib/dispatch/halt";
import { isSafeId } from "@/lib/security/safe-id";
import { getSessionFromRequest } from "@/lib/jwt";
import { isStaffRole, resolveActingStudentId } from "@/lib/security/actor";
import { supabaseAdmin } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

const STATUSES: HaltRequestStatus[] = ["PENDING", "APPROVED", "REJECTED", "COMPLETED"];
const keyFor = (tripId: string, studentId: string) => `halt_request:${tripId}:${studentId}`;

// GET ?tripId=…            → all requests for the trip (crew only)
// GET ?tripId=…&studentId= → one request (riders: always their own)
export async function GET(req: NextRequest) {
  try {
    if (!redis) return NextResponse.json({ success: false, error: "Redis not configured" }, { status: 503 });
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get("tripId");
    if (!tripId) return NextResponse.json({ success: false, error: "tripId is required" }, { status: 400 });

    const { studentId, isStaff } = await resolveActingStudentId(session, searchParams.get("studentId"));

    if (studentId) {
      const data = await cacheGet<HaltRequest>(keyFor(tripId, studentId));
      return NextResponse.json({ success: true, request: data });
    }
    if (!isStaff) return NextResponse.json({ success: true, request: null });

    const keys = await redis.keys(`halt_request:${tripId}:*`);
    if (keys.length === 0) return NextResponse.json({ success: true, requests: [] });
    const requests = (await redis.mget(...keys)).filter(Boolean) as HaltRequest[];
    return NextResponse.json({ success: true, requests });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST: a rider asks the bus to wait for them. Students use /api/students/ride/halt, which picks
// the trip for them; here a non-staff caller must hold a reservation on the named trip.
export async function POST(req: NextRequest) {
  try {
    if (!redis) return NextResponse.json({ success: false, error: "Redis not configured" }, { status: 503 });
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });

    const body = await req.json();
    const { tripId, latitude, longitude } = body;
    const { studentId, isStaff } = await resolveActingStudentId(session, body.studentId);

    if (!isSafeId(tripId) || !studentId || typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }
    if (!isStaff) {
      const { data: resv } = await supabaseAdmin
        .from("bus_reservations")
        .select("id")
        .eq("trip_id", tripId)
        .eq("student_id", studentId)
        .neq("status", "CANCELLED")
        .limit(1)
        .maybeSingle();
      if (!resv) return NextResponse.json({ success: false, error: "You are not booked on this bus." }, { status: 403 });
    }
    const request = await createHaltRequest(tripId, studentId, { latitude, longitude });
    return NextResponse.json({ success: true, request });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH: crew approves / rejects / completes.
export async function PATCH(req: NextRequest) {
  try {
    if (!redis) return NextResponse.json({ success: false, error: "Redis not configured" }, { status: 503 });
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ success: false, error: "Authentication required." }, { status: 401 });
    if (!isStaffRole(session.role)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });

    const { tripId, studentId, status } = await req.json();
    if (!tripId || !studentId || !STATUSES.includes(status)) {
      return NextResponse.json({ success: false, error: "Missing or invalid fields" }, { status: 400 });
    }

    const key = keyFor(tripId, studentId);
    const existing = await cacheGet<HaltRequest>(key);
    if (!existing) return NextResponse.json({ success: false, error: "Request not found or expired" }, { status: 404 });

    existing.status = status;
    existing.updatedAt = new Date().toISOString();
    await cacheSet(key, existing, 900);
    return NextResponse.json({ success: true, request: existing });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
