import { z } from "zod";

export const EvmSettlementSchema = z
  .object({
    chainId: z.number().int().positive(),
    tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "tokenAddress must be a valid EVM address"),
    amount: z.string().regex(/^\d+$/, "amount must be a base-unit integer string"),
    payerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "payerAddress must be a valid EVM address"),
  })
  .strict();

export const FeeBumpSchema = z
  .object({
    chainId: z.enum(["stellar", "evm", "solana"]).default("stellar"),
    xdr: z.string().optional(), // Stellar
    userOp: z.any().optional(), // EVM
    transactionB64: z.string().optional(), // Solana
    submit: z.boolean().optional(),
    token: z.string().optional(),
    maxSlippage: z.number().min(0).max(100).optional(),
    evmSettlement: EvmSettlementSchema.optional(),
  })
  .strict();

export type FeeBumpRequest = z.infer<typeof FeeBumpSchema>;

export const FeeBumpBatchSchema = z.object({
  xdrs: z.array(z.string().min(1)).min(1, "xdrs field is required and must contain at least one string"),
  submit: z.boolean().optional(),
  token: z.string().optional(),
}).strict();

export type FeeBumpBatchRequest = z.infer<typeof FeeBumpBatchSchema>;
