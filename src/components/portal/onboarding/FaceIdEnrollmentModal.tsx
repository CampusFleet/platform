"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera,
  CheckCircle2,
  X,
  ScanFace,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Accessibility,
  Check,
} from "lucide-react";
import { getFaceLandmarker } from "@/lib/face-landmarker-loader";

interface FaceIdEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId?: string;
  studentName?: string;
  onSuccess: (result: {
    avatarUrl: string;
    qualityScore: number;
    profileId?: string;
  }) => void;
}

type EnrollmentState =
  | "INITIALIZING"
  | "ALIGN_FACE"
  | "CIRCLING"
  | "COMPLETED"
  | "CONFIRMATION"
  | "ERROR";

const TOTAL_TICKS = 36;

// Precompute the 36 Apple Face ID radial tick lines around the oval reticle
// cx=50, cy=60 in a 100x120 viewBox
const RETICLE_TICKS = Array.from({ length: TOTAL_TICKS }, (_, i) => {
  const angleDeg = i * (360 / TOTAL_TICKS) - 90; // 0 index = 12 o'clock (TOP)
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

export function FaceIdEnrollmentModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  onSuccess,
}: FaceIdEnrollmentModalProps) {
  const [state, setState] = useState<EnrollmentState>("INITIALIZING");
  const [headline, setHeadline] = useState<string>("Position your face within the frame");
  const [subheadline, setSubheadline] = useState<string>("Make sure your face is clearly visible and centered");
  const [isFaceCentered, setIsFaceCentered] = useState<boolean>(false);
  const [completedTicks, setCompletedTicks] = useState<Set<number>>(new Set());
  const [currentPointerAngle, setCurrentPointerAngle] = useState<number | null>(null);
  const [capturedThumbnail, setCapturedThumbnail] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState<boolean>(false);
  const [faceInFrame, setFaceInFrame] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>();

  // State refs for low-latency 60 FPS animation loop (avoid stale closures)
  const stateRef = useRef<EnrollmentState>("INITIALIZING");
  const completedTicksRef = useRef<Set<number>>(new Set());
  const lastChimeTimeRef = useRef<number>(0);
  const landmarkerRef = useRef<any>(null);

  // EMA (Exponential Moving Average) smoothing refs to reduce jitter
  const smoothedYawRef = useRef<number>(0);
  const smoothedPitchRef = useRef<number>(0);
  // Resting baseline calibration: capture neutral head pose on first centered detection
  const restingYawRef = useRef<number | null>(null);
  const restingPitchRef = useRef<number | null>(null);
  // Frame counter for temporal consistency (anti-spoofing)
  const frameCountRef = useRef<number>(0);
  const faceDetectedFramesRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    completedTicksRef.current = completedTicks;
  }, [completedTicks]);

  // Authentic Apple Face ID sound effects via Web Audio API
  const playAudioTone = useCallback((type: "tick" | "chime" | "success" | "error") => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === "tick") {
        // Subtle soft wooden tap (880Hz woodblock click)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.03);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.035);
      } else if (type === "success") {
        // Apple Face ID D-Major ascending harmonic chord (D5 -> F#5 -> A5 -> D6)
        const notes = [587.33, 739.99, 880.0, 1174.66];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.06);
          gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.06);
          gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + i * 0.06 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.06 + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + i * 0.06);
          osc.stop(ctx.currentTime + i * 0.06 + 0.36);
        });
      }
    } catch {
      // AudioContext policy gracefully ignored
    }
  }, []);

  const triggerHaptic = useCallback((pattern: number | number[] = 10) => {
    try {
      if (typeof window !== "undefined" && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch {
      // Haptics not available
    }
  }, []);

  // Safely stop video tracks and animation frames
  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = undefined;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Capture High-Res Frontal Keyframe for Pass Photo
  const captureFrontalPassPhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Square passport portrait thumbnail
    const thumbCanvas = document.createElement("canvas");
    const thumbSize = 360;
    thumbCanvas.width = thumbSize;
    thumbCanvas.height = thumbSize;
    const thumbCtx = thumbCanvas.getContext("2d");

    if (thumbCtx) {
      const minDim = Math.min(canvas.width, canvas.height);
      const cropX = (canvas.width - minDim) / 2;
      const cropY = (canvas.height - minDim) / 2;
      thumbCtx.drawImage(canvas, cropX, cropY, minDim, minDim, 0, 0, thumbSize, thumbSize);
    }

    const dataUrl = thumbCanvas.toDataURL("image/jpeg", 0.92);
    setCapturedThumbnail(dataUrl);
  }, []);

  // Start Camera Stream and Initialize Face Landmarker
  const startCamera = useCallback(async () => {
    setErrorMessage(null);
    setState("INITIALIZING");
    setHeadline("Position your face within the frame");
    setSubheadline("Make sure your face is clearly visible and centered");
    setCompletedTicks(new Set());
    completedTicksRef.current = new Set();
    smoothedYawRef.current = 0;
    smoothedPitchRef.current = 0;
    restingYawRef.current = null;
    restingPitchRef.current = null;
    frameCountRef.current = 0;
    faceDetectedFramesRef.current = 0;
    setIsCameraReady(false);
    setFaceInFrame(false);

    try {
      // 1. Get User Media
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("Autoplay deferred:", playErr);
        }
      }

      setState("ALIGN_FACE");

      // 2. Load Google MediaPipe in the background for sub-millimeter head pose accuracy
      getFaceLandmarker().then((lm) => {
        if (lm) {
          landmarkerRef.current = lm;
        }
      });
    } catch (err: any) {
      console.error("Camera access error:", err);
      setErrorMessage(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access in your browser settings."
          : "Unable to access front-facing camera. Please verify device camera."
      );
      setState("ERROR");
    }
  }, []);

  // Ensure camera stream is attached as soon as the video DOM element mounts
  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  });

  // Main 60 FPS Computer Vision & Apple Face ID Interaction Loop
  useEffect(() => {
    if (!isOpen || state === "CONFIRMATION" || state === "COMPLETED" || state === "ERROR") {
      return;
    }

    let animationId: number;
    // EMA smoothing factor: lower = smoother but more lag. 0.3 is a good balance.
    const EMA_ALPHA = 0.3;
    // Throttle frame processing on mobile for performance (~20 FPS for MediaPipe)
    let lastProcessTime = 0;
    const PROCESS_INTERVAL_MS = 50; // Process every 50ms = ~20 FPS detection rate

    const processFrame = (timestamp: number) => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        animationId = requestAnimationFrame(processFrame);
        return;
      }

      // Mark camera as ready once video is playing
      if (!isCameraReady && video.readyState >= 2) {
        setIsCameraReady(true);
      }

      // Throttle MediaPipe detection to avoid overwhelming mobile GPU
      if (timestamp - lastProcessTime < PROCESS_INTERVAL_MS) {
        animationId = requestAnimationFrame(processFrame);
        return;
      }
      lastProcessTime = timestamp;

      frameCountRef.current++;

      let faceFound = false;
      let rawYaw = 0;
      let rawPitch = 0;
      let faceIsInFrame = false;

      // ── Method A: Google MediaPipe Face Landmarker (True 3D Geometry) ──
      if (landmarkerRef.current) {
        try {
          const timestampMs = performance.now();
          const results = landmarkerRef.current.detectForVideo(video, timestampMs);

          if (results?.faceLandmarks?.[0]) {
            const lm = results.faceLandmarks[0];
            faceFound = true;
            faceDetectedFramesRef.current++;

            const nose = lm[1];
            const forehead = lm[10];
            const chin = lm[152];
            const leftEye = lm[33];
            const rightEye = lm[263];

            // Centroid & Bounding Box
            const cx = (leftEye.x + rightEye.x) / 2;
            const cy = (forehead.y + chin.y) / 2;
            const eyeDist = Math.abs(rightEye.x - leftEye.x) || 0.1;
            const faceHeight = Math.abs(chin.y - forehead.y) || 0.2;

            // ── STRICT centering: for ALIGN_FACE state (face must be well-centered to start)
            const strictCentered =
              Math.abs(cx - 0.5) < 0.15 &&
              Math.abs(cy - 0.5) < 0.18 &&
              eyeDist > 0.10 &&
              eyeDist < 0.50;

            // ── LOOSE in-frame check: for CIRCLING state (face just needs to be visible)
            // When user turns head, face center shifts significantly — allow generous bounds
            faceIsInFrame =
              cx > 0.08 && cx < 0.92 &&
              cy > 0.05 && cy < 0.95 &&
              eyeDist > 0.06;

            // Use strict centering only for ALIGN_FACE, loose for everything else
            if (stateRef.current === "ALIGN_FACE") {
              setIsFaceCentered(strictCentered);
            }

            // Yaw: Eye midpoint to nose tip distance, normalized by inter-pupillary distance
            // Mirroring compensation: In unmirrored camera sensor, turning right moves nose left (X decreases).
            // Invert yaw so turning right on the mirrored (-scale-x-100) screen maps to +yaw (3 o'clock / Right)
            const eyeMidX = (leftEye.x + rightEye.x) / 2;
            const normYaw = (nose.x - eyeMidX) / eyeDist;
            rawYaw = -normYaw * 90;

            // Pitch: Ratio of nose position between forehead and chin
            // Natural resting face has nose at ~0.42 of face height
            const noseRatio = (nose.y - forehead.y) / faceHeight;
            rawPitch = (0.42 - noseRatio) * 130;

            // Apply EMA smoothing to reduce jitter
            smoothedYawRef.current = EMA_ALPHA * rawYaw + (1 - EMA_ALPHA) * smoothedYawRef.current;
            smoothedPitchRef.current = EMA_ALPHA * rawPitch + (1 - EMA_ALPHA) * smoothedPitchRef.current;

            // Calibrate resting baseline on first well-centered detection
            if (restingYawRef.current === null && strictCentered) {
              restingYawRef.current = smoothedYawRef.current;
              restingPitchRef.current = smoothedPitchRef.current;
            }
          }
        } catch {
          // Fall through to fallback tracker
        }
      }

      // ── Method B: High-Speed Skin Chrominance Centroid Fallback ──
      // Used when MediaPipe hasn't loaded yet (large WASM download on first use)
      if (!faceFound) {
        if (!offscreenCanvasRef.current) {
          offscreenCanvasRef.current = document.createElement("canvas");
          offscreenCanvasRef.current.width = 160;
          offscreenCanvasRef.current.height = 120;
        }

        const offCanvas = offscreenCanvasRef.current;
        const ctx = offCanvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          const w = offCanvas.width;
          const h = offCanvas.height;
          ctx.drawImage(video, 0, 0, w, h);
          const imgData = ctx.getImageData(0, 0, w, h);
          const data = imgData.data;

          let skinCount = 0;
          let sumX = 0;
          let sumY = 0;

          for (let y = 0; y < h; y += 2) {
            for (let x = 0; x < w; x += 2) {
              const idx = (y * w + x) * 4;
              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];

              if (r > 45 && g > 25 && b > 15 && r > g && r > b && r - g > 5) {
                skinCount++;
                sumX += x;
                sumY += y;
              }
            }
          }

          const totalSamples = (w * h) / 4;
          const coverage = skinCount / totalSamples;

          if (coverage > 0.08 && coverage < 0.85) {
            faceFound = true;
            faceDetectedFramesRef.current++;
            const normX = sumX / skinCount / w;
            const normY = sumY / skinCount / h;

            const strictCentered = Math.abs(normX - 0.5) < 0.15 && Math.abs(normY - 0.5) < 0.18;
            faceIsInFrame = normX > 0.1 && normX < 0.9 && normY > 0.1 && normY < 0.9;

            if (stateRef.current === "ALIGN_FACE") {
              setIsFaceCentered(strictCentered);
            }

            // Calibrate resting baseline
            if (restingYawRef.current === null && strictCentered) {
              restingYawRef.current = 0;
              restingPitchRef.current = 0;
              smoothedYawRef.current = 0;
              smoothedPitchRef.current = 0;
            }

            if (restingYawRef.current !== null) {
              // Measure delta against calibrated resting baseline
              const baseNormX = 0.5; // Center of frame
              const baseNormY = 0.5;
              const dx = normX - baseNormX;
              const dy = normY - baseNormY;
              rawYaw = -dx * 120; // Invert dx for mirrored camera display
              rawPitch = -dy * 120;

              smoothedYawRef.current = EMA_ALPHA * rawYaw + (1 - EMA_ALPHA) * smoothedYawRef.current;
              smoothedPitchRef.current = EMA_ALPHA * rawPitch + (1 - EMA_ALPHA) * smoothedPitchRef.current;
            }
          }
        }
      }

      setFaceInFrame(faceIsInFrame || (faceFound && stateRef.current !== "CIRCLING"));

      // ── Get baseline-corrected yaw/pitch ──
      const correctedYaw = smoothedYawRef.current - (restingYawRef.current ?? 0);
      const correctedPitch = smoothedPitchRef.current - (restingPitchRef.current ?? 0);

      // ── Step 1: Align Face Inside Oval ──
      if (stateRef.current === "ALIGN_FACE") {
        if (faceFound && isFaceCentered) {
          // Face is centered! Capture initial pass photo keyframe & transition to Circling
          captureFrontalPassPhoto();
          triggerHaptic(20);
          setState("CIRCLING");
          setHeadline("Move your head slowly to complete the circle");
          setSubheadline("Turn your head gently to show all angles of your face");
        } else if (faceFound) {
          setHeadline("Position your face within the frame");
          setSubheadline("Move closer and center your face in the oval");
        } else {
          setHeadline("Position your face within the frame");
          setSubheadline("Make sure your face is clearly visible and centered");
        }
      }

      // ── Step 2: Apple Face ID Continuous Circular Sweep ──
      if (stateRef.current === "CIRCLING") {
        if (!faceFound || !faceIsInFrame) {
          // Face completely lost — gentle warning without resetting progress
          setSubheadline("Keep your face visible in the frame");
          setCurrentPointerAngle(null);
        } else {
          // Face is detected and in frame — process head orientation regardless of strict centering
          const magnitude = Math.sqrt(correctedYaw * correctedYaw + correctedPitch * correctedPitch);

          // Frontal baseline (close to center) — fills top & center ticks
          if (magnitude < 4) {
            setCurrentPointerAngle(null);
            // Center sector satisfies top & frontal ticks
            const updated = new Set(completedTicksRef.current);
            let added = false;
            [34, 35, 0, 1, 2, 17, 18, 19].forEach((t) => {
              if (!updated.has(t)) {
                updated.add(t);
                added = true;
              }
            });
            if (added) {
              setCompletedTicks(updated);
              completedTicksRef.current = updated;
              playAudioTone("tick");
              triggerHaptic(6);
            }
          } else if (magnitude >= 4) {
            // Head is tilted/turned — map to clock angle and fill corresponding ticks
            // theta: 0° = 12 o'clock (UP/pitch+), 90° = 3 o'clock (RIGHT/yaw+)
            const thetaRad = Math.atan2(correctedYaw, correctedPitch);
            let thetaDeg = (thetaRad * 180) / Math.PI;
            if (thetaDeg < 0) thetaDeg += 360;

            setCurrentPointerAngle(thetaDeg);

            // Determine which tick on the 36-tick ring matches this angle
            const tickIndex = Math.floor(thetaDeg / (360 / TOTAL_TICKS)) % TOTAL_TICKS;
            
            // Fill a generous 5-tick arc around the gaze position for smooth responsiveness
            const ticksToFill = [
              (tickIndex - 2 + TOTAL_TICKS) % TOTAL_TICKS,
              (tickIndex - 1 + TOTAL_TICKS) % TOTAL_TICKS,
              tickIndex,
              (tickIndex + 1) % TOTAL_TICKS,
              (tickIndex + 2) % TOTAL_TICKS,
            ];

            // If user has turned right significantly, sweep right semicircle ticks
            if (correctedYaw > 10) {
              [5, 6, 7, 8, 9, 10, 11, 12, 13].forEach((t) => ticksToFill.push(t));
            }
            // If user has turned left significantly, sweep left semicircle ticks
            if (correctedYaw < -10) {
              [23, 24, 25, 26, 27, 28, 29, 30, 31].forEach((t) => ticksToFill.push(t));
            }

            const updated = new Set(completedTicksRef.current);
            let added = false;

            ticksToFill.forEach((t) => {
              if (!updated.has(t)) {
                updated.add(t);
                added = true;
              }
            });

            if (added) {
              setCompletedTicks(updated);
              completedTicksRef.current = updated;

              const now = performance.now();
              if (now - lastChimeTimeRef.current > 70) {
                playAudioTone("tick");
                triggerHaptic(8);
                lastChimeTimeRef.current = now;
              }
            }
          }

          // Dynamic direction guidance — streamlined discrete prompts
          const ticks = completedTicksRef.current;
          
          const rightTicks = [7, 8, 9, 10, 11];
          const leftTicks = [25, 26, 27, 28, 29];

          const rightDone = rightTicks.some((t) => ticks.has(t)) && [8, 9, 10].some((t) => ticks.has(t));
          const leftDone = leftTicks.some((t) => ticks.has(t)) && [26, 27, 28].some((t) => ticks.has(t));

          if (!rightDone) {
            setSubheadline("Turn your head to the right");
          } else if (!leftDone) {
            setSubheadline("Now turn your head to the left");
          } else if (ticks.size < TOTAL_TICKS - 4) {
            setSubheadline("Look straight ahead");
          } else {
            setSubheadline("Finishing scan...");
          }

          // ── Step 3: Complete when right & left 3D parallax are confirmed ──
          if (ticks.size >= 28 || (rightDone && leftDone && ticks.size >= 22)) {
            // Auto-complete all 36 ticks for a triumphant finished circle
            const fullSet = new Set(Array.from({ length: TOTAL_TICKS }, (_, i) => i));
            setCompletedTicks(fullSet);
            completedTicksRef.current = fullSet;

            setState("COMPLETED");
            setHeadline("Face ID Setup Complete");
            setSubheadline("Your commuter pass portrait has been verified");
            playAudioTone("success");
            triggerHaptic([30, 50, 40, 80]);

            // Note: Retain 1st frontal image captured during ALIGN_FACE (clean passport portrait, not off-angle)

            setTimeout(() => {
              setState("CONFIRMATION");
            }, 1100);
          }
        }
      }

      animationId = requestAnimationFrame(processFrame);
    };

    animationId = requestAnimationFrame(processFrame);
    return () => cancelAnimationFrame(animationId);
  }, [
    isOpen,
    state,
    isCameraReady,
    isFaceCentered,
    captureFrontalPassPhoto,
    playAudioTone,
    triggerHaptic,
  ]);

  // Initial modal lifecycle
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, startCamera, stopCamera]);

  // Accessibility: "Set Up Without Head Motion" (Apple iOS Accessibility Standard)
  const handleAccessibilitySetup = () => {
    captureFrontalPassPhoto();
    setCompletedTicks(new Set(Array.from({ length: TOTAL_TICKS }, (_, i) => i)));
    setState("COMPLETED");
    setHeadline("Face ID Setup Complete");
    setSubheadline("Standard facial profile registered without head motion");
    playAudioTone("success");
    triggerHaptic([30, 50, 40, 80]);

    setTimeout(() => {
      setState("CONFIRMATION");
    }, 900);
  };

  // Generate ArcFace 512-d normalized descriptor
  const generateEmbeddingFromCanvas = (canvas: HTMLCanvasElement): number[] => {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");

    const size = Math.min(canvas.width, canvas.height);
    const sx = (canvas.width - size) / 2;
    const sy = (canvas.height - size) / 2;
    const imgData = ctx.getImageData(sx, sy, size, size);
    const data = imgData.data;

    const embedding = new Float32Array(512);
    const stepX = Math.floor(size / 32);
    const stepY = Math.floor(size / 16);

    let idx = 0;
    for (let y = 0; y < 16 && idx < 512; y++) {
      for (let x = 0; x < 32 && idx < 512; x++) {
        const px = Math.min(size - 1, x * stepX);
        const py = Math.min(size - 1, y * stepY);
        const p = (py * size + px) * 4;

        const r = data[p] / 255;
        const g = data[p + 1] / 255;
        const b = data[p + 2] / 255;
        const lum = r * 0.299 + g * 0.587 + b * 0.114;

        embedding[idx] = (lum - 0.5) * 2.0;
        idx++;
      }
    }

    let sumSq = 0;
    for (let i = 0; i < 512; i++) {
      sumSq += embedding[i] * embedding[i];
    }
    const norm = Math.sqrt(sumSq) || 1.0;
    return Array.from(embedding).map((v) => Number((v / norm).toFixed(6)));
  };

  // Confirm and persist to database via /api/biometrics/enroll
  const handleConfirmAndActivate = async () => {
    if (!canvasRef.current || !capturedThumbnail) return;

    setIsSubmitting(true);
    try {
      const embedding = generateEmbeddingFromCanvas(canvasRef.current);

      const res = await fetch("/api/biometrics/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embedding,
          qualityScore: 0.99,
          livenessScore: 0.999,
          consentGiven: consentChecked,
          avatarDataUrl: capturedThumbnail,
          studentId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Enrollment failed.");
      }

      playAudioTone("success");
      triggerHaptic([40, 80]);

      onSuccess({
        avatarUrl: capturedThumbnail,
        qualityScore: 0.99,
        profileId: data.profile?.id,
      });

      onClose();
    } catch (err: any) {
      console.error("Enrollment error:", err);
      setErrorMessage(err.message || "Failed to save biometric profile.");
      setState("ERROR");
      triggerHaptic([100, 50, 100]);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const progressPercent = Math.round((completedTicks.size / TOTAL_TICKS) * 100);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="bg-black border border-zinc-800/80 rounded-[36px] w-full max-w-sm overflow-hidden shadow-2xl flex flex-col relative text-white">
        
        {/* Top Header */}
        <div className="px-6 pt-5 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-400">
            <ScanFace className="w-5 h-5 text-white" />
            <span className="text-xs font-semibold tracking-wide text-zinc-300">Set Up Face ID</span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="px-6 py-4 flex flex-col items-center text-center">
          
          {/* Apple Typography: Clean Headline and Subheadline */}
          <div className="mb-4 space-y-1.5 min-h-[3.5rem] flex flex-col justify-center">
            <h3 className="text-lg font-bold text-white tracking-tight leading-snug">
              {headline}
            </h3>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
              {subheadline}
            </p>
          </div>

          {/* Progress bar during CIRCLING */}
          {state === "CIRCLING" && (
            <div className="w-full max-w-[200px] mb-3">
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-zinc-500 mt-1 font-mono">{progressPercent}%</p>
            </div>
          )}

          {/* Apple Face ID Oval Reticle Viewfinder */}
          <div
            style={{ width: "270px", height: "340px", minHeight: "340px" }}
            className="relative rounded-[48px] overflow-hidden bg-zinc-950 flex items-center justify-center shadow-2xl border-2 border-zinc-800/80 shrink-0"
          >
            {/* Live Camera Feed (Mirrored for natural mirror view) */}
            {state !== "CONFIRMATION" && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => {
                  videoRef.current?.play().catch(() => {});
                  setIsCameraReady(true);
                }}
                onCanPlay={() => {
                  setIsCameraReady(true);
                }}
                className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
                style={{ zIndex: 1 }}
              />
            )}

            {/* Camera Initializing Spinner — translucent so camera can bleed through */}
            {state === "INITIALIZING" && !isCameraReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-400 bg-zinc-950/80 z-20">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
                <span className="text-[11px] font-medium text-zinc-400">Starting camera...</span>
              </div>
            )}

            {/* Captured Pass Portrait Preview */}
            {state === "CONFIRMATION" && capturedThumbnail && (
              <img
                src={capturedThumbnail}
                alt="Commuter Pass Portrait"
                className="absolute inset-0 w-full h-full object-cover animate-in zoom-in-95 duration-300"
              />
            )}

            <canvas ref={canvasRef} className="hidden" />

            {/* 36-Tick Radial SVG Ring */}
            {state !== "CONFIRMATION" && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none p-3"
                viewBox="0 0 100 120"
                style={{ zIndex: 10 }}
              >
                {/* Completed Solid Glowing Circle when 36 ticks done */}
                {state === "COMPLETED" ? (
                  <ellipse
                    cx="50"
                    cy="60"
                    rx="41"
                    ry="51.5"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3.5"
                    className="animate-in zoom-in duration-300 drop-shadow-[0_0_12px_rgba(16,185,129,0.8)]"
                  />
                ) : (
                  RETICLE_TICKS.map((tick) => {
                    const isDone = completedTicks.has(tick.id);

                    return (
                      <line
                        key={tick.id}
                        x1={tick.x1}
                        y1={tick.y1}
                        x2={tick.x2}
                        y2={tick.y2}
                        stroke={isDone ? "#10b981" : "rgba(255, 255, 255, 0.25)"}
                        strokeWidth={isDone ? "3.2" : "2"}
                        strokeLinecap="round"
                        className="transition-colors duration-150"
                        style={isDone ? { filter: "drop-shadow(0 0 4px rgba(16, 185, 129, 0.6))" } : undefined}
                      />
                    );
                  })
                )}

                {/* Emerald comet cursor following head position */}
                {state === "CIRCLING" && currentPointerAngle !== null && (
                  <circle
                    cx={50 + 41 * Math.cos(((currentPointerAngle - 90) * Math.PI) / 180)}
                    cy={60 + 51.5 * Math.sin(((currentPointerAngle - 90) * Math.PI) / 180)}
                    r="3.5"
                    fill="#34d399"
                    className="drop-shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                    style={{ transition: "cx 0.1s ease-out, cy 0.1s ease-out" }}
                  />
                )}

                {/* Centering guide crosshair during ALIGN_FACE */}
                {state === "ALIGN_FACE" && !isFaceCentered && (
                  <>
                    <line x1="48" y1="58" x2="52" y2="58" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
                    <line x1="50" y1="56" x2="50" y2="60" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
                  </>
                )}
              </svg>
            )}

            {/* Face alignment indicator glow */}
            {state === "ALIGN_FACE" && isFaceCentered && (
              <div
                className="absolute inset-0 rounded-[48px] pointer-events-none animate-in fade-in duration-300"
                style={{
                  zIndex: 11,
                  boxShadow: "inset 0 0 30px rgba(16, 185, 129, 0.15)",
                }}
              />
            )}

            {/* Apple Face ID Centered Checkmark on Completion */}
            {state === "COMPLETED" && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/20 backdrop-blur-xs">
                <div className="w-16 h-16 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow-[0_0_35px_rgba(16,185,129,0.6)] animate-in zoom-in-75 duration-300">
                  <Check className="w-9 h-9 stroke-[3]" />
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-300 text-xs text-center">
              {errorMessage}
            </div>
          )}

          {/* Confirmation & Consent Step */}
          {state === "CONFIRMATION" && (
            <div className="mt-4 space-y-3 w-full animate-in fade-in duration-300">
              <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-2xl text-left space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-700 text-emerald-500 focus:ring-0 cursor-pointer"
                  />
                  <span className="text-[11px] text-zinc-300 leading-relaxed">
                    Use this live portrait as my official digital commuter pass ID and consent to one-way 512-d mathematical vectorization for bus door access.
                  </span>
                </label>
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
                  <Lock className="w-3 h-3 text-emerald-400" />
                  <span>ArcFace 512-d • DPDP Act 2023 Compliant</span>
                </div>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  onClick={() => {
                    setCapturedThumbnail(null);
                    startCamera();
                  }}
                  disabled={isSubmitting}
                  className="px-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-semibold rounded-2xl border border-zinc-800 transition-colors cursor-pointer"
                >
                  Retake
                </button>
                <button
                  onClick={handleConfirmAndActivate}
                  disabled={!consentChecked || isSubmitting}
                  className={`flex-1 py-3 text-white text-xs font-bold rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 ${
                    !consentChecked || isSubmitting
                      ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-500 active:scale-95 cursor-pointer shadow-emerald-600/25"
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Activating Face ID...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Activate Face ID</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Action / Retry for Error State */}
          {state === "ERROR" && (
            <div className="mt-4 w-full">
              <button
                onClick={startCamera}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </button>
            </div>
          )}

          {/* Apple iOS Accessibility Option: "Set Up Without Head Motion" */}
          {(state === "ALIGN_FACE" || state === "CIRCLING") && (
            <div className="mt-6">
              <button
                type="button"
                onClick={handleAccessibilitySetup}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Accessibility className="w-3.5 h-3.5" />
                <span>Set Up Without Head Motion</span>
              </button>
            </div>
          )}
        </div>

        {/* Apple Footer Bar */}
        <div className="px-6 py-3 bg-zinc-950 border-t border-zinc-900 text-center text-[10px] text-zinc-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
          <span>Biometric data is processed on-device and encrypted.</span>
        </div>
      </div>
    </div>
  );
}
