"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, RefreshCw, ScanFace, X } from "lucide-react";
import { getFaceLandmarker } from "@/lib/face-landmarker-loader";
import { CONSENT_VERSION } from "@/lib/biometrics-consent";
import { CLIENT_POSE, framingIssue, faceBox, isTurned, signedYawRatio, type Point2D, type TurnSide } from "@/lib/face/pose";
import { Button, cn } from "@/components/ui";

/**
 * Live camera capture for onboarding. Camera only, no file upload. Two separate steps:
 *
 * mode "photo" (step 1, everyone): the student frames their face and presses the shutter. The
 *   shutter only works when the face is centred, close enough and looking straight. Three frames
 *   are taken and the sharpest is kept. The student reviews it (Use / Retake); it is saved through
 *   POST /api/students/portrait.
 *
 * mode "faceid" (step 2, only with consent): look straight → turn to the side from
 *   GET /api/biometrics/challenge → look straight. These frames are never shown; they go to
 *   /api/biometrics/enroll-v2, which checks liveness, same person and head turn on the server.
 */

export type CaptureMode = "faceid" | "photo";
type Phase = "STARTING" | "FRAME" | "REVIEW" | "STRAIGHT" | "TURN" | "CENTRE" | "SAVING" | "DONE" | "ERROR";

const HOLD_MS = 450;
const STEP_TIMEOUT_MS = 30_000;
const DETECT_EVERY_MS = 70;
const FRAME_MAX_PX = 720;
const PORTRAIT_PX = 640;

const FRAMING_TEXT = {
  TOO_FAR: "Move closer",
  TOO_CLOSE: "Move a little further away",
  OFF_CENTRE: "Centre your face in the oval",
} as const;
const turnText = (side: TurnSide) => (side === "LEFT" ? "Slowly turn your head to your left" : "Slowly turn your head to your right");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Variance of a 3×3 Laplacian on a small grey image: higher = sharper. */
function sharpness(canvas: HTMLCanvasElement): number {
  const w = 160;
  const h = Math.round((canvas.height / canvas.width) * w) || 160;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;
  ctx.drawImage(canvas, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function LiveFaceCapture({
  open,
  mode,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: CaptureMode;
  onClose: () => void;
  /** photo mode: photoUrl + preview of the saved pass photo. faceid mode: photoUrl is "" (photo unchanged). */
  onDone: (result: { photoUrl: string; preview: string; faceId: boolean }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<any>(null);
  const rafRef = useRef<number>();
  const phaseRef = useRef<Phase>("STARTING");
  const holdSinceRef = useRef<number | null>(null);
  const stepStartedRef = useRef<number>(0);
  const framesRef = useRef<string[]>([]);
  const lastLmRef = useRef<Point2D[] | null>(null);
  const challengeRef = useRef<{ token: string; turn: TurnSide } | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const [phase, setPhase] = useState<Phase>("STARTING");
  const [hint, setHint] = useState("Starting camera…");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false); // photo mode: shutter enabled
  const [review, setReview] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    holdSinceRef.current = null;
    stepStartedRef.current = performance.now();
    setHoldProgress(0);
    setPhase(p);
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
  }, []);
  const stop = useCallback(() => {
    stopLoop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [stopLoop]);

  const fail = useCallback(
    (msg: string) => {
      stop();
      setError(msg);
      go("ERROR");
    },
    [go, stop]
  );

  const grabFrame = useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const scale = Math.min(1, FRAME_MAX_PX / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.88);
  }, []);

  /** Head-and-shoulders crop around the face, in true (not mirrored) orientation like an ID photo. */
  const cropPortrait = useCallback((lm: Point2D[]): HTMLCanvasElement | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const b = faceBox(lm);
    const W = v.videoWidth;
    const H = v.videoHeight;
    const side = Math.min(Math.max(b.w * W, b.h * H) * 2.3, W, H);
    const sx = Math.max(0, Math.min(W - side, b.cx * W - side / 2));
    const sy = Math.max(0, Math.min(H - side, b.cy * H - side * 0.45));
    const out = Math.min(PORTRAIT_PX, Math.round(side));
    const c = document.createElement("canvas");
    c.width = out;
    c.height = out;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, sx, sy, side, side, 0, 0, out, out);
    return c;
  }, []);

  // ── Step 1: shutter ─────────────────────────────────────────────────────
  const shoot = useCallback(async () => {
    if (!lastLmRef.current) return;
    setShooting(true);
    let best: { canvas: HTMLCanvasElement; score: number } | null = null;
    for (let i = 0; i < 3; i++) {
      const lm = lastLmRef.current;
      const c = lm ? cropPortrait(lm) : null;
      if (c) {
        const score = sharpness(c);
        if (!best || score > best.score) best = { canvas: c, score };
      }
      if (i < 2) await wait(140);
    }
    setShooting(false);
    if (!best) return;
    stopLoop();
    setReview(best.canvas.toDataURL("image/jpeg", 0.92));
    go("REVIEW");
  }, [cropPortrait, go, stopLoop]);

  const savePhoto = useCallback(async () => {
    if (!review) return;
    stop();
    go("SAVING");
    setHint("Saving your photo…");
    try {
      const res = await fetch("/api/students/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portrait: review }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Could not save your photo. Please try again.");
      go("DONE");
      onDoneRef.current({ photoUrl: data.photoUrl, preview: review, faceId: false });
    } catch (e) {
      fail((e as Error).message);
    }
  }, [fail, go, review, stop]);

  // ── Step 2: Face ID submit ─────────────────────────────────────────────
  const submitFaceId = useCallback(async () => {
    stop();
    go("SAVING");
    setHint("Checking your face…");
    try {
      const res = await fetch("/api/biometrics/enroll-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentGiven: true,
          consentVersion: CONSENT_VERSION,
          challenge: challengeRef.current?.token,
          frames: framesRef.current.slice(0, 5),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || "Face ID setup failed. Please try again.");
      go("DONE");
      navigator.vibrate?.([30, 40, 30]);
      onDoneRef.current({ photoUrl: "", preview: "", faceId: true });
    } catch (e) {
      fail((e as Error).message);
    }
  }, [fail, go, stop]);

  const loop = useCallback(() => {
    let last = 0;
    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const v = videoRef.current;
      const lmk = landmarkerRef.current;
      const p = phaseRef.current;
      if (!v || v.readyState < 2 || !lmk || !["FRAME", "STRAIGHT", "TURN", "CENTRE"].includes(p)) return;
      if (now - last < DETECT_EVERY_MS) return;
      last = now;
      if (p !== "FRAME" && now - stepStartedRef.current > STEP_TIMEOUT_MS) {
        fail("That took too long. Find good light, hold the phone at eye level and try again.");
        return;
      }

      let faces: Point2D[][] = [];
      try {
        faces = lmk.detectForVideo(v, now)?.faceLandmarks || [];
      } catch {
        return;
      }
      if (faces.length !== 1) {
        lastLmRef.current = null;
        holdSinceRef.current = null;
        setHoldProgress(0);
        setReady(false);
        setHint(faces.length > 1 ? "Only you should be in the picture" : "Show your whole face to the camera");
        return;
      }
      const lm = faces[0];
      lastLmRef.current = lm;
      const framing = framingIssue(lm);
      const yaw = signedYawRatio(lm);
      if (yaw === null) return;

      // Step 1: just tell the student when the shutter will work.
      if (p === "FRAME") {
        const ok = !framing && Math.abs(yaw) <= CLIENT_POSE.FRONTAL_MAX;
        setReady(ok);
        setHint(framing ? FRAMING_TEXT[framing] : Math.abs(yaw) > CLIENT_POSE.FRONTAL_MAX ? "Look straight at the camera" : "Looks good. Tap the button");
        return;
      }

      const turn = challengeRef.current?.turn ?? "LEFT";
      let good = false;
      if (p === "STRAIGHT" || p === "CENTRE") {
        if (framing) setHint(FRAMING_TEXT[framing]);
        else if (Math.abs(yaw) > CLIENT_POSE.FRONTAL_MAX) setHint("Look straight at the camera");
        else {
          setHint("Hold still");
          good = true;
        }
      } else {
        const towards = turn === "LEFT" ? yaw : -yaw;
        if (framing === "TOO_FAR" || framing === "TOO_CLOSE") setHint(FRAMING_TEXT[framing]);
        else if (isTurned(yaw, turn)) {
          setHint("Hold it there");
          good = true;
        } else if (towards < -CLIENT_POSE.TURN_MIN) setHint(`Other way. ${turnText(turn)}`);
        else if (towards > CLIENT_POSE.TURN_MAX) setHint("Not so far. Turn back a little");
        else setHint(turnText(turn));
      }
      if (!good) {
        holdSinceRef.current = null;
        setHoldProgress(0);
        return;
      }
      if (holdSinceRef.current === null) holdSinceRef.current = now;
      const held = now - holdSinceRef.current;
      setHoldProgress(Math.min(1, held / HOLD_MS));
      if (held < HOLD_MS) return;

      navigator.vibrate?.(15);
      const f = grabFrame();
      if (f) framesRef.current.push(f);
      if (p === "STRAIGHT") {
        setTimeout(() => {
          const f2 = grabFrame();
          if (f2) framesRef.current.push(f2);
        }, 250);
        go("TURN");
        setHint(turnText(turn));
      } else if (p === "TURN") {
        go("CENTRE");
        setHint("Now look straight at the camera again");
      } else {
        if (framesRef.current.length < 3) {
          fail("The camera did not give us clear frames. Please try again.");
          return;
        }
        void submitFaceId();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [fail, go, grabFrame, submitFaceId]);

  const start = useCallback(async () => {
    setError(null);
    setReview(null);
    setReady(false);
    framesRef.current = [];
    lastLmRef.current = null;
    challengeRef.current = null;
    go("STARTING");
    setHint("Starting camera…");
    if (!navigator.mediaDevices?.getUserMedia) {
      fail("This browser cannot open the camera. Open the app in Chrome or Safari.");
      return;
    }
    try {
      const [stream, lm, challenge] = await Promise.all([
        streamRef.current
          ? Promise.resolve(streamRef.current)
          : navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }),
        getFaceLandmarker(),
        mode === "faceid"
          ? fetch("/api/biometrics/challenge", { cache: "no-store" }).then(async (r) => {
              const d = await r.json().catch(() => ({}));
              if (!r.ok || !d.success) throw new Error(d.error || "Could not start Face ID. Please try again.");
              return { token: d.token as string, turn: d.turn as TurnSide };
            })
          : Promise.resolve(null),
      ]);
      streamRef.current = stream;
      if (!lm) {
        fail("The face check could not load. Check your internet connection and try again.");
        return;
      }
      landmarkerRef.current = lm;
      challengeRef.current = challenge;
      const v = videoRef.current;
      if (v && v.srcObject !== stream) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      if (mode === "photo") {
        go("FRAME");
        setHint("Centre your face in the oval");
      } else {
        go("STRAIGHT");
        setHint("Look straight at the camera");
      }
      loop();
    } catch (e: any) {
      if (e?.name === "NotAllowedError") fail("Camera permission was denied. Allow camera access for this site in your browser settings, then try again.");
      else if (e?.name === "NotFoundError") fail("No front camera was found on this device.");
      else fail(e?.message || "Could not open the camera.");
    }
  }, [fail, go, loop, mode]);

  const retake = useCallback(() => {
    setReview(null);
    go("FRAME");
    setHint("Centre your face in the oval");
    const v = videoRef.current;
    if (v && streamRef.current) {
      v.srcObject = streamRef.current;
      v.play().catch(() => {});
      loop();
    } else void start();
  }, [go, loop, start]);

  useEffect(() => {
    if (open) void start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  if (!open) return null;

  const faceSteps = ["STRAIGHT", "TURN", "CENTRE"] as const;
  const stepIndex = Math.max(0, faceSteps.indexOf(phase as any));
  const turn = challengeRef.current?.turn;
  const live = ["FRAME", "STRAIGHT", "TURN", "CENTRE"].includes(phase);
  const ring = phase === "FRAME" ? (ready ? "rgba(52,211,153,1)" : "rgba(255,255,255,0.25)") : holdProgress > 0 ? `rgba(52,211,153,${0.4 + holdProgress * 0.6})` : "rgba(255,255,255,0.25)";

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white flex flex-col h-[100dvh] select-none" role="dialog" aria-modal="true" aria-label={mode === "photo" ? "Take your pass photo" : "Set up Face ID"}>
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {mode === "photo" ? <Camera className="w-5 h-5 shrink-0" /> : <ScanFace className="w-5 h-5 shrink-0" />}
          <span className="text-sm font-bold truncate">{mode === "photo" ? "Step 1 · Pass photo" : "Step 2 · Face ID"}</span>
        </div>
        <button type="button" onClick={() => { stop(); onClose(); }} aria-label="Close" className="p-2 -mr-2 rounded-full hover:bg-white/10">
          <X className="w-5 h-5" />
        </button>
      </div>

      {mode === "faceid" && live && (
        <div className="flex gap-1.5 px-6 pb-2" aria-hidden>
          {faceSteps.map((s, i) => (
            <div key={s} className={cn("h-1 flex-1 rounded-full", i < stepIndex ? "bg-emerald-400" : i === stepIndex ? "bg-white" : "bg-white/20")} />
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 gap-5">
        <div className="relative w-full max-w-[300px] max-h-[55dvh] aspect-[3/4] rounded-[40%] overflow-hidden bg-zinc-900 transition-shadow" style={{ boxShadow: `0 0 0 4px ${ring}` }}>
          <video ref={videoRef} autoPlay playsInline muted className={cn("absolute inset-0 w-full h-full object-cover -scale-x-100", review && "invisible")} />
          {review && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={review} alt="Your pass photo" className="absolute inset-0 w-full h-full object-cover" />
          )}
          {phase === "TURN" && turn && (
            <div className={cn("absolute top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50", turn === "LEFT" ? "left-2" : "right-2")}>
              {turn === "LEFT" ? <ArrowLeft className="w-6 h-6" /> : <ArrowRight className="w-6 h-6" />}
            </div>
          )}
          {(phase === "STARTING" || phase === "SAVING") && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
          )}
          {phase === "DONE" && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
          )}
        </div>

        <div className="text-center min-h-[4rem] max-w-xs" aria-live="polite">
          {phase === "ERROR" ? (
            <p className="text-sm text-rose-300 font-semibold">{error}</p>
          ) : phase === "REVIEW" ? (
            <p className="text-base font-bold">Is your face clear and in focus?</p>
          ) : phase === "DONE" ? (
            <p className="text-base font-bold">{mode === "photo" ? "Pass photo saved" : "Face ID is set up"}</p>
          ) : (
            <>
              <p className="text-lg font-bold leading-snug">{hint}</p>
              {live && <p className="text-xs text-white/60 mt-1">Good light on your face, no cap or mask. Hold the phone at eye level.</p>}
            </>
          )}
        </div>
      </div>

      <div className="px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] space-y-2">
        {phase === "FRAME" && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void shoot()}
              disabled={!ready || shooting}
              aria-label="Take photo"
              className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40"
            >
              <span className={cn("w-14 h-14 rounded-full", ready ? "bg-white" : "bg-white/40", shooting && "animate-pulse")} />
            </button>
          </div>
        )}
        {phase === "REVIEW" && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={retake}>
              <RefreshCw className="w-4 h-4" /> Retake
            </Button>
            <Button variant="success" onClick={() => void savePhoto()}>
              <Check className="w-4 h-4" /> Use photo
            </Button>
          </div>
        )}
        {phase === "ERROR" && (
          <Button block variant="secondary" onClick={() => void start()}>
            <RefreshCw className="w-4 h-4" /> Try again
          </Button>
        )}
        {phase === "DONE" && (
          <Button block variant="success" onClick={onClose}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
