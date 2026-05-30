import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

export interface MasterKey {
  id: string;
  secret: Buffer;
  createdAt: number;
}

export class KeyRotationService {
  private activeKey: MasterKey | null = null;
  private retiredKeys: Map<string, MasterKey> = new Map();

  constructor(initialKey?: MasterKey, retiredKeys?: MasterKey[]) {
    if (initialKey) {
      this.activeKey = initialKey;
    }
    if (retiredKeys) {
      for (const key of retiredKeys) {
        this.retiredKeys.set(key.id, key);
      }
    }
  }

  public generateKey(): MasterKey {
    return {
      id: randomBytes(16).toString("hex"),
      secret: randomBytes(32), // 256-bit key for AES-256
      createdAt: Date.now(),
    };
  }

  /**
   * Rotates the active master key.
   * The old active key is moved to the retired keys map to allow decrypting legacy data.
   */
  public rotateKey(newKey?: MasterKey): MasterKey {
    if (this.activeKey) {
      this.retiredKeys.set(this.activeKey.id, this.activeKey);
    }
    
    this.activeKey = newKey || this.generateKey();
    return this.activeKey;
  }

  public getActiveKey(): MasterKey {
    if (!this.activeKey) {
      throw new Error("No active master key available.");
    }
    return this.activeKey;
  }

  /**
   * Encrypts plaintext using AES-256-GCM.
   * Prepends the key ID to ensure we know which key to use for decryption later.
   */
  public encrypt(plaintext: string): string {
    const key = this.getActiveKey();
    const iv = randomBytes(12); // Standard IV size for GCM
    const cipher = createCipheriv("aes-256-gcm", key.secret, iv);
    
    let ciphertext = cipher.update(plaintext, "utf8", "base64");
    ciphertext += cipher.final("base64");
    const authTag = cipher.getAuthTag().toString("base64");

    // Format: version:iv:authTag:ciphertext
    return `${key.id}:${iv.toString("base64")}:${authTag}:${ciphertext}`;
  }

  /**
   * Decrypts ciphertext by matching the prepended key ID with active/retired keys.
   */
  public decrypt(encryptedData: string): string {
    const parts = encryptedData.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted data format.");
    }

    const [keyId, ivBase64, authTagBase64, ciphertext] = parts;
    
    const keyToUse = this.activeKey?.id === keyId ? this.activeKey : this.retiredKeys.get(keyId);
    
    if (!keyToUse) {
      throw new Error(`Key with ID ${keyId} not found. Cannot decrypt.`);
    }

    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");
    
    const decipher = createDecipheriv("aes-256-gcm", keyToUse.secret, iv);
    decipher.setAuthTag(authTag);
    
    let plaintext = decipher.update(ciphertext, "base64", "utf8");
    plaintext += decipher.final("utf8");
    
    return plaintext;
  }
}