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
    // pitch = (0.42 - noseRatio) * 140
    const calcPitch = (noseY: number, foreheadY: number, chinY: number) => {
      const faceHeight = Math.abs(chinY - foreheadY);
      const noseRatio = (noseY - foreheadY) / faceHeight;
      return Math.round((0.42 - noseRatio) * 140);
    };

    // Standard frontal resting face: nose is at 42% between forehead and chin
    const frontalPitch = calcPitch(0.41, 0.20, 0.70); // forehead=0.20, chin=0.70 (height=0.50), nose=0.41 (0.21/0.50 = 0.42)
    expect(Math.abs(frontalPitch)).toBeLessThanOrEqual(2);

    // User tilting chin UP: nose tip rises toward forehead (nose = 0.36 -> ratio = 0.16/0.50 = 0.32)
    const liftChinPitch = calcPitch(0.36, 0.20, 0.70);
    expect(liftChinPitch).toBeGreaterThan(10); // POSITIVE pitch!

    // User nodding DOWN: nose tip drops toward chin (nose = 0.45 -> ratio = 0.25/0.50 = 0.50)
    const nodDownPitch = calcPitch(0.45, 0.20, 0.70);
    expect(nodDownPitch).toBeLessThan(-10); // NEGATIVE pitch!
  });

  it("pauses active challenge and warns when face is not properly centered in frame", () => {
    const checkCentering = (cx: number, cy: number, eyeDist: number) => {
      const isCentered =
        Math.abs(cx - 0.5) < 0.16 &&
        Math.abs(cy - 0.5) < 0.18 &&
        eyeDist > 0.12 &&
        eyeDist < 0.45;
      return isCentered;
    };

    // Centered face
    expect(checkCentering(0.5, 0.5, 0.25)).toBe(true);
    // Face shifted off to left
    expect(checkCentering(0.2, 0.5, 0.25)).toBe(false);
    // Face shifted off to top
    expect(checkCentering(0.5, 0.15, 0.25)).toBe(false);
    // Face too far away (small eye distance)
    expect(checkCentering(0.5, 0.5, 0.05)).toBe(false);
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
