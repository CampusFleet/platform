import {
  AttendanceValidationStrategy,
  StaticQrPayload,
  ValidationContext,
  ValidationOutcome,
} from "../types";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { calculateDistanceKm } from "@/lib/utils";
import { orEqFilter } from "@/lib/security/safe-id";

export class StaticQrStrategy implements AttendanceValidationStrategy<StaticQrPayload> {
  public readonly modality = "STATIC_QR" as const;

  async validate(
    payload: StaticQrPayload,
    context: ValidationContext
  ): Promise<ValidationOutcome> {
    try {
      if (!payload.studentId || !payload.busIdScanned) {
        return {
          isValid: false,
          status: "INVALID_CREDENTIAL",
          modality: this.modality,
          reason: "Static QR payload missing student ID or bus scan target",
        };
      }

      // Check bus matching
      if (Number(payload.busIdScanned) !== Number(context.busId)) {
        return {
          isValid: false,
          status: "WRONG_BUS",
          modality: this.modality,
          reason: `Scanned Bus #${payload.busIdScanned} does not match operating duty Bus #${context.busId}`,
        };
      }

      // Geofence Radius Validation — fail closed: a static poster QR proves nothing
      // about presence, so both the commuter and bus coordinates are mandatory.
      const maxRadiusMeters = payload.maxRadiusMeters ?? 150;
      const hasCoords =
        Number.isFinite(payload.commuterLat) &&
        Number.isFinite(payload.commuterLng) &&
        Number.isFinite(context.latitude) &&
        Number.isFinite(context.longitude);
      if (!hasCoords) {
        return {
          isValid: false,
          status: "OUT_OF_GEOFENCE",
          modality: this.modality,
          studentId: payload.studentId,
          reason: "Static QR requires live GPS from both the commuter phone and the bus to verify proximity",
        };
      }
      {
        const distKm = calculateDistanceKm(
          payload.commuterLat,
          payload.commuterLng,
          context.latitude,
          context.longitude
        );
        const distMeters = distKm * 1000;

        if (distMeters > maxRadiusMeters) {
          return {
            isValid: false,
            status: "OUT_OF_GEOFENCE",
            modality: this.modality,
            studentId: payload.studentId,
            reason: `Commuter GPS is ${Math.round(distMeters)}m away from bus (exceeds ${maxRadiusMeters}m geofence)`,
          };
        }
      }

      // Fetch student record (filter value is validated to prevent PostgREST filter injection)
      const studentFilter = orEqFilter(["id", "student_id_code"], payload.studentId);
      if (!studentFilter) {
        return {
          isValid: false,
          status: "INVALID_CREDENTIAL",
          modality: this.modality,
          reason: "Malformed student identifier in static QR payload",
        };
      }
      const { data: student, error } = await (supabaseAdmin as any)
        .from("students")
        .select("id, full_name, student_id_code, primary_route_id, transport_access_suspended")
        .or(studentFilter)
        .maybeSingle();

      if (error || !student) {
        return {
          isValid: false,
          status: "INVALID_CREDENTIAL",
          modality: this.modality,
          reason: "Student record not found in system",
        };
      }

      if (student.transport_access_suspended === true) {
        return {
          isValid: false,
          status: "EXPIRED_PASS",
          modality: this.modality,
          studentId: student.id,
          reason: "Student commuter pass has been revoked or expired",
        };
      }

      return {
        isValid: true,
        status: "AUTHORIZED",
        modality: this.modality,
        student: {
          id: student.id,
          name: student.full_name,
          studentIdCode: student.student_id_code,
          primaryRouteId: student.primary_route_id,
        },
        message: "Static bus/seat QR validated within geofenced proximity",
      };
    } catch (err: any) {
      return {
        isValid: false,
        status: "INVALID_CREDENTIAL",
        modality: this.modality,
        reason: err.message || "Static QR validation error",
      };
    }
  }
}
