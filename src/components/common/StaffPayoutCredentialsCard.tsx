"use client";

import React, { useState, useEffect } from "react";
import {
  Banknote,
  Building2,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  RefreshCw,
  Receipt,
  Calendar,
  Sparkles,
  CreditCard,
  X,
  ExternalLink,
} from "lucide-react";
import { UserRole } from "@/lib/types";

interface StaffPayoutCredentialsCardProps {
  currentUser: any;
  userRole: UserRole;
}

export function StaffPayoutCredentialsCard({
  currentUser,
  userRole,
}: StaffPayoutCredentialsCardProps) {
  // Only render for staff roles
  const isStaffRole = [
    "driver",
    "conductor",
    "transport_manager",
    "transport_admin",
    "admin",
  ].includes(userRole);

  if (!isStaffRole) return null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [payoutMethod, setPayoutMethod] = useState<"BANK_ACCOUNT" | "UPI">("BANK_ACCOUNT");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankName, setBankName] = useState("State Bank of India");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [confirmBankAccount, setConfirmBankAccount] = useState("");
  const [upiId, setUpiId] = useState("");

  const staffId = currentUser?.staffId || currentUser?.id || "";

  const fetchProfile = async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/salary/profile?staffId=${encodeURIComponent(staffId)}&userId=${encodeURIComponent(currentUser?.id || "")}`);
      const data = await res.json();
      if (data.success && data.profile) {
        setProfile(data.profile);
        setPayouts(data.payouts || []);
        setPayoutMethod(data.profile.payoutMethod || "BANK_ACCOUNT");
        setAccountHolderName(data.profile.accountHolderName || data.profile.fullName || currentUser?.fullName || "");
        setBankName(data.profile.bankName || "State Bank of India");
        setBankIfsc(data.profile.bankIfsc || "");
      }
    } catch (err) {
      console.error("Failed to load staff payout credentials:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [staffId]);

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();

    if (payoutMethod === "BANK_ACCOUNT") {
      if (!bankAccount || bankAccount.length < 8) {
        alert("Please enter a valid bank account number (at least 8 digits).");
        return;
      }
      if (bankAccount !== confirmBankAccount) {
        alert("Bank account number and confirmation account number do not match.");
        return;
      }
      if (!bankIfsc || bankIfsc.length !== 11) {
        alert("Please enter a valid 11-character bank IFSC code (e.g. SBIN0000726).");
        return;
      }
    } else {
      if (!upiId || !upiId.includes("@")) {
        alert("Please enter a valid UPI Virtual Payment Address (e.g. yourname@okhdfcbank).");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/staff/salary/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: profile?.staffId || staffId,
          userId: currentUser?.id,
          payoutMethod,
          accountHolderName: accountHolderName.trim() || currentUser?.fullName,
          bankName: bankName.trim(),
          bankIfsc: bankIfsc.trim().toUpperCase(),
          bankAccount: bankAccount.trim(),
          upiId: upiId.trim().toLowerCase(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setToastMessage(data.message);
        setTimeout(() => setToastMessage(null), 4000);
        setIsEditing(false);
        setBankAccount("");
        setConfirmBankAccount("");
        setUpiId("");
        fetchProfile();
      } else {
        alert(data.error || "Failed to update payout credentials.");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-none overflow-hidden space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="p-4 bg-emerald-600 text-white font-bold text-xs flex items-center justify-between">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-white/80 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-6 border-b border-gray-100 dark:border-gray-800/60">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <span>Salary & Automated Direct Deposit Payouts</span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 uppercase tracking-wider">
                Razorpay Automated
              </span>
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Configure your personal Bank Account or UPI VPA to receive scheduled salary and overtime bonuses.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="px-3.5 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-semibold cursor-pointer transition-all"
            >
              Update Banking / UPI
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3.5 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="p-6 pt-0 space-y-6">
        {/* Current Salary Benchmark Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-800 text-xs">
          <div>
            <span className="text-gray-500 block text-[11px] font-bold uppercase tracking-wider">Assigned Base Pay</span>
            <span className="text-lg font-black text-gray-900 dark:text-white font-mono mt-0.5 block">
              ₹{(profile?.baseSalary || 20000).toLocaleString("en-IN")}
            </span>
            <span className="text-[10px] text-gray-400">Institutional benchmark</span>
          </div>

          <div>
            <span className="text-gray-500 block text-[11px] font-bold uppercase tracking-wider">Pay Schedule</span>
            <span className="text-lg font-black text-gray-900 dark:text-white font-mono mt-0.5 block capitalize">
              {profile?.paymentFrequency || "MONTHLY"}
            </span>
            <span className="text-[10px] text-gray-400">Disbursed on scheduled cycle</span>
          </div>

          <div>
            <span className="text-gray-500 block text-[11px] font-bold uppercase tracking-wider">Active Bonus / Incentive</span>
            <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5 block">
              {profile?.activeBonusAmount > 0 ? `+₹${profile.activeBonusAmount.toLocaleString("en-IN")}` : "No pending bonus"}
            </span>
            <span className="text-[10px] text-gray-400">{profile?.activeBonusReason || "Performance incentive"}</span>
          </div>
        </div>

        {/* Existing Masked Credentials Preview */}
        {!isEditing && (
          <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Current Direct Deposit Target
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verified for Automated Razorpay Payouts</span>
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              {profile?.payoutMethod === "UPI" ? (
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 dark:bg-blue-950 text-blue-600">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                      {profile?.upiIdMasked || "Active UPI VPA"}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      Primary Instant UPI Destination • {profile?.accountHolderName}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                      {profile?.bankName || "Commercial Bank"}: {profile?.bankAccountMasked || "••••••••"}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      IFSC: {profile?.bankIfsc || "SBIN0000726"} • {profile?.accountHolderName}
                    </div>
                  </div>
                </div>
              )}

              <div className="text-[11px] text-gray-400 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                <span>Encrypted with AES-256-GCM at rest</span>
              </div>
            </div>
          </div>
        )}

        {/* Edit Form */}
        {isEditing && (
          <form onSubmit={handleSaveCredentials} className="p-5 border border-blue-200 dark:border-blue-900/60 bg-blue-50/20 dark:bg-blue-950/20 space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Select Payout Method:</span>
              <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-700 p-0.5 bg-white dark:bg-gray-900 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPayoutMethod("BANK_ACCOUNT")}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    payoutMethod === "BANK_ACCOUNT" ? "bg-blue-600 text-white shadow-xs" : "text-gray-600 dark:text-gray-400"
                  }`}
                >
                  Bank Account (IMPS/NEFT)
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutMethod("UPI")}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    payoutMethod === "UPI" ? "bg-blue-600 text-white shadow-xs" : "text-gray-600 dark:text-gray-400"
                  }`}
                >
                  UPI VPA (Instant)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Account Holder Name (as in bank records)
              </label>
              <input
                type="text"
                required
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                placeholder="e.g. Narayan Singh Chhilwal"
                className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-xs dark:text-white"
              />
            </div>

            {payoutMethod === "BANK_ACCOUNT" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    required
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. State Bank of India, HDFC Bank"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-xs dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Bank IFSC Code
                  </label>
                  <input
                    type="text"
                    required
                    value={bankIfsc}
                    onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                    placeholder="e.g. SBIN0000726"
                    maxLength={11}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-xs font-mono uppercase dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Bank Account Number
                  </label>
                  <input
                    type="password"
                    required
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    placeholder="Enter full bank account number"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-xs font-mono dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Confirm Account Number
                  </label>
                  <input
                    type="text"
                    required
                    value={confirmBankAccount}
                    onChange={(e) => setConfirmBankAccount(e.target.value)}
                    placeholder="Re-enter bank account number"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-xs font-mono dark:text-white"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  UPI Virtual Payment Address (VPA)
                </label>
                <input
                  type="text"
                  required
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. 9876543210@paytm or username@okhdfcbank"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-xs font-mono dark:text-white"
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-gray-500 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Encrypted with AES-256-GCM. Masked in public UI.</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {saving ? "Encrypting & Saving..." : "Save Credentials"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Recent Payout History */}
        {payouts.length > 0 && (
          <div className="space-y-2 pt-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
              Recent Disbursement History
            </span>

            <div className="divide-y divide-gray-100 dark:divide-gray-800/80 border border-gray-200 dark:border-gray-800">
              {payouts.map((tx: any) => (
                <div key={tx.id} className="p-3 text-xs flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="font-bold font-mono text-gray-900 dark:text-white flex items-center gap-2">
                      <span>{tx.payout_ref}</span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        {tx.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-400">
                      Cycle: {tx.cycle_period} • {tx.recipient_masked}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-black text-sm text-gray-900 dark:text-white">
                      ₹{Number(tx.net_amount).toLocaleString("en-IN")}
                    </span>
                    <span className="block text-[10px] text-gray-400">
                      {tx.paid_at ? new Date(tx.paid_at).toLocaleDateString() : "Processed"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
