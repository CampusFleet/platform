import { describe, it, expect } from "vitest";
import {
  encryptSensitiveField,
  decryptSensitiveField,
  maskBankAccount,
  maskUpiId,
  isValidIfsc,
  isValidUpiVpa,
} from "../lib/payroll-crypto";
import {
  generatePayoutReference,
  executeSalaryPayout,
} from "../lib/razorpay-payouts";

describe("Staff Salary Automation & RazorpayX Payroll Engine", () => {
  describe("Cryptographic Data Security & Masking", () => {
    it("safeguards sensitive bank account numbers with AES-256-GCM authenticated cipher", () => {
      const plain = "91823746501928";
      const encrypted = encryptSensitiveField(plain);
      expect(encrypted).not.toBe(plain);
      expect(encrypted.split(":")).toHaveLength(3);

      const decrypted = decryptSensitiveField(encrypted);
      expect(decrypted).toBe(plain);
    });

    it("safeguards sensitive UPI VPAs with encryption", () => {
      const upi = "driver.bhuwan@oksbi";
      const encrypted = encryptSensitiveField(upi);
      expect(encrypted).not.toContain("bhuwan");

      const decrypted = decryptSensitiveField(encrypted);
      expect(decrypted).toBe(upi);
    });

    it("masks bank account numbers protecting PII in responses", () => {
      const masked = maskBankAccount("12345678901234");
      expect(masked.endsWith("1234")).toBe(true);
      expect(masked).toContain("••••");
      expect(masked).not.toContain("1234567890");
    });

    it("masks UPI VPAs preserving domain for user identification", () => {
      const masked = maskUpiId("conductor.bora@okhdfcbank");
      expect(masked.endsWith("@okhdfcbank")).toBe(true);
      expect(masked).toContain("••••");
    });
  });

  describe("Automated RazorpayX Salary Payouts", () => {
    it("generates deterministic and unique payout references", () => {
      const ref1 = generatePayoutReference("staff-drv-02", "driver");
      const ref2 = generatePayoutReference("staff-cnd-02", "conductor");
      expect(ref1).toMatch(/^PAY-\d{6}-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(ref2).toMatch(/^PAY-\d{6}-[A-Z0-9]+-[A-Z0-9]+$/);
      expect(ref1).not.toBe(ref2);
    });

    it("executes single salary disbursement with base pay and bonus", async () => {
      const payoutResult = await executeSalaryPayout({
        staffId: "staff-drv-02",
        staffName: "Narayan Singh Chhilwal",
        email: "driver.02@gehu.ac.in",
        phone: "+91 6397487199",
        amountInr: 22000,
        bonusAmount: 1500,
        bonusReason: "End of month night shift bonus",
        cyclePeriod: "2026-11",
        destination: {
          method: "BANK_ACCOUNT",
          accountHolderName: "Narayan Singh Chhilwal",
          bankAccount: "50100492817263",
          bankIfsc: "SBIN0000726",
          bankName: "State Bank of India",
        },
      });

      expect(payoutResult.success).toBe(true);
      expect(payoutResult.payoutRef).toBeDefined();
      expect(payoutResult.netAmount).toBe(23500);
      expect(payoutResult.status).toBe("PAID");
      expect(payoutResult.recipientMasked).toContain("••••7263");
    });

    it("executes instant UPI salary disbursement", async () => {
      const payoutResult = await executeSalaryPayout({
        staffId: "staff-cnd-02",
        staffName: "Rajendra Bora",
        email: "helper.02@gehu.ac.in",
        phone: "+91 9012433913",
        amountInr: 18000,
        bonusAmount: 500,
        bonusReason: "On-time departure bonus",
        cyclePeriod: "2026-11",
        destination: {
          method: "UPI",
          accountHolderName: "Rajendra Bora",
          upiId: "rajendra@okaxis",
        },
      });

      expect(payoutResult.success).toBe(true);
      expect(payoutResult.netAmount).toBe(18500);
      expect(payoutResult.recipientMasked).toContain("UPI:");
      expect(payoutResult.recipientMasked).toContain("@okaxis");
      expect(payoutResult.status).toBe("PAID");
    });
  });
});
