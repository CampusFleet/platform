import {
  AttendanceValidationStrategy,
  StaticQrPayload,
  ValidationContext,
  ValidationOutcome,
} from "../types";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { calculateDistanceKm } from "@/lib/utils";

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

      // Geofence Radius Validation
      const maxRadiusMeters = payload.maxRadiusMeters ?? 150;
      if (
        typeof payload.commuterLat === "number" &&
        typeof payload.commuterLng === "number" &&
        typeof context.latitude === "number" &&
        typeof context.longitude === "number"
      ) {
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

      // Fetch student record
      const { data: student, error } = await (supabaseAdmin as any)
        .from("students")
        .select("id, full_name, student_id, primary_route_id, is_active")
        .or(`id.eq.${payload.studentId},student_id.eq.${payload.studentId}`)
        .maybeSingle();

      if (error || !student) {
        return {
          isValid: false,
          status: "INVALID_CREDENTIAL",
          modality: this.modality,
          reason: "Student record not found in system",
        };
      }

      if (student.is_active === false) {
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
          studentIdCode: student.student_id,
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
