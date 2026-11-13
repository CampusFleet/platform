"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CreditCard, Loader2, Printer, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";

/** Server-built view model from src/app/portal/payments/page.tsx. null means "not set". */
export interface PaymentsData {
  studentId: string | null;
  fullName: string | null;
  isActive: boolean;
  expiry: string | null;
  zoneName: string | null;
  stopName: string | null;
  routeName: string | null;
  fee: number | null;
  paid: number;
  due: number | null;
  history: { id: string; createdAt: string | null; amount: number; status: string; reference: string | null }[];
}

const STATUS_TONE: Record<string, "green" | "red" | "amber"> = { APPROVED: "green", COMPLETED: "green", REJECTED: "red" };

function daysLeft(expiry: string | null): number | null {
  if (!expiry) return null;
  const ms = new Date(expiry).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 86_400_000)) : null;
}

export default function PortalPaymentsView({ data }: { data: PaymentsData }) {
  const [verifying, setVerifying] = useState(false);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Return from Razorpay hosted checkout
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const paymentId = p.get("razorpay_payment_id");
    const linkId = p.get("razorpay_payment_link_id");
    const sig = p.get("razorpay_signature");
    if (!paymentId || !linkId || !sig) return;
    setVerifying(true);
    fetch("/api/payments/razorpay/verify-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_payment_id: paymentId,
        razorpay_payment_link_id: linkId,
        razorpay_payment_link_reference_id: p.get("razorpay_payment_link_reference_id"),
        razorpay_payment_link_status: p.get("razorpay_payment_link_status"),
        razorpay_signature: sig,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        window.history.replaceState({}, document.title, window.location.pathname);
        if (d.success) {
          setNotice({ ok: true, text: "Payment received. Your pass is active." });
          setTimeout(() => window.location.reload(), 1500);
        } else {
          setNotice({ ok: false, text: d.error || "We could not confirm the payment. If money was taken, it will appear here within a few minutes." });
        }
      })
      .catch(() => setNotice({ ok: false, text: "Network error while confirming the payment. Check this page again before paying twice." }))
      .finally(() => setVerifying(false));
  }, []);

  const pay = async () => {
    if (!data.studentId) return;
    setPaying(true);
    setNotice(null);
    try {
      const res = await fetch("/api/payments/razorpay/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: data.studentId, callbackPath: "/portal/payments" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success || !d.short_url) throw new Error(d.error || "Could not start the payment.");
      window.location.href = d.short_url;
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
      setPaying(false);
    }
  };

  const left = daysLeft(data.expiry);
  const expired = data.expiry ? left === 0 : false;

  return (
    <div className="w-full max-w-2xl mx-auto px-3 sm:px-0 py-4 space-y-4 pb-24">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Pass and payments</h1>
          <p className="text-xs text-gray-500 mt-0.5">Semester bus pass, fees and receipts</p>
        </div>
        {data.isActive ? (
          <Badge tone="green" dot>Active{left != null ? ` · ${left} days left` : ""}</Badge>
        ) : expired ? (
          <Badge tone="amber" dot>Expired</Badge>
        ) : (
          <Badge tone="red" dot>Not active</Badge>
        )}
      </div>

      {verifying && (
        <Card className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600 shrink-0" />
          <span className="text-sm">Confirming your payment…</span>
        </Card>
      )}
      {notice && (
        <div className={`p-3 rounded-xl border text-sm flex items-start gap-2 ${notice.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200" : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200"}`} role="status">
          {notice.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{notice.text}</span>
        </div>
      )}

      <Card>
        <CardHeader icon={<ShieldCheck className="w-5 h-5" />} title="Semester pass" subtitle={data.fullName || undefined} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-gray-500">Valid until</dt>
          <dd className="font-semibold text-right">{data.expiry ? formatDate(data.expiry) : "Not set"}</dd>
          <dt className="text-gray-500">Zone</dt>
          <dd className="font-semibold text-right truncate">{data.zoneName || "Not set"}</dd>
          <dt className="text-gray-500">Pickup stop</dt>
          <dd className="font-semibold text-right truncate">{data.stopName || "Not set"}</dd>
          <dt className="text-gray-500">Route</dt>
          <dd className="font-semibold text-right truncate">{data.routeName || "Not set"}</dd>
        </dl>
        {data.isActive && (
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> Print
          </Button>
        )}
      </Card>

      <Card>
        <CardHeader icon={<CreditCard className="w-5 h-5" />} title="Fees" />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-gray-500">Semester fee</dt>
          <dd className="font-semibold text-right">{data.fee != null ? formatCurrency(data.fee) : "Not set"}</dd>
          <dt className="text-gray-500">Paid</dt>
          <dd className="font-semibold text-right">{formatCurrency(data.paid)}</dd>
          <dt className="text-gray-500">Due</dt>
          <dd className="font-black text-right">{data.due != null ? formatCurrency(data.due) : "Not set"}</dd>
        </dl>
        {data.fee == null && <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">Your fee is not set yet. Contact the transport office.</p>}
        {data.due != null && data.due > 0 && (
          <Button block variant="success" className="mt-4" onClick={pay} loading={paying} disabled={!data.studentId || verifying}>
            Pay {formatCurrency(data.due)}
          </Button>
        )}
        {!data.isActive && (
          <Link href="/portal/onboarding" className="block mt-3 text-center text-xs font-bold text-blue-600 dark:text-blue-400">
            Change details or pickup stop
          </Link>
        )}
      </Card>

      <Card>
        <CardHeader title="Payment history" />
        {data.history.length === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-zinc-900">
            {data.history.map((h) => (
              <li key={h.id} className="py-2.5 flex items-center justify-between gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="text-sm font-bold">{formatCurrency(h.amount)}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {h.createdAt ? new Date(h.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Date not set"}
                    {h.reference ? ` · ${h.reference}` : ""}
                  </div>
                </div>
                <Badge tone={STATUS_TONE[h.status] || "amber"}>{h.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
