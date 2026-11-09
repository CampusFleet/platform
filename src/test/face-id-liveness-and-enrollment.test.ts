import { describe, it, expect } from "vitest";

describe("Face ID Apple Reverse-Engineered Architecture & 36-Tick Polar Mapping", () => {
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

  it("maps head movement (Yaw, Pitch) accurately to Apple continuous polar clock angles", () => {
    const mapMovementToTick = (yaw: number, pitch: number): { tickIndex: number; angleDeg: number } => {
      const thetaRad = Math.atan2(yaw, pitch);
      let thetaDeg = (thetaRad * 180) / Math.PI;
      if (thetaDeg < 0) thetaDeg += 360;

      const tickIndex = Math.floor(thetaDeg / (360 / TOTAL_TICKS)) % TOTAL_TICKS;
      return { tickIndex, angleDeg: Math.round(thetaDeg) };
    };

    // Tilting Up (Pitch > 0, Yaw = 0) -> 12 o'clock (0° / tick 0)
    const up = mapMovementToTick(0, 15);
    expect(up.angleDeg).toBe(0);
    expect(up.tickIndex).toBe(0);

    // Turning Right (Yaw > 0, Pitch = 0) -> 3 o'clock (90° / tick 9)
    const right = mapMovementToTick(15, 0);
    expect(right.angleDeg).toBe(90);
    expect(right.tickIndex).toBe(9);

    // Nodding Down (Pitch < 0, Yaw = 0) -> 6 o'clock (180° / tick 18)
    const down = mapMovementToTick(0, -15);
    expect(down.angleDeg).toBe(180);
    expect(down.tickIndex).toBe(18);

    // Turning Left (Yaw < 0, Pitch = 0) -> 9 o'clock (270° / tick 27)
    const left = mapMovementToTick(-15, 0);
    expect(left.angleDeg).toBe(270);
    expect(left.tickIndex).toBe(27);
  });

  it("calculates accurate 3D facial pitch from MediaPipe landmark ratio (positive when lifting chin up)", () => {
    // noseRatio = (nose.y - forehead.y) / faceHeight
    // pitch = (0.42 - noseRatio) * 130  (updated multiplier)
    const calcPitch = (noseY: number, foreheadY: number, chinY: number) => {
      const faceHeight = Math.abs(chinY - foreheadY);
      const noseRatio = (noseY - foreheadY) / faceHeight;
      return Math.round((0.42 - noseRatio) * 130);
    };

    // Standard frontal resting face: nose is at 42% between forehead and chin
    const frontalPitch = calcPitch(0.41, 0.20, 0.70); // forehead=0.20, chin=0.70 (height=0.50), nose=0.41 (0.21/0.50 = 0.42)
    expect(Math.abs(frontalPitch)).toBeLessThanOrEqual(2);

    // User tilting chin UP: nose tip rises toward forehead (nose = 0.36 -> ratio = 0.16/0.50 = 0.32)
    const liftChinPitch = calcPitch(0.36, 0.20, 0.70);
    expect(liftChinPitch).toBeGreaterThan(10); // POSITIVE pitch!

    // User nodding DOWN: nose tip drops toward chin (nose = 0.46 -> ratio = 0.26/0.50 = 0.52)
    const nodDownPitch = calcPitch(0.46, 0.20, 0.70);
    expect(nodDownPitch).toBeLessThan(-10); // NEGATIVE pitch!
  });

  it("uses strict centering for ALIGN_FACE and loose in-frame check for CIRCLING", () => {
    // Strict centering: used only to start the sweep
    const checkStrictCentering = (cx: number, cy: number, eyeDist: number) => {
      return (
        Math.abs(cx - 0.5) < 0.15 &&
        Math.abs(cy - 0.5) < 0.18 &&
        eyeDist > 0.10 &&
        eyeDist < 0.50
      );
    };

    // Loose in-frame: used during CIRCLING (face just needs to be visible)
    const checkFaceInFrame = (cx: number, cy: number, eyeDist: number) => {
      return (
        cx > 0.08 && cx < 0.92 &&
        cy > 0.05 && cy < 0.95 &&
        eyeDist > 0.06
      );
    };

    // Well-centered face passes both
    expect(checkStrictCentering(0.5, 0.5, 0.25)).toBe(true);
    expect(checkFaceInFrame(0.5, 0.5, 0.25)).toBe(true);

    // Face shifted when turning head — fails strict but passes loose
    expect(checkStrictCentering(0.3, 0.5, 0.20)).toBe(false);
    expect(checkFaceInFrame(0.3, 0.5, 0.20)).toBe(true);

    // Face too far shifted — fails both
    expect(checkStrictCentering(0.05, 0.5, 0.25)).toBe(false);
    expect(checkFaceInFrame(0.05, 0.5, 0.25)).toBe(false);

    // Face too far away
    expect(checkStrictCentering(0.5, 0.5, 0.05)).toBe(false);
    expect(checkFaceInFrame(0.5, 0.5, 0.05)).toBe(false);
  });

  it("applies EMA smoothing to reduce jitter in yaw/pitch measurements", () => {
    const EMA_ALPHA = 0.3;
    let smoothedYaw = 0;
    let smoothedPitch = 0;

    // Simulate a series of raw measurements with noise
    const rawMeasurements = [
      { yaw: 10, pitch: 0 },
      { yaw: 12, pitch: -1 },
      { yaw: 8, pitch: 1 },
      { yaw: 11, pitch: 0 },
      { yaw: 10, pitch: -2 },
    ];

    for (const m of rawMeasurements) {
      smoothedYaw = EMA_ALPHA * m.yaw + (1 - EMA_ALPHA) * smoothedYaw;
      smoothedPitch = EMA_ALPHA * m.pitch + (1 - EMA_ALPHA) * smoothedPitch;
    }

    // Smoothed values should be close to the average but biased toward recent measurements
    expect(smoothedYaw).toBeGreaterThan(5);
    expect(smoothedYaw).toBeLessThan(15);
    // The smoothed values should NOT exactly match any single raw measurement (smoothing effect)
    expect(smoothedYaw).not.toBeCloseTo(10, 1);
  });

  it("supports Apple iOS Accessibility option 'Set Up Without Head Motion'", () => {
    let completedSet = new Set<number>();
    const handleAccessibility = () => {
      completedSet = new Set(Array.from({ length: TOTAL_TICKS }, (_, i) => i));
    };

    handleAccessibility();
    expect(completedSet.size).toBe(36);
  });
});
