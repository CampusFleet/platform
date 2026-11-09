"use client";

import React, { useEffect, useState, useMemo } from "react";
import { store } from "@/lib/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { TRANSIT_ZONES, TransitZone, Student } from "@/lib/types";
import { createStudentId } from "@/lib/id";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Lock,
  BusFront,
  CalendarCheck,
  Printer,
  Compass,
  QrCode,
  Clock,
  Settings,
  User,
} from "lucide-react";
import {
  isStudentSubscriptionActive,
  getSubscriptionRemainingDays,
} from "@/lib/subscription-utils";

export default function PortalPaymentsView({
  initialUser,
  initialStudents = [],
  initialPayments = [],
  initialZones = [],
}: any) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(initialUser || store.getCurrentUser());
  const [students, setStudents] = useState<Student[]>(() => initialStudents.length > 0 ? initialStudents : store.getStudents());
  const [activeChildId, setActiveChildId] = useState(store.getActiveChildId());

  // Active student calculation
  const activeStudent: Student | null = useMemo(() => {
    if (!currentUser) return null;
    return (
      students.find(
        (s) =>
          (activeChildId && (s.id === activeChildId || s.userId === activeChildId)) ||
          (currentUser.studentId && s.id === currentUser.studentId) ||
          s.userId === currentUser.id ||
          s.email?.toLowerCase() === currentUser.email?.toLowerCase()
      ) || null
    );
  }, [currentUser, students, activeChildId]);

  // Zone & Payment Plan State
  const studentCampusId = activeStudent?.campusId || currentUser?.campusId;
  const [transitZones, setTransitZones] = useState<TransitZone[]>(() => {
    // Prefer server-side zones (already filtered by campus), fall back to store
    if (initialZones.length > 0) return initialZones;
    return store.getTransitZones(studentCampusId);
  });
  const selectedZoneCode = activeStudent?.zoneCode || "ZONE_B";
  const isDataReady = Boolean(activeStudent && transitZones.length > 0);
  const currentZone = useMemo(() => {
    if (studentCampusId) {
      const matchCampus = transitZones.find(
        (z) => z.code === selectedZoneCode && z.campusId === studentCampusId
      );
      if (matchCampus) return matchCampus;
    }
    const matchCode = transitZones.find((z) => z.code === selectedZoneCode);
    if (matchCode) return matchCode;
    return transitZones[0] || TRANSIT_ZONES[1];
  }, [selectedZoneCode, transitZones, studentCampusId]);

  // Payment Amount
  const remainingDue = useMemo(() => {
    const total = currentZone.semesterFee;
    const paid = Number(activeStudent?.totalFeePaid || 0);
    return Math.max(0, total - paid);
  }, [currentZone, activeStudent]);

  const amountToPay = useMemo(() => {
    return remainingDue > 0 ? remainingDue : currentZone.semesterFee;
  }, [remainingDue, currentZone]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [isRazorpayLoading, setIsRazorpayLoading] = useState<boolean>(false);

  // Sync store
  useEffect(() => {
    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
      
      const newStudents = store.getStudents();
      setStudents(prev => newStudents.length > 0 ? newStudents : prev);
      
      setActiveChildId(store.getActiveChildId());
      
      const newZones = store.getTransitZones(studentCampusId);
      setTransitZones(prev => newZones.length > 0 ? newZones : prev);
    });
    return unsub;
  }, [studentCampusId]);

  // Fetch payment history
  useEffect(() => {
    if (!activeStudent?.id) return;
    fetch(`/api/payments/approvals?studentId=${activeStudent.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.submissions) {
          const studentSubs = data.submissions.filter(
            (s: any) => s.student_id === activeStudent.id || s.student_id === activeStudent.userId
          );
          setPaymentHistory(studentSubs);
        }
      })
      .catch(console.error);
  }, [activeStudent?.id, activeStudent?.userId, submitSuccess]);

  // Check for Razorpay Payment Link return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get("razorpay_payment_id");
    const linkId = params.get("razorpay_payment_link_id");
    const refId = params.get("razorpay_payment_link_reference_id");
    const status = params.get("razorpay_payment_link_status");
    const sig = params.get("razorpay_signature");
    const studentIdParam = params.get("student_id");

    if (paymentId && linkId && sig) {
      setSubmitError(null);
      setSubmitSuccess(null);
      setIsRazorpayLoading(true);

      fetch("/api/payments/razorpay/verify-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_payment_id: paymentId,
          razorpay_payment_link_id: linkId,
          razorpay_payment_link_reference_id: refId,
          razorpay_payment_link_status: status,
          razorpay_signature: sig,
        })
      })
      .then(res => res.json())
      .then(data => {
        setIsRazorpayLoading(false);
        if (data.success) {
          setSubmitSuccess("🎉 Payment Successful! Your transit pass is unlocked.");
          window.history.replaceState({}, document.title, window.location.pathname);
          setTimeout(() => window.location.reload(), 2000);
        } else {
          setSubmitError(data.error || "Failed to verify payment.");
        }
      })
      .catch(err => {
        setIsRazorpayLoading(false);
        setSubmitError(err.message || "Network error verifying payment.");
      });
    }
  }, []);

  // Razorpay Hosted Checkout (Payment Links)
  const handleRazorpayCheckout = async () => {
    if (!currentUser) {
      alert("Please sign in to proceed with payment.");
      return;
    }
    
    setIsRazorpayLoading(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    
    try {
      const studentId = activeStudent?.id || currentUser?.studentId || createStudentId();
      
      const linkRes = await fetch("/api/payments/razorpay/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountToPay, studentId }),
      });
      
      const linkData = await linkRes.json();
      if (!linkRes.ok || !linkData.success) {
        throw new Error(linkData.error || "Failed to generate payment link.");
      }
      
      // Redirect seamlessly to Razorpay hosted checkout
      window.location.href = linkData.short_url;
      
    } catch (err: any) {
      setSubmitError(err.message);
      setIsRazorpayLoading(false);
    }
  };

  const isPassApproved = isStudentSubscriptionActive(activeStudent);
  const isSubscriptionExpired = activeStudent?.subscriptionExpiryDate
    ? Date.now() > new Date(activeStudent.subscriptionExpiryDate).getTime()
    : false;
  const remainingDays = getSubscriptionRemainingDays(activeStudent);
  const currentPaid = Number(activeStudent?.totalFeePaid || 0);

  // Diagnostic prints as requested by user
  useEffect(() => {
    console.log("=== PortalPaymentsView Diagnostic ===");
    console.log("Active Student:", activeStudent);
    console.log("isPassApproved:", isPassApproved);
    console.log("currentPaid:", currentPaid);
    console.log("=====================================");
  }, [activeStudent, isPassApproved, currentPaid]);

  // Show loading state until student + zone data is confirmed
  if (!isDataReady) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-gray-500">Loading your transit zone & billing data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in max-w-5xl mx-auto pb-12">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
            <CreditCard className="w-7 h-7 text-blue-600" />
            Transit Pass & Billing
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Secure your semester transit subscription using Razorpay online checkout.
          </p>
        </div>

        <div>
          {isPassApproved ? (
            <span className="px-4 py-2 bg-green-50 border border-green-200 dark:bg-green-900/30 dark:border-green-800 text-green-700 dark:text-green-400 font-bold text-xs flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Active Pass ({remainingDays}d left)
            </span>
          ) : isSubscriptionExpired ? (
            <span className="px-4 py-2 bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400 font-bold text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Pass Expired • Renewal Needed
            </span>
          ) : (
            <span className="px-4 py-2 bg-red-50 border border-red-200 dark:bg-red-900/30 dark:border-red-800 text-red-700 dark:text-red-400 font-bold text-xs flex items-center gap-1.5">
              <Lock className="w-4 h-4" />
              Payment Required For Access
            </span>
          )}
        </div>
      </div>

      {/* Main Status Hero Card (Flat Design) */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col md:flex-row">
        <div className="flex-1 p-6 sm:p-8 space-y-4">
           <div className="text-xs uppercase font-bold tracking-wider text-gray-500 flex items-center gap-2">
             <Compass className="w-4 h-4 text-blue-500" />
             {currentZone.name}
           </div>
           <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
             {isPassApproved ? "Academic Term Transit Pass" : "Semester Transit Access"}
           </div>
           <p className="text-sm text-gray-500 max-w-xl leading-relaxed">
             {currentZone.corridorDescription}. Covers morning, afternoon, and evening shifts to the campus.
           </p>
           <div className="flex flex-wrap items-center gap-4 pt-2 text-sm text-gray-600 dark:text-gray-400">
             <span>Semester Fee: <strong>{formatCurrency(currentZone.semesterFee)}</strong></span>
             <span className="text-gray-300 dark:text-gray-700">•</span>
             <span>Paid Amount: <strong>{formatCurrency(currentPaid)}</strong></span>
           </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-950/50 border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-800 p-6 sm:p-8 flex flex-col justify-center items-center text-center min-w-[240px]">
           <div className="text-[10px] uppercase font-bold tracking-wider text-gray-500">
             Pass Status
           </div>
           <div className={`text-xl font-black mt-1 ${isPassApproved ? "text-green-600" : "text-red-600"}`}>
             {isPassApproved ? "UNLOCKED" : "LOCKED"}
           </div>
           <div className="text-xs text-gray-500 mt-2 font-medium">
             {isPassApproved
               ? (activeStudent?.subscriptionExpiryDate ? `Valid until ${formatDate(activeStudent.subscriptionExpiryDate)}` : "Valid Pass")
               : "Payment required for access"}
           </div>
           {!isPassApproved && (
             <Link
               href="/portal/onboarding"
               className="mt-3 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
             >
               <span>Edit Profile Details</span>
               <ArrowRight className="w-3.5 h-3.5" />
             </Link>
           )}
        </div>
      </div>

      {submitError && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" /> {submitError}
        </div>
      )}

      {submitSuccess && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> {submitSuccess}
        </div>
      )}

      {isPassApproved ? (
        <div className="space-y-6">
          {/* Specifications Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <div className="p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-2">
              <div className="text-xs font-bold uppercase text-gray-500">Validity</div>
              <div className="text-sm font-black text-gray-900 dark:text-white">
                {activeStudent?.subscriptionExpiryDate ? formatDate(activeStudent.subscriptionExpiryDate) : "NONE"}
              </div>
            </div>
            <div className="p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-2">
              <div className="text-xs font-bold uppercase text-gray-500">Corridor</div>
              <div className="text-sm font-black text-gray-900 dark:text-white">
                {currentZone.name}
              </div>
            </div>
            <div className="p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-2">
              <div className="text-xs font-bold uppercase text-gray-500">Commuter</div>
              <div className="text-sm font-black text-gray-900 dark:text-white truncate">
                {activeStudent?.fullName || currentUser?.fullName}
              </div>
            </div>
            <div className="p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-2 flex flex-col justify-center items-center bg-blue-50/50 dark:bg-blue-900/10 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors" onClick={() => window.print()}>
              <Printer className="w-6 h-6 text-blue-600 mb-1" />
              <div className="text-xs font-bold text-blue-700 dark:text-blue-400">Print Certificate</div>
            </div>
          </div>

          <div className="pt-4 space-y-3">
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Operational Portals
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Link href="/portal" className="p-4 border border-gray-200 dark:border-gray-800 hover:border-blue-500 bg-white dark:bg-gray-900 flex items-center justify-between group transition-all">
                <div className="flex items-center gap-3">
                  <BusFront className="w-5 h-5 text-gray-400 group-hover:text-blue-600" />
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">My Commute</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-600" />
              </Link>
              <Link href="/portal/qr" className="p-4 border border-gray-200 dark:border-gray-800 hover:border-blue-500 bg-white dark:bg-gray-900 flex items-center justify-between group transition-all">
                <div className="flex items-center gap-3">
                  <QrCode className="w-5 h-5 text-gray-400 group-hover:text-blue-600" />
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">QR Connect</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-600" />
              </Link>
              <Link href="/portal/settings" className="p-4 border border-gray-200 dark:border-gray-800 hover:border-blue-500 bg-white dark:bg-gray-900 flex items-center justify-between group transition-all">
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-gray-400 group-hover:text-blue-600" />
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">Settings</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-600" />
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 p-6 sm:p-10 border border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center text-center space-y-5">
           <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
             <ShieldCheck className="w-8 h-8 text-blue-600" />
           </div>
           <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Instant Account Activation</h2>
              <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
                Pay securely using Razorpay (UPI, Cards, Netbanking). Your transit pass will be unlocked instantly upon verification.
              </p>
           </div>
           
           <div className="w-full max-w-sm p-4 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex justify-between items-center my-2">
             <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Total Amount Due</span>
             <span className="text-lg font-black text-gray-900 dark:text-white">{formatCurrency(amountToPay)}</span>
           </div>

           <div className="w-full max-w-sm space-y-3">
             <button
               type="button"
               onClick={handleRazorpayCheckout}
               disabled={isRazorpayLoading}
               className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-50"
             >
               {isRazorpayLoading ? (
                 <RefreshCw className="w-5 h-5 animate-spin" />
               ) : (
                 <CreditCard className="w-5 h-5" />
               )}
               {isRazorpayLoading ? "Connecting Gateway..." : "Proceed to Payment"}
             </button>

             <Link
               href="/portal/onboarding"
               className="w-full py-3.5 px-4 bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 font-bold text-sm flex items-center justify-center gap-2 transition-all group"
             >
               <User className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
               <span>Edit Profile Details</span>
             </Link>
           </div>

           <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
             Need to change your transit corridor, pickup stop, or personal details? Update your profile before completing payment.
           </p>
        </div>
      )}

      {/* Payment History */}
      {paymentHistory.length > 0 && (
        <div className="bg-white dark:bg-gray-900 p-6 border border-gray-200 dark:border-gray-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              Transaction History
            </h3>
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1">
              {paymentHistory.length} records
            </span>
          </div>

          <div className="overflow-x-auto border border-gray-100 dark:border-gray-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-950 text-gray-500 font-semibold border-b border-gray-100 dark:border-gray-800">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Transaction ID</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {paymentHistory.map((sub: any) => (
                  <tr key={sub.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                    <td className="p-4 text-gray-600 dark:text-gray-400 text-xs">
                      {new Date(sub.created_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </td>
                    <td className="p-4 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {sub.transaction_id}
                    </td>
                    <td className="p-4 font-bold text-gray-900 dark:text-white">
                      {formatCurrency(sub.amount)}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 font-bold text-[10px] uppercase ${ sub.status === "APPROVED" ? "bg-green-50 text-green-600 border border-green-200" : sub.status === "REJECTED" ? "bg-red-50 text-red-600 border border-red-200" : "bg-yellow-50 text-yellow-600 border border-yellow-200" }`}>
                        {sub.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
