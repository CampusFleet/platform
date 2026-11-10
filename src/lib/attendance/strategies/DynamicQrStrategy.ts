import {
  AttendanceValidationStrategy,
  DynamicQrPayload,
  ValidationContext,
  ValidationOutcome,
} from "../types";
import { supabaseAdmin } from "@/lib/supabaseClient";
import { verifyStudentPass } from "@/lib/security/student-pass";
import { orEqFilter } from "@/lib/security/safe-id";

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

      // Dynamic pass: the server-issued HMAC signature is mandatory. The rotating
      // window alone is client-computable, so it cannot prove the pass is genuine.
      const pass = verifyStudentPass({
        studentId: targetStudentId,
        window: payload.window ?? parsed?.window,
        sig: payload.hmacSignature ?? parsed?.sig,
      });
      if (!pass.valid) {
        return {
          isValid: false,
          status: pass.code === "EXPIRED_PASS" ? "EXPIRED_PASS" : "INVALID_CREDENTIAL",
          modality: this.modality,
          studentId: targetStudentId,
          reason: `SECURITY ALERT: ${pass.message}`,
        };
      }

      const studentFilter = orEqFilter(["id", "student_id_code"], targetStudentId);
      if (!targetStudentId || !studentFilter) {
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
        .select("id, full_name, student_id_code, primary_route_id, transport_access_suspended")
        .or(studentFilter)
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

      if (student.transport_access_suspended === true) {
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
          studentIdCode: student.student_id_code,
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
