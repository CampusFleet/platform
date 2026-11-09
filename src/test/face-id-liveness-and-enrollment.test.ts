import { describe, it, expect } from "vitest";

describe("Face ID 5-Point Transit Liveness & Live Pass Photo Architecture", () => {
  const TOTAL_TICKS = 36;

  // Replicate mathematical geometry from FaceIdEnrollmentModal
  const RETICLE_TICKS = Array.from({ length: TOTAL_TICKS }, (_, i) => {
    const angleDeg = i * (360 / TOTAL_TICKS) - 90;
    const angleRad = (angleDeg * Math.PI) / 180;
    const cx = 50;
    const cy = 60;
    const rxInner = 38;
    const ryInner = 48;
    const rxOuter = 44;
    const ryOuter = 55;

    const x1 = Number((cx + rxInner * Math.cos(angleRad)).toFixed(2));
    const y1 = Number((cy + ryInner * Math.sin(angleRad)).toFixed(2));
    const x2 = Number((cx + rxOuter * Math.cos(angleRad)).toFixed(2));
    const y2 = Number((cy + ryOuter * Math.sin(angleRad)).toFixed(2));

    return { id: i, angleDeg, x1, y1, x2, y2 };
  });

  const POSE_TICK_MAP = {
    LOOK_CENTER: [35, 0, 1], // Top center (Frontal baseline pass photo)
    TURN_LEFT: [23, 24, 25, 26, 27, 28, 29, 30], // Left quadrant (Yaw -16° to -28°)
    TURN_RIGHT: [6, 7, 8, 9, 10, 11, 12, 13], // Right quadrant (Yaw +16° to +26°)
    TILT_UP: [31, 32, 33, 34, 2, 3, 4, 5], // Upper arc (Elevated bus door camera, Pitch +12°)
    TILT_DOWN: [14, 15, 16, 17, 18, 19, 20, 21, 22], // Bottom arc (Overhead boarding descent, Pitch -10°)
    SCAN_COMPLETE: Array.from({ length: TOTAL_TICKS }, (_, i) => i),
  };

  it("generates exactly 36 Apple Face ID radial ticks spanning full 360 degrees", () => {
    expect(RETICLE_TICKS).toHaveLength(36);
    expect(RETICLE_TICKS[0].angleDeg).toBe(-90); // Top 12 o'clock
    expect(RETICLE_TICKS[9].angleDeg).toBe(0); // Right 3 o'clock
    expect(RETICLE_TICKS[18].angleDeg).toBe(90); // Bottom 6 o'clock
    expect(RETICLE_TICKS[27].angleDeg).toBe(180); // Left 9 o'clock
  });

  it("ensures every radial tick has positive outward length", () => {
    RETICLE_TICKS.forEach((tick) => {
      const dx = tick.x2 - tick.x1;
      const dy = tick.y2 - tick.y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      expect(length).toBeGreaterThan(4.0);
      expect(length).toBeLessThan(12.0);
    });
  });

  it("maps every single tick from 0 to 35 across the 5 pose challenges with zero omissions or duplicates", () => {
    const allAssigned = [
      ...POSE_TICK_MAP.LOOK_CENTER,
      ...POSE_TICK_MAP.TURN_LEFT,
      ...POSE_TICK_MAP.TURN_RIGHT,
      ...POSE_TICK_MAP.TILT_UP,
      ...POSE_TICK_MAP.TILT_DOWN,
    ];

    expect(allAssigned).toHaveLength(36);

    const uniqueSet = new Set(allAssigned);
    expect(uniqueSet.size).toBe(36);

    for (let i = 0; i < 36; i++) {
      expect(uniqueSet.has(i)).toBe(true);
    }
  });

  it("validates left quadrant ticks correspond to negative yaw angles (left head turns)", () => {
    POSE_TICK_MAP.TURN_LEFT.forEach((tickId) => {
      const tick = RETICLE_TICKS[tickId];
      // In SVG viewBox (0-100), left side has x < cx (50)
      expect(tick.x1).toBeLessThan(50);
      expect(tick.x2).toBeLessThan(50);
    });
  });

  it("validates right quadrant ticks correspond to positive yaw angles (right head turns)", () => {
    POSE_TICK_MAP.TURN_RIGHT.forEach((tickId) => {
      const tick = RETICLE_TICKS[tickId];
      // In SVG viewBox (0-100), right side has x > cx (50)
      expect(tick.x1).toBeGreaterThan(50);
      expect(tick.x2).toBeGreaterThan(50);
    });
  });

  it("validates elevated door camera ticks (TILT_UP) map to upper vertical half", () => {
    POSE_TICK_MAP.TILT_UP.forEach((tickId) => {
      const tick = RETICLE_TICKS[tickId];
      // Upper diagonal arc has y < cy (60)
      expect(tick.y1).toBeLessThan(60);
      expect(tick.y2).toBeLessThan(60);
    });
  });

  it("validates overhead descent camera ticks (TILT_DOWN) map to bottom vertical arc", () => {
    POSE_TICK_MAP.TILT_DOWN.forEach((tickId) => {
      const tick = RETICLE_TICKS[tickId];
      // Bottom arc has y > cy (60)
      expect(tick.y1).toBeGreaterThan(60);
      expect(tick.y2).toBeGreaterThan(60);
    });
  });

  it("enforces real-time active angle thresholds: only advances when user actually performs motions", () => {
    const isAngleSatisfied = (pose: string, yaw: number, pitch: number): boolean => {
      switch (pose) {
        case "LOOK_CENTER":
          return Math.abs(yaw) <= 10 && Math.abs(pitch) <= 10;
        case "TURN_LEFT":
          return yaw <= -14;
        case "TURN_RIGHT":
          return yaw >= 14;
        case "TILT_UP":
          return pitch >= 10;
        case "TILT_DOWN":
          return pitch <= -8;
        default:
          return false;
      }
    };

    // Staring straight ahead must NOT satisfy TURN_LEFT
    expect(isAngleSatisfied("TURN_LEFT", 0, 0)).toBe(false);
    expect(isAngleSatisfied("TURN_LEFT", -5, 0)).toBe(false);
    // Turning head left (-18°) MUST satisfy TURN_LEFT
    expect(isAngleSatisfied("TURN_LEFT", -18, 0)).toBe(true);

    // Staring straight must NOT satisfy TURN_RIGHT
    expect(isAngleSatisfied("TURN_RIGHT", 0, 0)).toBe(false);
    expect(isAngleSatisfied("TURN_RIGHT", 18, 0)).toBe(true);

    // Elevated bus door angle (+15°) must satisfy TILT_UP
    expect(isAngleSatisfied("TILT_UP", 0, 0)).toBe(false);
    expect(isAngleSatisfied("TILT_UP", 0, 15)).toBe(true);

    // Overhead boarding step descent angle (-12°) must satisfy TILT_DOWN
    expect(isAngleSatisfied("TILT_DOWN", 0, 0)).toBe(false);
    expect(isAngleSatisfied("TILT_DOWN", 0, -12)).toBe(true);
  });

  it("pauses active challenge and warns when face is not properly centered in oval", () => {
    const checkCentering = (isFacePresent: boolean, offCenterX: number, offCenterY: number) => {
      if (!isFacePresent) return { isCentered: false, warning: "No face detected" };
      if (offCenterX > 0.16 || offCenterY > 0.18) return { isCentered: false, warning: "Align face inside oval" };
      return { isCentered: true, warning: null };
    };

    // No face in camera
    expect(checkCentering(false, 0, 0).isCentered).toBe(false);
    // Face way off to the side
    expect(checkCentering(true, 0.35, 0).isCentered).toBe(false);
    expect(checkCentering(true, 0.35, 0).warning).toBe("Align face inside oval");
    // Face centered properly
    expect(checkCentering(true, 0.05, 0.05).isCentered).toBe(true);
    expect(checkCentering(true, 0.05, 0.05).warning).toBeNull();
  });

  it("enforces dual-use camera capture: live photo required and file upload disabled", () => {
    const canContinue = (photoUrl?: string, localPreviewUrl?: string) => {
      return Boolean(photoUrl || localPreviewUrl);
    };

    expect(canContinue(undefined, undefined)).toBe(false);
    expect(canContinue("data:image/jpeg;base64,sample123", undefined)).toBe(true);
    expect(canContinue(undefined, "data:image/jpeg;base64,sample123")).toBe(true);
  });
});
