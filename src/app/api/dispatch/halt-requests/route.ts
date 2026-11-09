import { NextRequest, NextResponse } from "next/server";
import { redis, cacheSet, cacheGet } from "@/lib/redis";
import type { HaltRequest } from "@/lib/types";
import { createHaltId } from "@/lib/id";

export const dynamic = "force-dynamic";

// GET /api/dispatch/halt-requests?tripId=123 (For conductor)
// GET /api/dispatch/halt-requests?tripId=123&studentId=456 (For student)
export async function GET(req: NextRequest) {
  try {
    if (!redis) return NextResponse.json({ success: false, error: "Redis not configured" }, { status: 503 });

    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get("tripId");
    const studentId = searchParams.get("studentId");

    if (!tripId) {
      return NextResponse.json({ success: false, error: "tripId is required" }, { status: 400 });
    }

    if (studentId) {
      // Single student request status
      const key = `halt_request:${tripId}:${studentId}`;
      const data = await cacheGet<HaltRequest>(key);
      return NextResponse.json({ success: true, request: data });
    }

    // All requests for a trip (conductor view)
    const pattern = `halt_request:${tripId}:*`;
    const keys = await redis.keys(pattern);
    
    if (keys.length === 0) {
      return NextResponse.json({ success: true, requests: [] });
    }

    // Use mget if there are keys
    const requestsData = await redis.mget(...keys);
    const requests = requestsData.filter(Boolean) as HaltRequest[];

    return NextResponse.json({ success: true, requests });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/dispatch/halt-requests (Student makes a request)
export async function POST(req: NextRequest) {
  try {
    if (!redis) return NextResponse.json({ success: false, error: "Redis not configured" }, { status: 503 });
    
    const body = await req.json();
    const { tripId, studentId, studentName, studentPhoto, latitude, longitude } = body;

    if (!tripId || !studentId || !latitude || !longitude) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const key = `halt_request:${tripId}:${studentId}`;
    
    // Check if already exists to prevent spam
    const existing = await cacheGet<HaltRequest>(key);
    if (existing && existing.status !== "REJECTED") {
       return NextResponse.json({ success: true, request: existing });
    }

    const newReq: HaltRequest = {
      id: createHaltId(),
      tripId,
      studentId,
      studentName,
      studentPhoto,
      latitude,
      longitude,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // TTL 15 minutes (900 seconds)
    await cacheSet(key, newReq, 900);

    return NextResponse.json({ success: true, request: newReq });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PATCH /api/dispatch/halt-requests (Conductor approves/rejects)
export async function PATCH(req: NextRequest) {
  try {
    if (!redis) return NextResponse.json({ success: false, error: "Redis not configured" }, { status: 503 });

    const body = await req.json();
    const { tripId, studentId, status } = body;

    if (!tripId || !studentId || !status) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const key = `halt_request:${tripId}:${studentId}`;
    const existing = await cacheGet<HaltRequest>(key);
    
    if (!existing) {
      return NextResponse.json({ success: false, error: "Request not found or expired" }, { status: 404 });
    }

    existing.status = status;
    existing.updatedAt = new Date().toISOString();

    // Extend TTL on update (another 15 mins)
    await cacheSet(key, existing, 900);

    return NextResponse.json({ success: true, request: existing });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
