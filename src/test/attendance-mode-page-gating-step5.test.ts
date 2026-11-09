import { describe, it, expect } from "vitest";
import { getModalityPageRules } from "@/lib/attendance/policy";
import type { TransitAttendanceMode } from "@/lib/types";

describe("Step 5: Attendance Mode Feature & Page Activation Matrix", () => {
  describe("Mode: FACE_ID (Default Institutional Standard)", () => {
    const rules = getModalityPageRules("FACE_ID");

    it("activates Face ID badge on student pass and keeps backup QR collapsible", () => {
      expect(rules.studentPassBadge).toBe("FACE_ID");
      expect(rules.isStudentShowQrActive).toBe(false);
      expect(rules.studentQrConnectLabel).toBe("Backup Pass");
    });

    it("deactivates student bus door scanner since gate camera is autonomous", () => {
      expect(rules.isStudentDoorScannerActive).toBe(false);
    });

    it("deactivates conductor bus QR poster generation to prevent door clutter", () => {
      expect(rules.isConductorBusQrActive).toBe(false);
    });

    it("relegates conductor scanner to Backup Exception role", () => {
      expect(rules.conductorScannerRole).toBe("BACKUP_EXCEPTION");
    });

    it("activates live AI inference on driver dual-gate camera HUD", () => {
      expect(rules.isDriverGateCameraActive).toBe(true);
    });

    it("sets RFID card issuance to secondary / standby mode", () => {
      expect(rules.isRfidIssuancePrimary).toBe(false);
    });
  });

  describe("Mode: DYNAMIC_QR (Optical Conductor Verification)", () => {
    const rules = getModalityPageRules("DYNAMIC_QR");

    it("activates Dynamic QR as the primary student pass presentation", () => {
      expect(rules.studentPassBadge).toBe("DYNAMIC_QR");
      expect(rules.isStudentShowQrActive).toBe(true);
      expect(rules.studentQrConnectLabel).toBe("QR Pass");
    });

    it("promotes conductor scanner to PRIMARY verification tool", () => {
      expect(rules.conductorScannerRole).toBe("PRIMARY");
    });

    it("places driver gate camera in battery-saving standby", () => {
      expect(rules.isDriverGateCameraActive).toBe(false);
      expect(rules.driverCameraStandbyReason).toContain("Dynamic QR");
    });

    it("deactivates static bus door self-scanner for students", () => {
      expect(rules.isStudentDoorScannerActive).toBe(false);
    });
  });

  describe("Mode: RFID (Contactless Smart Cards)", () => {
    const rules = getModalityPageRules("RFID");

    it("activates RFID Smart Card as the primary commuter pass badge", () => {
      expect(rules.studentPassBadge).toBe("RFID");
      expect(rules.studentQrConnectLabel).toBe("Smart Card");
    });

    it("promotes RFID smart card issuance to primary transport admin workflow", () => {
      expect(rules.isRfidIssuancePrimary).toBe(true);
    });

    it("places driver gate camera in battery-saving standby", () => {
      expect(rules.isDriverGateCameraActive).toBe(false);
      expect(rules.driverCameraStandbyReason).toContain("RFID");
    });

    it("deactivates student bus door camera scanner", () => {
      expect(rules.isStudentDoorScannerActive).toBe(false);
    });
  });

  describe("Mode: STATIC_QR (Physical Bus & Seat Posters)", () => {
    const rules = getModalityPageRules("STATIC_QR");

    it("activates student bus door scanner as primary action", () => {
      expect(rules.studentPassBadge).toBe("STATIC_QR");
      expect(rules.isStudentDoorScannerActive).toBe(true);
      expect(rules.studentQrConnectLabel).toBe("Scan Bus QR");
    });

    it("activates conductor bus QR poster generation & printing", () => {
      expect(rules.isConductorBusQrActive).toBe(true);
    });

    it("places driver gate camera in standby", () => {
      expect(rules.isDriverGateCameraActive).toBe(false);
      expect(rules.driverCameraStandbyReason).toContain("Bus Door QR");
    });
  });

  describe("Mode: ALL (Hybrid Multi-Modal Ecosystem)", () => {
    const rules = getModalityPageRules("ALL");

    it("activates all commuter, conductor, driver, and admin modalities simultaneously", () => {
      expect(rules.studentPassBadge).toBe("HYBRID");
      expect(rules.isStudentDoorScannerActive).toBe(true);
      expect(rules.isStudentShowQrActive).toBe(true);
      expect(rules.isConductorBusQrActive).toBe(true);
      expect(rules.conductorScannerRole).toBe("HYBRID");
      expect(rules.isDriverGateCameraActive).toBe(true);
      expect(rules.isRfidIssuancePrimary).toBe(true);
    });
  });

  describe("Fallback Behavior & Graceful Degradation", () => {
    it("falls back to FACE_ID safely when mode is undefined", () => {
      const rules = getModalityPageRules(undefined as any);
      expect(rules.mode).toBe("FACE_ID");
      expect(rules.isDriverGateCameraActive).toBe(true);
    });
  });
});

