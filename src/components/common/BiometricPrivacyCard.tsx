"use client";

import React, { useEffect, useState } from "react";
import { ScanFace, Trash2 } from "lucide-react";

interface Status {
  enrolled: boolean;
  templates: number;
  consentVersion: string | null;
  grantedAt: string | null;
  withdrawnAt: string | null;
  needsReconsent: boolean;
}

/** Student Settings: Face ID status, withdraw consent and delete face data (DPDP Act 2023). */
export function BiometricPrivacyCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/biometrics/consent", { cache: "no-store" });
    if (res.ok) setStatus(await res.json());
  };
  useEffect(() => {
    load();
  }, []);

  const withdraw = async () => {
    if (!confirm("Withdraw Face ID consent and delete your face data? Bus cameras will stop recognising you. You can still board with your pass or RFID card.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/biometrics/consent", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMessage(`Done. Deleted ${data.templatesDeleted} face template(s) and ${data.evidenceDeleted} camera photo(s).`);
      await load();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;
  return (
    <div className="p-5 rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-950 space-y-3">
      <div className="flex items-center gap-2">
        <ScanFace className="w-5 h-5 text-emerald-600" />
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Face ID &amp; privacy</h3>
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        {status.enrolled
          ? `Face ID is active (consent ${status.consentVersion}, given ${status.grantedAt ? new Date(status.grantedAt).toLocaleDateString() : ""}).`
          : status.withdrawnAt
          ? `You withdrew consent on ${new Date(status.withdrawnAt).toLocaleDateString()}. Your face data was deleted.`
          : "Face ID is not set up. You can enable it from onboarding at any time."}
        {status.needsReconsent && " The privacy notice changed — please re-enroll to accept the new version."}
      </p>
      <div className="flex flex-wrap gap-2">
        <a href="/privacy/biometrics" target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-bold">
          Read privacy notice
        </a>
        {status.enrolled && (
          <button type="button" disabled={busy} onClick={withdraw} className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" /> Withdraw consent &amp; delete my face data
          </button>
        )}
      </div>
      {message && <p className="text-xs text-gray-700 dark:text-gray-300">{message}</p>}
    </div>
  );
}
