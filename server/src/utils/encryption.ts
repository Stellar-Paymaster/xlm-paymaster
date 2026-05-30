import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function getEncryptionKey(): Buffer {
  const keyBase64 = process.env.DATABASE_ENCRYPTION_KEY;
  
  if (!keyBase64) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_ENCRYPTION_KEY environment variable is required in production");
    }
    // Fallback static key for local development
    return Buffer.alloc(32, "dev-encryption-key-000000000000");
  }
  
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("DATABASE_ENCRYPTION_KEY must be exactly 32 bytes (256 bits) when decoded");
  }
  return key;
}

export function encrypt(text: string): string {
  if (!text) return text;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  
  const authTag = cipher.getAuthTag().toString("base64");
  
  return `enc:v1:${iv.toString("base64")}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText || !encryptedText.startsWith("enc:v1:")) {
    return encryptedText; // Return as-is if unencrypted (facilitates smooth migration)
  }
  
  const parts = encryptedText.split(":");
  if (parts.length !== 5) throw new Error("Invalid encrypted text format");
  
  const [, , ivBase64, authTagBase64, encryptedBase64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));
  
  let decrypted = decipher.update(encryptedBase64, "base64", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}