import {
  AttendanceValidationStrategy,
  DynamicQrPayload,
  ValidationContext,
  ValidationOutcome,
} from "../types";
import { supabaseAdmin } from "@/lib/supabaseClient";

export class DynamicQrStrategy implements AttendanceValidationStrategy<DynamicQrPayload> {
  public readonly modality = "DYNAMIC_QR" as const;

  async validate(
    payload: DynamicQrPayload,
    context: ValidationContext
  ): Promise<ValidationOutcome> {
    try {
      if (!payload.rawToken && !payload.studentId) {
        return {
          isValid: false,
          status: "INVALID_CREDENTIAL",
          modality: this.modality,
          reason: "Dynamic QR payload is missing token and student identification",
        };
      }

      let parsed: any = null;
      let targetStudentId = payload.studentId;

      if (payload.rawToken) {
        try {
          parsed = JSON.parse(payload.rawToken);
          targetStudentId = parsed.studentId || parsed.id || targetStudentId;
        } catch {
          // Check for URL-encoded parameter (e.g. /verify/student?id=...)
          if (payload.rawToken.includes("id=")) {
            const match = payload.rawToken.match(/[?&]id=([^&]+)/);
            if (match) targetStudentId = decodeURIComponent(match[1]);
          } else {
            targetStudentId = payload.rawToken;
          }
        }
      }

      // Dynamic 1-Minute Anti-Screenshot Security Validation
      const windowVal = payload.window ?? parsed?.window;
      if (windowVal !== undefined && typeof windowVal === "number") {
        const currentWindow = Math.floor(Date.now() / 60000);
        const windowDiff = Math.abs(currentWindow - windowVal);
        // Allow 2 windows of skew (120s buffer) to tolerate client clock drift
        if (windowDiff > 2) {
          return {
            isValid: false,
            status: "EXPIRED_PASS",
            modality: this.modality,
            studentId: targetStudentId,
            reason: "SECURITY ALERT: Expired dynamic pass (>1 min old screenshot). Please show live dynamic pass.",
          };
        }
      }

      if (!targetStudentId) {
        return {
          isValid: false,
          status: "INVALID_CREDENTIAL",
          modality: this.modality,
          reason: "Could not extract student ID from dynamic QR pass",
        };
      }

      // Fetch student from database
      const { data: student, error } = await (supabaseAdmin as any)
        .from("students")
        .select("id, full_name, student_id, primary_route_id, is_active")
        .or(`id.eq.${targetStudentId},student_id.eq.${targetStudentId}`)
        .maybeSingle();

      if (error || !student) {
        return {
          isValid: false,
          status: "INVALID_CREDENTIAL",
          modality: this.modality,
          studentId: targetStudentId,
          reason: "Commuter record not found in registered fleet roster",
        };
      }

      if (student.is_active === false) {
        return {
          isValid: false,
          status: "EXPIRED_PASS",
          modality: this.modality,
          studentId: student.id,
          reason: "Student commuter pass has been deactivated or suspended",
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
        message: "Dynamic rotating QR pass verified successfully",
      };
    } catch (err: any) {
      return {
        isValid: false,
        status: "INVALID_CREDENTIAL",
        modality: this.modality,
        reason: err.message || "Dynamic QR validation failed",
      };
    }
  }
}
