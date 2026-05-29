import { describe, it, expect, beforeEach } from "vitest";
import { KeyRotationService } from "./keyRotationService";

describe("KeyRotationService", () => {
  let service: KeyRotationService;

  beforeEach(() => {
    service = new KeyRotationService();
    service.rotateKey(); // Initialize with an active key
  });

  it("should encrypt and decrypt using the active key", () => {
    const plaintext = "super secret data";
    const encrypted = service.encrypt(plaintext);
    
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(":")).toHaveLength(4);
    
    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("should support zero-downtime rotation and decrypt old data", () => {
    const plaintext = "data from old key";
    const encryptedOld = service.encrypt(plaintext);
    
    // Rotate the key
    const oldKeyId = service.getActiveKey().id;
    service.rotateKey();
    const newKeyId = service.getActiveKey().id;
    
    expect(oldKeyId).not.toBe(newKeyId);
    
    // Decrypt old data with new active key but old retired key stored internally
    const decryptedOld = service.decrypt(encryptedOld);
    expect(decryptedOld).toBe(plaintext);
    
    // Encrypt new data
    const encryptedNew = service.encrypt("data from new key");
    expect(encryptedNew.startsWith(newKeyId)).toBe(true);
  });

  it("should throw when decrypting with an unknown key id", () => {
    const invalidEncrypted = "unknown-id:ivdata:tagdata:cipherdata";
    expect(() => service.decrypt(invalidEncrypted)).toThrow("Key with ID unknown-id not found");
  });

  it("should throw when trying to encrypt with no active key", () => {
    const emptyService = new KeyRotationService();
    expect(() => emptyService.encrypt("data")).toThrow("No active master key available");
  });
});