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
  Radio,
  Clock,
  PhoneCall,
} from "lucide-react";
import BusDepartureAlertModal from "@/components/portal/BusDepartureAlertModal";
import { ContactCrewModal } from "@/components/portal/ContactCrewModal";

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
  const [departureAlertData, setDepartureAlertData] = useState<{
    activeAlert: any;
    studentBooking: any;
    trip: any;
    bus: any;
  } | null>(null);
  const [isContactCrewOpen, setIsContactCrewOpen] = useState(false);

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

  // ── Bus Departure Recall Siren Listener ────────────────────────────
  // Polls active departure recall alerts for this student every 5 seconds.
  // If an alert is triggered while student is off-bus, launches modal & siren.
  useEffect(() => {
    if (!activeStudent?.id) return;

    let isMounted = true;
    const checkDepartureAlert = async () => {
      try {
        const res = await fetch(`/api/boarding/roaming?studentId=${activeStudent.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;

        if (data.activeAlert && data.studentBooking) {
          const isConfirmed = data.studentBooking.roamingStatus === "ONBOARD_CONFIRMED";
          if (!isConfirmed) {
            setDepartureAlertData({
              activeAlert: data.activeAlert,
              studentBooking: data.studentBooking,
              trip: data.trip,
              bus: data.trip
                ? {
                    id: data.trip.busId,
                    busNumber: data.trip.busNumber,
                    registrationNo: data.trip.registrationNo,
                    capacity: data.trip.capacity,
                  }
                : null,
            });
          } else {
            setDepartureAlertData(null);
          }
        } else {
          setDepartureAlertData(null);
        }
      } catch {
        // Silently catch background poll hiccups
      }
    };

    checkDepartureAlert();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        checkDepartureAlert();
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeStudent?.id]);
  
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
      // Seamlessly guide unsubscribed or new students to the Unified Onboarding & Pass Activation gateway
      const hasPaymentParams = typeof window !== "undefined" && window.location.search.includes("razorpay_");
      if (!isSubscriptionActive && !isOnboardingPage && (!isPaymentPage || !hasPaymentParams)) {
        console.warn("[REDIRECT] New or Unsubscribed Commuter -> /portal/onboarding");
        router.replace("/portal/onboarding");
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
  const isRadarPage = pathname === "/portal/radar" || pathname === "/portal/tracker";

  // Dynamic Navigation Links:
  // 1. If Inactive/Unpaid/Expired: ONLY show Pass Activation & Fees (other pages are hidden)
  // 2. If Paid & Active: Show Commute Cockpit, Live Radar, Seat Booking, Digital Pass
  const navLinks = isSubscriptionActive
    ? [
        { href: "/portal", label: t('commutePortal'), icon: Navigation, requiresPayment: false },
        { href: "/portal/radar", label: "Live Radar", icon: Radio, requiresPayment: false },
        { href: "/portal/late", label: t('tripUpdates'), icon: Clock, requiresPayment: false },
        { href: "/portal/settings", label: t('settings'), icon: User, requiresPayment: false },
      ]
    : [
        { href: "/portal/onboarding", label: "Pass Activation", icon: CreditCard, requiresPayment: false },
        { href: "/portal/settings", label: t('settings'), icon: User, requiresPayment: false },
      ];

  const processedNavLinks = navLinks.map(link => ({
    ...link,
    isLocked: false,
  }));

  const layoutContent = (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col overflow-x-hidden ${
      isRadarPage ? "h-[100dvh] pb-0 md:pb-0 overflow-hidden" : "pb-16 md:pb-6"
    }`}>
      {/* Zero-Overflow Unified Header with Vertical Slide-Down Command Panel */}
      <UnifiedAppHeader
        role="student"
        portalTitle="CampusFleet"
        portalSubtitle={activeStudent ? (activeStudent.campus || store.getStudentPrimaryCampus(activeStudent).name) : "Student & Mobility Portal"}
        navLinks={processedNavLinks}
        userPhotoUrl={initialPhotoUrl}
        showSOS={true}
        onOpenSOS={() => setIsSOSOpen(true)}
        customActions={
          <button
            type="button"
            onClick={() => setIsContactCrewOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-all shadow-2xs cursor-pointer"
            title="Contact Assigned Bus Conductor & Transport Helpline"
          >
            <PhoneCall className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Call Crew</span>
          </button>
        }
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
                href: "/portal/onboarding",
                subtitle: "Confirm home address & unlock transit pass",
                icon: CreditCard,
              }
        }
      />

      {/* Main Content Container with Top-to-Down Progressive Flow */}
      <main className={`flex-1 w-full mx-auto ${
        isRadarPage 
          ? "p-0 max-w-none h-[calc(100dvh-4rem)] relative overflow-hidden"
          : isOnboardingPage
          ? "p-0 sm:p-6 lg:p-8 max-w-5xl"
          : "max-w-7xl p-4 sm:p-6 lg:p-8 space-y-6"
      }`}>
        {isAccessBlocked ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 animate-in fade-in">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Launching Pass Onboarding & Activation...
            </p>
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

      {/* Global Campus Bus Departure Alert Siren & Takeover Modal */}
      {departureAlertData?.activeAlert && (
        <BusDepartureAlertModal
          booking={departureAlertData.studentBooking}
          trip={departureAlertData.trip}
          bus={departureAlertData.bus}
          activeAlert={departureAlertData.activeAlert}
          onStatusChange={(newStatus) => {
            if (newStatus === "ONBOARD_CONFIRMED") {
              setDepartureAlertData(null);
            }
          }}
        />
      )}
      {/* Contact Bus Conductor & Transport Helpline Modal */}
      <ContactCrewModal
        isOpen={isContactCrewOpen}
        onClose={() => setIsContactCrewOpen(false)}
        bus={(() => {
          const t = store.getTrips().find(tr => tr.status === "IN_PROGRESS" || tr.routeId === activeStudent?.primaryRouteId);
          return t ? store.getBuses().find(b => b.id === t.busId) : null;
        })()}
        shift={(() => {
          const t = store.getTrips().find(tr => tr.status === "IN_PROGRESS" || tr.routeId === activeStudent?.primaryRouteId);
          return t ? store.getShifts().find(s => s.id === t.shiftId) : null;
        })()}
        route={(() => {
          const t = store.getTrips().find(tr => tr.status === "IN_PROGRESS" || tr.routeId === activeStudent?.primaryRouteId);
          return t ? store.getRoutes().find(r => r.id === t.routeId) : null;
        })()}
        conductor={(() => {
          const t = store.getTrips().find(tr => tr.status === "IN_PROGRESS" || tr.routeId === activeStudent?.primaryRouteId);
          return store.getStaff().find(s => (t && s.id === t.conductorId) || s.role === "conductor") || null;
        })()}
        transportManager={store.getStaff().find(s => s.role === "transport_manager" || s.role === "transport_admin") || null}
        stopName={activeStudent?.primaryStopId ? store.getStops().find(st => st.id === activeStudent.primaryStopId)?.name : undefined}
      />
    </div>
  );

  return layoutContent;
}
