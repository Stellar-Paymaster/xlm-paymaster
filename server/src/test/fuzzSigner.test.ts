import { describe, it, expect } from 'vitest';
import { nativeSigner } from '../signing/native';
import { Keypair } from '@stellar/stellar-sdk';
import crypto from 'crypto';

// Implement Fuzz testing the signer logic in the server package
describe('Fuzz Testing the Signer (TypeScript Wrapper)', () => {
  it('should handle randomly generated payloads without crashing', async () => {
    const keypair = Keypair.random();
    const secret = keypair.secret();
    
    let crashCount = 0;
    const fuzzIterations = 1000;

    for (let i = 0; i < fuzzIterations; i++) {
      // Generate payloads of random length from 0 to 4096 bytes
      const randomLength = Math.floor(Math.random() * 4096);
      const payload = crypto.randomBytes(randomLength);

      try {
        const signature = await nativeSigner.signPayload(secret, payload);
        expect(signature).toBeDefined();
        expect(signature.length).toBeGreaterThan(0);
      } catch (error: any) {
        // If it throws gracefully, it's not a crash
        // Crash is when the node process dies or segmentation fault occurs
        if (!error.message) {
          crashCount++;
        }
      }
    }

    expect(crashCount).toBe(0);
  });

  it('should handle malformed secrets without crashing', async () => {
    const fuzzIterations = 100;
    const payload = Buffer.from('test payload');
    let handledCount = 0;

    for (let i = 0; i < fuzzIterations; i++) {
      const malformedSecret = crypto.randomBytes(56).toString('base64');
      try {
        await nativeSigner.signPayload(malformedSecret, payload);
      } catch (error: any) {
        expect(error).toBeDefined();
        handledCount++;
      }
    }
    
    expect(handledCount).toBe(fuzzIterations);
  });
});
