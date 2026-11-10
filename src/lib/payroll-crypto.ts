import crypto from "crypto";

/**
 * AES-256-GCM Encryption / Decryption & Masking for Staff Financial Data
 * Strictly compliant with PCI-DSS / RBI Data Security Standards for banking & UPI details.
 */

// Derive a 32-byte (256-bit) encryption key
function getEncryptionKey(): Buffer {
  const secret =
    process.env.PAYROLL_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.JWT_SECRET;

  // No committed fallback key: bank/UPI data must not be encrypted with a public key.
  if (!secret) {
    throw new Error("PAYROLL_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be configured.");
  }

  return crypto.scryptSync(secret, "campusfleet-salt-iv-9821", 32);
}

/**
 * Encrypt sensitive plain text (e.g. Bank Account Number or UPI ID)
 * Returns format: `${ivHex}:${authTagHex}:${cipherHex}`
 */
export function encryptSensitiveField(plainText: string): string {
  if (!plainText || typeof plainText !== "string") return "";
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plainText.trim(), "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt ciphertext previously encrypted with encryptSensitiveField
 */
export function decryptSensitiveField(payload: string): string {
  if (!payload || typeof payload !== "string") return "";
  try {
    const parts = payload.split(":");
    if (parts.length !== 3) {
      // Legacy or unencrypted string fallback if applicable
      return payload;
    }
    const [ivHex, authTagHex, cipherHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Failed to decrypt sensitive payroll field:", err);
    return "";
  }
}

/**
 * Mask a bank account number for display (e.g., "••••••••••••1234")
 */
export function maskBankAccount(accountNumber: string): string {
  if (!accountNumber) return "";
  const clean = accountNumber.replace(/\s+/g, "");
  if (clean.length <= 4) return "••••" + clean;
  const last4 = clean.slice(-4);
  const maskedLength = Math.max(8, clean.length - 4);
  return "•".repeat(maskedLength) + last4;
}

/**
 * Mask a UPI ID for display (e.g., "d•••••r@okhdfcbank" or "9•••••••10@upi")
 */
export function maskUpiId(upiId: string): string {
  if (!upiId) return "";
  const clean = upiId.trim();
  const parts = clean.split("@");
  if (parts.length !== 2) return clean.slice(0, 2) + "••••";

  const [username, handle] = parts;
  if (username.length <= 2) {
    return `${username[0]}•@${handle}`;
  }
  const firstChar = username[0];
  const lastChar = username[username.length - 1];
  const middleMask = "•".repeat(Math.max(4, username.length - 2));
  return `${firstChar}${middleMask}${lastChar}@${handle}`;
}

/**
 * Validate Indian Bank IFSC Code (11 characters: 4 letters, '0', 6 alphanumeric)
 */
export function isValidIfsc(ifsc: string): boolean {
  if (!ifsc) return false;
  const regex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  return regex.test(ifsc.trim().toUpperCase());
}

/**
 * Validate Indian UPI Virtual Payment Address (VPA)
 */
export function isValidUpiVpa(vpa: string): boolean {
  if (!vpa) return false;
  const regex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
  return regex.test(vpa.trim().toLowerCase());
}
