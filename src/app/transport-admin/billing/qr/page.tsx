import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy UPI QR upload route — deprecated in favor of Razorpay automated payment gateway.
 * Automatically redirects to the Payment Approvals & Reconciliation desk.
 */
export default function StaffBillingQRPage() {
  redirect("/transport-admin/billing/approvals");
}
