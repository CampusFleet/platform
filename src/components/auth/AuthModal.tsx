"use client";

import React, { useState } from "react";
import { store } from "@/lib/client-store";
import { replaceLocation } from "@/lib/client/auth-navigation";
import { authService } from "@/lib/auth-service";
import { UserRole } from "@/lib/types";
import { ShieldCheck, Mail, CheckCircle2, Lock, ArrowRight, X, Sparkles, AlertCircle } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRole?: UserRole;
}

export function AuthModal({ isOpen, onClose, initialRole = "student" }: AuthModalProps) {
  const [role, setRole] = useState<UserRole>(initialRole);
  const [authStep, setAuthStep] = useState<"SELECT" | "EMAIL_OTP" | "SUCCESS">("SELECT");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [generatedCodeHint, setGeneratedCodeHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await authService.signInWithGoogle();
      if (!result.success) {
        setErrorMessage(result.message || "Google Sign-In is unavailable. Please use Email OTP.");
      }
    } catch (err: any) {
      console.warn("Auth Exception:", err);
      setErrorMessage(err.message || "Failed to authenticate");
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
        setGeneratedCodeHint(null);
        setAuthStep("EMAIL_OTP");
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to send passcode");
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
        const user = res.user;
        store.setCurrentUser(user);
        setAuthStep("SUCCESS");
        setTimeout(() => {
          onClose();
          setAuthStep("SELECT");
          replaceLocation(authService.getTargetRouteForRole(user.role));
        }, 700);
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Invalid passcode.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index: number, val: string) => {
    if (val.length > 1) val = val[0];
    const newOtp = [...otp];
    newOtp[index] = val;
    setOtp(newOtp);

    // Auto-advance focus
    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-gray-900 dark:text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black tracking-tight">Institutional Gateway Login</h2>
          <p className="text-xs text-gray-500 max-w-xs mx-auto">
            CampusFleet Auth • Google SSO & Email Verification
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-2xl text-xs text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 1: Method Selector */}
        {authStep === "SELECT" && (
          <div className="space-y-4">
            {/* Google OAuth Button */}
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-3 px-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/80 text-gray-800 dark:text-white font-bold text-xs rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                />
              </svg>
              <span>{isLoading ? "Authenticating..." : "Continue with Google Institutional SSO"}</span>
            </button>

            <div className="relative flex items-center justify-center my-2">
              <div className="border-t border-gray-200 dark:border-gray-800 w-full" />
              <span className="bg-white dark:bg-gray-900 px-3 text-[10px] uppercase font-bold text-gray-400 absolute">
                Or Email OTP
              </span>
            </div>

            {/* Email Form */}
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Campus Email Address
                </label>
                <div className="relative mt-1">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="student@campus.edu or your.email@gmail.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full text-xs pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !email}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
              >
                <span>{isLoading ? "Dispatching..." : "Send Verification Code"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}

        {/* STEP 2: Enter 6-Digit Email OTP */}
        {authStep === "EMAIL_OTP" && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-100 dark:border-blue-900/40 text-center space-y-1">
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                Verification code sent to:
              </p>
              <p className="text-xs font-mono font-bold text-blue-900 dark:text-blue-200">{email}</p>
              <p className="text-[10px] text-gray-400">Enter the 6-digit passcode sent to your inbox</p>
            </div>

            <div className="flex justify-between gap-1.5">
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  id={`otp-input-${idx}`}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleOtpChange(idx, e.target.value)}
                  className="w-11 h-12 text-center font-mono font-black text-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-600/20"
            >
              {isLoading ? "Verifying..." : "Verify & Complete Sign In"}
            </button>

            <button
              type="button"
              onClick={() => setAuthStep("SELECT")}
              className="w-full text-center text-xs text-gray-400 hover:text-gray-600 font-bold"
            >
              ← Use a different method or email
            </button>
          </form>
        )}

        {/* STEP 3: Success */}
        {authStep === "SUCCESS" && (
          <div className="text-center py-6 space-y-3 animate-in zoom-in-95">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-950/60 text-green-600 dark:text-green-400 flex items-center justify-center mx-auto shadow-md shadow-green-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="font-black text-lg">Authentication Verified!</h3>
            <p className="text-xs text-gray-500">Redirecting to your institutional portal...</p>
          </div>
        )}
      </div>
    </div>
  );
}
