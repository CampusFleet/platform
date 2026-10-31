"use client";

import React, { useEffect, useState } from "react";
import { store } from "@/lib/store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Campus, TransitZone, Stop } from "@/lib/types";
import { getSafePhotoUrl } from "@/lib/image-utils";
import {
  CreditCard,
  Download,
  FileText,
  CheckCircle2,
  Search,
  ShieldCheck,
  Clock,
  Check,
  X,
  Eye,
  Building2,
  Layers,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  IndianRupee,
  CheckSquare,
  Square,
} from "lucide-react";
import { CustomDropdown } from "@/components/common/CustomDropdown";

interface StaffBillingViewProps {
  initialSubmissions: any[];
  initialPayments: any[];
  user: any;
}

export function StaffBillingView({
  initialSubmissions,
  initialPayments,
  user,
}: StaffBillingViewProps) {
  const [payments, setPayments] = useState(initialPayments?.length ? initialPayments : store.getPayments());
  const [plans, setPlans] = useState(store.getPlans());
  const [activeTab, setActiveTab] = useState<"APPROVALS" | "LEDGER" | "ZONES">("APPROVALS");

  // Submissions State
  const [submissions, setSubmissions] = useState<any[]>(initialSubmissions || []);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Campus & Transit Zones State
  const [campuses, setCampuses] = useState<Campus[]>(() => store.getCampuses());
  const [stops, setStops] = useState<Stop[]>(() => store.getStops());
  const [transitZones, setTransitZones] = useState<TransitZone[]>(() => store.getTransitZones(undefined, true));
  const [selectedCampusId, setSelectedCampusId] = useState<string>(() => store.getPrimaryCampus()?.id || store.getCampuses()[0]?.id || "");

  // Zone Modal & CRUD State
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<TransitZone | null>(null);
  const [zoneForm, setZoneForm] = useState({
    code: "ZONE_A",
    name: "",
    semesterFee: 12000,
    installmentsAllowed: 3,
    corridorDescription: "",
    isActive: true,
    assignedStopIds: [] as string[],
  });
  const [stopFilterSearch, setStopFilterSearch] = useState("");
  const [isSavingZone, setIsSavingZone] = useState(false);
  const [deleteConfirmZone, setDeleteConfirmZone] = useState<TransitZone | null>(null);

  const fetchSubmissions = () => {
    setIsLoadingSubmissions(true);
    fetch("/api/payments/approvals")
      .then((res) => res.json())
      .then((data) => {
        setIsLoadingSubmissions(false);
        if (data.success && data.submissions) {
          setSubmissions(data.submissions);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch payment approvals:", err);
        setIsLoadingSubmissions(false);
      });
  };

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setPayments(store.getPayments());
      setPlans(store.getPlans());
      setCampuses(store.getCampuses());
      setStops(store.getStops());
      setTransitZones(store.getTransitZones(undefined, true));
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedCampusId && campuses.length > 0) {
      setSelectedCampusId(store.getPrimaryCampus()?.id || campuses[0]?.id || "");
    }
  }, [campuses, selectedCampusId]);

  const pendingCount = submissions.filter((s) => s.status === "PENDING_APPROVAL").length;
  const approvedCount = submissions.filter((s) => s.status === "APPROVED").length;
  
  // Calculate revenue from both old payments table and new payment_submissions table (Razorpay)
  const legacyRevenue = payments.reduce((acc: number, p: any) => acc + (p.status === "PAID" ? p.amount : 0), 0);
  const submissionsRevenue = submissions.reduce((acc: number, s: any) => acc + (s.status === "APPROVED" ? Number(s.amount) || 0 : 0), 0);
  const totalRevenue = legacyRevenue + submissionsRevenue;

  const handleApprove = async (submissionId: string) => {
    setActionLoadingId(submissionId);
    const reviewerName = user?.fullName || store.getCurrentUser()?.fullName || "Transport Admin";
    try {
      const res = await fetch("/api/payments/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          action: "APPROVE",
          reviewedBy: reviewerName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage("✓ Payment Approved! Student transit pass unlocked and active.");
        setTimeout(() => setToastMessage(null), 3500);
        fetchSubmissions();
        store.syncFromSupabase();
      } else {
        alert(data.error || "Approval failed");
      }
    } catch (err: any) {
      alert("Failed to approve payment: " + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModalId) return;
    setActionLoadingId(rejectModalId);
    const reviewerName = user?.fullName || store.getCurrentUser()?.fullName || "Transport Admin";
    try {
      const res = await fetch("/api/payments/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: rejectModalId,
          action: "REJECT",
          rejectionReason: rejectionReason.trim() || "Transaction ID / Screenshot could not be verified.",
          reviewedBy: reviewerName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage("Payment submission rejected.");
        setTimeout(() => setToastMessage(null), 3500);
        setRejectModalId(null);
        setRejectionReason("");
        fetchSubmissions();
        store.syncFromSupabase();
      } else {
        alert(data.error || "Rejection failed");
      }
    } catch (err: any) {
      alert("Failed to reject payment: " + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Active Campus Context for Zones
  const currentCampus = campuses.find((c) => c.id === selectedCampusId) || campuses[0];
  const campusZones = transitZones.filter((z) => z.campusId === selectedCampusId);
  const campusStops = stops.filter((s) => s.campusId === selectedCampusId);

  // Open Create Modal
  const handleOpenCreateZone = () => {
    setEditingZone(null);
    const nextCodeLetter = String.fromCharCode(65 + (campusZones.length % 26));
    setZoneForm({
      code: `ZONE_${nextCodeLetter}`,
      name: `Zone ${nextCodeLetter}: Corridor`,
      semesterFee: 12000,
      installmentsAllowed: 3,
      corridorDescription: "",
      isActive: true,
      assignedStopIds: [],
    });
    setStopFilterSearch("");
    setZoneModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditZone = (zone: TransitZone) => {
    setEditingZone(zone);
    const currentAssigned = campusStops
      .filter((s) => s.zoneCode === zone.code)
      .map((s) => s.id);
    setZoneForm({
      code: zone.code,
      name: zone.name,
      semesterFee: zone.semesterFee,
      installmentsAllowed: zone.installmentsAllowed,
      corridorDescription: zone.corridorDescription,
      isActive: zone.isActive !== false,
      assignedStopIds: currentAssigned,
    });
    setStopFilterSearch("");
    setZoneModalOpen(true);
  };

  // Toggle stop inclusion in zone
  const handleToggleStop = (stopId: string) => {
    setZoneForm((prev) => {
      const isChecked = prev.assignedStopIds.includes(stopId);
      const updated = isChecked
        ? prev.assignedStopIds.filter((id) => id !== stopId)
        : [...prev.assignedStopIds, stopId];

      const autoDescription = campusStops
        .filter((s) => updated.includes(s.id))
        .map((s) => s.name)
        .join(", ");

      return {
        ...prev,
        assignedStopIds: updated,
        corridorDescription: autoDescription || prev.corridorDescription,
      };
    });
  };

  // Select all or deselect all campus stops
  const handleSelectAllStops = (select: boolean) => {
    const updated = select ? campusStops.map((s) => s.id) : [];
    const autoDescription = select ? campusStops.map((s) => s.name).join(", ") : "";
    setZoneForm((prev) => ({
      ...prev,
      assignedStopIds: updated,
      corridorDescription: autoDescription,
    }));
  };

  // Save Zone (Create or Update)
  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampusId) {
      alert("Please select a campus first.");
      return;
    }
    if (!zoneForm.code.trim() || !zoneForm.name.trim()) {
      alert("Zone code and zone name are required.");
      return;
    }
    setIsSavingZone(true);
    try {
      if (editingZone) {
        await store.updateTransitZone(editingZone.id || editingZone.code, {
          code: zoneForm.code.trim().toUpperCase(),
          name: zoneForm.name.trim(),
          semesterFee: Number(zoneForm.semesterFee) || 0,
          installmentsAllowed: Number(zoneForm.installmentsAllowed) || 3,
          corridorDescription: zoneForm.corridorDescription.trim(),
          isActive: zoneForm.isActive,
          campusId: selectedCampusId,
          assignedStopIds: zoneForm.assignedStopIds,
        });
        setToastMessage(`✓ Zone ${zoneForm.code} updated and assigned ${zoneForm.assignedStopIds.length} stops.`);
      } else {
        await store.createTransitZone({
          code: zoneForm.code.trim().toUpperCase(),
          name: zoneForm.name.trim(),
          semesterFee: Number(zoneForm.semesterFee) || 0,
          installmentsAllowed: Number(zoneForm.installmentsAllowed) || 3,
          corridorDescription: zoneForm.corridorDescription.trim(),
          isActive: zoneForm.isActive,
          campusId: selectedCampusId,
          assignedStopIds: zoneForm.assignedStopIds,
        });
        setToastMessage(`✓ Zone ${zoneForm.code} created for ${currentCampus?.name || "Campus"} with pass fee ₹${Number(zoneForm.semesterFee).toLocaleString("en-IN")}.`);
      }
      setTimeout(() => setToastMessage(null), 3500);
      setZoneModalOpen(false);
      setEditingZone(null);
      await store.syncFromSupabase();
    } catch (err: any) {
      alert("Failed to save zone: " + err.message);
    } finally {
      setIsSavingZone(false);
    }
  };

  // Delete Zone
  const handleDeleteZone = async () => {
    if (!deleteConfirmZone) return;
    try {
      await store.deleteTransitZone(deleteConfirmZone.id || deleteConfirmZone.code);
      setToastMessage(`✓ Zone ${deleteConfirmZone.code} deleted.`);
      setTimeout(() => setToastMessage(null), 3500);
      setDeleteConfirmZone(null);
      await store.syncFromSupabase();
    } catch (err: any) {
      alert("Failed to delete zone: " + err.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-4 rounded-2xl bg-green-600 text-white font-bold text-xs shadow-xl flex items-center justify-between animate-in slide-in-from-top">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
            <CreditCard className="w-7 h-7 text-blue-600" />
            Fee Management & Staff Payment Approvals
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Configure campus transit zones & pricing, review receipts, and manage student passes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-gray-100 dark:bg-gray-800 p-1.5 rounded-2xl border border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setActiveTab("APPROVALS")}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
              activeTab === "APPROVALS"
                ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Staff Approvals ({pendingCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("LEDGER")}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
              activeTab === "LEDGER"
                ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Financial Ledger</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ZONES")}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all ${
              activeTab === "ZONES"
                ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
            }`}
          >
            <Layers className="w-4 h-4 text-blue-500" />
            <span>Campus Zones & Fares ({transitZones.length})</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-yellow-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Pending Verification
          </div>
          <div className="text-3xl font-black text-yellow-600 font-mono">
            {pendingCount} Receipts
          </div>
          <div className="text-xs text-gray-500">
            Awaiting finance staff approval to unlock passes
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-green-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved Submissions
          </div>
          <div className="text-3xl font-black text-green-600 font-mono">
            {approvedCount} Passes
          </div>
          <div className="text-xs text-gray-500">
            Verified with unlocked student transport access
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-500">
            Total Reconciled Revenue
          </div>
          <div className="text-3xl font-black text-gray-900 dark:text-white font-mono">
            {formatCurrency(totalRevenue)}
          </div>
          <div className="text-xs text-gray-500">
            Across all approved semester subscription fees
          </div>
        </div>
      </div>

      {/* TAB 1: Staff Approvals (Vercel Blob Receipts) */}
      {activeTab === "APPROVALS" && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
                <span>Student Payment Verification Queue</span>
                {pendingCount > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 font-extrabold">
                    {pendingCount} Action Required
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Inspect Vercel Blob screenshots, verify UTR, and approve to unlock student portal access.
              </p>
            </div>

            <button
              onClick={fetchSubmissions}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-xs font-bold rounded-xl text-gray-700 dark:text-gray-300"
            >
              Refresh Queue
            </button>
          </div>

          {isLoadingSubmissions ? (
            <div className="py-12 text-center text-xs text-gray-400 font-bold">
              Loading payment submission records...
            </div>
          ) : submissions.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-gray-500">No payment submissions found in database.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 dark:bg-gray-800/60 uppercase font-bold text-gray-400 border-b border-gray-200 dark:border-gray-800">
                  <tr>
                    <th className="p-3">Commuter</th>
                    <th className="p-3">Zone & Route</th>
                    <th className="p-3">Amount & Method</th>
                    <th className="p-3">Bank UTR / Ref</th>
                    <th className="p-3">Receipt Screenshot</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {submissions.map((sub: any) => {
                    const isPending = sub.status === "PENDING_APPROVAL";
                    const isActioning = actionLoadingId === sub.id;

                    return (
                      <tr key={sub.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                        <td className="p-3">
                          <div className="font-bold text-gray-900 dark:text-white">
                            {sub.student_name || sub.students?.full_name || "Student"}
                          </div>
                                                  </td>

                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-black text-[10px]">
                            {sub.zone_code || "ZONE_B"}
                          </span>
                          <div className="text-[11px] text-gray-500 truncate max-w-[150px] mt-0.5">
                            {sub.stop_name || sub.students?.primary_stop_name || "Designated Stop"}
                          </div>
                        </td>

                        <td className="p-3">
                          <div className="font-black text-sm text-gray-900 dark:text-white font-mono">
                            {formatCurrency(sub.amount || 12000)}
                          </div>
                          <div className="text-[11px] text-gray-400 uppercase font-bold">
                            {sub.payment_method || "UPI_QR"}
                          </div>
                        </td>

                        <td className="p-3">
                          <div className="font-mono text-xs font-bold text-blue-600 bg-blue-50/80 dark:bg-blue-950/40 px-2 py-1 rounded-lg inline-block border border-blue-100 dark:border-blue-900">
                            {sub.transaction_ref || sub.transaction_id || "MISSING-UTR"}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            {formatDate(sub.created_at)}
                          </div>
                        </td>

                        <td className="p-3">
                          {sub.receipt_url ? (
                            <button
                              type="button"
                              onClick={() => setPreviewImageUrl(sub.receipt_url)}
                              className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 rounded-xl border border-blue-200 dark:border-blue-800"
                            >
                              <Eye className="w-3.5 h-3.5" /> View Receipt
                            </button>
                          ) : (
                            <span className="text-gray-400 italic text-[11px]">No Screenshot</span>
                          )}
                        </td>

                        <td className="p-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              sub.status === "APPROVED"
                                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                                : sub.status === "REJECTED"
                                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300 animate-pulse"
                            }`}
                          >
                            {sub.status}
                          </span>
                        </td>

                        <td className="p-3 text-right">
                          {isPending ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={isActioning}
                                onClick={() => handleApprove(sub.id)}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1 shadow-sm transition-all disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" /> Approve
                              </button>
                              <button
                                type="button"
                                disabled={isActioning}
                                onClick={() => setRejectModalId(sub.id)}
                                className="px-3 py-1.5 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-600 dark:text-red-400 font-extrabold text-xs rounded-xl flex items-center gap-1 transition-all border border-red-200 dark:border-red-900 disabled:opacity-50"
                              >
                                <X className="w-3.5 h-3.5" /> Reject
                              </button>
                            </div>
                          ) : (
                            <div className="text-[11px] text-gray-400">
                              Reviewed by {sub.reviewed_by || "Staff"}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: General Ledger Table */}
      {activeTab === "LEDGER" && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-gray-900 dark:text-white">
              Institutional Fee Accounting Ledger
            </h3>
            <button
              onClick={() => window.print()}
              className="px-3.5 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-xs font-bold rounded-xl flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Print Ledger
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/60 uppercase font-bold text-gray-400 border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="p-3">Receipt No.</th>
                  <th className="p-3">Student Passenger</th>
                  <th className="p-3">Plan Details</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Gateway Ref</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {[
                  ...payments.map((p: any) => ({ ...p, _source: "legacy" })),
                  ...submissions
                    .filter((s: any) => s.status === "APPROVED")
                    .map((s: any) => ({
                      id: s.id,
                      receiptNumber: s.receipt_number,
                      studentName: s.student_name || s.students?.full_name,
                      planName: `Zone: ${s.zone_code}`,
                      amount: s.amount,
                      transactionRef: s.transaction_id || s.transaction_ref,
                      createdAt: s.created_at,
                      status: "PAID", // Map APPROVED to PAID for consistency in UI
                      _source: s.auto_detected ? "razorpay" : "manual"
                    }))
                ].sort((a, b) => new Date(b.createdAt || b.created_at).getTime() - new Date(a.createdAt || a.created_at).getTime()).map((pay: any) => (
                  <tr key={pay.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="p-3 font-mono font-bold text-blue-600">{pay.receiptNumber || pay.receipt_number}</td>
                    <td className="p-3 font-medium">
                      <div className="flex items-center gap-1.5">
                        <span>{pay.studentName || pay.student_name}</span>
                        {pay._source === "razorpay" && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-bold border border-purple-200">
                            Razorpay
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-gray-500">{pay.planName || pay.plan_name}</td>
                    <td className="p-3 font-black font-mono">{formatCurrency(pay.amount)}</td>
                    <td className="p-3 font-mono text-gray-400 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span>{(pay.transactionRef || pay.transaction_ref)?.startsWith("pay_") ? "RZP Txn: " : "Ref: "}{pay.transactionRef || pay.transaction_ref || "-"}</span>
                        {(pay.receiptNumber || pay.receipt_number)?.startsWith("order_") && (
                          <span className="text-[10px] text-gray-500">Order: {pay.receiptNumber || pay.receipt_number}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-gray-500">{formatDate(pay.createdAt || pay.created_at)}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-extrabold text-[10px] uppercase">
                        {pay.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Campus Transit Zones & Fare Pricing (Per-Campus Zone Management & Stop Assignment) */}
      {activeTab === "ZONES" && (
        <div className="space-y-6 animate-in fade-in">
          {/* Campus Selector Bar */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5 mb-1">
                  <Building2 className="w-4 h-4" /> Campus Operating Scope
                </div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  Select Campus to Manage Zones & Pricing
                </h3>
                <p className="text-xs text-gray-500">
                  Every campus encapsulates its own dedicated pickup stops, corridor zones, and student semester fees.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenCreateZone}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-2xl flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" /> Create New Zone
              </button>
            </div>

            {/* Campus Pills */}
            <div className="flex flex-wrap gap-2.5 pt-2 border-t border-gray-100 dark:border-gray-800">
              {campuses.map((c) => {
                const isSelected = c.id === selectedCampusId;
                const zoneCount = transitZones.filter((z) => z.campusId === c.id).length;
                const stopCount = stops.filter((s) => s.campusId === c.id).length;

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCampusId(c.id)}
                    className={`px-4 py-3 rounded-2xl text-left border transition-all flex items-center gap-3 ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-900 dark:text-blue-200 shadow-md ring-2 ring-blue-500/20"
                        : "bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs ${
                        isSelected
                          ? "bg-blue-600 text-white shadow-sm"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {c.code?.slice(0, 3) || "CMP"}
                    </div>
                    <div>
                      <div className="text-xs font-black flex items-center gap-1.5">
                        <span>{c.name}</span>
                        {c.isPrimary && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-extrabold uppercase">
                            Primary
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-2 font-medium">
                        <span>{c.city || "Uttarakhand"}</span>
                        <span>•</span>
                        <span>{zoneCount} Zones</span>
                        <span>•</span>
                        <span>{stopCount} Stops</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Zones Grid for Active Campus */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <span>Zones Configured for {currentCampus?.name || "Selected Campus"}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 font-bold text-gray-600 dark:text-gray-400">
                    {campusZones.length} Zones Active
                  </span>
                </h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  Students registered under this campus are charged according to these zone prices during semester onboarding & pass generation.
                </p>
              </div>
            </div>

            {campusZones.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-300 dark:border-gray-800 p-12 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                  <Layers className="w-7 h-7" />
                </div>
                <h5 className="font-black text-base text-gray-900 dark:text-white">
                  No Transit Zones for {currentCampus?.name || "this Campus"}
                </h5>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  Set up fare corridors (e.g. Zone A, Zone B) and assign stops for this campus so commuter students can purchase bus passes.
                </p>
                <button
                  type="button"
                  onClick={handleOpenCreateZone}
                  className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow hover:bg-blue-700"
                >
                  Create First Zone
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {campusZones.map((zone) => {
                  const assignedStops = campusStops.filter((s) => s.zoneCode === zone.code);

                  return (
                    <div
                      key={zone.id || zone.code}
                      className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3">
                        {/* Zone Card Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 rounded-xl bg-blue-600 text-white font-black text-xs tracking-wider shadow-sm">
                              {zone.code}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                zone.isActive !== false
                                  ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                              }`}
                            >
                              {zone.isActive !== false ? "Active" : "Inactive"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditZone(zone)}
                              className="p-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-gray-600 dark:text-gray-300 hover:text-blue-600 transition-all"
                              title="Edit Zone & Assign Stops"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmZone(zone)}
                              className="p-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-950 text-gray-600 dark:text-gray-300 hover:text-red-600 transition-all"
                              title="Delete Zone"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Zone Name */}
                        <div>
                          <h5 className="font-extrabold text-sm text-gray-900 dark:text-white">
                            {zone.name}
                          </h5>
                          <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            <span>{currentCampus?.name || "Campus"}</span>
                          </div>
                        </div>

                        {/* Pricing / Fare Box */}
                        <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 space-y-1">
                          <div className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <IndianRupee className="w-3 h-3" /> Student Pass Pricing
                          </div>
                          <div className="text-2xl font-black text-gray-900 dark:text-white font-mono">
                            ₹{Number(zone.semesterFee).toLocaleString("en-IN")}
                            <span className="text-xs font-bold text-gray-500 font-sans ml-1">/ semester</span>
                          </div>
                          <div className="text-[10px] text-gray-500 font-medium">
                            Permits up to <span className="font-bold text-gray-700 dark:text-gray-300">{zone.installmentsAllowed || 3} installments</span>
                          </div>
                        </div>

                        {/* Assigned Stops Details */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-blue-500" />
                              Assigned Stops ({assignedStops.length})
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenEditZone(zone)}
                              className="text-[10px] font-bold text-blue-600 hover:underline"
                            >
                              Manage Stops
                            </button>
                          </div>

                          {assignedStops.length === 0 ? (
                            <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-dashed border-gray-200 dark:border-gray-800 text-[11px] text-gray-400 italic text-center">
                              No stops bundled into this zone yet.
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1">
                              {assignedStops.map((st) => (
                                <span
                                  key={st.id}
                                  className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-[10px] font-bold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                                >
                                  {st.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Corridor Description */}
                        {zone.corridorDescription && (
                          <div className="text-[10px] text-gray-400 line-clamp-2">
                            <span className="font-bold">Corridor:</span> {zone.corridorDescription}
                          </div>
                        )}
                      </div>

                      {/* Footer Info */}
                      <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[10px] text-gray-400">
                        <span>ID: {zone.id?.slice(0, 16) || zone.code}</span>
                        <span>{zone.updatedAt ? `Updated ${formatDate(zone.updatedAt)}` : "Standard"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox Modal for Receipt Preview */}
      {previewImageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative max-w-2xl w-full bg-white dark:bg-gray-900 rounded-3xl p-5 shadow-2xl border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <span className="font-bold text-sm text-gray-800 dark:text-white flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" /> Vercel Blob Receipt Screenshot
              </span>
              <button
                type="button"
                onClick={() => setPreviewImageUrl(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-600 dark:text-gray-300 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img src={getSafePhotoUrl(previewImageUrl)} alt="Full Receipt" className="rounded-xl object-contain max-h-[70vh]" />
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-black text-base text-red-600">Reject Payment Submission</span>
              <button
                type="button"
                onClick={() => setRejectModalId(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Please specify the reason for rejecting this receipt (e.g. invalid UTR, blurred screenshot, amount mismatch).
            </p>

            <textarea
              rows={3}
              placeholder="Enter reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full text-xs p-3 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalId(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 rounded-xl hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleReject}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT TRANSIT ZONE & ASSIGN STOPS MODAL */}
      {zoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative max-w-2xl w-full bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
              <div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-600" />
                  {editingZone ? `Edit Transit Zone (${zoneForm.code})` : "Configure New Transit Zone"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Assigned to <span className="font-bold text-blue-600">{currentCampus?.name || "Campus"}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setZoneModalOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveZone} className="space-y-4">
              {/* Form Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Zone Identifier Code *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ZONE_A, ZONE_B"
                    value={zoneForm.code}
                    onChange={(e) => setZoneForm({ ...zoneForm, code: e.target.value.toUpperCase() })}
                    className="w-full text-xs p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-bold uppercase tracking-wider outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-gray-400">Used as system code on passes</span>
                </div>

                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Semester Fee / Price (₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-gray-400 font-bold text-xs">₹</span>
                    <input
                      type="number"
                      required
                      min={0}
                      step={500}
                      value={zoneForm.semesterFee}
                      onChange={(e) => setZoneForm({ ...zoneForm, semesterFee: Number(e.target.value) })}
                      className="w-full text-xs pl-7 pr-3 py-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-black font-mono text-sm outline-none focus:border-blue-500 text-blue-600 dark:text-blue-400"
                    />
                  </div>
                  <span className="text-[10px] text-gray-400">Charged to student commuters</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Zone Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Zone A: Clock Tower & Rajpur Road"
                    value={zoneForm.name}
                    onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                    className="w-full text-xs p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-medium outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                    Allowed Installments
                  </label>
                  <CustomDropdown
                    value={zoneForm.installmentsAllowed}
                    onChange={(val) => setZoneForm({ ...zoneForm, installmentsAllowed: Number(val) })}
                    options={[
                      { value: 1, label: "1 Installment (Full Payment Upfront)" },
                      { value: 2, label: "2 Installments (50% Split)" },
                      { value: 3, label: "3 Installments (Standard Split)" },
                      { value: 4, label: "4 Installments (Flexible Monthly)" },
                    ]}
                  />
                </div>
              </div>

              {/* Stop Assignment Section (Encapsulated for this campus) */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-black text-gray-800 dark:text-white flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      Take Stops into this Zone ({zoneForm.assignedStopIds.length} Selected)
                    </label>
                    <p className="text-[10px] text-gray-500">
                      Select already created stops from <span className="font-bold">{currentCampus?.name}</span> to bundle into this pricing zone.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectAllStops(true)}
                      className="text-[10px] font-bold text-blue-600 hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-gray-300">•</span>
                    <button
                      type="button"
                      onClick={() => handleSelectAllStops(false)}
                      className="text-[10px] font-bold text-gray-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Search in Campus Stops */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder={`Search ${campusStops.length} stops for ${currentCampus?.code || "campus"}...`}
                    value={stopFilterSearch}
                    onChange={(e) => setStopFilterSearch(e.target.value)}
                    className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 outline-none focus:border-blue-500"
                  />
                </div>

                {/* Scrollable Campus Stops List */}
                <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-2xl p-2 divide-y divide-gray-100 dark:divide-gray-800/60 bg-gray-50/50 dark:bg-gray-950/40">
                  {campusStops.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-400 font-medium">
                      No stops currently registered for {currentCampus?.name}. Create stops first in Route Builder.
                    </div>
                  ) : (
                    campusStops
                      .filter((s) => {
                        if (!stopFilterSearch.trim()) return true;
                        const q = stopFilterSearch.toLowerCase();
                        return (
                          s.name.toLowerCase().includes(q) ||
                          s.code.toLowerCase().includes(q) ||
                          (s.landmark && s.landmark.toLowerCase().includes(q))
                        );
                      })
                      .map((s) => {
                        const isChecked = zoneForm.assignedStopIds.includes(s.id);
                        const isOtherZone = s.zoneCode && s.zoneCode !== zoneForm.code;

                        return (
                          <div
                            key={s.id}
                            onClick={() => handleToggleStop(s.id)}
                            className={`p-2.5 rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                              isChecked
                                ? "bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200"
                                : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              )}
                              <div>
                                <div className="text-xs font-bold flex items-center gap-1.5">
                                  <span>{s.name}</span>
                                  <span className="text-[10px] font-mono text-gray-400">({s.code})</span>
                                </div>
                                {s.landmark && (
                                  <div className="text-[10px] text-gray-400 truncate max-w-sm">
                                    {s.landmark}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="text-[10px]">
                              {isChecked ? (
                                <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white font-black uppercase text-[9px]">
                                  Selected
                                </span>
                              ) : isOtherZone ? (
                                <span className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-500 text-[9px]">
                                  In {s.zoneCode}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic text-[9px]">Unassigned</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              {/* Corridor Description */}
              <div>
                <label className="text-xs font-black text-gray-700 dark:text-gray-300 block mb-1">
                  Corridor Description / Covered Stops Summary
                </label>
                <textarea
                  rows={2}
                  value={zoneForm.corridorDescription}
                  onChange={(e) => setZoneForm({ ...zoneForm, corridorDescription: e.target.value })}
                  placeholder="e.g. Clock Tower, Dilaram Chowk, Jakhan, Rajpur Road"
                  className="w-full text-xs p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 outline-none focus:border-blue-500"
                />
                <span className="text-[10px] text-gray-400">
                  Automatically populated from selected stops, or edit manually.
                </span>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="zoneActiveToggle"
                  checked={zoneForm.isActive}
                  onChange={(e) => setZoneForm({ ...zoneForm, isActive: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <label htmlFor="zoneActiveToggle" className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  Zone is active and visible to commuters for pass payment
                </label>
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setZoneModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-400 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSavingZone}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                  {isSavingZone ? "Saving Zone..." : editingZone ? "Update Zone & Pricing" : "Create Zone & Pricing"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-gray-800 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-black text-base text-red-600 flex items-center gap-2">
                <Trash2 className="w-5 h-5" /> Delete Transit Zone
              </span>
              <button
                type="button"
                onClick={() => setDeleteConfirmZone(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-300">
              Are you sure you want to delete <span className="font-bold text-gray-900 dark:text-white">{deleteConfirmZone.name} ({deleteConfirmZone.code})</span> for <span className="font-bold">{currentCampus?.name}</span>?
            </p>

            <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-900 text-[11px] text-yellow-700 dark:text-yellow-300">
              Stops currently assigned to this zone will be unassigned. Student passes already issued remain unaffected.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmZone(null)}
                className="px-4 py-2 text-xs font-bold text-gray-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDeleteZone}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
