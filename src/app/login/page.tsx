"use client";

import React, { useState } from "react";
import Link from "next/link";
import { store } from "@/lib/client-store";
import { redirectIfSignedIn, replaceLocation } from "@/lib/client/auth-navigation";

import { UserRole, Stop, Campus } from "@/lib/types";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import BusLoadingScreen from "@/components/common/BusLoadingScreen";
import {
  BusFront,
  ShieldCheck,
  Mail,
  CheckCircle2,
  Lock,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Key,
  GraduationCap,
  Navigation,
  LayoutDashboard,
  Users,
  MapPin,
  Compass,
  Check,
  Building,
  Home,
  User,
} from "lucide-react";
import { authService } from "@/lib/auth-service";
import { CustomDropdown } from "@/components/common/CustomDropdown";

export default function LoginPage() {
  const [authStep, setAuthStep] = useState<"LOGIN_FORM" | "EMAIL_OTP" | "ONBOARDING" | "SUCCESS">("LOGIN_FORM");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Commuter Onboarding State
  const [stops, setStops] = useState<Stop[]>(store.getStops());
  const [campuses, setCampuses] = useState<Campus[]>(() => store.getCampuses());
  const [onboardingName, setOnboardingName] = useState("");
  const [onboardingCampusId, setOnboardingCampusId] = useState<string>(() => store.getPrimaryCampus()?.id || "");
  const [homeLocation, setHomeLocation] = useState("");
  const [selectedStopId, setSelectedStopId] = useState("");
  const [detectedDistanceText, setDetectedDistanceText] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [pendingAuthUser, setPendingAuthUser] = useState<any>(null);

  // If already authenticated, redirect straight to assigned console
  // Also re-checked when the browser restores this page from the back/forward
  // cache, where neither middleware nor this mount effect would run again.
  React.useEffect(() => {
    const user = store.getCurrentUser();
    if (user) {
      replaceLocation(authService.getTargetRouteForRole(user.role));
      return;
    }
    void redirectIfSignedIn();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void redirectIfSignedIn();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  React.useEffect(() => {
    const initialStops = store.getStops();
    const initialCampuses = store.getCampuses();
    if (initialCampuses.length > 0) {
      setCampuses(initialCampuses);
      if (!onboardingCampusId) {
        setOnboardingCampusId(store.getPrimaryCampus()?.id || initialCampuses[0].id);
      }
    }
    if (initialStops.length > 0) {
      setStops(initialStops);
      const defaultStop = initialStops.find(s => s.name.includes("Laldant")) || initialStops[0];
      if (defaultStop) setSelectedStopId(defaultStop.id);
    }

    const unsub = store.subscribe(() => {
      const latestStops = store.getStops();
      const latestCampuses = store.getCampuses();
      setStops(latestStops);
      setCampuses(latestCampuses);
      if (latestCampuses.length > 0 && !onboardingCampusId) {
        setOnboardingCampusId(store.getPrimaryCampus()?.id || latestCampuses[0].id);
      }
      if (latestStops.length > 0 && !selectedStopId) {
        const defaultStop = latestStops.find(s => s.name.includes("Laldant")) || latestStops[0];
        if (defaultStop) setSelectedStopId(defaultStop.id);
      }
    });
    return unsub;
  }, [selectedStopId, onboardingCampusId]);

  // Filter stops by selected campus
  const campusStops = React.useMemo(() => {
    if (!onboardingCampusId) return stops;
    const campus = campuses.find(c => c.id === onboardingCampusId);
    return stops.filter(st => {
      if (st.campusId) return st.campusId === onboardingCampusId;
      if (campus && (st.code?.toLowerCase().includes(campus.code.toLowerCase()) || st.name.toLowerCase().includes(campus.name.toLowerCase()))) {
        return true;
      }
      return true;
    });
  }, [stops, onboardingCampusId, campuses]);

  // Compute nearest stops based on text filter or GPS
  const filteredNearestStops = React.useMemo(() => {
    if (!homeLocation.trim()) {
      return campusStops;
    }
    const q = homeLocation.toLowerCase().trim();
    const matched = campusStops.filter(
      st =>
        st.name.toLowerCase().includes(q) ||
        st.landmark.toLowerCase().includes(q) ||
        st.code.toLowerCase().includes(q)
    );
    return matched.length > 0 ? matched : campusStops;
  }, [campusStops, homeLocation]);

  const [recommendedStops, setRecommendedStops] = useState<any[]>([]);

  const handleDetectGPSLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        if (campusStops.length === 0) return;

        // Use Bellman-Ford + Dijkstra combined recommendation engine
        const recs = store.recommendRoute(latitude, longitude);
        setRecommendedStops(recs);

        if (recs.length > 0) {
          const topPickStop = stops.find(s => s.id === recs[0].stopId);
          if (topPickStop) {
            setSelectedStopId(topPickStop.id);
            setHomeLocation(topPickStop.name.split("(")[0].trim());
            setDetectedDistanceText(
              `Algorithm Match: ~${recs[0].walkingDistanceKm} km walk (${recs[0].busCount} bus options, ${topPickStop.name})`
            );
          }
        }
      },
      err => {
        setIsLocating(false);
        console.warn("GPS error:", err);
        const defaultStop = campusStops[0];
        if (defaultStop) setSelectedStopId(defaultStop.id);
      },
      { timeout: 8000 }
    );
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Try real Google OAuth
      const result = await authService.signInWithGoogle();
      if (!result.success) {
        setErrorMessage(result.message || "Google Sign-In is unavailable. Please sign in with Email OTP or Password.");
      }
      // If success, browser will redirect to Google consent / callback
    } catch (err: any) {
      console.warn("Auth exception:", err);
      setErrorMessage(err.message || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await authService.sendOtp(email);
      if (res.success) {
        setAuthStep("EMAIL_OTP");
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to send verification code.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const enteredOtp = otp.join("");
    if (enteredOtp.length < 6) {
      setErrorMessage("Please enter the complete 6-digit code");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await authService.verifyOtp(email, enteredOtp);
      if (res.success && res.user) {
        const authUser = res.user;
        store.setCurrentUser(authUser);

        if (authUser.role === "admin") {
          setAuthStep("SUCCESS");
          setTimeout(() => replaceLocation("/admin"), 700);
        } else if (
          authUser.role === "driver" ||
          authUser.role === "conductor" ||
          authUser.role === "transport_admin" ||
          authUser.role === "transport_manager" ||
          authUser.role === "teacher"
        ) {
          setAuthStep("SUCCESS");
          setTimeout(() => replaceLocation(authService.getTargetRouteForRole(authUser.role)), 700);
        } else {
          // Student role
          if (
            authUser.primaryStopId ||
            (authUser.campus && authUser.fullName && authUser.fullName !== "Student Commuter")
          ) {
            setAuthStep("SUCCESS");
            setTimeout(() => replaceLocation("/portal"), 700);
          } else {
            // First time student commuter onboarding
            setPendingAuthUser(authUser);
            setOnboardingName(authUser.fullName || "Student Commuter");
            const defaultStop = stops.find(s => s.name.includes("Laldant")) || stops[0];
            if (defaultStop) setSelectedStopId(defaultStop.id);
            setAuthStep("ONBOARDING");
          }
        }
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Invalid passcode.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardingName.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!selectedStopId) {
      setErrorMessage("Please select your nearest boarding stop.");
      return;
    }

    setIsLoading(true);

    try {
      const chosenStop = stops.find(s => s.id === selectedStopId) || stops[0];
      const chosenCampus = campuses.find(c => c.id === onboardingCampusId) || store.getPrimaryCampus();
      const updatedUser = {
        ...(pendingAuthUser || store.getCurrentUser()),
        fullName: onboardingName.trim(),
        campusId: onboardingCampusId,
        campus: chosenCampus?.name || "",
        primaryStopId: selectedStopId,
        primaryStopName: chosenStop?.name,
      };

      store.setCurrentUser(updatedUser);

      // Persist profile to server
      try {
        await fetch("/api/auth/update-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: updatedUser.fullName,
            campusId: onboardingCampusId,
            campus: chosenCampus?.name || "",
            primaryStopId: selectedStopId,
          }),
          credentials: "include",
        });
      } catch (err) {
        console.warn("Profile update notice:", err);
      }

      setAuthStep("SUCCESS");
      setTimeout(() => {
        replaceLocation("/portal");
      }, 700);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to complete onboarding.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index: number, val: string) => {
    if (val.length > 1) val = val[0];
    const newOtp = [...otp];
    newOtp[index] = val;
    setOtp(newOtp);

    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  return (
    <div className="min-h-screen flex selection:bg-blue-500 selection:text-white bg-gray-50 dark:bg-gray-950">
      
      {/* LEFT SIDE: Brand & Imagery (PC Only) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gray-900 flex-col justify-between overflow-hidden">
        {/* Clean Flat Background */}
        <div className="absolute inset-0 z-0 bg-blue-900" />

        {/* Content */}
        <div className="relative z-20 p-12 flex flex-col h-full justify-between">
          <div>
            <Link href="/" className="inline-flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/20">
                <BusFront className="w-6 h-6" />
              </div>
              <span className="text-2xl font-black tracking-tight text-white">
                Campus<span className="text-blue-400">Fleet</span>
              </span>
            </Link>
          </div>

          <div className="space-y-6">
            <h1 className="text-5xl font-black text-white leading-tight tracking-tight">
              The future of <br/>
              <span className="text-blue-400">
                campus mobility.
              </span>
            </h1>
            <p className="text-gray-400 text-lg max-w-md font-medium">
              A unified smart transit system connecting students, parents, drivers, and administrators.
            </p>
            
            <div className="flex gap-4 pt-4">
              <div className="flex items-center gap-2 text-sm text-gray-300 bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                <ShieldCheck className="w-4 h-4 text-green-400" />
                <span>Enterprise Grade Security</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Auth Flow (Both PC & Mobile) */}
      <div className="flex-1 flex flex-col relative w-full lg:w-1/2">
        {/* Mobile Header (Hidden on PC) */}
        <header className="lg:hidden absolute top-0 w-full px-6 h-20 flex items-center justify-between z-20">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <BusFront className="w-5 h-5" />
            </div>
            <span className="text-xl font-black tracking-tight text-gray-900 dark:text-white">
              Campus<span className="text-blue-600 dark:text-blue-400">Fleet</span>
            </span>
          </Link>
          <ThemeToggle />
        </header>

        {/* Floating Theme Toggle (PC Only) */}
        <div className="hidden lg:block absolute top-6 right-8 z-20">
          <ThemeToggle />
        </div>

        <main className="flex-1 flex items-center justify-center p-6 pt-24 lg:pt-6">
          {isLoading && (
            <BusLoadingScreen
              fullScreen={true}
              message={
                authStep === "EMAIL_OTP"
                  ? "Verifying OTP code and loading transit profile..."
                  : authStep === "ONBOARDING"
                  ? "Saving primary stop & configuring campus hub..."
                  : "Authenticating & querying institutional database..."
              }
              subtitle="Graphic Era Hill University Smart Fleet Gateway"
            />
          )}

          <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Context Header */}
            <div className="mb-8 space-y-2">
              <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">
                {authStep === "LOGIN_FORM" ? "Welcome back" :
                 authStep === "EMAIL_OTP" ? "Verify identity" :
                 authStep === "ONBOARDING" ? "Complete profile" : "Verified!"}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                {authStep === "LOGIN_FORM" ? "Sign in to access your dashboard." :
                 authStep === "EMAIL_OTP" ? "We sent a 6-digit code to your email." :
                 authStep === "ONBOARDING" ? "Tell us where you commute from." : "Redirecting securely..."}
              </p>
            </div>

            {errorMessage && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-2xl text-sm text-red-600 dark:text-red-400 flex items-start gap-3 animate-in shake">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            )}

            {/* STEP 1: Main Login Form */}
            {authStep === "LOGIN_FORM" && (
              <div className="space-y-6">
                {/* Google SSO */}
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full py-4 px-4 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-white font-bold text-sm rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-center gap-3 transition-all active:scale-[0.98] group"
                >
                  <svg className="w-5 h-5 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24Z" />
                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15Z" />
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z" />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <div className="relative flex items-center justify-center my-6">
                  <div className="border-t border-gray-200 dark:border-gray-800 w-full" />
                  <span className="bg-gray-50 dark:bg-gray-950 px-4 text-xs font-bold text-gray-400 absolute">
                    or use institutional email
                  </span>
                </div>

                {/* Email Form */}
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <div className="relative group">
                      <Mail className="w-5 h-5 text-gray-400 absolute left-4 top-4 transition-colors group-focus-within:text-blue-500" />
                      <input
                        type="email"
                        required
                        placeholder="name@gehu.ac.in"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full text-sm pl-12 pr-4 py-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium placeholder:font-normal"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !email}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm rounded-2xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  >
                    <span>Send Login Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* STEP 2: Email OTP Input */}
            {authStep === "EMAIL_OTP" && (
              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div className="p-4 bg-gray-100 dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-800 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Code sent to</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{email}</p>
                  </div>
                </div>

                <div className="flex justify-between gap-3">
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      id={`otp-input-${idx}`}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(idx, e.target.value)}
                      className="w-12 h-16 sm:w-14 sm:h-16 text-center font-mono font-black text-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
                    />
                  ))}
                </div>

                <div className="space-y-3">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-lg shadow-blue-600/25 transition-all active:scale-[0.98]"
                  >
                    {isLoading ? "Verifying..." : "Verify & Continue"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthStep("LOGIN_FORM")}
                    className="w-full text-center text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white font-bold transition-colors"
                  >
                    Use a different email
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: Required Details & Nearest Stop Selection */}
            {authStep === "ONBOARDING" && (
              <form onSubmit={handleCompleteOnboarding} className="space-y-5">
                {/* Full Name */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1 mb-1.5 block">
                    Full Name
                  </label>
                  <div className="relative group">
                    <User className="w-5 h-5 text-gray-400 absolute left-4 top-4 transition-colors group-focus-within:text-blue-500" />
                    <input
                      type="text"
                      required
                      placeholder="Aditya Pandey"
                      value={onboardingName}
                      onChange={e => setOnboardingName(e.target.value)}
                      className="w-full text-sm pl-12 pr-4 py-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-bold"
                    />
                  </div>
                </div>

                {/* Campus Selection */}
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1 mb-1.5 block">
                    Enrolled Campus
                  </label>
                  <CustomDropdown
                    value={onboardingCampusId}
                    onChange={val => setOnboardingCampusId(val)}
                    placeholder="Select Campus"
                    options={campuses.map(c => ({
                      value: c.id,
                      label: `${c.name}${c.isPrimary ? " • (Main Hub)" : ""}`,
                    }))}
                  />
                </div>

                {/* Home Location / Neighborhood */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1">
                      Home Area
                    </label>
                    <button
                      type="button"
                      onClick={handleDetectGPSLocation}
                      disabled={isLocating}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-full transition-colors"
                    >
                      <Navigation className="w-3 h-3" />
                      <span>{isLocating ? "Locating..." : "Auto-Detect"}</span>
                    </button>
                  </div>

                  <div className="relative group">
                    <Home className="w-5 h-5 text-gray-400 absolute left-4 top-4 transition-colors group-focus-within:text-blue-500" />
                    <input
                      type="text"
                      placeholder="e.g. Laldant, Mukhani, Lalkuan..."
                      value={homeLocation}
                      onChange={e => {
                        setHomeLocation(e.target.value);
                        setDetectedDistanceText(null);
                      }}
                      className="w-full text-sm pl-12 pr-4 py-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium"
                    />
                  </div>
                  {detectedDistanceText && (
                    <p className="text-xs font-bold text-green-600 dark:text-green-400 mt-2 ml-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> {detectedDistanceText}
                    </p>
                  )}
                </div>

                {/* Nearest Stop Selector */}
                <div className="pt-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ml-1 mb-2 block">
                    Select Boarding Stop
                  </label>

                  {recommendedStops.length > 0 && (
                    <div className="mb-3 space-y-2">
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1 ml-1">
                        <Sparkles className="w-3 h-3" /> Smart Recommendations
                      </span>
                      <div className="grid grid-cols-2 gap-3">
                        {recommendedStops.slice(0, 2).map((rec: any) => {
                          const st = stops.find(s => s.id === rec.stopId);
                          if (!st) return null;
                          const isSelected = selectedStopId === st.id;
                          return (
                            <div
                              key={st.id}
                              onClick={() => setSelectedStopId(st.id)}
                              className={`p-3 rounded-2xl border text-sm cursor-pointer transition-all ${
                                isSelected
                                  ? "bg-blue-50 dark:bg-blue-900/20 border-blue-500 shadow-sm shadow-blue-500/10"
                                  : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700"
                              }`}
                            >
                              <div className="font-bold text-gray-900 dark:text-white truncate">
                                {st.name}
                              </div>
                              <div className="text-[11px] text-gray-500 font-medium flex items-center justify-between mt-1.5">
                                <span>~{rec.walkingDistanceKm}km</span>
                                <span className="text-blue-600 dark:text-blue-400 font-bold">{rec.busCount} buses</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <CustomDropdown
                    value={selectedStopId}
                    onChange={val => setSelectedStopId(val)}
                    placeholder="Select Nearest Boarding Stop"
                    options={filteredNearestStops.map(st => ({
                      value: st.id,
                      label: `${st.name} (${st.code})`,
                      sublabel: st.landmark || undefined,
                    }))}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] mt-4"
                >
                  <span>{isLoading ? "Saving Profile..." : "Complete Setup"}</span>
                  {!isLoading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
            )}

            {/* STEP 4: Success Screen */}
            {authStep === "SUCCESS" && (
              <div className="text-center py-12 space-y-4 animate-in zoom-in-95 duration-500">
                <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center mx-auto shadow-xl shadow-green-500/10">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="font-black text-2xl text-gray-900 dark:text-white">Access Granted</h3>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Securely routing you to your dashboard...
                </p>
              </div>
            )}
          </div>
        </main>
        
        {/* Simple Footer */}
        <div className="p-6 text-center">
          <p className="text-[11px] font-medium text-gray-400 dark:text-gray-600">
            © {new Date().getFullYear()} CampusFleet • Protected by Enterprise SSO
          </p>
        </div>
      </div>
    </div>
  );
}
