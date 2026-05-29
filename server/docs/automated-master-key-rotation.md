# Automated Master Key Rotation

**Status:** Implemented
**Scope:** `server/`
**Goal:** Implement zero-downtime key rotation for the core server to ensure high security compliance and robust cryptographic management.

## 1. Overview

The `KeyRotationService` provides a reliable mechanism to manage, rotate, and utilize master encryption keys within the Fluid server. It guarantees zero-downtime by retaining retired keys in memory (or optionally, a database) to decrypt legacy ciphertexts while seamlessly switching to a new active key for future encryption operations.

## 2. Architecture

- **Active Key:** The single, freshly generated key used for all new encryption operations.
- **Retired Keys:** Older keys kept available solely for the decryption of existing legacy data.
- **Ciphertext Format:** `${keyId}:${ivBase64}:${authTagBase64}:${ciphertext}`. 
  By prepending the `keyId` to the ciphertext, the service can instantly map and identify which key to use for decryption, regardless of how many rotations have occurred.

## 3. Security Considerations

- **Algorithm:** Uses `AES-256-GCM`, providing industry-standard confidentiality and authenticity.
- **Initialization Vector (IV):** Generates a random 12-byte IV for every encryption operation to prevent replay and pattern attacks.
- **Zero-Downtime:** The active key can be rotated at any moment without causing decryption failures for in-flight or resting data encrypted with the immediate predecessor key.

## 4. Usage Example

```typescript
import { KeyRotationService } from "./services/keyRotationService";

const service = new KeyRotationService();
service.rotateKey(); // Generates and sets the first active key

// Encrypt sensitive data
const encryptedString = service.encrypt("tenant-database-password");

// Perform a rotation (can be triggered by a CRON job or admin action)
service.rotateKey();

// Old data remains perfectly decryptable
const originalData = service.decrypt(encryptedString);
```