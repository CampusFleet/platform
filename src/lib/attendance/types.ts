import type { AttendanceMethod, BusGateType, BusGateEvent, BusSecurityIncident } from "@/lib/types";

/**
 * The 4 supported attendance validation modalities in CampusFleet.
 */
export type AttendanceModality =
  | "BIOMETRIC_FACE_ID"
  | "DYNAMIC_QR"
  | "RFID"
  | "STATIC_QR";

/**
 * Universal transit operational context passed to any validation strategy.
 */
export interface ValidationContext {
  busId: number;
  tripId?: string | null;
  gateType?: BusGateType;
  stopName?: string | null;
  latitude: number;
  longitude: number;
  timestamp?: string;
  operatorId?: string;
  operatorRole?: string;
  filterRouteId?: string;
}

/**
 * Unified summary of the commuter resolved from validation.
 */
export interface StudentSummary {
  id: string;
  name: string;
  studentIdCode: string;
  primaryRouteId?: string | null;
  rfidCardId?: string | null;
}

/**
 * Discriminated union outcome pattern ensuring strict type safety.
 */
export type ValidationOutcome =
  | {
      isValid: true;
      status: "AUTHORIZED";
      modality: AttendanceModality;
      student: StudentSummary;
      confidence?: number;
      distance?: number;
      message?: string;
    }
  | {
      isValid: false;
      status:
        | "UNAUTHORIZED_INTRUDER"
        | "EXPIRED_PASS"
        | "WRONG_BUS"
        | "INVALID_CREDENTIAL"
        | "LIVENESS_FAILED"
        | "OUT_OF_GEOFENCE";
      modality: AttendanceModality;
      reason: string;
      studentId?: string;
      confidence?: number;
    };

/**
 * Strategy contract for all attendance validation modalities.
 */
export interface AttendanceValidationStrategy<TPayload> {
  readonly modality: AttendanceModality;
  validate(payload: TPayload, context: ValidationContext): Promise<ValidationOutcome>;
}

// ── Specific Modality Payloads ──────────────────────────────────────────────

export interface FaceIdPayload {
  embedding: number[];
  threshold?: number;
  livenessPassed?: boolean;
}

export interface DynamicQrPayload {
  rawToken: string;
  studentId?: string;
  window?: number;
  hmacSignature?: string;
}

export interface RfidPayload {
  cardUid: string;
}

export interface StaticQrPayload {
  busIdScanned: number;
  studentId: string;
  commuterLat: number;
  commuterLng: number;
  maxRadiusMeters?: number;
}

/**
 * Comprehensive execution record after the engine orchestrates attendance sinks.
 */
export interface UnifiedAttendanceExecutionResult {
  outcome: ValidationOutcome;
  gateEvent?: BusGateEvent;
  securityIncident?: BusSecurityIncident;
  attendanceMarked: boolean;
  reservationUpdated: boolean;
}
