"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { store } from "@/lib/store";
import { authService } from "@/lib/auth-service";
import { useTranslation } from "@/components/common/LanguageProvider";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { MobileBottomNav } from "@/components/common/MobileBottomNav";
import { SOSModal } from "@/components/common/SOSModal";
import { AuthModal } from "@/components/auth/AuthModal";
import { isStudentSubscriptionActive } from "@/lib/subscription-utils";
// Removed reCAPTCHA
import {
  BusFront,
  Compass,
  QrCode,
  CalendarCheck,
  CreditCard,
  Lock,
  ArrowRight,
  ShieldAlert,
  Navigation,
  Zap,
  User,
  LayoutDashboard,
  Clock,
} from "lucide-react";

export default function ClientPortalLayout({
  children,
  initialIsSubscribed,
  initialPhotoUrl,
}: {
  children: React.ReactNode;
  initialIsSubscribed: boolean;
  initialPhotoUrl?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState(store.getCurrentUser());
  const [students, setStudents] = useState(store.getStudents());
  const [activeChildId, setActiveChildId] = useState(store.getActiveChildId());
  const [isSOSOpen, setIsSOSOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isStoreReady, setIsStoreReady] = useState(store.isReady());

  // ── Sticky Subscription Guard ──────────────────────────────────────
  // Once we confirm subscription is active, we NEVER downgrade it to
  // inactive due to a transient sync/re-render. This prevents the
  // "flicker to /payments" bug caused by the store briefly having an
  // empty students array during re-sync.
  const confirmedActiveRef = useRef(false);

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
      setStudents(store.getStudents());
      setActiveChildId(store.getActiveChildId());
      setIsStoreReady(store.isReady());
    });
    return unsub;
  }, []);

  // Strict Access Guard: Student portal can only be seen by enrolled students or admins
  const isAuthorizedStudent = !currentUser || currentUser.role === "student" || currentUser.role === "admin";

  useEffect(() => {
    if (currentUser && currentUser.role && currentUser.role !== "student" && currentUser.role !== "admin") {
      const destination = authService.getTargetRouteForRole(currentUser.role);
      router.replace(destination);
    }
  }, [currentUser, router]);

  const activeStudent = currentUser
    ? students.find(
        s =>
          (activeChildId && (s.id === activeChildId || s.userId === activeChildId)) ||
          (currentUser.studentId && s.id === currentUser.studentId) ||
          s.userId === currentUser.id ||
          s.id === currentUser.id ||
          s.email?.toLowerCase() === currentUser.email?.toLowerCase()
      ) || null
    : null;

  const isStudent = currentUser?.role === "student";
  // The server provides the ultimate source of truth instantly via Redis!
  const isSubscriptionActiveNow = initialIsSubscribed || isStudentSubscriptionActive(activeStudent) || currentUser?.role === "admin";

  // Sticky guard: once active, stays active (prevents flicker)
  if (isSubscriptionActiveNow) {
    confirmedActiveRef.current = true;
  }
  // IF the server said they are subscribed, we NEVER block access!
  const isSubscriptionActive = initialIsSubscribed || confirmedActiveRef.current || isSubscriptionActiveNow;

  const hasCompleteProfile = Boolean(activeStudent?.phone && activeStudent.phone.trim() !== "");
  
  const isOnboardingPage = pathname === "/portal/onboarding";
  const isPaymentPage = pathname === "/portal/payments";
  
  // Only block access if the server definitively said they are NOT subscribed!
  const isAccessBlocked = isStudent && !isSubscriptionActive && !isPaymentPage && !isOnboardingPage;
  useEffect(() => {
    // If the server explicitly said we are subscribed, SKIP ALL REDIRECTS!
    if (initialIsSubscribed) return;
    
    // Skip if we don't have a student resolved yet (still loading)
    if (isStudent && !activeStudent) return;
    
    if (isStudent) {
      // 1. Force onboarding if profile is incomplete
      if (!hasCompleteProfile && !isOnboardingPage) {
        console.warn("[REDIRECT] Profile Incomplete -> /portal/onboarding");
        router.replace("/portal/onboarding");
      } 
      // 2. Force payment if profile is complete but subscription inactive
      // ONLY if confirmedActiveRef was never set (truly never paid)
      else if (hasCompleteProfile && !isSubscriptionActive && !isPaymentPage && !isOnboardingPage) {
        console.warn("[REDIRECT] Subscription Inactive -> /portal/payments");
        router.replace("/portal/payments");
      }
    }
  }, [isStudent, hasCompleteProfile, activeStudent, pathname, router, isOnboardingPage, isPaymentPage, initialIsSubscribed, isSubscriptionActive]);

  if (currentUser && !isAuthorizedStudent) {
    const role = currentUser.role;
    const targetRoute = authService.getTargetRouteForRole(role);
    const roleTitle = role.toUpperCase();

    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 rounded-3xl p-8 border border-gray-800 shadow-2xl text-center space-y-4 animate-in fade-in">
          <div className="w-16 h-16 rounded-2xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black">Student Portal Restricted</h2>
          <p className="text-xs text-gray-400 leading-relaxed">
            You are signed in as <strong>{currentUser.fullName}</strong> with role{" "}
            <span className="text-pink-400 font-bold uppercase">{roleTitle}</span>. The Student Portal is strictly reserved for enrolled students.
          </p>
          <div className="pt-2">
            <Link
              href={targetRoute}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-pink-600 hover:bg-pink-700  text-white text-xs font-black shadow-lg shadow-pink-600/30 transition-all active:scale-95"
            >
              <span>Switch to {roleTitle} Console ({targetRoute})</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isStoreReady) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  // Removed blocking loading screen to reveal the underlying UI instantly!

  // Dynamic Navigation Links:
  // 1. If Inactive/Unpaid/Expired: ONLY show Pass Activation & Fees (other pages are hidden)
  // 2. If Paid & Active: Show Commute Cockpit, Seat Booking, Digital Pass, Live Radar (Fee payment form deactivated)
  const navLinks = isSubscriptionActive
    ? [
        { href: "/portal", label: t('commutePortal'), icon: Navigation, requiresPayment: false },
        { href: "/portal/late", label: t('tripUpdates'), icon: Clock, requiresPayment: false },
        { href: "/portal/settings", label: t('settings'), icon: User, requiresPayment: false },
      ]
    : [
        { href: "/portal/payments", label: t('feePayment'), icon: CreditCard, requiresPayment: false },
        { href: "/portal/onboarding", label: t('profileDetails'), icon: User, requiresPayment: false },
      ];

  const processedNavLinks = navLinks.map(link => ({
    ...link,
    isLocked: false,
  }));

  const layoutContent = (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col pb-16 md:pb-6 overflow-x-hidden">
      {/* Zero-Overflow Unified Header with Vertical Slide-Down Command Panel */}
      <UnifiedAppHeader
        role="student"
        portalTitle="CampusFleet"
        portalSubtitle={activeStudent ? (activeStudent.campus || store.getStudentPrimaryCampus(activeStudent).name) : "Student & Mobility Portal"}
        navLinks={processedNavLinks}
        userPhotoUrl={initialPhotoUrl}
        showSOS={true}
        onOpenSOS={() => setIsSOSOpen(true)}
        mobilePrimaryAction={
          isSubscriptionActive
              ? {
                  label: "My Commute Hub",
                  href: "/portal",
                  subtitle: "Book seats, view pass & track buses",
                  icon: BusFront,
                }
            : {
                label: "Activate Transit Pass",
                href: "/portal/payments",
                subtitle: "Select zone & complete fee payment to unlock pass",
                icon: CreditCard,
              }
        }
      />

      {/* Main Content Container with Top-to-Down Progressive Flow */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {isAccessBlocked ? (
          <div className="max-w-2xl mx-auto my-10 p-6 sm:p-10 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl text-center space-y-6 animate-in zoom-in-95">
            <div className="w-16 h-16 rounded-3xl bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mx-auto shadow-inner">
              <Lock className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <div className="inline-block text-[11px] font-extrabold uppercase px-3 py-1 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                Transport Pass Inactive • Payment Required
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                Semester Transit Access Locked
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
                Without verified transit fee payment, seat booking, digital dynamic QR pass, and live fleet telematics are restricted.
              </p>
            </div>

            {activeStudent?.paymentStatus === "PENDING_APPROVAL" ? (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-950/60 rounded-2xl border border-yellow-200 dark:border-yellow-800 text-left space-y-1">
                <div className="text-xs font-bold text-yellow-800 dark:text-yellow-300 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 animate-ping" />
                  Payment Processing — Awaiting Confirmation
                </div>
                <p className="text-[11px] text-yellow-700 dark:text-yellow-400">
                  Your payment is currently processing. If it was successful, your transit pass will automatically unlock shortly.
                </p>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 text-left space-y-2">
                <div className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  How to Unlock Your Transit Pass:
                </div>
                <ol className="text-[11px] text-gray-500 space-y-1 list-decimal list-inside">
                  <li>Click on "Pass Activation & Fees" in the sidebar.</li>
                  <li>Click "Instant Account Activation" to securely pay via Razorpay.</li>
                  <li>Upon successful payment, your pass will instantly unlock automatically!</li>
                </ol>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/portal/payments"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm shadow-lg shadow-blue-500/25 transition-transform active:scale-95"
              >
                <CreditCard className="w-4 h-4" />
                <span>Go to Pass & Fee Payment Gateway →</span>
              </Link>
              <Link
                href="/portal/onboarding"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-sm transition-all"
              >
                <User className="w-4 h-4" />
                <span>Edit Profile Details</span>
              </Link>
            </div>
          </div>
        ) : (
          children
        )}
      </main>

      {/* Modern Floating Bottom Navigation Bar for Mobile Commuters */}
      <MobileBottomNav isPaymentApproved={isSubscriptionActive} />

      {/* SOS Modal */}
      <SOSModal
        isOpen={isSOSOpen}
        onClose={() => setIsSOSOpen(false)}
        studentId={activeStudent?.id || currentUser?.id || ""}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        initialRole="student"
      />
    </div>
  );

  return layoutContent;
}
