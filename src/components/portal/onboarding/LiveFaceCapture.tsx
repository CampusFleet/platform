"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RefreshCw, ScanFace, X } from "lucide-react";
import { getFaceLandmarker } from "@/lib/face-landmarker-loader";
import { CONSENT_VERSION } from "@/lib/biometrics-consent";
import { CLIENT_POSE, framingIssue, faceBox, isTurned, signedYawRatio, type Point2D, type TurnSide } from "@/lib/face/pose";
import { Button, cn } from "@/components/ui";

/**
 * Live pass photo + Face ID capture (onboarding). Camera only: there is no file upload.
 *
 * mode "faceid": three prompts, like Google's selfie check:
 *   1. look straight  → pass photo + 2 frames
 *   2. turn your head to a random side (from GET /api/biometrics/challenge) → 1–2 frames
 *   3. look straight again → 1 frame
 * Frames go to /api/biometrics/enroll-v2, which templates them on the server, checks anti-spoofing,
 * that the frames are the same person, and that one frame is turned. The pass photo is saved there too.
 *
 * mode "photo": step 1 only, saved through /api/students/portrait (no face template). Used when the
 * student does not consent to Face ID.
 *
 * Head turn is measured with the same yaw ratio the face service uses (lib/face/pose.ts).
 */

export type CaptureMode = "faceid" | "photo";

type Phase = "STARTING" | "STRAIGHT" | "TURN" | "CENTRE" | "SAVING" | "DONE" | "ERROR";

const HOLD_MS = 500; // pose must be held this long
const STEP_TIMEOUT_MS = 25_000;
const DETECT_EVERY_MS = 70;
const FRAME_MAX_PX = 720;

const FRAMING_TEXT = {
  TOO_FAR: "Move closer",
  TOO_CLOSE: "Move a little further away",
  OFF_CENTRE: "Centre your face in the oval",
} as const;

function turnText(side: TurnSide) {
  return side === "LEFT" ? "Slowly turn your head to your left" : "Slowly turn your head to your right";
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
  /** photoUrl is the stored portrait route; preview is the local JPEG data URL for immediate display. */
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
  const portraitRef = useRef<string | null>(null);
  const challengeRef = useRef<{ token: string; turn: TurnSide } | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const [phase, setPhase] = useState<Phase>("STARTING");
  const [hint, setHint] = useState<string>("Starting camera…");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    holdSinceRef.current = null;
    stepStartedRef.current = performance.now();
    setHoldProgress(0);
    setPhase(p);
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const fail = useCallback(
    (msg: string) => {
      stop();
      setError(msg);
      go("ERROR");
    },
    [go, stop]
  );

  /** Full frame (raw camera orientation, not mirrored) for the face service. */
  const grabFrame = useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const scale = Math.min(1, FRAME_MAX_PX / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  }, []);

  /** Square pass photo centred on the face. */
  const grabPortrait = useCallback((lm: Point2D[]): string | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const b = faceBox(lm);
    const W = v.videoWidth;
    const H = v.videoHeight;
    const side = Math.min(Math.max(b.w * W, b.h * H) * 1.9, W, H);
    const sx = Math.max(0, Math.min(W - side, b.cx * W - side / 2));
    const sy = Math.max(0, Math.min(H - side, b.cy * H - side / 2 - side * 0.05));
    const c = document.createElement("canvas");
    c.width = 480;
    c.height = 480;
    c.getContext("2d")?.drawImage(v, sx, sy, side, side, 0, 0, 480, 480);
    return c.toDataURL("image/jpeg", 0.9);
  }, []);

  const submit = useCallback(async () => {
    stop();
    go("SAVING");
    setHint(mode === "faceid" ? "Checking your face…" : "Saving your photo…");
    const portrait = portraitRef.current!;
    try {
      let photoUrl: string | null = null;
      if (mode === "faceid") {
        const res = await fetch("/api/biometrics/enroll-v2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consentGiven: true,
            consentVersion: CONSENT_VERSION,
            challenge: challengeRef.current?.token,
            frames: framesRef.current.slice(0, 5),
            portrait,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.message || "Face ID setup failed. Please try again.");
        photoUrl = data.photoUrl || null;
      }
      if (!photoUrl) {
        const res = await fetch("/api/students/portrait", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portrait }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || "Could not save your photo. Please try again.");
        photoUrl = data.photoUrl;
      }
      setPreview(portrait);
      go("DONE");
      navigator.vibrate?.([30, 40, 30]);
      onDoneRef.current({ photoUrl: photoUrl!, preview: portrait, faceId: mode === "faceid" });
    } catch (e) {
      fail((e as Error).message);
    }
  }, [fail, go, mode, stop]);

  const loop = useCallback(() => {
    let last = 0;
    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const v = videoRef.current;
      const lmk = landmarkerRef.current;
      const p = phaseRef.current;
      if (!v || v.readyState < 2 || !lmk || !["STRAIGHT", "TURN", "CENTRE"].includes(p)) return;
      if (now - last < DETECT_EVERY_MS) return;
      last = now;

      if (now - stepStartedRef.current > STEP_TIMEOUT_MS) {
        fail("That took too long. Find good light, hold the phone at eye level and try again.");
        return;
      }

      let faces: Point2D[][] = [];
      try {
        faces = lmk.detectForVideo(v, now)?.faceLandmarks || [];
      } catch {
        return;
      }
      if (faces.length === 0) {
        holdSinceRef.current = null;
        setHoldProgress(0);
        setHint("Show your whole face to the camera");
        return;
      }
      const lm = faces[0];
      const framing = framingIssue(lm);
      const yaw = signedYawRatio(lm);
      if (yaw === null) return;

      const turn = challengeRef.current?.turn ?? "LEFT";
      const wantStraight = p === "STRAIGHT" || p === "CENTRE";
      let good = false;
      if (wantStraight) {
        if (framing) setHint(FRAMING_TEXT[framing]);
        else if (Math.abs(yaw) > CLIENT_POSE.FRONTAL_MAX) setHint("Look straight at the camera");
        else {
          setHint("Hold still");
          good = true;
        }
      } else {
        const towards = turn === "LEFT" ? yaw : -yaw; // positive = turning the requested way
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

      // Pose held: capture and move on.
      navigator.vibrate?.(15);
      if (p === "STRAIGHT") {
        portraitRef.current = grabPortrait(lm);
        const f = grabFrame();
        if (f) framesRef.current.push(f);
        if (mode === "photo") {
          void submit();
          return;
        }
        // A second straight frame a moment later gives the server two clean templates.
        setTimeout(() => {
          const f2 = grabFrame();
          if (f2) framesRef.current.push(f2);
        }, 250);
        go("TURN");
        setHint(turnText(turn));
      } else if (p === "TURN") {
        const f = grabFrame();
        if (f) framesRef.current.push(f);
        go("CENTRE");
        setHint("Now look straight at the camera again");
      } else {
        const f = grabFrame();
        if (f) framesRef.current.push(f);
        if (framesRef.current.length < 3 || !portraitRef.current) {
          fail("The camera did not give us clear frames. Please try again.");
          return;
        }
        void submit();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [fail, go, grabFrame, grabPortrait, mode, submit]);

  const start = useCallback(async () => {
    setError(null);
    setPreview(null);
    framesRef.current = [];
    portraitRef.current = null;
    challengeRef.current = null;
    go("STARTING");
    setHint("Starting camera…");

    if (!navigator.mediaDevices?.getUserMedia) {
      fail("This browser cannot open the camera. Open the app in Chrome or Safari.");
      return;
    }
    try {
      const [stream, lm, challenge] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
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
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      go("STRAIGHT");
      setHint("Look straight at the camera");
      loop();
    } catch (e: any) {
      if (e?.name === "NotAllowedError") fail("Camera permission was denied. Allow camera access for this site in your browser settings, then try again.");
      else if (e?.name === "NotFoundError") fail("No front camera was found on this device.");
      else fail(e?.message || "Could not open the camera.");
    }
  }, [fail, go, loop, mode]);

  useEffect(() => {
    if (open) void start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  if (!open) return null;

  const steps = mode === "faceid" ? (["STRAIGHT", "TURN", "CENTRE"] as const) : (["STRAIGHT"] as const);
  const stepIndex = Math.max(0, steps.indexOf(phase as any));
  const turn = challengeRef.current?.turn;
  const capturing = phase === "STRAIGHT" || phase === "TURN" || phase === "CENTRE";

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white flex flex-col h-[100dvh] select-none" role="dialog" aria-modal="true" aria-label="Take your pass photo">
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <ScanFace className="w-5 h-5 shrink-0" />
          <span className="text-sm font-bold truncate">{mode === "faceid" ? "Pass photo and Face ID" : "Pass photo"}</span>
        </div>
        <button type="button" onClick={() => { stop(); onClose(); }} aria-label="Close" className="p-2 -mr-2 rounded-full hover:bg-white/10">
          <X className="w-5 h-5" />
        </button>
      </div>

      {capturing && steps.length > 1 && (
        <div className="flex gap-1.5 px-6 pb-2" aria-hidden>
          {steps.map((s, i) => (
            <div key={s} className={cn("h-1 flex-1 rounded-full", i < stepIndex ? "bg-emerald-400" : i === stepIndex ? "bg-white" : "bg-white/20")} />
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 gap-5">
        <div
          className="relative w-full max-w-[300px] max-h-[55dvh] aspect-[3/4] rounded-[40%] overflow-hidden bg-zinc-900 transition-shadow"
          style={{ boxShadow: `0 0 0 4px ${holdProgress > 0 ? `rgba(52,211,153,${0.4 + holdProgress * 0.6})` : "rgba(255,255,255,0.25)"}` }}
        >
          {preview && (phase === "DONE") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your pass photo" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover -scale-x-100" />
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
          ) : phase === "DONE" ? (
            <p className="text-base font-bold">{mode === "faceid" ? "Photo saved and Face ID is set up" : "Photo saved"}</p>
          ) : (
            <>
              <p className="text-lg font-bold leading-snug">{hint}</p>
              {capturing && <p className="text-xs text-white/60 mt-1">Good light, no cap or mask. Hold the phone at eye level.</p>}
            </>
          )}
        </div>
      </div>

      <div className="px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
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
