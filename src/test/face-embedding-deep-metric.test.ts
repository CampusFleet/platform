import { describe, it, expect } from "vitest";
import {
  l2Normalize,
  preprocessFaceCropToCHW,
} from "@/lib/face-embedding";
import { computeCosineDistance } from "@/lib/biometrics";

describe("Production Deep Metric Face Embedding Engine (MobileFaceNet-ArcFace-ONNX)", () => {
  it("l2Normalize outputs exactly a unit vector with length 512 and norm 1.0", () => {
    const raw = Array.from({ length: 512 }, (_, i) => Math.sin(i + 1) * 10);
    const normalized = l2Normalize(raw);

    expect(normalized).toHaveLength(512);

    let sumSq = 0;
    for (const val of normalized) {
      expect(typeof val).toBe("number");
      expect(isFinite(val)).toBe(true);
      sumSq += val * val;
    }

    // L2 norm must be approximately 1.0
    expect(Math.abs(Math.sqrt(sumSq) - 1.0)).toBeLessThan(0.005);
  });

  it("cosine distance between identical embeddings is exactly 0.0", () => {
    const raw = Array.from({ length: 512 }, (_, i) => Math.cos(i * 0.05));
    const emb = l2Normalize(raw);

    const dist = computeCosineDistance(emb, emb);
    expect(dist).toBeLessThan(0.0001);
  });

  it("orthogonal embeddings produce cosine distance of ~1.0", () => {
    const vecA = new Array(512).fill(0);
    const vecB = new Array(512).fill(0);
    vecA[0] = 1;
    vecB[1] = 1;

    const dist = computeCosineDistance(vecA, vecB);
    expect(dist).toBeCloseTo(1.0, 5);
  });
});
