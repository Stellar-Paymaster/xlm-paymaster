import { z } from "zod";

export const AmmSwapSchema = z
  .object({
    xdr: z.string().optional(),
    ammContractId: z.string().optional(),
    userPublicKey: z.string().optional(),
    tokenA: z.string().optional(),
    tokenB: z.string().optional(),
    amount: z.string().optional(),
    minAmountOut: z.string().optional(),
    submit: z.boolean().optional(),
  })
  .strict();

export type AmmSwapRequest = z.infer<typeof AmmSwapSchema>;
