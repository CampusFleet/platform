import {
  AttendanceValidationStrategy,
  RfidPayload,
  ValidationContext,
  ValidationOutcome,
} from "../types";
import { supabaseAdmin } from "@/lib/supabaseClient";

export class RfidStrategy implements AttendanceValidationStrategy<RfidPayload> {
  public readonly modality = "RFID" as const;

  async validate(
    payload: RfidPayload,
    context: ValidationContext
  ): Promise<ValidationOutcome> {
    try {
      if (!payload.cardUid || typeof payload.cardUid !== "string" || !payload.cardUid.trim()) {
        return {
          isValid: false,
          status: "INVALID_CREDENTIAL",
          modality: this.modality,
          reason: "RFID tap payload is missing a valid card UID",
        };
      }

      const normalizedUid = payload.cardUid.trim().toUpperCase();

      // Query student paired to this RFID card
      const { data: student, error } = await (supabaseAdmin as any)
        .from("students")
        .select("id, full_name, student_id_code, primary_route_id, transport_access_suspended, rfid_card_id")
        .eq("rfid_card_id", normalizedUid)
        .maybeSingle();

      if (error || !student) {
        return {
          isValid: false,
          status: "INVALID_CREDENTIAL",
          modality: this.modality,
          reason: `Unpaired RFID card UID: ${normalizedUid}. No student enrolled with this tag.`,
        };
      }

      if (student.transport_access_suspended === true) {
        return {
          isValid: false,
          status: "EXPIRED_PASS",
          modality: this.modality,
          studentId: student.id,
          reason: "Student commuter pass is inactive or revoked.",
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
          rfidCardId: student.rfid_card_id,
        },
        message: `RFID tap authenticated for ${student.full_name}`,
      };
    } catch (err: any) {
      return {
        isValid: false,
        status: "INVALID_CREDENTIAL",
        modality: this.modality,
        reason: err.message || "RFID tap validation error",
      };
    }
  }
}
