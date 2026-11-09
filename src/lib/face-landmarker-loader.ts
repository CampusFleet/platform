/**
 * Face Landmarker Loader (MediaPipe Tasks Vision)
 * Loads Google MediaPipe FaceLandmarker with local WebAssembly and model assets.
 * Gracefully handles SSR, WebGL availability, and fallbacks.
 */

let landmarkerInstance: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

export async function getFaceLandmarker(): Promise<any | null> {
  if (typeof window === "undefined") return null;
  if (landmarkerInstance) return landmarkerInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      isLoading = true;
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");

      // 1. Try local self-hosted WASM first (fastest, offline-safe, zero CDN latency)
      let filesetResolver;
      try {
        filesetResolver = await FilesetResolver.forVisionTasks("/wasm/vision");
      } catch (localWasmErr) {
        console.warn("Local WASM fallback to CDN:", localWasmErr);
        filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
      }

      // 2. Load model (local first, CDN fallback)
      let modelPath = "/models/face_landmarker.task";
      try {
        const testRes = await fetch(modelPath, { method: "HEAD" });
        if (!testRes.ok) {
          modelPath = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
        }
      } catch {
        modelPath = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
      }

      landmarkerInstance = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      return landmarkerInstance;
    } catch (err) {
      console.warn("MediaPipe FaceLandmarker init warning (using mathematical fallback):", err);
      return null;
    } finally {
      isLoading = false;
    }
  })();

  return loadPromise;
}
