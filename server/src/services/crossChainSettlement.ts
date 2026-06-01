import { Config, FeePayerAccount, pickFeePayerAccount } from "../config";
import prisma from "../utils/db";

const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ERC20_TRANSFER_SELECTOR = "a9059cbb";

export interface PendingEvmSettlement {
  transactionId: string;
  tenantId: string;
  xdr: string;
  submit: boolean;
  sourceChainId: number;
  sourceTokenAddress: string;
  sourceAmount: string;
  payerAddress: string;
  recipientAddress: string;
  confirmationsRequired: number;
  feePayerPublicKey: string;
}

export interface ObservedEvmPayment {
  txHash: string;
  blockNumber: number;
  amount: bigint;
}

export interface EvmChainClient {
  getBlockNumber(): Promise<number>;
  findConfirmedPayment(input: {
    tokenAddress: string;
    payerAddress: string;
    recipientAddress: string;
    amount: bigint;
    startBlock: number;
    confirmationsRequired: number;
  }): Promise<ObservedEvmPayment | null>;
  refundToken(input: {
    tokenAddress: string;
    fromAddress: string;
    recipientAddress: string;
    amount: bigint;
  }): Promise<string>;
}

export interface SettlementExecutor {
  execute(input: {
    transactionId: string;
    tenantId: string;
    xdr: string;
    submit: boolean;
    feePayerAccount: FeePayerAccount;
  }): Promise<void>;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function toTopicAddress(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function toHexQuantity(value: bigint | number): string {
  const bigintValue = typeof value === "bigint" ? value : BigInt(value);
  return `0x${bigintValue.toString(16)}`;
}

function encodeErc20Transfer(recipientAddress: string, amount: bigint): string {
  const recipient = recipientAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const encodedAmount = amount.toString(16).padStart(64, "0");
  return `0x${ERC20_TRANSFER_SELECTOR}${recipient}${encodedAmount}`;
}

class JsonRpcEvmChainClient implements EvmChainClient {
  constructor(private readonly rpcUrl: string) {}

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: Date.now(),
        jsonrpc: "2.0",
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`EVM RPC ${method} failed with HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error(payload.error.message || `EVM RPC ${method} failed`);
    }

    return payload.result as T;
  }

  async getBlockNumber(): Promise<number> {
    const result = await this.call<string>("eth_blockNumber", []);
    return Number.parseInt(result, 16);
  }

  async findConfirmedPayment(input: {
    tokenAddress: string;
    payerAddress: string;
    recipientAddress: string;
    amount: bigint;
    startBlock: number;
    confirmationsRequired: number;
  }): Promise<ObservedEvmPayment | null> {
    const latestBlock = await this.getBlockNumber();
    const logs = await this.call<
      Array<{ blockNumber: string; data: string; transactionHash: string }>
    >("eth_getLogs", [
      {
        address: input.tokenAddress,
        fromBlock: toHexQuantity(input.startBlock),
        toBlock: toHexQuantity(latestBlock),
        topics: [
          ERC20_TRANSFER_TOPIC,
          toTopicAddress(input.payerAddress),
          toTopicAddress(input.recipientAddress),
        ],
      },
    ]);

    for (const log of logs) {
      const amount = BigInt(log.data);
      const blockNumber = Number.parseInt(log.blockNumber, 16);
      const confirmations = latestBlock - blockNumber + 1;

      if (amount === input.amount && confirmations >= input.confirmationsRequired) {
        return {
          txHash: log.transactionHash,
          blockNumber,
          amount,
        };
      }
    }

    return null;
  }

  async refundToken(input: {
    tokenAddress: string;
    fromAddress: string;
    recipientAddress: string;
    amount: bigint;
  }): Promise<string> {
    return this.call<string>("eth_sendTransaction", [
      {
        from: input.fromAddress,
        to: input.tokenAddress,
        data: encodeErc20Transfer(input.recipientAddress, input.amount),
        value: "0x0",
      },
    ]);
  }
}

export class CrossChainSettlementService {
  private readonly client: EvmChainClient;
  private readonly executor: SettlementExecutor;
  private poller?: NodeJS.Timeout;
  private pollInFlight = false;

  constructor(
    private readonly config: Config,
    executor: SettlementExecutor,
    client?: EvmChainClient,
  ) {
    if (!config.evmSettlement) {
      throw new Error("EVM settlement is not configured");
    }

    this.executor = executor;
    this.client = client ?? new JsonRpcEvmChainClient(config.evmSettlement.rpcUrl);
  }

  ensureStarted(): void {
    if (this.poller) {
      return;
    }

    this.poller = setInterval(() => {
      void this.processPendingSettlements();
    }, this.config.evmSettlement!.pollIntervalMs);
    this.poller.unref?.();
  }

  stop(): void {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = undefined;
    }
  }

  async enqueuePendingSettlement(input: PendingEvmSettlement): Promise<{
    settlementId: string;
    startBlock: number;
  }> {
    const startBlock = await this.client.getBlockNumber();
    const settlement = await prisma.crossChainSettlement.create({
      data: {
        transactionId: input.transactionId,
        tenantId: input.tenantId,
        sourceChainId: input.sourceChainId,
        sourceTokenAddress: normalizeAddress(input.sourceTokenAddress),
        sourceAmount: input.sourceAmount,
        payerAddress: normalizeAddress(input.payerAddress),
        recipientAddress: normalizeAddress(input.recipientAddress),
        startBlock,
        confirmationsRequired: input.confirmationsRequired,
        xdr: input.xdr,
        submit: input.submit,
        feePayerPublicKey: input.feePayerPublicKey,
      },
    });

    return {
      settlementId: settlement.id,
      startBlock,
    };
  }

  async processPendingSettlements(): Promise<void> {
    if (this.pollInFlight) {
      return;
    }
    this.pollInFlight = true;

    try {
      const pending = await prisma.crossChainSettlement.findMany({
        where: { status: "AWAITING_EVM_PAYMENT" },
        orderBy: { createdAt: "asc" },
        take: 25,
      });

      for (const settlement of pending) {
        await this.processSettlement(settlement);
      }
    } finally {
      this.pollInFlight = false;
    }
  }

  private async processSettlement(settlement: {
    id: string;
    transactionId: string;
    tenantId: string;
    sourceTokenAddress: string;
    sourceAmount: string;
    payerAddress: string;
    recipientAddress: string;
    startBlock: number;
    confirmationsRequired: number;
    xdr: string;
    submit: boolean;
  }): Promise<void> {
    const payment = await this.client.findConfirmedPayment({
      tokenAddress: settlement.sourceTokenAddress,
      payerAddress: settlement.payerAddress,
      recipientAddress: settlement.recipientAddress,
      amount: BigInt(settlement.sourceAmount),
      startBlock: settlement.startBlock,
      confirmationsRequired: settlement.confirmationsRequired,
    });

    if (!payment) {
      return;
    }

    await prisma.crossChainSettlement.update({
      where: { id: settlement.id },
      data: {
        status: "EVM_CONFIRMED",
        sourceTxHash: payment.txHash,
        confirmedAt: new Date(),
      },
    });

    try {
      await this.executor.execute({
        transactionId: settlement.transactionId,
        tenantId: settlement.tenantId,
        xdr: settlement.xdr,
        submit: settlement.submit,
        feePayerAccount: pickFeePayerAccount(this.config),
      });

      await prisma.crossChainSettlement.update({
        where: { id: settlement.id },
        data: {
          status: "STELLAR_SETTLED",
          settledAt: new Date(),
        },
      });
    } catch (error: any) {
      await this.refundSettlement(settlement.id, settlement, error);
    }
  }

  private async refundSettlement(
    settlementId: string,
    settlement: {
      sourceTokenAddress: string;
      sourceAmount: string;
      payerAddress: string;
    },
    cause: Error,
  ): Promise<void> {
    const refundFromAddress =
      this.config.evmSettlement?.refundFromAddress ??
      this.config.evmSettlement?.receiverAddress;

    if (!refundFromAddress) {
      await prisma.crossChainSettlement.update({
        where: { id: settlementId },
        data: {
          status: "REFUND_FAILED",
          errorMessage: `Stellar settlement failed: ${cause.message}. Refund sender is not configured.`,
        },
      });
      return;
    }

    try {
      const refundTxHash = await this.client.refundToken({
        tokenAddress: settlement.sourceTokenAddress,
        fromAddress: refundFromAddress,
        recipientAddress: settlement.payerAddress,
        amount: BigInt(settlement.sourceAmount),
      });

      await prisma.crossChainSettlement.update({
        where: { id: settlementId },
        data: {
          status: "REFUNDED",
          refundTxHash,
          refundedAt: new Date(),
          errorMessage: `Stellar settlement failed: ${cause.message}`,
        },
      });
    } catch (refundError: any) {
      await prisma.crossChainSettlement.update({
        where: { id: settlementId },
        data: {
          status: "REFUND_FAILED",
          errorMessage: `Stellar settlement failed: ${cause.message}. Refund failed: ${refundError.message}`,
        },
      });
    }
  }
}

let serviceInstance: CrossChainSettlementService | undefined;

export function getCrossChainSettlementService(
  config: Config,
  executor: SettlementExecutor,
): CrossChainSettlementService {
  if (!serviceInstance) {
    serviceInstance = new CrossChainSettlementService(config, executor);
  }

  return serviceInstance;
}

export function resetCrossChainSettlementServiceForTests(): void {
  serviceInstance?.stop();
  serviceInstance = undefined;
}
