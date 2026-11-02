import { describe, it, expect } from "vitest";
import {
  generatePayoutReference,
  getOrCreateContact,
  getOrCreateFundAccount,
  executeSalaryPayout,
} from "../lib/razorpay-payouts";

describe("RazorpayX Automated Salary Payouts Service", () => {
  it("generates structured, unique payout reference numbers", () => {
    const ref1 = generatePayoutReference("staff-drv-02", "driver");
    const ref2 = generatePayoutReference("staff-cnd-02", "conductor");

    expect(ref1).toMatch(/^PAY-\d{6}-[A-Z0-9]+-[A-Z0-9]+$/);
    expect(ref2).toMatch(/^PAY-\d{6}-[A-Z0-9]+-[A-Z0-9]+$/);
    expect(ref1).not.toBe(ref2);
  });

  it("handles contact creation with smart fallback", async () => {
    const contactId = await getOrCreateContact({
      id: "staff-drv-02",
      fullName: "Narayan Singh Chhilwal",
      email: "driver.02@gehu.ac.in",
      phone: "+91 6397487199",
    });

    expect(contactId).toBeDefined();
    expect(contactId.length).toBeGreaterThan(5);
  });

  it("links fund accounts for bank accounts and UPI VPAs", async () => {
    const bankFa = await getOrCreateFundAccount("cont_sim_1234", {
      method: "BANK_ACCOUNT",
      accountHolderName: "Narayan Singh",
      bankAccount: "50100492817263",
      bankIfsc: "SBIN0000726",
      bankName: "State Bank of India",
    });

    const upiFa = await getOrCreateFundAccount("cont_sim_1234", {
      method: "UPI",
      accountHolderName: "Narayan Singh",
      upiId: "narayan@oksbi",
    });

    expect(bankFa).toBeDefined();
    expect(upiFa).toBeDefined();
  });

  it("executes salary disbursement returning verified status and transaction ID", async () => {
    const result = await executeSalaryPayout({
      staffId: "staff-drv-02",
      staffName: "Narayan Singh Chhilwal",
      amountInr: 22000,
      bonusAmount: 1500,
      bonusReason: "Mountain corridor overtime allowance",
      cyclePeriod: "2026-11",
      destination: {
        method: "BANK_ACCOUNT",
        accountHolderName: "Narayan Singh Chhilwal",
        bankAccount: "50100492817263",
        bankIfsc: "SBIN0000726",
        bankName: "State Bank of India",
      },
    });

    expect(result.success).toBe(true);
    expect(result.payoutRef).toBeDefined();
    expect(result.netAmount).toBe(23500);
    expect(result.status).toBe("PAID");
    expect(result.gatewayPayoutId).toBeDefined();
  });
});
