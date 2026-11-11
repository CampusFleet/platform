import { describe, it, expect } from "vitest";
import {
  resolveValidationLocks,
  getModalityPageRules,
} from "@/lib/attendance/policy";
import { DEFAULT_VALIDATION_LOCKS, type ValidationLocksConfig } from "@/lib/types";

describe("Institutional Multi-Lock Gate Validation Policy", () => {
  it("resolves default validation locks with all 4 locks active", () => {
    const locks = resolveValidationLocks("ALL");
    expect(locks.faceId).toBe(true);
    expect(locks.dynamicQr).toBe(true);
    expect(locks.rfid).toBe(true);
    expect(locks.staticQr).toBe(true);
  });

  it("resolves specific single lock from legacy transit mode", () => {
    const dynamicOnly = resolveValidationLocks("DYNAMIC_QR");
    expect(dynamicOnly.dynamicQr).toBe(true);
    expect(dynamicOnly.faceId).toBe(false);
    expect(dynamicOnly.rfid).toBe(false);
    expect(dynamicOnly.staticQr).toBe(false);

    const rfidOnly = resolveValidationLocks("RFID");
    expect(rfidOnly.rfid).toBe(true);
    expect(rfidOnly.faceId).toBe(false);

    const faceOnly = resolveValidationLocks("FACE_ID");
    expect(faceOnly.faceId).toBe(true);
    expect(faceOnly.dynamicQr).toBe(false);
  });

  it("handles custom partial lock combinations (e.g. Dynamic QR + RFID without Face ID)", () => {
    const custom: ValidationLocksConfig = {
      faceId: false,
      dynamicQr: true,
      rfid: true,
      staticQr: false,
    };

    const rules = getModalityPageRules("ALL", custom);

    // Dynamic QR & RFID enabled
    expect(rules.isStudentShowQrActive).toBe(true);
    expect(rules.isRfidIssuancePrimary).toBe(true);
    expect(rules.locks.dynamicQr).toBe(true);
    expect(rules.locks.rfid).toBe(true);

    // Face ID & Door QR disabled
    expect(rules.isDriverGateCameraActive).toBe(false);
    expect(rules.isStudentDoorScannerActive).toBe(false);
    expect(rules.locks.faceId).toBe(false);
    expect(rules.locks.staticQr).toBe(false);

    // Multi-lock badge is HYBRID
    expect(rules.studentPassBadge).toBe("HYBRID");
    expect(rules.driverCameraStandbyReason).toContain("Face ID Biometric lock is currently disabled");
  });

  it("handles Face ID only configuration without other locks", () => {
    const custom: ValidationLocksConfig = {
      faceId: true,
      dynamicQr: false,
      rfid: false,
      staticQr: false,
    };

    const rules = getModalityPageRules("FACE_ID", custom);

    expect(rules.isDriverGateCameraActive).toBe(true);
    expect(rules.isStudentShowQrActive).toBe(false);
    expect(rules.isStudentDoorScannerActive).toBe(false);
    expect(rules.isRfidIssuancePrimary).toBe(false);
    expect(rules.studentPassBadge).toBe("FACE_ID");
    expect(rules.driverCameraStandbyReason).toBeUndefined();
  });

  it("handles all 4 locks active concurrently (Enterprise Universal Gate Mode)", () => {
    const rules = getModalityPageRules("ALL", DEFAULT_VALIDATION_LOCKS);

    expect(rules.isDriverGateCameraActive).toBe(true);
    expect(rules.isStudentShowQrActive).toBe(true);
    expect(rules.isStudentDoorScannerActive).toBe(true);
    expect(rules.isRfidIssuancePrimary).toBe(true);
    expect(rules.isConductorBusQrActive).toBe(true);
    expect(rules.conductorScannerRole).toBe("HYBRID");
    expect(rules.studentPassBadge).toBe("HYBRID");
    expect(rules.modeLabel).toContain("Universal Parallel Gate");
  });
});

