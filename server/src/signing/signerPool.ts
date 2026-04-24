import StellarSdk from "@stellar/stellar-sdk";
import { NonceGuard, NonceReplayError } from "./nonceGuard";

export type SignerSelectionStrategy = "least_used" | "round_robin";
type StellarKeypair = ReturnType<typeof StellarSdk.Keypair.fromSecret>;

export interface PoolAccountOptions {
  initialSequenceNumber?: bigint | number | string;
}

export interface SignerPoolOptions {
  lowBalanceThreshold?: bigint | number | string;
  selectionStrategy?: SignerSelectionStrategy;
  nonceGuard?: NonceGuard;
}

export type SignerAccountStatus =
  | "active"
  | "low_balance"
  | "sequence_error"
  | "inactive";

export interface PoolAccountSnapshot {
  active: boolean;
  balance: string | null;
  inFlight: number;
  publicKey: string;
  sequenceNumber: string | null;
  status: SignerAccountStatus;
  totalUses: number;
}

export interface PooledSignerAccount {
  active: boolean;
  balance: bigint | null;
  inFlight: number;
  keypair: StellarKeypair;
  publicKey: string;
  secret: string;
  sequenceNumber: bigint | null;
  status: SignerAccountStatus;
  totalUses: number;
}

export interface SignerLease {
  account: PooledSignerAccount;
  release(): Promise<void>;
  reservedSequenceNumber: bigint | null;
}

class AsyncMutex {
  private locked = false;

  private waiters: Array<() => void> = [];

  async runExclusive<T>(callback: () => T | Promise<T>): Promise<T> {
    await this.acquire();

    try {
      return await callback();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });

    this.locked = true;
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }

    this.locked = false;
  }
}

interface InternalPoolAccount extends PooledSignerAccount {
  index: number;
}

function parseBigIntValue(
  value?: bigint | number | string | null
): bigint | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return BigInt(value);
}

export class SignerPool {
  private readonly accounts: InternalPoolAccount[];

  private readonly lowBalanceThreshold: bigint | null;

  private readonly mutex = new AsyncMutex();

  private roundRobinCursor = 0;

  private readonly selectionStrategy: SignerSelectionStrategy;

  private readonly nonceGuard: NonceGuard | null;

  constructor(
    accounts: Array<{
      initialSequenceNumber?: bigint | number | string;
      keypair: StellarKeypair;
      secret: string;
    }>,
    options: SignerPoolOptions = {}
  ) {
    if (accounts.length === 0) {
      throw new Error("SignerPool requires at least one account");
    }

    this.accounts = accounts.map((account, index) => ({
      active: true,
      balance: null,
      inFlight: 0,
      index,
      keypair: account.keypair,
      publicKey: account.keypair.publicKey(),
      secret: account.secret,
      sequenceNumber: parseBigIntValue(account.initialSequenceNumber),
      status: "active",
      totalUses: 0,
    }));
    this.lowBalanceThreshold = parseBigIntValue(options.lowBalanceThreshold);
    this.selectionStrategy = options.selectionStrategy ?? "least_used";
    this.nonceGuard = options.nonceGuard ?? null;
  }

  static fromSecrets(
    secrets: string[],
    options: SignerPoolOptions & {
      accountOptions?: Record<string, PoolAccountOptions>;
    } = {}
  ): SignerPool {
    return new SignerPool(
      secrets.map((secret) => {
        const keypair = StellarSdk.Keypair.fromSecret(secret);
        const accountOptions = options.accountOptions?.[keypair.publicKey()];

        return {
          initialSequenceNumber: accountOptions?.initialSequenceNumber,
          keypair,
          secret,
        };
      }),
      options
    );
  }

  async addAccount(account: {
    initialSequenceNumber?: bigint | number | string;
    keypair: StellarKeypair;
    secret: string;
  }): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const publicKey = account.keypair.publicKey();
      const existing = this.accounts.find((candidate) => candidate.publicKey === publicKey);
      if (existing) {
        throw new Error(`Signer account already exists: ${publicKey}`);
      }

      this.accounts.push({
        active: true,
        balance: null,
        inFlight: 0,
        index: this.accounts.length,
        keypair: account.keypair,
        publicKey,
        secret: account.secret,
        sequenceNumber: parseBigIntValue(account.initialSequenceNumber),
        status: "active",
        totalUses: 0,
      });
    });
  }

  async removeAccount(publicKey: string): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const index = this.accounts.findIndex((candidate) => candidate.publicKey === publicKey);
      if (index === -1) {
        throw new Error(`Unknown signer account: ${publicKey}`);
      }

      this.accounts.splice(index, 1);
      this.accounts.forEach((account, accountIndex) => {
        account.index = accountIndex;
      });
      if (this.accounts.length === 0) {
        this.roundRobinCursor = 0;
      } else {
        this.roundRobinCursor %= this.accounts.length;
      }
    });
  }

  async acquire(): Promise<SignerLease> {
    return this.mutex.runExclusive(async () => {
      const account = this.selectAccount();
      if (!account) {
        throw new Error("No active signer accounts are available");
      }

      const reservedSequenceNumber = account.sequenceNumber;

      if (this.nonceGuard && reservedSequenceNumber !== null) {
        // Throws NonceReplayError before any state mutates, so the account's
        // sequence, in-flight count, and usage counters stay consistent.
        this.nonceGuard.assertAndRecord(account.publicKey, reservedSequenceNumber);
      }

      if (account.sequenceNumber !== null) {
        account.sequenceNumber += 1n;
      }

      account.inFlight += 1;
      account.totalUses += 1;

      let released = false;

      return {
        account,
        release: async () => {
          if (released) {
            return;
          }

          released = true;
          await this.mutex.runExclusive(async () => {
            account.inFlight = Math.max(0, account.inFlight - 1);
          });
        },
        reservedSequenceNumber,
      };
    });
  }

  async withSigner<T>(
    callback: (lease: SignerLease) => Promise<T> | T
  ): Promise<T> {
    const lease = await this.acquire();

    try {
      return await callback(lease);
    } finally {
      await lease.release();
    }
  }

  async updateBalance(publicKey: string, balance: bigint | number | string): Promise<void> {
    const nextBalance = BigInt(balance);

    await this.mutex.runExclusive(async () => {
      const account = this.accounts.find((candidate) => candidate.publicKey === publicKey);
      if (!account) {
        throw new Error(`Unknown signer account: ${publicKey}`);
      }

      account.balance = nextBalance;

      if (this.lowBalanceThreshold !== null && nextBalance < this.lowBalanceThreshold) {
        account.status = "low_balance";
        account.active = false;
        return;
      }

      account.status = "active";
      account.active = true;
    });
  }

  async updateSequenceNumber(
    publicKey: string,
    sequenceNumber: bigint | number | string | null,
  ): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const account = this.accounts.find((candidate) => candidate.publicKey === publicKey);
      if (!account) {
        throw new Error(`Unknown signer account: ${publicKey}`);
      }

      const nextSequence = parseBigIntValue(sequenceNumber);

      if (this.nonceGuard && nextSequence !== null) {
        // Rewinds below an already-signed nonce would let the next acquire
        // replay — refuse before mutating pool state. We check without
        // recording so the guard's high-water mark advances only when a
        // signing lease actually consumes the nonce.
        const lastSigned = this.nonceGuard.peek(publicKey);
        if (lastSigned !== null && nextSequence <= lastSigned) {
          throw new NonceReplayError(publicKey, nextSequence, lastSigned);
        }
      }

      account.sequenceNumber = nextSequence;
      if (account.status === "sequence_error") {
        if (
          this.lowBalanceThreshold !== null &&
          account.balance !== null &&
          account.balance < this.lowBalanceThreshold
        ) {
          account.status = "low_balance";
          account.active = false;
          return;
        }

        account.status = "active";
        account.active = true;
      }
    });
  }

  async markSequenceError(publicKey: string): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const account = this.accounts.find((candidate) => candidate.publicKey === publicKey);
      if (!account) {
        throw new Error(`Unknown signer account: ${publicKey}`);
      }

      account.status = "sequence_error";
      account.active = false;
    });
  }

  getSnapshot(): PoolAccountSnapshot[] {
    return this.accounts.map((account) => ({
      active: account.active,
      balance: account.balance?.toString() ?? null,
      inFlight: account.inFlight,
      publicKey: account.publicKey,
      sequenceNumber: account.sequenceNumber?.toString() ?? null,
      status: account.status,
      totalUses: account.totalUses,
    }));
  }

  private selectAccount(): InternalPoolAccount | null {
    const activeAccounts = this.accounts.filter((account) => account.active);
    if (activeAccounts.length === 0) {
      return null;
    }

    const minInFlight = Math.min(...activeAccounts.map((account) => account.inFlight));
    const leastBusyAccounts = activeAccounts.filter(
      (account) => account.inFlight === minInFlight
    );

    if (this.selectionStrategy === "round_robin") {
      const sorted = [...leastBusyAccounts].sort((left, right) => left.index - right.index);

      for (let offset = 0; offset < sorted.length; offset += 1) {
        const cursor = (this.roundRobinCursor + offset) % this.accounts.length;
        const nextAccount = sorted.find((account) => account.index === cursor);
        if (nextAccount) {
          this.roundRobinCursor = (cursor + 1) % this.accounts.length;
          return nextAccount;
        }
      }

      return sorted[0] ?? null;
    }

    const sorted = [...leastBusyAccounts].sort((left, right) => {
      if (left.totalUses !== right.totalUses) {
        return left.totalUses - right.totalUses;
      }

      return left.index - right.index;
    });

    return sorted[0] ?? null;
  }
}
