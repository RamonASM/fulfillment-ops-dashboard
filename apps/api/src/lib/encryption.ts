/**
 * =============================================================================
 * ENCRYPTION UTILITY
 * =============================================================================
 *
 * AES-256-GCM encryption for sensitive data like API keys.
 * Uses ENCRYPTION_KEY environment variable (32-byte hex string).
 *
 * Generate a key with: openssl rand -hex 32
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment.
 * Throws if not configured.
 */
function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required for API key encryption. " +
        "Generate one with: openssl rand -hex 32",
    );
  }

  if (keyHex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        "Generate one with: openssl rand -hex 32",
    );
  }

  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypt a plaintext string.
 *
 * @param plaintext - The string to encrypt
 * @returns Base64-encoded ciphertext (iv + authTag + encrypted)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Combine: iv (16 bytes) + authTag (16 bytes) + encrypted data
  const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, "hex")]);

  return combined.toString("base64");
}

/**
 * Decrypt a ciphertext string.
 *
 * @param ciphertext - Base64-encoded ciphertext from encrypt()
 * @returns The original plaintext string
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const combined = Buffer.from(ciphertext, "base64");

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted.toString("hex"), "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Check if encryption is configured (ENCRYPTION_KEY is set).
 */
export function isEncryptionConfigured(): boolean {
  const keyHex = process.env.ENCRYPTION_KEY;
  return !!keyHex && keyHex.length === 64;
}

/**
 * Mask an API key for display (show only last 4 characters).
 * Example: "sk-ant-api03-xxx...xxx" -> "sk-ant-***...1234"
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) {
    return "***";
  }

  const prefix = apiKey.substring(0, 7); // "sk-ant-"
  const suffix = apiKey.substring(apiKey.length - 4);
  return `${prefix}***...${suffix}`;
}
