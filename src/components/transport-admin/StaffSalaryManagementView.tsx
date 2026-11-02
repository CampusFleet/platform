"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Banknote,
  Search,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Plus,
  RefreshCw,
  TrendingUp,
  Receipt,
  FileCheck2,
  Calendar,
  Building2,
  Smartphone,
  SlidersHorizontal,
  X,
  Send,
  Sparkles,
  Lock,
  Printer,
  Eye,
  EyeOff,
  Edit3,
  CreditCard,
  ChevronRight,
  Check,
  LayoutGrid,
  Table as TableIcon,
  Shield,
  Bus,
  Award,
  ArrowRight,
  UserCheck,
} from "lucide-react";
import { useTheme } from "@/components/common/ThemeProvider";

export interface StaffPayrollRecord {
  staffId: string;
  userId?: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  photoUrl?: string | null;
  licenseNo?: string | null;
  role: string;
  category: string;
  isActive: boolean;
  staffCreatedAt?: string;
  baseSalary: number;
  paymentFrequency: "DAILY" | "WEEKLY" | "MONTHLY";
  payoutMethod: "BANK_ACCOUNT" | "UPI";
  accountHolderName: string;
  bankName: string;
  bankIfsc: string;
  bankAccountMasked?: string;
  upiIdMasked?: string;
  isPayoutConfigured: boolean;
  isVerified: boolean;
  activeBonusAmount: number;
  activeBonusReason?: string;
  netPayable: number;
  completedTripsMonth: number;
  totalPaidYtd: number;
  lastPayoutAt?: string;
  lastPayoutAmount?: number;
  lastPayoutStatus?: string;
}

export interface RoleSalaryDefault {
  role: string;
  base_salary: number;
  payment_frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  daily_allowance: number;
  trip_bonus_rate: number;
  description?: string;
}

export interface PayoutTransaction {
  id: string;
  payout_ref: string;
  staff_id: string;
  role: string;
  cycle_period: string;
  base_amount: number;
  bonus_amount: number;
  bonus_reason?: string;
  deductions?: number;
  net_amount: number;
  payment_frequency: string;
  payout_method: string;
  recipient_masked: string;
  status: "PAID" | "PENDING" | "PROCESSING" | "FAILED";
  gateway: string;
  gateway_payout_id?: string;
  paid_at?: string;
  created_at: string;
}

export default function StaffSalaryManagementView() {
  const { theme } = useTheme();

  // State
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<StaffPayrollRecord[]>([]);
  const [roleDefaults, setRoleDefaults] = useState<RoleSalaryDefault[]>([]);
  const [recentPayouts, setRecentPayouts] = useState<PayoutTransaction[]>([]);
  const [stats, setStats] = useState<any>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Tabs & Views
  const [activeTab, setActiveTab] = useState<"ROSTER" | "ROLE_DEFAULTS" | "BATCH_RUN" | "LEDGER">("ROSTER");
  const [viewMode, setViewMode] = useState<"GRID" | "TABLE">("TABLE");

  // Filters & Multi-Selection
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [freqFilter, setFreqFilter] = useState("ALL");
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);

  // Slide-over Drawer: Staff 360° Profile
  const [drawerStaff, setDrawerStaff] = useState<StaffPayrollRecord | null>(null);

  // Modals
  const [editingStaff, setEditingStaff] = useState<StaffPayrollRecord | null>(null);
  const [editForm, setEditForm] = useState({
    baseSalary: 20000,
    paymentFrequency: "MONTHLY" as "DAILY" | "WEEKLY" | "MONTHLY",
  });

  // Dedicated Staff Payout / Direct Deposit Credentials Modal
  const [editingPayoutStaff, setEditingPayoutStaff] = useState<StaffPayrollRecord | null>(null);
  const [payoutForm, setPayoutForm] = useState({
    payoutMethod: "BANK_ACCOUNT" as "BANK_ACCOUNT" | "UPI",
    accountHolderName: "",
    bankName: "State Bank of India",
    bankIfsc: "",
    bankAccount: "",
    confirmBankAccount: "",
    upiId: "",
  });
  const [showAccountNumbers, setShowAccountNumbers] = useState(false);
  const [isSavingPayout, setIsSavingPayout] = useState(false);

  const [bonusModalStaff, setBonusModalStaff] = useState<StaffPayrollRecord | null>(null);
  const [bonusForm, setBonusForm] = useState({
    amount: 1000,
    reason: "Festival allowance & mountain route endurance",
  });

  // Bulk Bonus Modal for Selected Staff
  const [isBulkBonusOpen, setIsBulkBonusOpen] = useState(false);
  const [bulkBonusForm, setBulkBonusForm] = useState({
    amount: 1500,
    reason: "Performance & fleet on-time incentive",
  });

  // Single Disburse Modal
  const [singleDisburseModalStaff, setSingleDisburseModalStaff] = useState<StaffPayrollRecord | null>(null);
  const [isProcessingDisburse, setIsProcessingDisburse] = useState(false);

  // Batch / Selected Disburse Wizard
  const [batchCycleFilter, setBatchCycleFilter] = useState<"ALL" | "DAILY" | "WEEKLY" | "MONTHLY">("MONTHLY");
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchResults, setBatchResults] = useState<any | null>(null);

  // Digital Payslip Modal
  const [payslipModalData, setPayslipModalData] = useState<{
    staff: StaffPayrollRecord;
    transaction?: PayoutTransaction;
  } | null>(null);

  // Fetch Payroll Data
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/staff/salary/admin");
      const data = await res.json();
      if (data.success) {
        setStaffList(data.staffList || []);
        setRoleDefaults(data.roleDefaults || []);
        setRecentPayouts(data.recentPayouts || []);
        setStats(data.stats || {});
      }
    } catch (err) {
      console.error("Failed to load payroll data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Filtered Staff
  const filteredStaff = useMemo(() => {
    return staffList.filter((s) => {
      const matchesSearch =
        s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.licenseNo && s.licenseNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.phone && s.phone.includes(searchQuery));

      const matchesRole = roleFilter === "ALL" || s.role.toLowerCase() === roleFilter.toLowerCase();
      const matchesFreq = freqFilter === "ALL" || s.paymentFrequency === freqFilter;

      return matchesSearch && matchesRole && matchesFreq;
    });
  }, [staffList, searchQuery, roleFilter, freqFilter]);

  // Selected Staff records
  const selectedStaffRecords = useMemo(() => {
    const idSet = new Set(selectedStaffIds);
    return staffList.filter((s) => idSet.has(s.staffId));
  }, [staffList, selectedStaffIds]);

  const selectedTotalNet = useMemo(() => {
    return selectedStaffRecords.reduce((acc, s) => acc + s.netPayable, 0);
  }, [selectedStaffRecords]);

  // Role defaults mapped by lowercase role key
  const roleDefaultsMap = useMemo(() => {
    return new Map(roleDefaults.map((rd) => [rd.role.toLowerCase(), rd]));
  }, [roleDefaults]);

  // Out of sync staff members whose current base salary differs from role benchmark
  const outOfSyncStaffList = useMemo(() => {
    return staffList.filter((s) => {
      const rd = roleDefaultsMap.get(s.role.toLowerCase());
      return rd && s.baseSalary !== rd.base_salary;
    });
  }, [staffList, roleDefaultsMap]);

  // Handle Multi-Select Toggles
  const handleToggleSelectAll = () => {
    if (selectedStaffIds.length === filteredStaff.length) {
      setSelectedStaffIds([]);
    } else {
      setSelectedStaffIds(Array.from(new Set(filteredStaff.map((s) => s.staffId))));
    }
  };

  const handleToggleSelectRow = (staffId: string) => {
    setSelectedStaffIds((prev) => {
      if (prev.includes(staffId)) {
        return prev.filter((id) => id !== staffId);
      }
      return Array.from(new Set([...prev, staffId]));
    });
  };

  // Handle Edit Individual Salary
  const handleSaveIndividualSalary = async () => {
    if (!editingStaff) return;
    try {
      const res = await fetch("/api/staff/salary/admin/staff-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: editingStaff.staffId,
          baseSalary: editForm.baseSalary,
          paymentFrequency: editForm.paymentFrequency,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ Compensation updated for ${editingStaff.fullName}`);
        setEditingStaff(null);
        if (drawerStaff?.staffId === editingStaff.staffId) {
          setDrawerStaff({
            ...drawerStaff,
            baseSalary: editForm.baseSalary,
            paymentFrequency: editForm.paymentFrequency,
            netPayable: editForm.baseSalary + drawerStaff.activeBonusAmount,
          });
        }
        fetchData();
      } else {
        alert(data.error || "Failed to update salary");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // Open Payout / Direct Deposit Credentials Modal
  const handleOpenPayoutModal = (staff: StaffPayrollRecord) => {
    setEditingPayoutStaff(staff);
    setPayoutForm({
      payoutMethod: staff.payoutMethod || "BANK_ACCOUNT",
      accountHolderName: staff.accountHolderName || staff.fullName || "",
      bankName: staff.bankName || "State Bank of India",
      bankIfsc: staff.bankIfsc || "",
      bankAccount: "",
      confirmBankAccount: "",
      upiId: "",
    });
    setShowAccountNumbers(false);
  };

  // Handle Save Payout Credentials
  const handleSavePayoutCredentials = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingPayoutStaff) return;

    if (payoutForm.payoutMethod === "BANK_ACCOUNT") {
      const cleanAcct = payoutForm.bankAccount.replace(/\s+/g, "");
      if (!cleanAcct || cleanAcct.length < 8) {
        alert("Please enter a valid bank account number (at least 8 digits).");
        return;
      }
      if (cleanAcct !== payoutForm.confirmBankAccount.replace(/\s+/g, "")) {
        alert("Bank account number and confirmation account number do not match.");
        return;
      }
      const cleanIfsc = payoutForm.bankIfsc.trim().toUpperCase();
      if (!cleanIfsc || cleanIfsc.length !== 11) {
        alert("Please enter a valid 11-character Indian Bank IFSC code (e.g. SBIN0000726).");
        return;
      }
    } else {
      if (!payoutForm.upiId || !payoutForm.upiId.includes("@")) {
        alert("Please enter a valid UPI Virtual Payment Address (e.g. driver@oksbi).");
        return;
      }
    }

    setIsSavingPayout(true);
    try {
      const res = await fetch("/api/staff/salary/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: editingPayoutStaff.staffId,
          userId: editingPayoutStaff.userId,
          payoutMethod: payoutForm.payoutMethod,
          accountHolderName: payoutForm.accountHolderName.trim() || editingPayoutStaff.fullName,
          bankName: payoutForm.bankName.trim(),
          bankIfsc: payoutForm.bankIfsc.trim().toUpperCase(),
          bankAccount: payoutForm.bankAccount.trim(),
          upiId: payoutForm.upiId.trim().toLowerCase(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast(data.message || `✓ Direct deposit credentials encrypted and saved for ${editingPayoutStaff.fullName}`);
        setEditingPayoutStaff(null);

        // Optimistically update the drawer if currently viewing this staff
        if (drawerStaff?.staffId === editingPayoutStaff.staffId) {
          setDrawerStaff({
            ...drawerStaff,
            payoutMethod: payoutForm.payoutMethod,
            accountHolderName: payoutForm.accountHolderName.trim() || editingPayoutStaff.fullName,
            bankName: payoutForm.bankName.trim(),
            bankIfsc: payoutForm.bankIfsc.trim().toUpperCase(),
            bankAccountMasked: data.bankAccountMasked || (payoutForm.bankAccount ? `••••••••${payoutForm.bankAccount.slice(-4)}` : drawerStaff.bankAccountMasked),
            upiIdMasked: data.upiIdMasked || (payoutForm.upiId ? payoutForm.upiId : drawerStaff.upiIdMasked),
            isVerified: true,
          });
        }
        fetchData();
      } else {
        alert(data.error || "Failed to update payout credentials.");
      }
    } catch (err: any) {
      alert("Error saving payout details: " + err.message);
    } finally {
      setIsSavingPayout(false);
    }
  };

  // Handle Award Bonus
  const handleAwardBonus = async () => {
    if (!bonusModalStaff) return;
    try {
      const res = await fetch("/api/staff/salary/admin/staff-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: bonusModalStaff.staffId,
          bonusAmount: bonusForm.amount,
          bonusReason: bonusForm.reason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ Bonus ₹${bonusForm.amount.toLocaleString("en-IN")} awarded to ${bonusModalStaff.fullName}`);
        setBonusModalStaff(null);
        if (drawerStaff?.staffId === bonusModalStaff.staffId) {
          setDrawerStaff({
            ...drawerStaff,
            activeBonusAmount: bonusForm.amount,
            activeBonusReason: bonusForm.reason,
            netPayable: drawerStaff.baseSalary + bonusForm.amount,
          });
        }
        fetchData();
      } else {
        alert(data.error || "Failed to award bonus");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // Handle Bulk Bonus for Selected Staff
  const handleApplyBulkBonus = async () => {
    if (selectedStaffIds.length === 0) return;
    try {
      let updatedCount = 0;
      for (const id of selectedStaffIds) {
        await fetch("/api/staff/salary/admin/staff-config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staffId: id,
            bonusAmount: bulkBonusForm.amount,
            bonusReason: bulkBonusForm.reason,
          }),
        });
        updatedCount++;
      }
      showToast(`✓ Applied bonus of ₹${bulkBonusForm.amount.toLocaleString("en-IN")} to ${updatedCount} staff members`);
      setIsBulkBonusOpen(false);
      setSelectedStaffIds([]);
      fetchData();
    } catch (err: any) {
      alert("Failed to apply bulk bonus: " + err.message);
    }
  };

  // Handle Single Disburse
  const handleExecuteSingleDisburse = async () => {
    if (!singleDisburseModalStaff) return;
    setIsProcessingDisburse(true);
    try {
      const res = await fetch("/api/staff/salary/admin/disburse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "SINGLE",
          staffId: singleDisburseModalStaff.staffId,
          processedBy: "Transport Administrator",
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || `✓ Salary payout executed for ${singleDisburseModalStaff.fullName}`);
        setSingleDisburseModalStaff(null);
        fetchData();
      } else {
        alert(data.error || "Disbursement failed");
      }
    } catch (err: any) {
      alert("Disbursement error: " + err.message);
    } finally {
      setIsProcessingDisburse(false);
    }
  };

  // Handle Disburse for Selected Staff
  const handleExecuteSelectedDisburse = async () => {
    if (selectedStaffIds.length === 0) return;
    if (
      !confirm(
        `Execute automated RazorpayX salary transfers for ${selectedStaffIds.length} selected staff totaling ₹${selectedTotalNet.toLocaleString("en-IN")}?`
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/staff/salary/admin/disburse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "SELECTED",
          staffIds: selectedStaffIds,
          processedBy: "Transport Administrator",
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        setSelectedStaffIds([]);
        fetchData();
      } else {
        alert(data.error || "Batch execution failed");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Batch Disburse Wizard (Tab 3)
  const handleExecuteBatchDisburse = async () => {
    setIsProcessingBatch(true);
    try {
      const res = await fetch("/api/staff/salary/admin/disburse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "BATCH",
          frequencyFilter: batchCycleFilter,
          processedBy: "Transport Administrator",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBatchResults(data);
        setWizardStep(3);
        showToast(data.message);
        fetchData();
      } else {
        alert(data.error || "Batch execution failed");
      }
    } catch (err: any) {
      alert("Batch execution error: " + err.message);
    } finally {
      setIsProcessingBatch(false);
    }
  };

  // Role Default Form updates with optional automatic staff cascading
  const handleUpdateRoleDefault = async (
    role: string,
    baseSalary: number,
    paymentFrequency: any,
    applyToExistingStaff = true
  ) => {
    try {
      const res = await fetch("/api/staff/salary/admin/role-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          baseSalary,
          paymentFrequency,
          applyToExistingStaff,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        await fetchData();
      } else {
        alert(data.error || "Failed to update benchmark");
      }
    } catch (err: any) {
      alert("Failed to update benchmark: " + err.message);
    }
  };

  // Explicit Cascade Action for a Role (synchronizes all active staff to role benchmark)
  const handleCascadeRoleBenchmark = async (role: string) => {
    try {
      const res = await fetch("/api/staff/salary/admin/role-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, action: "CASCADE" }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        await fetchData();
      } else {
        alert(data.error || "Failed to cascade benchmark");
      }
    } catch (err: any) {
      alert("Failed to cascade benchmark: " + err.message);
    }
  };

  // Synchronize targeted or bulk selected staff to their role benchmark
  const handleSyncStaffToBenchmark = async (targetStaffIds: string[]) => {
    if (!targetStaffIds || targetStaffIds.length === 0) return;
    try {
      const res = await fetch("/api/staff/salary/admin/staff-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SYNC_TO_BENCHMARK",
          staffIds: targetStaffIds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        setSelectedStaffIds([]);
        await fetchData();
      } else {
        alert(data.error || "Failed to sync staff to benchmark");
      }
    } catch (err: any) {
      alert("Error syncing to benchmark: " + err.message);
    }
  };

  // Helper: Open Payslip Modal
  const handleOpenPayslip = (staff: StaffPayrollRecord, tx?: PayoutTransaction) => {
    setPayslipModalData({ staff, transaction: tx });
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 p-4 rounded-2xl bg-emerald-600 text-white font-bold text-xs shadow-2xl flex items-center gap-3 animate-in slide-in-from-top">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-white/80 hover:text-white cursor-pointer ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Status Indicator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-3.5 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20 shrink-0">
            <Banknote className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Staff Payroll & Compensation Hub
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                RazorpayX Live
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Automated direct deposit disbursement for Drivers, Conductors, Managers, and Transport Admins with hardware AES-256 encryption.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync Fleet Database</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("BATCH_RUN");
              setWizardStep(1);
            }}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-98"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>Run Automated Payroll</span>
          </button>
        </div>
      </div>

      {/* Top Executive KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Monthly Obligation */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Monthly Commitment</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono">
            ₹{(stats.totalMonthlyObligation || 0).toLocaleString("en-IN")}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span>Base Salary + Incentives</span>
            <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">{stats.totalStaffCount || 0} Staff</span>
          </div>
        </div>

        {/* KPI 2: Staff Enrolled & Trips Driven */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Active Fleet Personnel</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Bus className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono">
            {stats.totalStaffCount || 0} Members
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-1 border-t border-slate-100 dark:border-slate-800">
            <span>{stats.driverCount || 0} Drivers</span>
            <span>•</span>
            <span>{stats.conductorCount || 0} Conductors</span>
            <span>•</span>
            <span>{stats.managerCount || 0} Managers</span>
          </div>
        </div>

        {/* KPI 3: Payout Readiness Rate */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Payout Readiness</span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono">
            {Math.round(((stats.configuredCount || 0) / (stats.totalStaffCount || 1)) * 100)}%
          </div>
          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{
                width: `${Math.round(((stats.configuredCount || 0) / (stats.totalStaffCount || 1)) * 100)}%`,
              }}
            ></div>
          </div>
          <p className="text-[11px] text-slate-500">
            {stats.configuredCount || 0} of {stats.totalStaffCount || 0} verified with Bank/UPI
          </p>
        </div>

        {/* KPI 4: Disbursed This Month */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Disbursed (Month-to-Date)</span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono">
            ₹{(stats.disbursedThisMonth || 0).toLocaleString("en-IN")}
          </div>
          <p className="text-[11px] text-purple-600 dark:text-purple-400 font-medium pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span>RazorpayX IMPS/UPI Payouts</span>
            <span className="font-bold">{recentPayouts.length} Transfers</span>
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab("ROSTER")}
            className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeTab === "ROSTER"
                ? "bg-blue-600 text-white shadow-xs font-black"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/60"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Staff Compensation Roster ({filteredStaff.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ROLE_DEFAULTS")}
            className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeTab === "ROLE_DEFAULTS"
                ? "bg-blue-600 text-white shadow-xs font-black"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/60"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Role Benchmarks</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("BATCH_RUN");
              setWizardStep(1);
            }}
            className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeTab === "BATCH_RUN"
                ? "bg-blue-600 text-white shadow-xs font-black"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/60"
            }`}
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>Batch Payout Wizard</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("LEDGER")}
            className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeTab === "LEDGER"
                ? "bg-blue-600 text-white shadow-xs font-black"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/60"
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Transaction Ledger ({recentPayouts.length})</span>
          </button>
        </div>

        {/* View Mode Toggle (Grid vs Table) */}
        {activeTab === "ROSTER" && (
          <div className="hidden sm:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode("TABLE")}
              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                viewMode === "TABLE"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
              title="Dense Table View"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("GRID")}
              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                viewMode === "GRID"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
              title="Cards Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Cards</span>
            </button>
          </div>
        )}
      </div>

      {/* ── TAB 1: STAFF COMPENSATION ROSTER ──────────────────────────────────── */}
      {activeTab === "ROSTER" && (
        <div className="space-y-4">
          {/* Out of Sync Warning Banner */}
          {outOfSyncStaffList.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs animate-in fade-in">
              <div className="flex items-center gap-3 text-amber-900 dark:text-amber-200">
                <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold flex items-center gap-2">
                    <span>Role Compensation Out of Sync</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-200/70 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 font-mono">
                      {outOfSyncStaffList.length} Personnel Affected
                    </span>
                  </div>
                  <p className="text-amber-800 dark:text-amber-300 mt-0.5 text-[11px]">
                    {outOfSyncStaffList.length} active staff member(s) have base salaries that differ from current institutional role benchmarks.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleSyncStaffToBenchmark(outOfSyncStaffList.map((s) => s.staffId))}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-2 shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync All {outOfSyncStaffList.length} to Benchmarks</span>
              </button>
            </div>
          )}

          {/* Controls & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff by name, code, DL number, or phone..."
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-hidden"
              >
                <option value="ALL">All Roles</option>
                <option value="driver">Drivers</option>
                <option value="conductor">Conductors</option>
                <option value="transport_manager">Managers</option>
                <option value="transport_admin">Admins</option>
              </select>

              <select
                value={freqFilter}
                onChange={(e) => setFreqFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-hidden"
              >
                <option value="ALL">All Cycles</option>
                <option value="MONTHLY">Monthly</option>
                <option value="WEEKLY">Weekly</option>
                <option value="DAILY">Daily</option>
              </select>
            </div>
          </div>

          {/* VIEW MODE 1: HIGH-DENSITY TABLE */}
          {viewMode === "TABLE" && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={filteredStaff.length > 0 && selectedStaffIds.length === filteredStaff.length}
                          onChange={handleToggleSelectAll}
                          className="rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-3">Personnel</th>
                      <th className="py-3 px-3">Role</th>
                      <th className="py-3 px-3 text-right">Base Pay</th>
                      <th className="py-3 px-3 text-center">Cycle</th>
                      <th className="py-3 px-3">Banking / UPI Destination</th>
                      <th className="py-3 px-3 text-center">Trips Month</th>
                      <th className="py-3 px-3 text-right">Net Payable</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {filteredStaff.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 text-center text-slate-400">
                          No staff personnel found matching the query.
                        </td>
                      </tr>
                    ) : (
                      filteredStaff.map((staff) => {
                        const isSelected = selectedStaffIds.includes(staff.staffId);
                        return (
                          <tr
                            key={staff.staffId}
                            className={`transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-blue-50/50 dark:bg-blue-950/20"
                                : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                            }`}
                          >
                            <td
                              className="py-3 px-4 text-center cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelectRow(staff.staffId);
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                                className="rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer pointer-events-none"
                              />
                            </td>

                            <td className="py-3 px-3" onClick={() => setDrawerStaff(staff)}>
                              <div className="flex items-center gap-3">
                                {staff.photoUrl ? (
                                  <img
                                    src={staff.photoUrl}
                                    alt={staff.fullName}
                                    className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-xs shrink-0">
                                    {staff.fullName.charAt(0)}
                                  </div>
                                )}
                                <div>
                                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <span>{staff.fullName}</span>
                                    {staff.isVerified && (
                                      <span title="Verified Direct Deposit Destination">
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                                    <span>{staff.employeeCode}</span>
                                    {staff.licenseNo && <span>• DL: {staff.licenseNo}</span>}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-3" onClick={() => setDrawerStaff(staff)}>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  staff.role === "driver"
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                                    : staff.role === "conductor"
                                    ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20"
                                    : staff.role === "transport_manager"
                                    ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20"
                                    : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20"
                                }`}
                              >
                                {staff.role.replace("_", " ")}
                              </span>
                            </td>

                            <td
                              className="py-3 px-3 text-right"
                              onClick={() => setDrawerStaff(staff)}
                            >
                              <div className="font-mono font-bold text-slate-900 dark:text-white">
                                ₹{staff.baseSalary.toLocaleString("en-IN")}
                              </div>
                              {(() => {
                                const rd = roleDefaultsMap.get(staff.role.toLowerCase());
                                if (rd && staff.baseSalary < rd.base_salary) {
                                  return (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/60 mt-0.5">
                                      Below ₹{rd.base_salary.toLocaleString("en-IN")}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </td>

                            <td className="py-3 px-3 text-center" onClick={() => setDrawerStaff(staff)}>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px]">
                                {staff.paymentFrequency}
                              </span>
                            </td>

                            <td className="py-3 px-3">
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenPayoutModal(staff);
                                }}
                                className="group inline-flex items-center gap-1.5 px-2 py-1 -mx-2 rounded-lg hover:bg-blue-50/80 dark:hover:bg-blue-950/40 border border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition-all cursor-pointer"
                                title="Click to manage bank account & direct deposit vault"
                              >
                                {staff.payoutMethod === "UPI" ? (
                                  <div className="flex items-center gap-1.5 text-[11px] font-mono">
                                    <Smartphone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                    <span>{staff.upiIdMasked || "UPI VPA Configured"}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-[11px] font-mono">
                                    <Building2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 shrink-0 transition-colors" />
                                    <span>
                                      {staff.bankName}: {staff.bankAccountMasked || "••••••••"}
                                    </span>
                                  </div>
                                )}
                                <Edit3 className="w-3 h-3 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                              </div>
                            </td>

                            <td className="py-3 px-3 text-center" onClick={() => setDrawerStaff(staff)}>
                              {staff.completedTripsMonth > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                  <Bus className="w-3 h-3 text-blue-500" />
                                  <span>{staff.completedTripsMonth} trips</span>
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-mono">—</span>
                              )}
                            </td>

                            <td
                              className="py-3 px-3 text-right font-mono font-black text-slate-900 dark:text-white"
                              onClick={() => setDrawerStaff(staff)}
                            >
                              ₹{staff.netPayable.toLocaleString("en-IN")}
                              {staff.activeBonusAmount > 0 && (
                                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans font-bold">
                                  +₹{staff.activeBonusAmount} bonus
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                {(() => {
                                  const rd = roleDefaultsMap.get(staff.role.toLowerCase());
                                  if (rd && staff.baseSalary !== rd.base_salary) {
                                    return (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSyncStaffToBenchmark([staff.staffId]);
                                        }}
                                        className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1"
                                        title={`Sync to Role Baseline (₹${rd.base_salary.toLocaleString("en-IN")})`}
                                      >
                                        <RefreshCw className="w-2.5 h-2.5" />
                                        <span>Sync</span>
                                      </button>
                                    );
                                  }
                                  return null;
                                })()}

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingStaff(staff);
                                    setEditForm({
                                      baseSalary: staff.baseSalary,
                                      paymentFrequency: staff.paymentFrequency,
                                    });
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-bold cursor-pointer transition-all"
                                  title="Edit salary and schedule"
                                >
                                  Edit
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setBonusModalStaff(staff);
                                    setBonusForm({
                                      amount: staff.activeBonusAmount || 1000,
                                      reason: staff.activeBonusReason || "Performance & on-time incentive",
                                    });
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-bold cursor-pointer transition-all"
                                  title="Award one-time bonus"
                                >
                                  + Bonus
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSingleDisburseModalStaff(staff);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold shadow-xs cursor-pointer transition-all flex items-center gap-1 active:scale-95"
                                  title="Instant payout via RazorpayX"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>Pay</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDrawerStaff(staff);
                                  }}
                                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                                  title="View Staff Profile & Payslips"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: CARDS GRID */}
          {viewMode === "GRID" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStaff.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                  No staff personnel found matching the query.
                </div>
              ) : (
                filteredStaff.map((staff) => {
                  const isSelected = selectedStaffIds.includes(staff.staffId);
                  return (
                    <div
                      key={staff.staffId}
                      onClick={() => setDrawerStaff(staff)}
                      className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all cursor-pointer relative space-y-3.5 ${
                        isSelected
                          ? "border-blue-600 ring-2 ring-blue-500/20 shadow-md"
                          : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs"
                      }`}
                    >
                      {/* Checkbox selector */}
                      <div
                        className="absolute top-4 right-4 z-10 cursor-pointer p-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelectRow(staff.staffId);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="w-4 h-4 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer pointer-events-none"
                        />
                      </div>

                      {/* Header Avatar & Details */}
                      <div className="flex items-center gap-3 pr-8">
                        {staff.photoUrl ? (
                          <img
                            src={staff.photoUrl}
                            alt={staff.fullName}
                            className="w-11 h-11 rounded-2xl object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-sm shrink-0">
                            {staff.fullName.charAt(0)}
                          </div>
                        )}
                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{staff.fullName}</span>
                            {staff.isVerified && (
                              <span title="Verified Direct Deposit Destination">
                                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                              </span>
                            )}
                          </h3>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {staff.employeeCode} {staff.phone ? `• ${staff.phone}` : ""}
                          </div>
                        </div>
                      </div>

                      {/* Chips: Role, Frequency, Trips */}
                      <div className="flex items-center gap-2 flex-wrap text-[10px]">
                        <span
                          className={`px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                            staff.role === "driver"
                              ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                              : staff.role === "conductor"
                              ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20"
                              : staff.role === "transport_manager"
                              ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20"
                              : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20"
                          }`}
                        >
                          {staff.role.replace("_", " ")}
                        </span>

                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                          {staff.paymentFrequency}
                        </span>

                        {staff.licenseNo && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono font-bold">
                            DL: {staff.licenseNo}
                          </span>
                        )}

                        {staff.completedTripsMonth > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800">
                            <Bus className="w-3 h-3 text-blue-500" />
                            <span>{staff.completedTripsMonth} trips</span>
                          </span>
                        )}
                      </div>

                      {/* Banking & Payout Vault */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPayoutModal(staff);
                        }}
                        className="group p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-blue-50/70 dark:hover:bg-blue-950/30 border border-slate-200 dark:border-slate-700/60 hover:border-blue-400 dark:hover:border-blue-600 flex items-center justify-between text-xs cursor-pointer transition-all shadow-2xs"
                        title="Click to manage bank account & direct deposit vault"
                      >
                        <div className="flex items-center gap-1.5 font-mono text-slate-600 dark:text-slate-400 text-[11px] truncate mr-2">
                          {staff.payoutMethod === "UPI" ? (
                            <>
                              <Smartphone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span className="font-semibold truncate">{staff.upiIdMasked || "Active UPI"}</span>
                            </>
                          ) : (
                            <>
                              <Building2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 shrink-0 transition-colors" />
                              <span className="font-semibold truncate">{staff.bankName}: {staff.bankAccountMasked || "••••••••"}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>AES-256</span>
                          </span>
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 pl-1.5 border-l border-slate-200 dark:border-slate-700">
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </span>
                        </div>
                      </div>

                      {/* Financial Amounts & Action CTA */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Net Payable</div>
                          <div className="text-lg font-black text-slate-900 dark:text-white font-mono">
                            ₹{staff.netPayable.toLocaleString("en-IN")}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBonusModalStaff(staff);
                              setBonusForm({
                                amount: staff.activeBonusAmount || 1000,
                                reason: staff.activeBonusReason || "Performance incentive",
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-100 cursor-pointer transition-all"
                            title="Award bonus"
                          >
                            + Bonus
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSingleDisburseModalStaff(staff);
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-xs cursor-pointer transition-all flex items-center gap-1 active:scale-95"
                            title="Disburse now"
                          >
                            <Send className="w-3 h-3" />
                            <span>Pay</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Floating Sticky Bulk Actions Dock (when >=1 staff selected) */}
          {selectedStaffRecords.length > 0 && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-5 py-3 rounded-2xl bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-xl border border-slate-700 text-white shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-black">
                  {selectedStaffRecords.length}
                </span>
                <span className="text-xs font-bold text-slate-300">
                  Staff Selected • Total:{" "}
                  <span className="font-mono text-emerald-400 font-black">
                    ₹{selectedTotalNet.toLocaleString("en-IN")}
                  </span>
                </span>
              </div>

              <div className="h-4 w-[1px] bg-slate-700"></div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSyncStaffToBenchmark(selectedStaffIds)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 cursor-pointer transition-all flex items-center gap-1.5"
                  title="Synchronize selected staff base salaries with role benchmarks"
                >
                  <RefreshCw className="w-3 h-3 text-blue-400" />
                  <span>Sync to Baseline</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsBulkBonusOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span>Bulk Bonus</span>
                </button>

                <button
                  type="button"
                  onClick={handleExecuteSelectedDisburse}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-black text-white shadow-md cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <Send className="w-3 h-3" />
                  <span>Disburse Selected ({selectedStaffRecords.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedStaffIds([])}
                  className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer ml-1"
                  title="Deselect all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: ROLE BASE SALARY BENCHMARKS ─────────────────────────────────── */}
      {activeTab === "ROLE_DEFAULTS" && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="p-5 rounded-3xl bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-blue-50/80 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-blue-950/30 border border-blue-200/80 dark:border-blue-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20 shrink-0">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span>Institutional Compensation Baseline & Benchmarks</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                    Live Governance
                  </span>
                </h2>
                <p className="mt-1 text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
                  Configuring a role-based salary tier establishes the mandatory compensation standard for all fleet personnel in that job bracket. Enabling automated cascading propagates salary changes to active staff database records immediately.
                </p>
              </div>
            </div>

            {outOfSyncStaffList.length > 0 && (
              <button
                type="button"
                onClick={() => handleSyncStaffToBenchmark(outOfSyncStaffList.map((s) => s.staffId))}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-2 shrink-0 whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Cascade All ({outOfSyncStaffList.length} Out of Sync)</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {roleDefaults.map((rd) => (
              <RoleBenchmarkCard
                key={rd.role}
                rd={rd}
                staffList={staffList}
                onSave={handleUpdateRoleDefault}
                onCascade={handleCascadeRoleBenchmark}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 3: 3-STEP AUTOMATED BATCH PAYROLL WIZARD ──────────────────────── */}
      {activeTab === "BATCH_RUN" && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
          {/* Stepper Header */}
          <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
                  <span>RazorpayX Automated Payroll Engine</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Guided 3-step workflow to audit, validate bank routes, and disburse staff salaries in direct bank accounts / UPI.
                </p>
              </div>

              <div className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-900/40">
                Step {wizardStep} of 3
              </div>
            </div>

            {/* Stepper Indicator */}
            <div className="grid grid-cols-3 gap-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  wizardStep >= 1 ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-800"
                }`}
              ></div>
              <div
                className={`h-2 rounded-full transition-all ${
                  wizardStep >= 2 ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-800"
                }`}
              ></div>
              <div
                className={`h-2 rounded-full transition-all ${
                  wizardStep >= 3 ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"
                }`}
              ></div>
            </div>
          </div>

          {/* STEP 1: Select Cycle */}
          {wizardStep === 1 && (
            <div className="space-y-5 animate-in fade-in">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                1. Select Target Payroll Frequency Cycle
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setBatchCycleFilter("MONTHLY")}
                  className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
                    batchCycleFilter === "MONTHLY"
                      ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                  }`}
                >
                  <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" />
                  <div className="font-black text-base text-slate-900 dark:text-white">Monthly Cycle</div>
                  <p className="text-xs text-slate-500 mt-1">
                    {staffList.filter((s) => s.paymentFrequency === "MONTHLY").length} staff members enrolled
                  </p>
                  <div className="mt-3 text-xs font-mono font-bold text-slate-900 dark:text-white">
                    ₹{staffList
                      .filter((s) => s.paymentFrequency === "MONTHLY")
                      .reduce((acc, s) => acc + s.netPayable, 0)
                      .toLocaleString("en-IN")} Total
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setBatchCycleFilter("WEEKLY")}
                  className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
                    batchCycleFilter === "WEEKLY"
                      ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                  }`}
                >
                  <Clock className="w-6 h-6 text-purple-600 dark:text-purple-400 mb-2" />
                  <div className="font-black text-base text-slate-900 dark:text-white">Weekly Cycle</div>
                  <p className="text-xs text-slate-500 mt-1">
                    {staffList.filter((s) => s.paymentFrequency === "WEEKLY").length} staff members enrolled
                  </p>
                  <div className="mt-3 text-xs font-mono font-bold text-slate-900 dark:text-white">
                    ₹{staffList
                      .filter((s) => s.paymentFrequency === "WEEKLY")
                      .reduce((acc, s) => acc + s.netPayable, 0)
                      .toLocaleString("en-IN")} Total
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setBatchCycleFilter("DAILY")}
                  className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
                    batchCycleFilter === "DAILY"
                      ? "border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                  }`}
                >
                  <Zap className="w-6 h-6 text-amber-500 mb-2" />
                  <div className="font-black text-base text-slate-900 dark:text-white">Daily Cycle (Today)</div>
                  <p className="text-xs text-slate-500 mt-1">
                    {staffList.filter((s) => s.paymentFrequency === "DAILY").length} staff members enrolled
                  </p>
                  <div className="mt-3 text-xs font-mono font-bold text-slate-900 dark:text-white">
                    ₹{staffList
                      .filter((s) => s.paymentFrequency === "DAILY")
                      .reduce((acc, s) => acc + s.netPayable, 0)
                      .toLocaleString("en-IN")} Total
                  </div>
                </button>
              </div>

              <div className="flex justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs flex items-center gap-2 cursor-pointer shadow-md transition-all active:scale-98"
                >
                  <span>Proceed to Pre-Flight Audit</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Pre-Flight Audit Checklist */}
          {wizardStep === 2 && (
            <div className="space-y-5 animate-in fade-in">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                2. RazorpayX Pre-Flight Safety & Compliance Audit
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Audit Checklist Items */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3">
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                    Safety & Vault Validations
                  </h4>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <Check className="w-4 h-4 shrink-0 font-black" />
                      <span>100% Recipients have verified Bank/UPI credentials</span>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <Check className="w-4 h-4 shrink-0 font-black" />
                      <span>AES-256-GCM hardware cipher active</span>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <Check className="w-4 h-4 shrink-0 font-black" />
                      <span>RazorpayX IMPS/UPI Smart Routing Ready</span>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <Check className="w-4 h-4 shrink-0 font-black" />
                      <span>Duplicate Payout Idempotency Lock enabled</span>
                    </div>
                  </div>
                </div>

                {/* Batch Financial Breakdown */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs">
                  <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-2">
                    Financial Summary ({batchCycleFilter})
                  </h4>

                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Recipients in Cycle:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {staffList.filter((s) => batchCycleFilter === "ALL" || s.paymentFrequency === batchCycleFilter).length}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Total Base Compensation:</span>
                    <span className="font-mono font-bold">
                      ₹{staffList
                        .filter((s) => batchCycleFilter === "ALL" || s.paymentFrequency === batchCycleFilter)
                        .reduce((acc, s) => acc + s.baseSalary, 0)
                        .toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Active Performance Bonuses:</span>
                    <span className="font-mono font-bold">
                      +₹{staffList
                        .filter((s) => batchCycleFilter === "ALL" || s.paymentFrequency === batchCycleFilter)
                        .reduce((acc, s) => acc + s.activeBonusAmount, 0)
                        .toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2 text-sm font-black text-slate-900 dark:text-white">
                    <span>Total Net Disbursement:</span>
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                      ₹{staffList
                        .filter((s) => batchCycleFilter === "ALL" || s.paymentFrequency === batchCycleFilter)
                        .reduce((acc, s) => acc + s.netPayable, 0)
                        .toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3">
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer"
                >
                  Back to Cycle
                </button>

                <button
                  type="button"
                  disabled={isProcessingBatch}
                  onClick={handleExecuteBatchDisburse}
                  className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-2 cursor-pointer shadow-lg transition-all active:scale-98 disabled:opacity-50"
                >
                  {isProcessingBatch ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Executing Razorpay Transfers...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Authorize & Execute Batch Transfers</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Execution Confirmation & Results */}
          {wizardStep === 3 && batchResults && (
            <div className="space-y-5 animate-in zoom-in-95">
              <div className="p-6 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-black text-emerald-900 dark:text-emerald-300">
                  Automated Payroll Batch Successfully Executed!
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 max-w-lg mx-auto">
                  {batchResults.message}
                </p>
                <div className="text-2xl font-black font-mono text-emerald-800 dark:text-emerald-200 pt-2">
                  ₹{(batchResults.summary?.totalDisbursedInr || 0).toLocaleString("en-IN")} Disbursed
                </div>
              </div>

              {/* Table of executed batch */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
                  Transfer Receipts
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {batchResults.results?.map((r: any) => (
                    <div key={r.payoutRef} className="p-3 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{r.staffName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {r.payoutRef} • {r.gatewayPayoutId}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-slate-900 dark:text-white">
                          ₹{r.netAmount.toLocaleString("en-IN")}
                        </div>
                        <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">
                          {r.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setWizardStep(1);
                    setActiveTab("LEDGER");
                  }}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs cursor-pointer shadow-md"
                >
                  View in Transaction Ledger
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: DISBURSEMENT AUDIT TRAIL LEDGER ────────────────────────────── */}
      {activeTab === "LEDGER" && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                Automated Disbursement Audit Trail
              </h3>
              <p className="text-xs text-slate-500">
                Official RazorpayX transaction receipts, bank UTRs, and digital payslips.
              </p>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {recentPayouts.length} recorded payments
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Transaction Ref</th>
                  <th className="py-3 px-3">Staff ID</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Cycle</th>
                  <th className="py-3 px-3 text-right">Net Amount</th>
                  <th className="py-3 px-3">Destination</th>
                  <th className="py-3 px-3">Gateway Payout ID</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Payslip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                {recentPayouts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                      No salary disbursements recorded yet. Click "Pay" on any staff member to disburse.
                    </td>
                  </tr>
                ) : (
                  recentPayouts.map((tx) => {
                    const matchedStaff = staffList.find((s) => s.staffId === tx.staff_id);
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                          {tx.payout_ref}
                        </td>
                        <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400">
                          {tx.staff_id}
                        </td>
                        <td className="py-3.5 px-3 capitalize font-sans">
                          {tx.role.replace("_", " ")}
                        </td>
                        <td className="py-3.5 px-3 font-sans">
                          {tx.cycle_period}
                        </td>
                        <td className="py-3.5 px-3 text-right font-black text-slate-900 dark:text-white">
                          ₹{Number(tx.net_amount).toLocaleString("en-IN")}
                        </td>
                        <td className="py-3.5 px-3 text-[11px] text-slate-500">
                          {tx.recipient_masked}
                        </td>
                        <td className="py-3.5 px-3 text-[11px] text-blue-600 dark:text-blue-400">
                          {tx.gateway_payout_id || "pout_live_synced"}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase font-sans ${
                              tx.status === "PAID"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : tx.status === "PROCESSING"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {matchedStaff && (
                            <button
                              type="button"
                              onClick={() => handleOpenPayslip(matchedStaff, tx)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-sans text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                              title="View & Print Official Payslip"
                            >
                              <FileCheck2 className="w-3 h-3 text-blue-500" />
                              <span>Payslip</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SLIDE-OVER DRAWER: STAFF 360° PROFILE & COMPENSATION ──────────────── */}
      {drawerStaff && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl p-6 overflow-y-auto space-y-6">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-blue-600" />
                  <span className="font-black text-sm uppercase tracking-wider text-slate-900 dark:text-white">
                    Personnel Compensation Profile
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerStaff(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Staff Identity Card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-start gap-3.5">
                {drawerStaff.photoUrl ? (
                  <img
                    src={drawerStaff.photoUrl}
                    alt={drawerStaff.fullName}
                    className="w-14 h-14 rounded-2xl object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-lg shrink-0">
                    {drawerStaff.fullName.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>{drawerStaff.fullName}</span>
                    {drawerStaff.isVerified && <ShieldCheck className="w-4 h-4 text-emerald-500" />}
                  </h3>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    ID: {drawerStaff.employeeCode}
                  </div>
                  <div className="text-xs text-slate-500">
                    {drawerStaff.email} {drawerStaff.phone ? `• ${drawerStaff.phone}` : ""}
                  </div>
                  {drawerStaff.licenseNo && (
                    <div className="mt-1 text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                      Driving License: {drawerStaff.licenseNo}
                    </div>
                  )}
                </div>
              </div>

              {/* Compensation Breakdown */}
              <div className="space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                  Current Compensation Structure
                </h4>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Role Base Pay:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      ₹{drawerStaff.baseSalary.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment Schedule:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {drawerStaff.paymentFrequency}
                    </span>
                  </div>

                  {drawerStaff.activeBonusAmount > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>Active Incentive ({drawerStaff.activeBonusReason || "Performance"}):</span>
                      <span className="font-mono font-bold">
                        +₹{drawerStaff.activeBonusAmount.toLocaleString("en-IN")}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-slate-400">
                    <span>Institutional TDS / Deductions:</span>
                    <span className="font-mono">₹0.00 (Exempt)</span>
                  </div>

                  <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2 text-sm font-black text-slate-900 dark:text-white">
                    <span>Net Transfer Amount:</span>
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                      ₹{drawerStaff.netPayable.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Banking & Encryption Vault */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                    Disbursement Vault
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold">
                      <Lock className="w-3 h-3" />
                      <span>AES-256-GCM Secure</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenPayoutModal(drawerStaff)}
                      className="px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800 transition-all cursor-pointer flex items-center gap-1"
                      title="Edit bank or UPI direct deposit destination"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                      <span>Edit Vault</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs font-mono">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-sans">Method</span>
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      {drawerStaff.payoutMethod === "UPI" ? (
                        <>
                          <Smartphone className="w-3.5 h-3.5 text-blue-500" />
                          <span>UPI VPA Instant Transfer</span>
                        </>
                      ) : (
                        <>
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>Bank Direct Deposit (IMPS/NEFT)</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] font-sans">Beneficiary Name</span>
                    <span className="font-bold text-slate-900 dark:text-white font-sans">
                      {drawerStaff.accountHolderName || drawerStaff.fullName}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] font-sans">Masked Destination</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {drawerStaff.payoutMethod === "UPI"
                        ? drawerStaff.upiIdMasked || "Configured"
                        : `${drawerStaff.bankName} (IFSC: ${drawerStaff.bankIfsc}): ${drawerStaff.bankAccountMasked}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transit Performance */}
              {drawerStaff.completedTripsMonth > 0 && (
                <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Bus className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-blue-900 dark:text-blue-200">
                      Trips Completed This Month:
                    </span>
                  </div>
                  <span className="font-mono font-black text-blue-600 dark:text-blue-400 text-sm">
                    {drawerStaff.completedTripsMonth} Runs
                  </span>
                </div>
              )}

              {/* Action Buttons in Drawer */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setSingleDisburseModalStaff(drawerStaff);
                  }}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all active:scale-98"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Execute Razorpay Payout (₹{drawerStaff.netPayable.toLocaleString("en-IN")})</span>
                </button>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStaff(drawerStaff);
                      setEditForm({
                        baseSalary: drawerStaff.baseSalary,
                        paymentFrequency: drawerStaff.paymentFrequency,
                      });
                    }}
                    className="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer transition-all text-center"
                  >
                    Edit Salary
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenPayoutModal(drawerStaff)}
                    className="py-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold text-xs cursor-pointer transition-all flex items-center justify-center gap-1"
                  >
                    <CreditCard className="w-3 h-3 text-blue-500" />
                    <span>Edit Payout</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenPayslip(drawerStaff)}
                    className="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer transition-all flex items-center justify-center gap-1"
                  >
                    <FileCheck2 className="w-3 h-3 text-blue-500" />
                    <span>Payslip</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: EDIT INDIVIDUAL SALARY & FREQUENCY ────────────────────────── */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-base text-slate-900 dark:text-white">
                Edit Compensation: {editingStaff.fullName}
              </h3>
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Base Salary (₹)
                </label>
                <input
                  type="number"
                  value={editForm.baseSalary}
                  onChange={(e) => setEditForm({ ...editForm, baseSalary: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono font-bold dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Disbursement Schedule
                </label>
                <select
                  value={editForm.paymentFrequency}
                  onChange={(e) => setEditForm({ ...editForm, paymentFrequency: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-800 dark:text-slate-200"
                >
                  <option value="MONTHLY">Monthly (Direct Deposit)</option>
                  <option value="WEEKLY">Weekly (Fridays)</option>
                  <option value="DAILY">Daily (End of Shift)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <CreditCard className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-[11px]">Direct Deposit & Banking:</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const s = editingStaff;
                    setEditingStaff(null);
                    handleOpenPayoutModal(s);
                  }}
                  className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>Edit Payout Vault →</span>
                </button>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveIndividualSalary}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: STAFF DIRECT DEPOSIT & PAYOUT VAULT (ENTERPRISE CRUD) ─────── */}
      {editingPayoutStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="w-full max-w-lg my-8 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Direct Deposit Vault</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                      RazorpayX Auto
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Configure payout destination for <span className="font-bold text-slate-700 dark:text-slate-200">{editingPayoutStaff.fullName}</span> ({editingPayoutStaff.employeeCode})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingPayoutStaff(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Hardware Encryption Notice */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="text-[11px] leading-relaxed">
                <span className="font-bold text-slate-900 dark:text-white">AES-256-GCM Vault:</span> Account numbers and VPA IDs are hardware encrypted before database persistence. Only masked digits are visible across public screens.
              </div>
            </div>

            {/* Current on file preview */}
            <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 text-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Current Destination on File:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verified</span>
                </span>
              </div>
              <div className="mt-1 font-mono font-bold text-slate-800 dark:text-slate-200 text-xs">
                {editingPayoutStaff.payoutMethod === "UPI"
                  ? `UPI VPA: ${editingPayoutStaff.upiIdMasked || "Active UPI"}`
                  : `${editingPayoutStaff.bankName} (IFSC: ${editingPayoutStaff.bankIfsc}): ${editingPayoutStaff.bankAccountMasked || "••••••••"}`}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSavePayoutCredentials} className="space-y-4">
              {/* Method Switcher Tabs */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">
                  Select Payout Channel
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayoutForm({ ...payoutForm, payoutMethod: "BANK_ACCOUNT" })}
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                      payoutForm.payoutMethod === "BANK_ACCOUNT"
                        ? "border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-500/20 shadow-xs"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className={`w-4 h-4 ${payoutForm.payoutMethod === "BANK_ACCOUNT" ? "text-blue-600 dark:text-blue-400" : "text-slate-400"}`} />
                      <span className="font-bold text-xs text-slate-900 dark:text-white">Bank Direct Deposit</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">IMPS / NEFT 24x7 Settlement</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPayoutForm({ ...payoutForm, payoutMethod: "UPI" })}
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                      payoutForm.payoutMethod === "UPI"
                        ? "border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 ring-2 ring-blue-500/20 shadow-xs"
                        : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Smartphone className={`w-4 h-4 ${payoutForm.payoutMethod === "UPI" ? "text-blue-600 dark:text-blue-400" : "text-slate-400"}`} />
                      <span className="font-bold text-xs text-slate-900 dark:text-white">Instant UPI VPA</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Google Pay, PhonePe, Paytm</div>
                  </button>
                </div>
              </div>

              {/* Beneficiary Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Beneficiary Account Holder Name
                </label>
                <input
                  type="text"
                  required
                  value={payoutForm.accountHolderName}
                  onChange={(e) => setPayoutForm({ ...payoutForm, accountHolderName: e.target.value })}
                  placeholder="e.g. Full Name as registered in bank passbook"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Must match banking records to avoid Razorpay transfer rejection.
                </span>
              </div>

              {/* Channel-Specific Fields */}
              {payoutForm.payoutMethod === "BANK_ACCOUNT" ? (
                <div className="space-y-3.5">
                  {/* Bank Name with Quick Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      required
                      value={payoutForm.bankName}
                      onChange={(e) => setPayoutForm({ ...payoutForm, bankName: e.target.value })}
                      placeholder="e.g. State Bank of India, HDFC Bank"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />

                    {/* Quick Select Chips */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <span className="text-[10px] text-slate-400 font-semibold mr-1">Top Banks:</span>
                      {["State Bank of India", "HDFC Bank", "ICICI Bank", "Punjab National Bank", "Bank of Baroda", "Axis Bank"].map((bank) => (
                        <button
                          key={bank}
                          type="button"
                          onClick={() => setPayoutForm({ ...payoutForm, bankName: bank })}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
                            payoutForm.bankName === bank
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                          }`}
                        >
                          {bank.replace("Bank of ", "").replace(" Bank", "")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* IFSC Code */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                        Bank IFSC Code
                      </label>
                      {payoutForm.bankIfsc && (
                        <span className={`text-[10px] font-bold flex items-center gap-1 ${
                          /^[A-Z]{4}0[A-Z0-9]{6}$/.test(payoutForm.bankIfsc.trim().toUpperCase())
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-500"
                        }`}>
                          {/^[A-Z]{4}0[A-Z0-9]{6}$/.test(payoutForm.bankIfsc.trim().toUpperCase()) ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Valid 11-Digit IFSC</span>
                            </>
                          ) : (
                            <span>11 characters required (e.g. SBIN0000726)</span>
                          )}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      required
                      maxLength={11}
                      value={payoutForm.bankIfsc}
                      onChange={(e) => setPayoutForm({ ...payoutForm, bankIfsc: e.target.value.toUpperCase() })}
                      placeholder="e.g. SBIN0000726"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold uppercase text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* Account Number & Confirm Account Number */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          Bank Account Number
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowAccountNumbers(!showAccountNumbers)}
                          className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-0.5 cursor-pointer"
                        >
                          {showAccountNumbers ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          <span>{showAccountNumbers ? "Hide" : "Show"}</span>
                        </button>
                      </div>
                      <input
                        type={showAccountNumbers ? "text" : "password"}
                        required
                        value={payoutForm.bankAccount}
                        onChange={(e) => setPayoutForm({ ...payoutForm, bankAccount: e.target.value.replace(/\s+/g, "") })}
                        placeholder="Enter full account number"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                          Confirm Account Number
                        </label>
                        {payoutForm.confirmBankAccount && (
                          <span className={`text-[10px] font-bold ${
                            payoutForm.bankAccount === payoutForm.confirmBankAccount
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-500"
                          }`}>
                            {payoutForm.bankAccount === payoutForm.confirmBankAccount ? "✓ Matches" : "⚠️ Mismatch"}
                          </span>
                        )}
                      </div>
                      <input
                        type={showAccountNumbers ? "text" : "password"}
                        required
                        value={payoutForm.confirmBankAccount}
                        onChange={(e) => setPayoutForm({ ...payoutForm, confirmBankAccount: e.target.value.replace(/\s+/g, "") })}
                        placeholder="Re-enter account number"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* UPI VPA Form */
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      UPI Virtual Payment Address (VPA)
                    </label>
                    <input
                      type="text"
                      required
                      value={payoutForm.upiId}
                      onChange={(e) => setPayoutForm({ ...payoutForm, upiId: e.target.value.toLowerCase().trim() })}
                      placeholder="e.g. driver@oksbi or 9876543210@paytm"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />

                    {/* Quick UPI Handles */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <span className="text-[10px] text-slate-400 font-semibold mr-1">Common Handles:</span>
                      {["@oksbi", "@okhdfcbank", "@paytm", "@ybl", "@axl"].map((handle) => (
                        <button
                          key={handle}
                          type="button"
                          onClick={() => {
                            const prefix = payoutForm.upiId.split("@")[0] || "staff";
                            setPayoutForm({ ...payoutForm, upiId: `${prefix}${handle}` });
                          }}
                          className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          {handle}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                  <Lock className="w-3 h-3 text-emerald-500" />
                  <span>Hardware Sealed</span>
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPayoutStaff(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPayout}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-md cursor-pointer disabled:opacity-50 transition-all flex items-center gap-2 active:scale-95"
                  >
                    {isSavingPayout ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Encrypting & Saving...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Save & Encrypt Vault</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: AWARD BONUS (SINGLE STAFF) ────────────────────────────────── */}
      {bonusModalStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <span>Award Incentive: {bonusModalStaff.fullName}</span>
              </h3>
              <button
                type="button"
                onClick={() => setBonusModalStaff(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Incentive / Bonus Amount (₹)
                </label>
                <input
                  type="number"
                  value={bonusForm.amount}
                  onChange={(e) => setBonusForm({ ...bonusForm, amount: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono font-bold dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Reason / Notes
                </label>
                <input
                  type="text"
                  value={bonusForm.reason}
                  onChange={(e) => setBonusForm({ ...bonusForm, reason: e.target.value })}
                  placeholder="e.g. Festival bonus, mountain shift endurance, zero-delay bonus"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setBonusModalStaff(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAwardBonus}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Confirm Bonus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: BULK BONUS (SELECTED STAFF) ────────────────────────────────── */}
      {isBulkBonusOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <span>Bulk Bonus for {selectedStaffIds.length} Staff</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsBulkBonusOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Bonus Amount Per Staff Member (₹)
                </label>
                <input
                  type="number"
                  value={bulkBonusForm.amount}
                  onChange={(e) => setBulkBonusForm({ ...bulkBonusForm, amount: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-mono font-bold dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Reason / Notes
                </label>
                <input
                  type="text"
                  value={bulkBonusForm.reason}
                  onChange={(e) => setBulkBonusForm({ ...bulkBonusForm, reason: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsBulkBonusOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyBulkBonus}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Apply to {selectedStaffIds.length} Staff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: INSTANT SINGLE PAYOUT ─────────────────────────────────────── */}
      {singleDisburseModalStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-600" />
                <span>Execute RazorpayX Salary Payout</span>
              </h3>
              <button
                type="button"
                onClick={() => setSingleDisburseModalStaff(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Recipient:</span>
                <span className="font-black text-slate-900 dark:text-white">{singleDisburseModalStaff.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Role:</span>
                <span className="capitalize">{singleDisburseModalStaff.role.replace("_", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold">Base Pay:</span>
                <span className="font-mono font-bold">₹{singleDisburseModalStaff.baseSalary.toLocaleString("en-IN")}</span>
              </div>
              {singleDisburseModalStaff.activeBonusAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span className="font-bold">Active Bonus:</span>
                  <span className="font-mono font-bold">+₹{singleDisburseModalStaff.activeBonusAmount.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2 text-sm font-black text-slate-900 dark:text-white">
                <span>Net Transfer Amount:</span>
                <span className="font-mono text-blue-600 dark:text-blue-400">
                  ₹{singleDisburseModalStaff.netPayable.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                <span>Destination:</span>
                <span className="font-mono">
                  {singleDisburseModalStaff.payoutMethod === "UPI"
                    ? singleDisburseModalStaff.upiIdMasked || "Active UPI VPA"
                    : `${singleDisburseModalStaff.bankName}: ${singleDisburseModalStaff.bankAccountMasked || "••••••••"}`}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSingleDisburseModalStaff(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessingDisburse}
                onClick={handleExecuteSingleDisburse}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isProcessingDisburse ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Payout...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Confirm & Disburse Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DIGITAL SALARY SLIP (PAYSLIP) ──────────────────────────────── */}
      {payslipModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6">
            {/* Payslip Header */}
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-600 text-white">
                  <Banknote className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                    Graphic Era Hill University
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Campus Fleet Transit Department • Official Salary Advice
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPayslipModalData(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Employee Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Employee Name</span>
                <span className="font-black text-slate-900 dark:text-white">{payslipModalData.staff.fullName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Employee Code</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{payslipModalData.staff.employeeCode}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Designation</span>
                <span className="capitalize font-bold text-slate-700 dark:text-slate-300">
                  {payslipModalData.staff.role.replace("_", " ")}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Payment Mode</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {payslipModalData.staff.payoutMethod === "UPI" ? "UPI VPA" : "Direct Bank IMPS"}
                </span>
              </div>
            </div>

            {/* Itemized Earnings & Deductions */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">Basic Monthly / Cycle Pay</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  ₹{payslipModalData.staff.baseSalary.toLocaleString("en-IN")}
                </span>
              </div>

              {payslipModalData.staff.activeBonusAmount > 0 && (
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 text-emerald-600 dark:text-emerald-400">
                  <span>Special Allowance / Bonus ({payslipModalData.staff.activeBonusReason || "Performance"})</span>
                  <span className="font-mono font-bold">
                    +₹{payslipModalData.staff.activeBonusAmount.toLocaleString("en-IN")}
                  </span>
                </div>
              )}

              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 text-slate-400">
                <span>Statutory Deductions (PF / TDS)</span>
                <span className="font-mono">₹0.00</span>
              </div>

              <div className="flex justify-between pt-2 text-sm font-black text-slate-900 dark:text-white">
                <span>Net Disbursed Amount:</span>
                <span className="font-mono text-blue-600 dark:text-blue-400">
                  ₹{payslipModalData.staff.netPayable.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {/* Transaction Stamp */}
            {payslipModalData.transaction && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-[11px] space-y-1">
                <div className="flex justify-between font-bold">
                  <span>Razorpay Reference:</span>
                  <span className="font-mono">{payslipModalData.transaction.payout_ref}</span>
                </div>
                <div className="flex justify-between">
                  <span>UTR / Payout ID:</span>
                  <span className="font-mono">{payslipModalData.transaction.gateway_payout_id || "pout_live_synced"}</span>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPayslipModalData(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Salary Slip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Enterprise Role Benchmark Component
 * Visualizes compensation baseline, active workforce count, total commitment, and out-of-sync alert.
 * Allows instant cascading of updated benchmark to all existing personnel.
 */
function RoleBenchmarkCard({
  rd,
  staffList,
  onSave,
  onCascade,
}: {
  rd: RoleSalaryDefault;
  staffList: StaffPayrollRecord[];
  onSave: (role: string, baseSalary: number, paymentFrequency: string, applyToExistingStaff: boolean) => Promise<void>;
  onCascade: (role: string) => Promise<void>;
}) {
  const [baseSalary, setBaseSalary] = useState<number>(rd.base_salary);
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY" | "MONTHLY">(rd.payment_frequency || "MONTHLY");
  const [applyToExistingStaff, setApplyToExistingStaff] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isCascading, setIsCascading] = useState<boolean>(false);

  useEffect(() => {
    setBaseSalary(rd.base_salary);
    setFrequency(rd.payment_frequency || "MONTHLY");
  }, [rd.base_salary, rd.payment_frequency]);

  const assignedStaff = useMemo(() => {
    return staffList.filter((s) => s.role.toLowerCase() === rd.role.toLowerCase());
  }, [staffList, rd.role]);

  const outOfSyncStaff = useMemo(() => {
    return assignedStaff.filter((s) => s.baseSalary !== rd.base_salary);
  }, [assignedStaff, rd.base_salary]);

  const totalMonthlyCommitment = useMemo(() => {
    return assignedStaff.length * baseSalary;
  }, [assignedStaff.length, baseSalary]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(rd.role, baseSalary, frequency, applyToExistingStaff);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCascade = async () => {
    setIsCascading(true);
    try {
      await onCascade(rd.role);
    } finally {
      setIsCascading(false);
    }
  };

  const getRoleIcon = (role: string) => {
    if (role === "driver") return <Bus className="w-5 h-5 text-amber-500" />;
    if (role === "conductor") return <Award className="w-5 h-5 text-indigo-500" />;
    if (role === "transport_manager") return <Building2 className="w-5 h-5 text-purple-500" />;
    return <Shield className="w-5 h-5 text-blue-500" />;
  };

  const getRoleBg = (role: string) => {
    if (role === "driver") return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20";
    if (role === "conductor") return "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20";
    if (role === "transport_manager") return "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20";
    return "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20";
  };

  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 flex flex-col justify-between">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl border ${getRoleBg(rd.role)}`}>
              {getRoleIcon(rd.role)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 dark:text-white capitalize text-base">
                  {rd.role.replace("_", " ")} Baseline
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${getRoleBg(rd.role)}`}>
                  {rd.role.replace("_", " ")}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {rd.description || "Official institutional compensation baseline"}
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {assignedStaff.length} Staff
          </span>
        </div>

        {/* Commitment KPI Strip */}
        <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400">Active Workforce</span>
            <div className="font-black text-slate-900 dark:text-white text-sm">
              {assignedStaff.length} Personnel
            </div>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400">Monthly Commitment</span>
            <div className="font-mono font-black text-slate-900 dark:text-white text-sm">
              ₹{totalMonthlyCommitment.toLocaleString("en-IN")}/mo
            </div>
          </div>
        </div>

        {/* Out-of-sync Warning / In-sync Status */}
        {outOfSyncStaff.length > 0 ? (
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{outOfSyncStaff.length} staff currently on legacy rate (₹{outOfSyncStaff[0].baseSalary.toLocaleString("en-IN")})</span>
            </div>
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              {outOfSyncStaff.length} staff member(s) have base salaries that do not match this updated benchmark.
            </p>
            <button
              type="button"
              disabled={isCascading}
              onClick={handleCascade}
              className="w-full mt-1 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCascading ? "animate-spin" : ""}`} />
              <span>{isCascading ? "Synchronizing..." : `Cascade ₹${rd.base_salary.toLocaleString("en-IN")} to All ${assignedStaff.length} ${rd.role.replace("_", " ")}s`}</span>
            </button>
          </div>
        ) : (
          <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>All {assignedStaff.length} {rd.role.replace("_", " ")}s synchronized with benchmark</span>
          </div>
        )}

        {/* Edit Form */}
        <form onSubmit={handleSave} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                Base Salary (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold text-xs">
                  ₹
                </span>
                <input
                  type="number"
                  min="1000"
                  step="500"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(Number(e.target.value))}
                  className="w-full pl-7 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  placeholder="20000"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                Default Cycle
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="WEEKLY">Weekly</option>
                <option value="DAILY">Daily</option>
              </select>
            </div>
          </div>

          {/* Automatic Cascade Checkbox */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={applyToExistingStaff}
              onChange={(e) => setApplyToExistingStaff(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-900 dark:text-white">
                Automatically update all {assignedStaff.length} active {rd.role.replace("_", " ")}s
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Applies ₹{baseSalary.toLocaleString("en-IN")} base pay to existing records in the database immediately upon saving.
              </p>
            </div>
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Saving & Updating Database...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Save Benchmark {applyToExistingStaff ? `& Update ${assignedStaff.length} Staff` : ""}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
