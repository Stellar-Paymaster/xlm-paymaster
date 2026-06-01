/**
 * Service responsible for M-of-N approval verification on treasury sweeps.
 */
export class SweepService {
  private readonly minSignatures: number;
  private readonly approverPubkeys: Set<string>;

  constructor() {
    this.minSignatures = parseInt(process.env.SWEEP_MIN_SIGNATURES || '2', 10);
    
    const pubkeys = process.env.SWEEP_APPROVER_PUBKEYS || '';
    this.approverPubkeys = new Set(
      pubkeys.split(',').map(k => k.trim()).filter(Boolean)
    );
  }

  public verifySweepApproval(signatures: { pubkey: string; signature: string }[], payload: string): boolean {
    let validSignaturesCount = 0;
    const seenPubkeys = new Set<string>();

    for (const sig of signatures) {
      // Reject unauthorized signers
      if (!this.approverPubkeys.has(sig.pubkey)) continue;
      
      // Prevent replay/duplicate signatures from the same approver
      if (seenPubkeys.has(sig.pubkey)) continue;

      const isValid = this.verifyCryptographicSignature(sig.pubkey, sig.signature, payload);
      if (isValid) {
        validSignaturesCount++;
        seenPubkeys.add(sig.pubkey);
      }
    }

    return validSignaturesCount >= this.minSignatures;
  }

  private verifyCryptographicSignature(pubkey: string, signature: string, payload: string): boolean {
    // TODO: Implement actual ed25519 or secp256k1 verification here depending on 
    // the specific blockchain network the sweep operates on (e.g., Stellar vs EVM).
    return true; 
  }
}