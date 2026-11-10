import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/jwt";
import { persistGateAttendance } from "@/lib/attendance/persist";
import {
  matchStudentFace,
  recordBusGateEvent,
  reportSecurityIncident,
  DEFAULT_FACE_MATCH_THRESHOLD,
} from "@/lib/biometrics";
import { z } from "zod";

export const dynamic = "force-dynamic";

const verifyGateSchema = z.object({
  busId: z.coerce.number(),
  tripId: z.string().optional().nullable(),
  gateType: z.enum(["GATE_IN", "GATE_OUT"]),
  embedding: z.array(z.number()).length(512, "Embedding must be exactly 512 dimensions"),
  latitude: z.number(),
  longitude: z.number(),
  stopName: z.string().optional(),
  evidenceThumbnail: z.string().optional(),
  threshold: z.number().min(0.1).max(0.9).default(DEFAULT_FACE_MATCH_THRESHOLD),
  filterRouteId: z.string().optional(),
});

/**
 * POST /api/biometrics/verify-gate
 * Autonomous Dual-Gate Telematics Verification Endpoint
 * - Gate In: Validates boarding face, marks attendance, or triggers intruder alert
 * - Gate Out: Validates alighting face, logs drop-off stop, and decrements headcount
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    // Only on-bus crew and transport operations staff may submit gate camera events
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
    if (!["driver", "conductor", "transport_admin", "transport_manager", "admin"].includes(session.role)) {
      return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
    }

    const body = await req.json();
    const parsed = verifyGateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error.errors[0]?.message || "Invalid gate telematics payload.",
        },
        { status: 400 }
      );
    }

    const {
      busId,
      tripId,
      gateType,
      embedding,
      latitude,
      longitude,
      stopName,
      evidenceThumbnail,
      threshold,
      filterRouteId,
    } = parsed.data;

    // 1. Query HNSW vector index for matching enrolled student face
    const matches = await matchStudentFace(embedding, threshold, {
      matchCount: 1,
      filterRouteId,
    });

    const isMatchFound = matches.length > 0;
    const matchedCandidate = isMatchFound ? matches[0] : null;

    // ── CASE A: AUTHORIZED STUDENT MATCHED ──────────────────────────────────
    if (isMatchFound && matchedCandidate) {
      // Record gate event
      const gateEvent = await recordBusGateEvent({
        busId,
        tripId: tripId || null,
        gateType,
        studentId: matchedCandidate.studentId,
        matchedDistance: matchedCandidate.distance,
        confidenceScore: matchedCandidate.confidence,
        isAuthorized: true,
        latitude,
        longitude,
        stopName: stopName || null,
        metadata: {
          studentName: matchedCandidate.studentName,
          studentIdCode: matchedCandidate.studentIdCode,
          verifiedBy: session.userId,
        },
      });

      // Persist attendance (GATE_IN → BOARDED, GATE_OUT → ALIGHTED) using live-schema columns
      const persisted = await persistGateAttendance({
        studentId: matchedCandidate.studentId,
        busId,
        tripId: tripId || null,
        gateType,
        method: "BIOMETRIC_FACE_ID",
        unlockedBy: "FACE_ID",
        latitude,
        longitude,
        stopName: stopName || null,
        verifiedBy: session.fullName || session.userId,
      });

      return NextResponse.json({
        success: true,
        matched: true,
        isAuthorized: true,
        attendanceMarked: persisted.attendanceMarked,
        alreadyMarked: persisted.alreadyMarked,
        reservationUpdated: persisted.reservationUpdated,
        isAssignedBus: persisted.isAssignedBus,
        gateType,
        student: {
          id: matchedCandidate.studentId,
          name: matchedCandidate.studentName,
          studentIdCode: matchedCandidate.studentIdCode,
          confidence: matchedCandidate.confidence,
          distance: matchedCandidate.distance,
        },
        event: {
          id: gateEvent.id,
          stopName: gateEvent.stopName,
          timestamp: gateEvent.createdAt,
        },
      });
    }

    // ── CASE B: UNAUTHORIZED / INTRUDER / STRANGER DETECTED ─────────────────
    // Record unauthorized gate event
    const unauthorizedGateEvent = await recordBusGateEvent({
      busId,
      tripId: tripId || null,
      gateType,
      studentId: null,
      matchedDistance: null,
      confidenceScore: 0,
      isAuthorized: false,
      latitude,
      longitude,
      stopName: stopName || null,
    });

    let incidentId: string | undefined = undefined;

    // If an unknown person boards through Gate In, trigger Security Incident
    if (gateType === "GATE_IN") {
      try {
        const incident = await reportSecurityIncident({
          busId,
          tripId: tripId || null,
          incidentType: "UNAUTHORIZED_INTRUDER",
          severity: "CRITICAL",
          stopName: stopName || "Unknown Stop",
          latitude,
          longitude,
          evidenceUrl: evidenceThumbnail || null,
          metadata: {
            detectedAt: new Date().toISOString(),
            reportedByRole: session.role,
            reportedByUserId: session.userId,
          },
        });
        incidentId = incident.id;
      } catch (incErr) {
        console.warn("Security incident reporting error:", incErr);
      }
    }

    return NextResponse.json({
      success: true,
      matched: false,
      isAuthorized: false,
      alert: gateType === "GATE_IN" ? "UNAUTHORIZED_INTRUDER" : "UNKNOWN_DEBOARDER",
      gateType,
      incidentId,
      event: {
        id: unauthorizedGateEvent.id,
        stopName: unauthorizedGateEvent.stopName,
        timestamp: unauthorizedGateEvent.createdAt,
      },
    });
  } catch (err: any) {
    console.error("Gate verification error:", err);
    return NextResponse.json(
      {
        success: false,
        message: err.message || "Failed to process gate verification.",
      },
      { status: 500 }
    );
  }
}

