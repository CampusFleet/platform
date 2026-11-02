"use client";

import React, { useState, useEffect, useMemo } from "react";
import { store } from "@/lib/store";
import * as XLSX from "xlsx";
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  X,
  CreditCard,
  Eye,
  Check,
  Download,
  AlertCircle,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  User,
  ExternalLink,
  Copy,
  CheckCheck,
  Sparkles,
  MapPin,
  Bus,
  Activity,
  Info,
  Shield,
  FileText,
  Lock,
} from "lucide-react";
import type { Route, Bus as BusType, Student } from "@/lib/types";
import { getSafePhotoUrl } from "@/lib/image-utils";
import { CustomDropdown } from "@/components/common/CustomDropdown";

interface StaffFeeApprovalsViewProps {
  initialUser?: any;
  initialRoutes?: Route[];
  initialBuses?: BusType[];
  initialStudents?: Student[];
}

export default function StaffFeeApprovalsView({
  initialUser,
  initialRoutes = [],
  initialBuses = [],
  initialStudents = [],
}: StaffFeeApprovalsViewProps) {
  const [currentUser] = useState(initialUser || store.getCurrentUser());
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [reverifyingId, setReverifyingId] = useState<string | null>(null);

  // Modals & Drawers
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [inspectSubmission, setInspectSubmission] = useState<any | null>(null);
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectPreset, setRejectPreset] = useState("Payment ID not found on Razorpay live gateway");
  const [rejectCustomNotes, setRejectCustomNotes] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type?: "success" | "info" | "error" } | null>(null);

  // Filters & State
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING_APPROVAL" | "RAZORPAY_AUTO" | "APPROVED" | "REJECTED">("ALL");
  const [routeFilter, setRouteFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"STUDENTS" | "STREAM">("STUDENTS");
  const [expandedStudentIds, setExpandedStudentIds] = useState<Set<string>>(new Set());

  const showToast = (text: string, type: "success" | "info" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3800);
  };

  const copyToClipboard = (text: string, idKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(idKey);
    showToast(`Copied ${text} to clipboard!`, "info");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fetchSubmissions = async () => {
    setIsLoadingSubmissions(true);
    try {
      const res = await fetch("/api/payments/approvals");
      const data = await res.json();
      if (data.success && Array.isArray(data.submissions)) {
        setSubmissions(data.submissions);
      }
    } catch (err) {
      console.error("Failed to fetch payment submissions:", err);
      showToast("Error loading payment submissions", "error");
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const toggleStudentExpansion = (studentId: string) => {
    const newSet = new Set(expandedStudentIds);
    if (newSet.has(studentId)) {
      newSet.delete(studentId);
    } else {
      newSet.add(studentId);
    }
    setExpandedStudentIds(newSet);
  };

  const expandAll = () => {
    const allIds = new Set(filteredSubmissions.map((s) => s.student_id));
    setExpandedStudentIds(allIds);
  };

  const collapseAll = () => {
    setExpandedStudentIds(new Set());
  };

  // Re-verify with Razorpay S2S API
  const handleReverifyRazorpay = async (sub: any) => {
    setReverifyingId(sub.id);
    try {
      const res = await fetch("/api/payments/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: sub.id,
          action: "REVERIFY_RAZORPAY",
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ Razorpay Verified: ${data.message}`, "success");
        fetchSubmissions();
        if (inspectSubmission?.id === sub.id) {
          setInspectSubmission((prev: any) => ({ ...prev, status: "APPROVED", auto_detected: true }));
        }
      } else {
        showToast(data.error || "Razorpay re-verification failed", "error");
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, "error");
    } finally {
      setReverifyingId(null);
    }
  };

  // Manual Staff Approve Payment
  const handleApprovePayment = async (sub: any) => {
    setActionLoadingId(sub.id);
    try {
      const res = await fetch("/api/payments/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: sub.id,
          action: "APPROVE",
          reviewedBy: currentUser?.fullName || currentUser?.email || "Transport Staff",
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ Cleared payment of ₹${Number(sub.amount).toLocaleString("en-IN")} for ${sub.full_name || sub.student_name || "Student"}!`, "success");
        fetchSubmissions();
        store.syncFromSupabase();
        if (inspectSubmission?.id === sub.id) {
          setInspectSubmission(null);
        }
      } else {
        showToast(data.error || "Approval failed", "error");
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Reject Payment
  const handleRejectPayment = async () => {
    if (!rejectModalId) return;
    setActionLoadingId(rejectModalId);
    try {
      const finalReason = rejectCustomNotes.trim()
        ? `${rejectPreset} — Note: ${rejectCustomNotes.trim()}`
        : rejectPreset;

      const res = await fetch("/api/payments/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: rejectModalId,
          action: "REJECT",
          rejectionReason: finalReason,
          reviewedBy: currentUser?.fullName || currentUser?.email || "Transport Staff",
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Payment submission rejected with audit reason.", "info");
        setRejectModalId(null);
        setRejectCustomNotes("");
        fetchSubmissions();
        if (inspectSubmission?.id === rejectModalId) {
          setInspectSubmission(null);
        }
      } else {
        showToast(data.error || "Rejection failed", "error");
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, "error");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Excel Audit Export
  const handleExportToExcel = () => {
    if (filteredSubmissions.length === 0) {
      showToast("No records match current filter for export.", "info");
      return;
    }

    const exportData = filteredSubmissions.map((sub, idx) => ({
      "S.No": idx + 1,
      "Student Roll No": sub.student_id_code || "N/A",
      "Student Name": sub.full_name || sub.student_name || "N/A",
      "Department": sub.department || "General",
      "Semester": sub.semester || "N/A",
      "Assigned Route": sub.primary_route_name || "N/A",
      "Pickup Stop": sub.primary_stop_name || "N/A",
      "Payment Policy": "Full Term Transport Fee",
      "Amount Paid (INR)": Number(sub.amount) || 0,
      "Payment Mode / Gateway": sub.gateway_source === "RAZORPAY_AUTO" ? "Razorpay Hosted S2S" : (sub.transaction_id?.startsWith("pay_") ? "Razorpay Gateway" : "Manual Bank UTR"),
      "Razorpay Txn ID": sub.transaction_id || "NOT_PROVIDED",
      "Razorpay Order ID": sub.receipt_number || "N/A",
      "Reconciliation Status": sub.auto_detected ? "AUTO-CLEARED" : sub.status,
      "Pass Active": sub.has_active_subscription ? "YES" : "NO",
      "Total Student Fee Due": Number(sub.total_fee_due) || 0,
      "Total Student Fee Paid": Number(sub.total_fee_paid) || 0,
      "Audited By": sub.reviewed_by || (sub.auto_detected ? "Razorpay Webhook Engine" : "Pending Audit"),
      "Audited At": sub.reviewed_at ? new Date(sub.reviewed_at).toLocaleString() : "-",
      "Submission Timestamp": new Date(sub.created_at).toLocaleString(),
      "Receipt URL": sub.receipt_url || "-",
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const colWidths = Object.keys(exportData[0] || {}).map((key) => ({
      wch: Math.max(key.length + 3, 14),
    }));
    worksheet["!cols"] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reconciliation Ledger");

    const todayStr = new Date().toISOString().split("T")[0];
    XLSX.writeFile(workbook, `CampusFleet_Razorpay_Reconciliation_${todayStr}.xlsx`);
    showToast("✓ Exported reconciliation report to Excel (.xlsx)!", "success");
  };

  // Unique route list for filter
  const routeOptions = useMemo(() => {
    const uniqueRoutes = new Set<string>();
    submissions.forEach((s) => {
      if (s.primary_route_name) uniqueRoutes.add(s.primary_route_name);
    });
    initialRoutes.forEach((r) => {
      if (r.name) uniqueRoutes.add(r.name);
    });
    return [
      { value: "ALL", label: "All Bus Routes" },
      ...Array.from(uniqueRoutes).sort().map((r) => ({ value: r, label: r })),
    ];
  }, [submissions, initialRoutes]);

  // Filtered Submissions
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((sub) => {
      // Status filter
      if (statusFilter === "PENDING_APPROVAL" && sub.status !== "PENDING_APPROVAL") return false;
      if (statusFilter === "APPROVED" && sub.status !== "APPROVED") return false;
      if (statusFilter === "REJECTED" && sub.status !== "REJECTED") return false;
      if (statusFilter === "RAZORPAY_AUTO" && !sub.auto_detected && !sub.transaction_id?.startsWith("pay_")) return false;

      // Route filter
      if (routeFilter !== "ALL" && sub.primary_route_name !== routeFilter) return false;

      // Search filter
      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase();
      return (
        sub.full_name?.toLowerCase().includes(q) ||
        sub.student_name?.toLowerCase().includes(q) ||
        sub.student_id_code?.toLowerCase().includes(q) ||
        sub.department?.toLowerCase().includes(q) ||
        sub.transaction_id?.toLowerCase().includes(q) ||
        sub.receipt_number?.toLowerCase().includes(q) ||
        sub.primary_route_name?.toLowerCase().includes(q) ||
        sub.primary_stop_name?.toLowerCase().includes(q)
      );
    });
  }, [submissions, statusFilter, routeFilter, searchFilter]);

  // Group by student for Hierarchical View
  const groupedStudents = useMemo(() => {
    const groups: Record<string, { student: any; submissions: any[] }> = {};
    filteredSubmissions.forEach((sub) => {
      const studentId = sub.student_id;
      if (!groups[studentId]) {
        groups[studentId] = {
          student: {
            id: studentId,
            id_code: sub.student_id_code,
            full_name: sub.full_name || sub.student_name || "Unknown Student",
            photo_url: sub.photo_url,
            department: sub.department,
            semester: sub.semester,
            email: sub.email,
            phone: sub.phone,
            route_name: sub.primary_route_name,
            stop_name: sub.primary_stop_name,
            total_fee_due: Number(sub.total_fee_due) || 0,
            total_fee_paid: Number(sub.total_fee_paid) || 0,
            has_active_subscription: sub.has_active_subscription,
          },
          submissions: [],
        };
      }
      groups[studentId].submissions.push(sub);
    });
    return Object.values(groups);
  }, [filteredSubmissions]);

  // Executive KPI Aggregates
  const totalSubmissionsCount = submissions.length;
  const pendingCount = submissions.filter((s) => s.status === "PENDING_APPROVAL").length;
  const approvedList = submissions.filter((s) => s.status === "APPROVED");
  const approvedCount = approvedList.length;
  const razorpayAutoCount = submissions.filter((s) => s.auto_detected || s.transaction_id?.startsWith("pay_")).length;
  const rejectedCount = submissions.filter((s) => s.status === "REJECTED").length;
  const totalApprovedAmount = approvedList.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);

  const autoReconciliationRate = totalSubmissionsCount > 0
    ? Math.round((razorpayAutoCount / totalSubmissionsCount) * 100)
    : 100;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900/95 dark:bg-gray-100 text-white dark:text-gray-900 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold border border-white/10 dark:border-gray-300 animate-in slide-in-from-bottom-4">
          {toastMessage.type === "error" ? (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          ) : toastMessage.type === "info" ? (
            <Info className="w-4 h-4 text-blue-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header & Razorpay Gateway Health Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <CreditCard className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              <span>Payment Approvals & Gateway Reconciliation</span>
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <Sparkles className="w-3 h-3 text-indigo-500" /> Razorpay S2S
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">
            Reconcile automated Razorpay online pass collections, verify bank settlements, and manage student transit clearances. CampusFleet strictly enforces full term fee payments.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="https://dashboard.razorpay.com/app/payments"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold flex items-center gap-1.5 transition-colors border border-gray-200 dark:border-gray-700"
            title="Open official Razorpay Merchant Dashboard"
          >
            <span>Razorpay Dashboard</span>
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          </a>

          <button
            onClick={handleExportToExcel}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            title="Export filtered records to formatted Excel spreadsheet"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel Export</span>
          </button>

          <button
            onClick={fetchSubmissions}
            disabled={isLoadingSubmissions}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl transition-colors border border-gray-200 dark:border-gray-700"
            title="Refresh database records"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSubmissions ? "animate-spin text-indigo-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Gateway & Policy Ribbon */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-50/70 via-blue-50/40 to-emerald-50/50 dark:from-indigo-950/30 dark:via-gray-900 dark:to-emerald-950/20 border border-indigo-100 dark:border-indigo-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-bold text-gray-800 dark:text-gray-200">Razorpay Live Gateway Active</span>
          </div>
          <span className="text-gray-300 dark:text-gray-700">•</span>
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>HMAC SHA256 Webhooks Verified</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/80 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[11px] font-bold text-gray-700 dark:text-gray-300">
            <Lock className="w-3 h-3 text-indigo-500" />
            <span>Policy: Full Term Payment Only (Zero Installments)</span>
          </span>
        </div>
      </div>

      {/* Executive KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Collected Revenue */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
              Reconciled Revenue
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono mt-1 text-gray-900 dark:text-white">
            ₹{totalApprovedAmount.toLocaleString("en-IN")}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
            <span className="font-bold text-emerald-600 dark:text-emerald-400">{approvedCount}</span>
            <span>full passes cleared</span>
          </div>
        </div>

        {/* Razorpay Automated Captures */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">
              Razorpay S2S Auto
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono mt-1 text-gray-900 dark:text-white">
            {razorpayAutoCount}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
            <span className="font-bold text-indigo-600 dark:text-indigo-400">{autoReconciliationRate}%</span>
            <span>autonomous reconciliation</span>
          </div>
        </div>

        {/* Pending Clearance Queue */}
        <div className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-gray-900 border shadow-sm relative overflow-hidden group transition-colors ${pendingCount > 0 ? "border-amber-300 dark:border-amber-700 bg-amber-50/20 dark:bg-amber-950/10" : "border-gray-200 dark:border-gray-800"}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 tracking-wider">
              Pending Clearance
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono mt-1 text-gray-900 dark:text-white">
            {pendingCount}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            {pendingCount === 0 ? "Queue is empty ✓" : "Requires staff verification"}
          </div>
        </div>

        {/* Total Submissions / All-Time Audits */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-gray-600 dark:text-gray-400 tracking-wider">
              Total Submissions
            </span>
            <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono mt-1 text-gray-900 dark:text-white">
            {totalSubmissionsCount}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
            <span className="text-rose-500 font-bold">{rejectedCount}</span> rejected / flagged
          </div>
        </div>
      </div>

      {/* Main Reconciliation Ledger Container */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-md p-5 sm:p-6 space-y-5">
        
        {/* Controls: Search, Filters, View Modes */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <button
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === "ALL"
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              All ({totalSubmissionsCount})
            </button>

            <button
              onClick={() => setStatusFilter("PENDING_APPROVAL")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === "PENDING_APPROVAL"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending Review ({pendingCount})</span>
            </button>

            <button
              onClick={() => setStatusFilter("RAZORPAY_AUTO")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === "RAZORPAY_AUTO"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Razorpay S2S ({razorpayAutoCount})</span>
            </button>

            <button
              onClick={() => setStatusFilter("APPROVED")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === "APPROVED"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Cleared ({approvedCount})</span>
            </button>

            <button
              onClick={() => setStatusFilter("REJECTED")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === "REJECTED"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-100"
              }`}
            >
              Rejected ({rejectedCount})
            </button>
          </div>

          {/* Right Filters & View Mode */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search name, roll no, pay_..., UTR..."
                className="w-full text-xs pl-8 pr-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <CustomDropdown
              value={routeFilter}
              onChange={(val) => setRouteFilter(val)}
              size="sm"
              options={routeOptions}
              containerClassName="w-44"
            />

            {/* Toggle Student Accounts vs Flat Stream */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
              <button
                onClick={() => setViewMode("STUDENTS")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "STUDENTS"
                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
                title="View grouped by student account"
              >
                Accounts
              </button>
              <button
                onClick={() => setViewMode("STREAM")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "STREAM"
                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                }`}
                title="View flat stream of all transactions"
              >
                Stream
              </button>
            </div>

            {viewMode === "STUDENTS" && (
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-gray-500 font-medium">
                <button onClick={expandAll} className="hover:text-indigo-600 px-1 py-0.5">Expand All</button>
                <span>/</span>
                <button onClick={collapseAll} className="hover:text-indigo-600 px-1 py-0.5">Collapse</button>
              </div>
            )}
          </div>
        </div>

        {/* Ledger List */}
        {isLoadingSubmissions ? (
          <div className="py-20 text-center text-xs text-gray-400 flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
            <span className="font-mono">Syncing payment submissions from Razorpay gateway & Supabase...</span>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="py-20 text-center text-xs text-gray-400 font-mono space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700" />
            <div className="text-sm font-bold text-gray-600 dark:text-gray-300">No payment records found</div>
            <p className="text-gray-400 max-w-sm mx-auto">
              No transactions match your current search criteria or status filter. Try clearing filters.
            </p>
          </div>
        ) : viewMode === "STUDENTS" ? (
          /* Hierarchical View: Grouped by Student */
          <div className="space-y-4">
            {groupedStudents.map((group) => {
              const { student, submissions: studentSubs } = group;
              const isExpanded = expandedStudentIds.has(student.id);
              const pendingSubs = studentSubs.filter((s) => s.status === "PENDING_APPROVAL");
              const hasPending = pendingSubs.length > 0;
              const totalDue = Number(student.total_fee_due) || 0;
              const totalPaid = Number(student.total_fee_paid) || 0;
              const isFullyCleared = totalDue > 0 && totalPaid >= totalDue;

              return (
                <div
                  key={student.id}
                  className={`rounded-2xl border transition-all ${
                    isExpanded
                      ? "border-indigo-300 dark:border-indigo-900 bg-white dark:bg-gray-900 shadow-md ring-1 ring-indigo-500/10"
                      : "border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 hover:bg-gray-100/80 dark:hover:bg-gray-800/60"
                  }`}
                >
                  {/* Student Header Bar */}
                  <div
                    onClick={() => toggleStudentExpansion(student.id)}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Avatar */}
                      <div className="w-11 h-11 rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex-shrink-0 flex items-center justify-center font-bold text-sm text-gray-500">
                        {student.photo_url ? (
                          <img
                            src={getSafePhotoUrl(student.photo_url)}
                            alt={student.full_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-5 h-5 text-gray-400" />
                        )}
                      </div>

                      {/* Name & Metadata */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-black text-sm text-gray-900 dark:text-white truncate">
                            {student.full_name}
                          </h3>
                          {student.id_code && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              {student.id_code}
                            </span>
                          )}
                          {hasPending ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 animate-pulse">
                              {pendingSubs.length} Review Needed
                            </span>
                          ) : isFullyCleared ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                              Pass Cleared ✓
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1 flex-wrap">
                          <span>{student.department || "General"}</span>
                          {student.semester && <span>• Sem {student.semester}</span>}
                          {student.route_name && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium">
                                <Bus className="w-3 h-3" /> {student.route_name}
                              </span>
                            </>
                          )}
                          {student.stop_name && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-gray-500">
                                <MapPin className="w-3 h-3" /> {student.stop_name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side: Fee Clearance Status & Expand button */}
                    <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100 dark:border-gray-800">
                      <div className="text-left sm:text-right">
                        <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                          Term Clearance (No Installments)
                        </div>
                        <div className="text-sm font-black font-mono">
                          <span className={isFullyCleared ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                            ₹{totalPaid.toLocaleString("en-IN")}
                          </span>
                          <span className="text-gray-300 dark:text-gray-700 mx-1">/</span>
                          <span className="text-gray-900 dark:text-gray-300">
                            ₹{totalDue.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>

                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 transition-transform">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Submissions Details */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 dark:border-gray-800 p-4 sm:p-5 bg-gray-50/70 dark:bg-gray-950/40 rounded-b-2xl space-y-3">
                      <div className="text-[11px] font-black uppercase text-gray-500 tracking-wider flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Submitted Transactions ({studentSubs.length})</span>
                      </div>

                      <div className="space-y-2.5">
                        {studentSubs.map((sub) => (
                          <TransactionRowItem
                            key={sub.id}
                            sub={sub}
                            actionLoadingId={actionLoadingId}
                            reverifyingId={reverifyingId}
                            copiedId={copiedId}
                            onCopy={copyToClipboard}
                            onInspect={() => setInspectSubmission(sub)}
                            onApprove={() => handleApprovePayment(sub)}
                            onReject={() => {
                              setRejectModalId(sub.id);
                              setRejectCustomNotes("");
                            }}
                            onReverify={() => handleReverifyRazorpay(sub)}
                            onPreviewImage={(url) => setPreviewImageUrl(url)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Flat Stream View */
          <div className="space-y-3">
            {filteredSubmissions.map((sub) => (
              <div
                key={sub.id}
                className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-900 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Student + Txn Info */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex-shrink-0 flex items-center justify-center font-bold text-xs text-gray-500">
                      {sub.photo_url ? (
                        <img
                          src={getSafePhotoUrl(sub.photo_url)}
                          alt={sub.full_name || sub.student_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-5 h-5 text-gray-400" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-gray-900 dark:text-white">
                          {sub.full_name || sub.student_name}
                        </span>
                        {sub.student_id_code && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            {sub.student_id_code}
                          </span>
                        )}
                        <span className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">
                          ₹{Number(sub.amount).toLocaleString("en-IN")}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                          Full Term Pass
                        </span>
                      </div>

                      <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 flex items-center gap-2 flex-wrap">
                        <span>{sub.primary_route_name || "Zone Transport"}</span>
                        <span>•</span>
                        <span className="text-[11px]">{new Date(sub.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Chips */}
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <TransactionRowActions
                      sub={sub}
                      actionLoadingId={actionLoadingId}
                      reverifyingId={reverifyingId}
                      copiedId={copiedId}
                      onCopy={copyToClipboard}
                      onInspect={() => setInspectSubmission(sub)}
                      onApprove={() => handleApprovePayment(sub)}
                      onReject={() => {
                        setRejectModalId(sub.id);
                        setRejectCustomNotes("");
                      }}
                      onReverify={() => handleReverifyRazorpay(sub)}
                      onPreviewImage={(url) => setPreviewImageUrl(url)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Slide-Over Inspection & Audit Drawer */}
      {inspectSubmission && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end animate-in fade-in">
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white dark:bg-gray-900 h-full shadow-2xl border-l border-gray-200 dark:border-gray-800 flex flex-col animate-in slide-in-from-right duration-200 overflow-y-auto"
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-900 dark:text-white">
                    Transaction Audit & Reconciliation
                  </h3>
                  <p className="text-[11px] text-gray-500 font-mono">
                    ID: {inspectSubmission.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectSubmission(null)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-6 flex-1">
              
              {/* Student Profile Card */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-200 dark:bg-gray-800 flex-shrink-0 border border-gray-300 dark:border-gray-700 flex items-center justify-center font-bold text-base text-gray-500">
                  {inspectSubmission.photo_url ? (
                    <img
                      src={getSafePhotoUrl(inspectSubmission.photo_url)}
                      alt={inspectSubmission.full_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-7 h-7 text-gray-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-black text-base text-gray-900 dark:text-white">
                    {inspectSubmission.full_name || inspectSubmission.student_name}
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5">
                    Roll: <strong className="text-gray-800 dark:text-gray-200">{inspectSubmission.student_id_code || "N/A"}</strong>
                    {inspectSubmission.department && ` • ${inspectSubmission.department}`}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                    {inspectSubmission.email && <span>{inspectSubmission.email}</span>}
                    {inspectSubmission.phone && <span>• {inspectSubmission.phone}</span>}
                  </div>
                </div>
              </div>

              {/* Transit Route Assignment */}
              <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 space-y-2">
                <div className="text-xs font-black uppercase text-gray-500 tracking-wider">
                  Assigned Transit Service
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-400">Bus Corridor:</span>
                    <div className="font-bold text-gray-900 dark:text-white mt-0.5">
                      {inspectSubmission.primary_route_name || "Unassigned"}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400">Boarding Stop:</span>
                    <div className="font-bold text-gray-900 dark:text-white mt-0.5">
                      {inspectSubmission.primary_stop_name || "Unassigned"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Breakdown (No Installments Policy) */}
              <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-indigo-700 dark:text-indigo-400 tracking-wider">
                    Full Term Fee Ledger
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    Zero Installments Enforced
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                    <div className="text-[10px] text-gray-400">Term Fee Due</div>
                    <div className="text-sm font-black font-mono text-gray-900 dark:text-white mt-0.5">
                      ₹{Number(inspectSubmission.total_fee_due || 0).toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                    <div className="text-[10px] text-gray-400">Amount Paid</div>
                    <div className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                      ₹{Number(inspectSubmission.total_fee_paid || 0).toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                    <div className="text-[10px] text-gray-400">This Submission</div>
                    <div className="text-sm font-black font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                      ₹{Number(inspectSubmission.amount || 0).toLocaleString("en-IN")}
                    </div>
                  </div>
                </div>
              </div>

              {/* Gateway Telemetry */}
              <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 space-y-3">
                <div className="text-xs font-black uppercase text-gray-500 tracking-wider flex items-center justify-between">
                  <span>Gateway Settlement Details</span>
                  {inspectSubmission.auto_detected && (
                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Autonomous Webhook
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 dark:bg-gray-950">
                    <span className="text-gray-500">Razorpay Payment ID:</span>
                    <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white">
                      <span>{inspectSubmission.transaction_id || "NOT_PROVIDED"}</span>
                      {inspectSubmission.transaction_id && (
                        <button
                          onClick={() => copyToClipboard(inspectSubmission.transaction_id, "drawer-txn")}
                          className="text-gray-400 hover:text-indigo-600"
                          title="Copy ID"
                        >
                          {copiedId === "drawer-txn" ? <CheckCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {inspectSubmission.receipt_number && (
                    <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 dark:bg-gray-950">
                      <span className="text-gray-500">Receipt / Order Ref:</span>
                      <span className="font-bold text-gray-900 dark:text-white">
                        {inspectSubmission.receipt_number}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 dark:bg-gray-950">
                    <span className="text-gray-500">Submitted Timestamp:</span>
                    <span className="text-gray-800 dark:text-gray-200">
                      {new Date(inspectSubmission.created_at).toLocaleString()}
                    </span>
                  </div>

                  {inspectSubmission.reviewed_by && (
                    <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 dark:bg-gray-950">
                      <span className="text-gray-500">Audited By:</span>
                      <span className="text-gray-800 dark:text-gray-200">
                        {inspectSubmission.reviewed_by}
                      </span>
                    </div>
                  )}
                </div>

                {inspectSubmission.transaction_id?.startsWith("pay_") && (
                  <div className="pt-1 flex items-center gap-2">
                    <a
                      href={`https://dashboard.razorpay.com/app/payments/${inspectSubmission.transaction_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span>Inspect on Razorpay Console</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>

              {/* Uploaded Receipt Preview */}
              {inspectSubmission.receipt_url && (
                <div className="space-y-2">
                  <div className="text-xs font-black uppercase text-gray-500 tracking-wider flex items-center justify-between">
                    <span>Uploaded Proof of Payment</span>
                    <button
                      onClick={() => setPreviewImageUrl(inspectSubmission.receipt_url)}
                      className="text-indigo-600 dark:text-indigo-400 text-xs font-bold flex items-center gap-1 hover:underline"
                    >
                      <Eye className="w-3.5 h-3.5" /> Fullscreen
                    </button>
                  </div>
                  <div
                    onClick={() => setPreviewImageUrl(inspectSubmission.receipt_url)}
                    className="h-48 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-black/5 dark:bg-black/40 flex items-center justify-center cursor-pointer relative group"
                  >
                    <img
                      src={getSafePhotoUrl(inspectSubmission.receipt_url)}
                      alt="Payment Receipt"
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-5 border-t border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-950/80 sticky bottom-0 flex items-center gap-2">
              {inspectSubmission.transaction_id?.startsWith("pay_") && (
                <button
                  onClick={() => handleReverifyRazorpay(inspectSubmission)}
                  disabled={reverifyingId === inspectSubmission.id}
                  className="px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title="Query Razorpay API to confirm capture status"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${reverifyingId === inspectSubmission.id ? "animate-spin" : ""}`} />
                  <span>Re-verify Gateway</span>
                </button>
              )}

              {inspectSubmission.status === "PENDING_APPROVAL" ? (
                <>
                  <button
                    onClick={() => {
                      setRejectModalId(inspectSubmission.id);
                      setRejectCustomNotes("");
                    }}
                    disabled={actionLoadingId === inspectSubmission.id}
                    className="flex-1 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-bold transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprovePayment(inspectSubmission)}
                    disabled={actionLoadingId === inspectSubmission.id}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{actionLoadingId === inspectSubmission.id ? "Clearing..." : "Approve & Issue Pass"}</span>
                  </button>
                </>
              ) : (
                <div className="w-full text-center text-xs font-bold py-1">
                  Status: <span className="uppercase text-indigo-600 dark:text-indigo-400">{inspectSubmission.status}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal with Audit Presets */}
      {rejectModalId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-md w-full bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <h4 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-600" />
                <span>Reject Payment Submission</span>
              </h4>
              <button
                onClick={() => setRejectModalId(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Select an audit reason for rejecting this fee submission. The student will be prompted to settle their term balance.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider block mb-1">
                  Standard Audit Preset
                </label>
                <CustomDropdown
                  value={rejectPreset}
                  onChange={(val) => setRejectPreset(val)}
                  size="sm"
                  options={[
                    "Payment ID not found on Razorpay live gateway",
                    "Transaction reference / UTR not found on institution bank account",
                    "Partial amount submitted (CampusFleet requires full term fee)",
                    "Duplicate transaction reference (already credited)",
                    "Unreadable or invalid receipt attachment",
                    "Incorrect student account selected",
                  ]}
                  containerClassName="w-full"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider block mb-1">
                  Additional Internal Notes (Optional)
                </label>
                <textarea
                  value={rejectCustomNotes}
                  onChange={(e) => setRejectCustomNotes(e.target.value)}
                  placeholder="e.g. Verified with ICICI account statement 02-Nov, no credit seen..."
                  rows={2}
                  className="w-full text-xs p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setRejectModalId(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectPayment}
                disabled={actionLoadingId === rejectModalId}
                className="px-4 py-2 text-xs font-black rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-sm disabled:opacity-50"
              >
                {actionLoadingId === rejectModalId ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Lightbox */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-3xl w-full bg-gray-900 rounded-3xl p-4 border border-gray-700 space-y-3 cursor-default"
          >
            <div className="flex items-center justify-between pb-2 border-b border-gray-800">
              <span className="text-xs font-bold text-gray-300">Payment Receipt Inspection</span>
              <button
                onClick={() => setPreviewImageUrl(null)}
                className="p-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden max-h-[75vh] flex items-center justify-center bg-black">
              <img
                src={getSafePhotoUrl(previewImageUrl)}
                alt="Receipt Inspection"
                className="max-w-full max-h-[75vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponent: Individual Transaction Item inside Student Card
function TransactionRowItem({
  sub,
  actionLoadingId,
  reverifyingId,
  copiedId,
  onCopy,
  onInspect,
  onApprove,
  onReject,
  onReverify,
  onPreviewImage,
}: {
  sub: any;
  actionLoadingId: string | null;
  reverifyingId: string | null;
  copiedId: string | null;
  onCopy: (text: string, key: string) => void;
  onInspect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onReverify: () => void;
  onPreviewImage: (url: string) => void;
}) {
  const isPending = sub.status === "PENDING_APPROVAL";
  const isApproved = sub.status === "APPROVED";
  const isRazorpay = sub.auto_detected || sub.transaction_id?.startsWith("pay_");

  return (
    <div
      className={`p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border transition-colors ${
        isPending
          ? "bg-white dark:bg-gray-900 border-amber-200 dark:border-amber-900/60 shadow-sm"
          : isRazorpay
          ? "bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/40"
          : isApproved
          ? "bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/30"
          : "bg-white/60 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Receipt thumbnail or CreditCard icon */}
        {sub.receipt_url ? (
          <div
            onClick={() => onPreviewImage(sub.receipt_url)}
            className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex-shrink-0 cursor-pointer relative group shadow-sm"
          >
            <img
              src={getSafePhotoUrl(sub.receipt_url)}
              alt="Receipt"
              className="w-full h-full object-cover group-hover:scale-110 transition-transform"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
              <Eye className="w-4 h-4" />
            </div>
          </div>
        ) : (
          <div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
        )}

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-sm text-gray-900 dark:text-white">
              ₹{Number(sub.amount).toLocaleString("en-IN")}
            </span>
            <span
              className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                isPending
                  ? "bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200"
                  : sub.auto_detected
                  ? "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200"
                  : isApproved
                  ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200"
                  : "bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200"
              }`}
            >
              {sub.auto_detected ? "RAZORPAY S2S AUTO" : sub.status}
            </span>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
            {sub.transaction_id && (
              <span className="flex items-center gap-1">
                <span>{sub.transaction_id.startsWith("pay_") ? "RZP ID:" : "UTR:"}</span>
                <strong className="text-gray-700 dark:text-gray-300">{sub.transaction_id}</strong>
                <button
                  onClick={() => onCopy(sub.transaction_id, `txn-${sub.id}`)}
                  className="text-gray-400 hover:text-indigo-600 ml-0.5"
                  title="Copy Transaction ID"
                >
                  {copiedId === `txn-${sub.id}` ? (
                    <CheckCheck className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </span>
            )}
            <span>•</span>
            <span className="text-[10px]">{new Date(sub.created_at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <TransactionRowActions
        sub={sub}
        actionLoadingId={actionLoadingId}
        reverifyingId={reverifyingId}
        copiedId={copiedId}
        onCopy={onCopy}
        onInspect={onInspect}
        onApprove={onApprove}
        onReject={onReject}
        onReverify={onReverify}
        onPreviewImage={onPreviewImage}
      />
    </div>
  );
}

// Subcomponent: Shared Action Buttons for a Transaction
function TransactionRowActions({
  sub,
  actionLoadingId,
  reverifyingId,
  onInspect,
  onApprove,
  onReject,
  onReverify,
}: {
  sub: any;
  actionLoadingId: string | null;
  reverifyingId: string | null;
  copiedId: string | null;
  onCopy: (text: string, key: string) => void;
  onInspect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onReverify: () => void;
  onPreviewImage: (url: string) => void;
}) {
  const isPending = sub.status === "PENDING_APPROVAL";
  const isApproved = sub.status === "APPROVED";
  const isRazorpay = sub.transaction_id?.startsWith("pay_");

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Inspect Audit Button */}
      <button
        onClick={onInspect}
        className="px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold flex items-center gap-1 transition-colors"
        title="Inspect full transaction details & audit trail"
      >
        <Eye className="w-3.5 h-3.5" />
        <span>Inspect</span>
      </button>

      {/* Razorpay Re-verify Button */}
      {isRazorpay && (
        <button
          onClick={onReverify}
          disabled={reverifyingId === sub.id}
          className="p-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-300 transition-colors disabled:opacity-50"
          title="Re-verify payment with Razorpay S2S API"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${reverifyingId === sub.id ? "animate-spin" : ""}`} />
        </button>
      )}

      {isPending ? (
        <>
          <button
            onClick={onApprove}
            disabled={actionLoadingId === sub.id}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm transition-all"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{actionLoadingId === sub.id ? "..." : "Approve"}</span>
          </button>
          <button
            onClick={onReject}
            disabled={actionLoadingId === sub.id}
            className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-bold rounded-xl transition-colors"
          >
            Reject
          </button>
        </>
      ) : sub.auto_detected ? (
        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50">
          <Sparkles className="w-3.5 h-3.5" /> Razorpay Verified
        </span>
      ) : isApproved ? (
        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50">
          <Check className="w-3.5 h-3.5" /> Approved
        </span>
      ) : (
        <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/50">
          <X className="w-3.5 h-3.5" /> Rejected
        </span>
      )}
    </div>
  );
}
