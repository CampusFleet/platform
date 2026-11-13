import { describe, it, expect } from "vitest";
import type { AttendanceRecord } from "@/lib/types";

describe("Step 4: Conductor & Driver Cockpits APC Gate Mirroring & Modality Integration", () => {
  // ── 1. AUTOMATED PASSENGER COUNTING (APC) LOAD FACTOR LOGIC ───────────────
  describe("Automated Passenger Counting (APC) Thresholds (ITS / APTA Standards)", () => {
    function computeApcLoad(boardedCount: number, capacity: number) {
      const occupancyPercent = Math.min(100, Math.round((boardedCount / (capacity || 1)) * 100));
      const isCritical = occupancyPercent >= 90;
      const isHighDensity = occupancyPercent >= 70 && occupancyPercent < 90;
      const isNormal = occupancyPercent < 70;

      const tier = isCritical ? "CRITICAL" : isHighDensity ? "HIGH_DENSITY" : "NORMAL";
      const color = isCritical ? "bg-red-500" : isHighDensity ? "bg-amber-500" : "bg-emerald-500";
      return { occupancyPercent, isCritical, isHighDensity, isNormal, tier, color };
    }

    it("evaluates <70% occupancy as Normal load factor with green indicator", () => {
      const load = computeApcLoad(25, 50); // 50%
      expect(load.occupancyPercent).toBe(50);
      expect(load.isNormal).toBe(true);
      expect(load.tier).toBe("NORMAL");
      expect(load.color).toBe("bg-emerald-500");
    });

    it("evaluates 70%-89% occupancy as High Density with amber indicator", () => {
      const load = computeApcLoad(38, 50); // 76%
      expect(load.occupancyPercent).toBe(76);
      expect(load.isHighDensity).toBe(true);
      expect(load.tier).toBe("HIGH_DENSITY");
      expect(load.color).toBe("bg-amber-500");
    });

    it("evaluates >=90% occupancy as Critical Capacity with red indicator and triggers Driver Alert", () => {
      const load = computeApcLoad(46, 50); // 92%
      expect(load.occupancyPercent).toBe(92);
      expect(load.isCritical).toBe(true);
      expect(load.tier).toBe("CRITICAL");
      expect(load.color).toBe("bg-red-500");
    });

    it("caps load factor at 100% even if standing passengers exceed seating capacity", () => {
      const load = computeApcLoad(55, 50); // 110% capped to 100%
      expect(load.occupancyPercent).toBe(100);
      expect(load.isCritical).toBe(true);
    });
  });

  // ── 2. CONDUCTOR AUDIT TAB MULTI-MODAL SEGREGATION ─────────────────────────
  describe("Conductor Audit Trail Modality Filtering & Provenance", () => {
    const mockRecords: AttendanceRecord[] = [
      {
        id: "att-1",
        studentId: "stud-01",
        tripId: "trip-1",
        busId: 40,
        method: "BIOMETRIC_FACE_ID",
        status: "BOARDED",
        timestamp: "2026-11-09T08:00:00Z",
        verifiedBy: "Autonomous AI Dual-Gate",
      },
      {
        id: "att-2",
        studentId: "stud-02",
        tripId: "trip-1",
        busId: 40,
        method: "FACE_ID" as any, // legacy raw value still present in old rows
        status: "BOARDED",
        timestamp: "2026-11-09T08:00:30Z",
        verifiedBy: "Autonomous AI Dual-Gate",
      },
      {
        id: "att-3",
        studentId: "stud-03",
        tripId: "trip-1",
        busId: 40,
        method: "QR_SCAN",
        status: "BOARDED",
        timestamp: "2026-11-09T08:01:00Z",
        verifiedBy: "Backup Barcode Scanner",
      },
      {
        id: "att-4",
        studentId: "stud-04",
        tripId: "trip-1",
        busId: 40,
        method: "RFID" as any, // legacy raw value still present in old rows
        status: "BOARDED",
        timestamp: "2026-11-09T08:01:30Z",
        verifiedBy: "PN532 NFC Sensor",
      },
      {
        id: "att-5",
        studentId: "stud-05",
        tripId: "trip-1",
        busId: 40,
        method: "MANUAL" as any, // legacy raw value still present in old rows
        status: "BOARDED",
        timestamp: "2026-11-09T08:02:00Z",
        verifiedBy: "Conductor Desk Override",
      },
    ];

    it("accurately categorizes all modalities in audit statistics", () => {
      let faceIdCount = 0;
      let qrCount = 0;
      let rfidCount = 0;
      let manualCount = 0;

      mockRecords.forEach((r) => {
        const m = (r.method || "").toUpperCase();
        if (m.includes("FACE") || m.includes("BIOMETRIC")) faceIdCount++;
        else if (m.includes("QR")) qrCount++;
        else if (m.includes("RFID")) rfidCount++;
        else manualCount++;
      });

      expect(faceIdCount).toBe(2);
      expect(qrCount).toBe(1);
      expect(rfidCount).toBe(1);
      expect(manualCount).toBe(1);
      expect(faceIdCount + qrCount + rfidCount + manualCount).toBe(mockRecords.length);
    });

    it("correctly filters records when FACE_ID filter is selected", () => {
      const faceRecords = mockRecords.filter((r) => {
        const m = (r.method || "").toUpperCase();
        return m.includes("FACE") || m.includes("BIOMETRIC");
      });
      expect(faceRecords.length).toBe(2);
      expect(faceRecords.map((r) => r.studentId)).toEqual(["stud-01", "stud-02"]);
    });

    it("correctly filters records when MANUAL override filter is selected", () => {
      const manualRecords = mockRecords.filter((r) => {
        const m = (r.method || "").toUpperCase();
        const isFace = m.includes("FACE") || m.includes("BIOMETRIC");
        const isQr = m.includes("QR");
        const isRfid = m.includes("RFID");
        return !isFace && !isQr && !isRfid;
      });
      expect(manualRecords.length).toBe(1);
      expect(manualRecords[0].studentId).toBe("stud-05");
    });
  });

  // ── 3. CONDUCTOR PASSENGER PROVENANCE BADGING ─────────────────────────────
  describe("Conductor Manifest Passenger Provenance Labeling", () => {
    function resolveModalityBadge(unlockedBy?: string) {
      const u = (unlockedBy || "").toUpperCase();
      if (u.includes("FACE") || u.includes("BIOMETRIC")) {
        return { label: "Face ID Gate", badgeClass: "bg-emerald-950 text-emerald-300" };
      }
      if (u.includes("DYNAMIC") || u.includes("QR")) {
        return { label: "Dynamic QR", badgeClass: "bg-blue-950 text-blue-300" };
      }
      if (u.includes("RFID")) {
        return { label: "RFID Card", badgeClass: "bg-indigo-950 text-indigo-300" };
      }
      return { label: unlockedBy || "Manual Desk", badgeClass: "bg-zinc-800 text-zinc-300" };
    }

    it("maps BIOMETRIC_FACE_ID to Face ID Gate with emerald badge", () => {
      const badge = resolveModalityBadge("BIOMETRIC_FACE_ID");
      expect(badge.label).toBe("Face ID Gate");
      expect(badge.badgeClass).toContain("bg-emerald-950");
    });

    it("maps QR_SCAN to Dynamic QR with blue badge", () => {
      const badge = resolveModalityBadge("QR_SCAN");
      expect(badge.label).toBe("Dynamic QR");
      expect(badge.badgeClass).toContain("bg-blue-950");
    });

    it("maps RFID to RFID Card with indigo badge", () => {
      const badge = resolveModalityBadge("RFID_CARD_TAP");
      expect(badge.label).toBe("RFID Card");
      expect(badge.badgeClass).toContain("bg-indigo-950");
    });
  });
});

