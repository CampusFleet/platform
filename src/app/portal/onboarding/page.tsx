"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Camera, CheckCircle2, CreditCard, Loader2, ScanFace, ShieldCheck } from "lucide-react";
import { CONSENT_POINTS, CONSENT_SUMMARY } from "@/lib/biometrics-consent";
import { saveOnboardingDraft, loadOnboardingDraft, clearOnboardingDraft } from "@/lib/onboarding-cache";
import { Badge, Button, Card, CardHeader, cn } from "@/components/ui";
import {
  OnboardingHeader,
  DetailsSection,
  HomePickupSection,
  LiveFaceCapture,
  EMPTY_FORM,
  formProblems,
  semesterOf,
  type AcademicData,
  type CampusOption,
  type CaptureMode,
  type HomeLocation,
  type OnboardingForm,
  type PickupOption,
} from "@/components/portal/onboarding";

/**
 * Single-page onboarding: details → home and pickup stop → live pass photo (+ optional Face ID) → pay.
 *
 * - Everything shown comes from the server: campuses (/api/students/onboarding GET), classes
 *   (/api/academic/cascade), stops/zone/fee (/api/students/pickup-options). No placeholder values.
 * - POST /api/students/onboarding saves the profile (creating the students row) before the camera
 *   opens, because enroll-v2 and the portrait route need that row.
 * - The pass photo is never uploaded from a file and never sent through /api/students/profile.
 * - Students with a paid pass are redirected to /portal by onboarding/layout.tsx on the server.
 */

type VerifyState = "IDLE" | "VERIFYING" | "SUCCESS" | "ERROR";

const isStoredPortrait = (url?: string | null) => Boolean(url && url.startsWith("/api/biometrics/portrait/"));

function emailStudentId(email?: string | null): string {
  const local = (email || "").split("@")[0] || "";
  const m = local.match(/\b\d{7,10}\b/) || local.match(/([a-zA-Z]{1,4}-\d{6,10})/i);
  return m ? m[0].toUpperCase() : "";
}

export default function StudentOnboardingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | undefined>();
  const [campuses, setCampuses] = useState<CampusOption[]>([]);
  const [academic, setAcademic] = useState<AcademicData>({ courses: [], branches: [], specializations: [], classes: [] });

  const [form, setForm] = useState<OnboardingForm>(EMPTY_FORM);
  const set = useCallback((patch: Partial<OnboardingForm>) => setForm((f) => ({ ...f, ...patch })), []);

  const [options, setOptions] = useState<PickupOption[]>([]);
  const [outOfServiceArea, setOutOfServiceArea] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const userPickedStop = useRef(false);

  const [photo, setPhoto] = useState<{ url: string; preview: string } | null>(null);
  const [faceIdDone, setFaceIdDone] = useState(false);
  const [consent, setConsent] = useState(false);
  const [capture, setCapture] = useState<CaptureMode | null>(null);

  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"photo" | "pay" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [verify, setVerify] = useState<VerifyState>("IDLE");

  // ── Payment return from Razorpay ────────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const paymentId = p.get("razorpay_payment_id");
    const linkId = p.get("razorpay_payment_link_id");
    const sig = p.get("razorpay_signature");
    if (!paymentId || !linkId || !sig) return;
    setVerify("VERIFYING");
    fetch("/api/payments/razorpay/verify-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_payment_id: paymentId,
        razorpay_payment_link_id: linkId,
        razorpay_payment_link_reference_id: p.get("razorpay_payment_link_reference_id"),
        razorpay_payment_link_status: p.get("razorpay_payment_link_status"),
        razorpay_signature: sig,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        window.history.replaceState({}, document.title, window.location.pathname);
        if (!d.success) {
          setVerify("ERROR");
          setError(d.error || "We could not confirm the payment. If money was taken, it will show in Payments within a few minutes.");
          return;
        }
        clearOnboardingDraft(userId);
        setVerify("SUCCESS");
        setTimeout(() => (window.location.href = "/portal"), 2000);
      })
      .catch(() => {
        setVerify("ERROR");
        setError("Network error while confirming the payment. Check Payments before paying again.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Initial data ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessionRes, meRes, cascadeRes, campusRes] = await Promise.all([
          fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
          fetch("/api/students/me", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
          fetch("/api/academic/cascade").then((r) => r.json()),
          fetch("/api/students/onboarding", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (!cascadeRes.success || !campusRes.success) throw new Error("load");
        const user = sessionRes.user || {};
        const s = meRes.student || null;
        const ac: AcademicData = {
          courses: cascadeRes.courses || [],
          branches: cascadeRes.branches || [],
          specializations: cascadeRes.specializations || [],
          classes: cascadeRes.classes || [],
        };
        const camps: CampusOption[] = campusRes.campuses || [];
        setAcademic(ac);
        setCampuses(camps);
        setUserId(user.id);

        // Saved profile first, then the local draft, then values we can derive (never invented).
        const draft = loadOnboardingDraft(user.id);
        const classId = s?.classId || draft?.selectedClassId || "";
        const cls = ac.classes.find((c) => c.id === classId);
        const lat = s?.homeLatitude ?? draft?.homeLat;
        const lng = s?.homeLongitude ?? draft?.homeLng;
        const address = s?.homeAddress || draft?.homeAddress || "";
        const primary = camps.find((c) => c.isPrimary) || (camps.length === 1 ? camps[0] : undefined);
        setForm({
          fullName: s?.fullName || draft?.fullName || user.fullName || "",
          phone: s?.phone || draft?.phone || "",
          studentIdCode: s?.studentIdCode || draft?.studentIdCode || emailStudentId(user.email),
          campusId: s?.campusId || draft?.campusId || cls?.campus_id || primary?.id || "",
          courseId: cls?.course_id || draft?.selectedCourseId || "",
          branchId: cls?.branch_id || draft?.selectedBranchId || "",
          specializationId: cls?.specialization_id || draft?.selectedSpecializationId || "",
          semester: cls ? String(semesterOf(cls) ?? "") : draft?.selectedYear || "",
          classId: cls ? cls.id : "",
          emergencyName: (s?.emergencyContact?.name !== "Campus Desk" && s?.emergencyContact?.name) || draft?.emergencyName || "",
          emergencyPhone: s?.emergencyContact?.phone || draft?.emergencyPhone || "",
          home: lat != null && lng != null && Number.isFinite(Number(lat)) ? { latitude: Number(lat), longitude: Number(lng), address } : null,
          stopId: s?.primaryStopId || draft?.primaryStopId || "",
        });
        if (s?.primaryStopId || draft?.primaryStopId) userPickedStop.current = true;
        if (s?.id) setStudentId(s.id);
        if (isStoredPortrait(s?.photoUrl)) setPhoto({ url: s.photoUrl, preview: s.photoUrl });
        setReady(true);
      } catch {
        if (!cancelled) setLoadError("Could not load the form. Check your connection and reload.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Draft (survives refresh and tab sleep; the photo is never stored here) ─
  useEffect(() => {
    if (!ready || verify !== "IDLE") return;
    const t = setTimeout(() => {
      saveOnboardingDraft(userId, {
        activeStep: 1,
        fullName: form.fullName,
        phone: form.phone,
        studentIdCode: form.studentIdCode,
        campusId: form.campusId,
        selectedCourseId: form.courseId,
        selectedBranchId: form.branchId,
        selectedSpecializationId: form.specializationId,
        selectedYear: form.semester,
        selectedClassId: form.classId,
        emergencyName: form.emergencyName,
        emergencyPhone: form.emergencyPhone,
        homeAddress: form.home?.address,
        homeLat: form.home?.latitude,
        homeLng: form.home?.longitude,
        primaryStopId: form.stopId,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [form, ready, userId, verify]);

  // ── Pickup options for the home location ────────────────────────────────
  const homeLat = form.home?.latitude;
  const homeLng = form.home?.longitude;
  useEffect(() => {
    if (homeLat == null || homeLng == null) {
      setOptions([]);
      return;
    }
    const ctrl = new AbortController();
    setLoadingOptions(true);
    const q = new URLSearchParams({ lat: String(homeLat), lng: String(homeLng) });
    if (form.campusId) q.set("campusId", form.campusId);
    fetch(`/api/students/pickup-options?${q}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error);
        const list: PickupOption[] = d.options || [];
        setOptions(list);
        setOutOfServiceArea(Boolean(d.outOfServiceArea));
        setForm((f) => {
          const keep = userPickedStop.current && list.some((o) => o.stopId === f.stopId && o.routeId);
          return keep ? f : { ...f, stopId: d.defaultStopId || "" };
        });
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setOptions([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingOptions(false);
      });
    return () => ctrl.abort();
  }, [homeLat, homeLng, form.campusId]);

  const onHome = useCallback((h: HomeLocation) => {
    userPickedStop.current = false;
    setForm((f) => ({ ...f, home: h }));
  }, []);
  const onStop = useCallback((id: string) => {
    userPickedStop.current = true;
    setForm((f) => ({ ...f, stopId: id }));
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const problems = formProblems(form);
  const formComplete = problems.details.length === 0 && problems.home.length === 0;
  const formKey = useMemo(() => JSON.stringify(form), [form]);
  const selected = options.find((o) => o.stopId === form.stopId) || null;
  const campus = campuses.find((c) => c.id === form.campusId) || null;

  const save = async (): Promise<string | null> => {
    setError(null);
    if (!formComplete) {
      setShowErrors(true);
      setError(`Still needed: ${[...problems.details, ...problems.home].join(", ")}.`);
      return null;
    }
    if (savedKey === formKey && studentId) return studentId;
    const res = await fetch("/api/students/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: form.fullName,
        phone: form.phone,
        studentIdCode: form.studentIdCode,
        campusId: form.campusId,
        classId: form.classId,
        emergencyName: form.emergencyName,
        emergencyPhone: form.emergencyPhone,
        home: form.home,
        stopId: form.stopId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      if (data.code === "ALREADY_ACTIVE") router.replace("/portal");
      setShowErrors(true);
      setError(data.error || "Could not save your details. Please try again.");
      return null;
    }
    setSavedKey(formKey);
    setStudentId(data.studentId);
    return data.studentId as string;
  };

  const openCamera = async () => {
    setBusy("photo");
    try {
      if (await save()) setCapture(consent ? "faceid" : "photo");
    } finally {
      setBusy(null);
    }
  };

  const pay = async () => {
    setBusy("pay");
    try {
      const id = await save();
      if (!id) return;
      if (!photo) {
        setError("Take your pass photo first.");
        return;
      }
      const res = await fetch("/api/payments/razorpay/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: id, callbackPath: "/portal/onboarding" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.short_url) throw new Error(data.error || "Could not start the payment.");
      window.location.href = data.short_url;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  // ── Screens ──────────────────────────────────────────────────────────────
  if (verify === "VERIFYING" || verify === "SUCCESS") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-gray-50 dark:bg-black">
        <Card className="w-full max-w-sm text-center space-y-3 py-8">
          {verify === "VERIFYING" ? (
            <>
              <Loader2 className="w-10 h-10 mx-auto animate-spin text-emerald-600" />
              <h2 className="text-lg font-black">Confirming your payment</h2>
              <p className="text-sm text-gray-500">Please keep this page open.</p>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
              <h2 className="text-lg font-black">Your bus pass is active</h2>
              <p className="text-sm text-gray-500">Opening My Commute…</p>
              <Button variant="success" block onClick={() => (window.location.href = "/portal")}>
                Open My Commute <ArrowRight className="w-4 h-4" />
              </Button>
            </>
          )}
        </Card>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 p-4 bg-gray-50 dark:bg-black text-center">
        {loadError ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300">{loadError}</p>
            <Button variant="secondary" onClick={() => window.location.reload()}>Reload</Button>
          </>
        ) : (
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        )}
      </div>
    );
  }

  const fee = selected?.semesterFee ?? null;
  const canPay = formComplete && Boolean(photo) && fee != null;

  return (
    <div className="min-h-[100dvh] bg-gray-50/80 dark:bg-black text-gray-900 dark:text-gray-100 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
      <OnboardingHeader onBack={() => router.push("/portal")} />

      <main className="w-full max-w-2xl mx-auto px-3 sm:px-6 py-4 space-y-4">
        {verify === "ERROR" && error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-sm text-rose-800 dark:text-rose-200">{error}</div>
        )}

        <DetailsSection form={form} set={set} campuses={campuses} academic={academic} showErrors={showErrors} />

        <HomePickupSection
          home={form.home}
          stopId={form.stopId}
          campus={campus}
          options={options}
          loadingOptions={loadingOptions}
          outOfServiceArea={outOfServiceArea}
          onHome={onHome}
          onStop={onStop}
          showErrors={showErrors}
        />

        {/* 3. Live pass photo */}
        <Card>
          <CardHeader
            icon={<Camera className="w-5 h-5" />}
            title="3. Pass photo"
            subtitle="Taken live with your front camera. Conductors check it when you board."
            action={photo ? <Badge tone="green" dot>Done</Badge> : undefined}
          />
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-gray-100 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shrink-0 flex items-center justify-center">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.preview} alt="Your pass photo" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-7 h-7 text-gray-400" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0" />
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  <span className="font-bold block">Also set up Face ID for boarding (optional)</span>
                  {CONSENT_SUMMARY}
                </span>
              </label>
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer font-semibold">How we use your face data</summary>
                <ul className="list-disc pl-4 mt-1 space-y-1">
                  {CONSENT_POINTS.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </details>
              {faceIdDone && (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <ScanFace className="w-4 h-4" /> Face ID is set up
                </p>
              )}
              <Button variant={photo ? "secondary" : "primary"} onClick={openCamera} loading={busy === "photo"} disabled={busy !== null}>
                <Camera className="w-4 h-4" />
                {photo ? "Retake photo" : consent ? "Take photo and set up Face ID" : "Take photo"}
              </Button>
            </div>
          </div>
        </Card>

        {/* 4. Summary and pay */}
        <Card>
          <CardHeader icon={<CreditCard className="w-5 h-5" />} title="4. Pay and activate" subtitle="Your pass works on the next trip after payment" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-gray-500">Pickup stop</dt>
            <dd className="font-semibold text-right truncate">{selected?.name || "Not set"}</dd>
            <dt className="text-gray-500">Route</dt>
            <dd className="font-semibold text-right truncate">{selected?.routeName || "Not set"}</dd>
            <dt className="text-gray-500">Zone</dt>
            <dd className="font-semibold text-right truncate">{selected?.zoneName || "Not set"}</dd>
            <dt className="text-gray-500">Semester fee</dt>
            <dd className="font-black text-right">{fee != null ? `₹${fee.toLocaleString("en-IN")}` : "Not set"}</dd>
          </dl>
          {selected && fee == null && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">The fee for this stop is not set yet. Choose another stop or contact the transport office.</p>
          )}
          <p className="mt-3 text-[11px] text-gray-500 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> The amount is checked again on our server before you pay with Razorpay.
          </p>
        </Card>
      </main>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-zinc-950/95 backdrop-blur border-t border-gray-200 dark:border-zinc-800">
        <div className="max-w-2xl mx-auto px-3 sm:px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] space-y-2">
          {error && verify !== "ERROR" && <p className="text-xs font-semibold text-rose-600" role="alert">{error}</p>}
          <Button
            block
            variant="success"
            size="lg"
            onClick={canPay ? pay : () => { setShowErrors(true); setError(!formComplete ? `Still needed: ${[...problems.details, ...problems.home].join(", ")}.` : !photo ? "Take your pass photo first." : "The fee for this stop is not set yet."); }}
            loading={busy === "pay"}
            disabled={busy !== null}
            className={cn(!canPay && "opacity-60")}
          >
            {fee != null ? `Pay ₹${fee.toLocaleString("en-IN")} and activate` : "Pay and activate"}
          </Button>
        </div>
      </div>

      <LiveFaceCapture
        open={capture !== null}
        mode={capture ?? "photo"}
        onClose={() => setCapture(null)}
        onDone={({ photoUrl, preview, faceId }) => {
          setPhoto({ url: photoUrl, preview });
          if (faceId) setFaceIdDone(true);
          setError(null);
        }}
      />
    </div>
  );
}
