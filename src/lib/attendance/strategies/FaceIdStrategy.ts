import {
  AttendanceValidationStrategy,
  FaceIdPayload,
  ValidationContext,
  ValidationOutcome,
} from "../types";
import {
  matchStudentFace,
  normalizeVector,
  DEFAULT_FACE_MATCH_THRESHOLD,
} from "@/lib/biometrics";

export class FaceIdStrategy implements AttendanceValidationStrategy<FaceIdPayload> {
  public readonly modality = "BIOMETRIC_FACE_ID" as const;

  async validate(
    payload: FaceIdPayload,
    context: ValidationContext
  ): Promise<ValidationOutcome> {
    try {
      if (!payload.embedding || !Array.isArray(payload.embedding) || payload.embedding.length !== 512) {
        return {
          isValid: false,
          status: "INVALID_CREDENTIAL",
          modality: this.modality,
          reason: `Invalid vector dimension: Expected 512, received ${payload.embedding?.length || 0}`,
        };
      }

      if (payload.livenessPassed === false) {
        return {
          isValid: false,
          status: "LIVENESS_FAILED",
          modality: this.modality,
          reason: "Biometric liveness challenge failed (potential spoof attempt)",
        };
      }

      // High-speed HNSW Cosine Similarity Query
      const candidates = await matchStudentFace(
        payload.embedding,
        payload.threshold ?? DEFAULT_FACE_MATCH_THRESHOLD,
        {
          matchCount: 1,
          filterRouteId: context.filterRouteId,
        }
      );

      if (candidates.length > 0) {
        const topMatch = candidates[0];
        return {
          isValid: true,
          status: "AUTHORIZED",
          modality: this.modality,
          student: {
            id: topMatch.studentId,
            name: topMatch.studentName,
            studentIdCode: topMatch.studentIdCode,
            primaryRouteId: topMatch.primaryRouteId,
          },
          confidence: topMatch.confidence,
          distance: topMatch.distance,
          message: `Biometric face verified with ${topMatch.confidence}% confidence`,
        };
      }

      return {
        isValid: false,
        status: "UNAUTHORIZED_INTRUDER",
        modality: this.modality,
        reason: "Face embedding did not match any enrolled active commuter profile",
      };
    } catch (err: any) {
      return {
        isValid: false,
        status: "INVALID_CREDENTIAL",
        modality: this.modality,
        reason: err.message || "Face ID validation engine error",
      };
    }
  }
}
