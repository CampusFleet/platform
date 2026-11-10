import {
  AttendanceModality,
  AttendanceValidationStrategy,
  ValidationContext,
  ValidationOutcome,
  UnifiedAttendanceExecutionResult,
} from "./types";
import { FaceIdStrategy } from "./strategies/FaceIdStrategy";
import { DynamicQrStrategy } from "./strategies/DynamicQrStrategy";
import { RfidStrategy } from "./strategies/RfidStrategy";
import { StaticQrStrategy } from "./strategies/StaticQrStrategy";
import {
  recordBusGateEvent,
  reportSecurityIncident,
} from "@/lib/biometrics";
import { persistGateAttendance } from "./persist";

/**
 * Unified Multi-Modal Transit Attendance Validation Engine.
 * Implements the Strategy Pattern adhering to Clean Architecture & SOLID principles.
 */
export class AttendanceEngine {
  private strategies = new Map<AttendanceModality, AttendanceValidationStrategy<any>>();

  constructor() {
    // Register the 4 default production strategies
    this.registerStrategy(new FaceIdStrategy());
    this.registerStrategy(new DynamicQrStrategy());
    this.registerStrategy(new RfidStrategy());
    this.registerStrategy(new StaticQrStrategy());
  }

  /**
   * Registers or overrides a validation strategy for a specific transit modality.
   */
  public registerStrategy<T>(strategy: AttendanceValidationStrategy<T>): this {
    this.strategies.set(strategy.modality, strategy);
    return this;
  }

  /**
   * Returns a specific strategy or throws an error if unsupported.
   */
  public getStrategy<T>(modality: AttendanceModality): AttendanceValidationStrategy<T> {
    const strategy = this.strategies.get(modality);
    if (!strategy) {
      throw new Error(`Unsupported attendance modality: '${modality}'`);
    }
    return strategy;
  }

  /**
   * Lists all currently registered attendance modalities.
   */
  public getSupportedModalities(): AttendanceModality[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Executes validation only without mutating persistence layers.
   */
  public async validate<T>(
    modality: AttendanceModality,
    payload: T,
    context: ValidationContext
  ): Promise<ValidationOutcome> {
    const strategy = this.getStrategy<T>(modality);
    return strategy.validate(payload, context);
  }

  /**
   * Complete End-to-End Execution:
   * 1. Runs the strategy validation.
   * 2. Persists gate telematics events (`bus_gate_events`).
   * 3. Syncs attendance records & seat reservations (`attendance_records` & `bus_reservations`).
   * 4. Dispatches security incidents (`bus_security_incidents`) if an unauthorized intruder is detected.
   */
  public async execute<T>(
    modality: AttendanceModality,
    payload: T,
    context: ValidationContext
  ): Promise<UnifiedAttendanceExecutionResult> {
    const gateType = context.gateType || "GATE_IN";

    // 1. Run Strategy Validation
    const outcome = await this.validate(modality, payload, context);

    let gateEvent: any = undefined;
    let securityIncident: any = undefined;
    let attendanceMarked = false;
    let reservationUpdated = false;

    // ── CASE A: AUTHORIZED COMMUTER ─────────────────────────────────────────
    if (outcome.isValid && outcome.status === "AUTHORIZED") {
      const studentId = outcome.student.id;

      // 1. Record Gate Event
      try {
        gateEvent = await recordBusGateEvent({
          busId: context.busId,
          tripId: context.tripId || null,
          gateType,
          studentId,
          confidenceScore: outcome.confidence ?? 100,
          isAuthorized: true,
          latitude: context.latitude,
          longitude: context.longitude,
          stopName: context.stopName || null,
        });
      } catch (gateErr) {
        console.warn("Gate event recording error:", gateErr);
      }

      // 2 + 3. Mark attendance record and update the reservation (live-schema columns)
      const attendanceMethod =
        modality === "BIOMETRIC_FACE_ID"
          ? "BIOMETRIC_FACE_ID"
          : modality === "RFID"
          ? "RFID_VERIFIED"
          : "QR_SCAN";
      const unlockedBy =
        modality === "BIOMETRIC_FACE_ID" ? "FACE_ID" : modality === "RFID" ? "RFID" : modality;

      try {
        const persisted = await persistGateAttendance({
          studentId,
          busId: context.busId,
          tripId: context.tripId || null,
          gateType,
          method: attendanceMethod,
          unlockedBy,
          latitude: context.latitude,
          longitude: context.longitude,
          stopName: context.stopName || null,
          verifiedBy: context.operatorId || null,
        });
        attendanceMarked = persisted.attendanceMarked;
        reservationUpdated = persisted.reservationUpdated;
      } catch (attErr) {
        console.warn("Attendance persistence error:", attErr);
      }

      return {
        outcome,
        gateEvent,
        attendanceMarked,
        reservationUpdated,
      };
    }

    // ── CASE B: UNAUTHORIZED / INTRUDER / EXPIRED PASS ──────────────────────
    try {
      gateEvent = await recordBusGateEvent({
        busId: context.busId,
        tripId: context.tripId || null,
        gateType,
        studentId: outcome.studentId || null,
        confidenceScore: outcome.confidence ?? 0,
        isAuthorized: false,
        latitude: context.latitude,
        longitude: context.longitude,
        stopName: context.stopName || null,
      });
    } catch (gateErr) {
      console.warn("Unauthorized gate event log error:", gateErr);
    }

    // If an unauthorized person enters Gate In, trigger Critical Security Incident
    if (gateType === "GATE_IN" && outcome.status === "UNAUTHORIZED_INTRUDER") {
      try {
        securityIncident = await reportSecurityIncident({
          busId: context.busId,
          tripId: context.tripId || null,
          incidentType: "UNAUTHORIZED_INTRUDER",
          severity: "CRITICAL",
          stopName: context.stopName || "Route Stop",
          latitude: context.latitude,
          longitude: context.longitude,
          matchedStudentId: outcome.studentId || null,
          metadata: {
            modality,
            detectedAt: new Date().toISOString(),
            reason: outcome.reason,
            operatorId: context.operatorId,
          },
        });
      } catch (incErr) {
        console.warn("Security incident report error:", incErr);
      }
    }

    return {
      outcome,
      gateEvent,
      securityIncident,
      attendanceMarked: false,
      reservationUpdated: false,
    };
  }
}

/** Global singleton instance of the Attendance Validation Engine */
export const attendanceEngine = new AttendanceEngine();
