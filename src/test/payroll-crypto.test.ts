import { describe, it, expect } from "vitest";
import {
  encryptSensitiveField,
  decryptSensitiveField,
  maskBankAccount,
  maskUpiId,
  isValidIfsc,
  isValidUpiVpa,
} from "../lib/payroll-crypto";

describe("Staff Payroll Cryptography & Masking Security", () => {
  it("encrypts and decrypts bank account numbers with AES-256-GCM integrity", () => {
    const rawAccount = "50100492817263";
    const encrypted = encryptSensitiveField(rawAccount);

    expect(encrypted).not.toEqual(rawAccount);
    expect(encrypted.split(":")).toHaveLength(3); // iv:authTag:ciphertext

    const decrypted = decryptSensitiveField(encrypted);
    expect(decrypted).toBe(rawAccount);
  });

  it("encrypts and decrypts UPI IDs securely", () => {
    const rawUpi = "driver.bhuwan@okhdfcbank";
    const encrypted = encryptSensitiveField(rawUpi);

    expect(encrypted).not.toContain("okhdfcbank");
    const decrypted = decryptSensitiveField(encrypted);
    expect(decrypted).toBe(rawUpi);
  });

  it("masks bank account numbers showing only last 4 digits", () => {
    const masked = maskBankAccount("50100492817263");
    expect(masked.endsWith("7263")).toBe(true);
    expect(masked).toContain("••••");
    expect(masked).not.toContain("5010049281");
  });

  it("masks UPI IDs while preserving the payment handle domain", () => {
    const masked = maskUpiId("conductor.rajesh@paytm");
    expect(masked.endsWith("@paytm")).toBe(true);
    expect(masked.startsWith("c")).toBe(true);
    expect(masked).toContain("••••");
  });

  it("validates valid and invalid IFSC codes correctly", () => {
    expect(isValidIfsc("SBIN0000726")).toBe(true);
    expect(isValidIfsc("HDFC0001234")).toBe(true);
    expect(isValidIfsc("ICIC0000001")).toBe(true);
    expect(isValidIfsc("INVALID_IFSC")).toBe(false);
    expect(isValidIfsc("12345678901")).toBe(false);
  });

  it("validates valid and invalid UPI VPAs correctly", () => {
    expect(isValidUpiVpa("9876543210@paytm")).toBe(true);
    expect(isValidUpiVpa("driver.narayan@oksbi")).toBe(true);
    expect(isValidUpiVpa("conductor_bora@apl")).toBe(true);
    expect(isValidUpiVpa("invalid-upi-without-at")).toBe(false);
    expect(isValidUpiVpa("@empty-username.com")).toBe(false);
  });
});
