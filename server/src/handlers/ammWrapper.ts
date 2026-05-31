import { Request, Response, NextFunction } from "express";
import { AmmSwapSchema } from "../schemas/ammWrapper";
import { AmmWrapperService } from "../services/ammWrapper";
import { AppError } from "../errors/AppError";
import { ApiKeyConfig } from "../middleware/apiKeys";
import { syncTenantFromApiKey } from "../models/tenantStore";
import { pickFeePayerAccount, Config } from "../config";

const ammWrapperService = new AmmWrapperService();

export async function ammSwapHandler(
  req: Request,
  res: Response,
  next: NextFunction,
  config: Config
) {
  try {
    const result = AmmSwapSchema.safeParse(req.body);
    if (!result.success) {
      return next(
        new AppError(
          `Validation failed: ${JSON.stringify(result.error.format())}`,
          400,
          "INVALID_PARAMS"
        )
      );
    }

    const { xdr, ammContractId, userPublicKey, tokenA, tokenB, amount, minAmountOut, submit } = result.data;

    // Get tenant context
    const apiKeyConfig = res.locals.apiKey as ApiKeyConfig | undefined;
    if (!apiKeyConfig) {
      res.status(500).json({ error: "Missing tenant context for fee sponsorship" });
      return;
    }
    const tenant = syncTenantFromApiKey(apiKeyConfig);
    const feePayerAccount = pickFeePayerAccount(config);

    if (xdr) {
      // Sponsoring a pre-signed swap transaction
      const response = await ammWrapperService.processSponseredSwap(
        xdr,
        submit ?? false,
        config,
        tenant,
        feePayerAccount
      );
      res.json(response);
      return;
    }

    if (ammContractId && userPublicKey && tokenA && tokenB && amount && minAmountOut) {
      // Build the unsigned swap transaction XDR so the user can sign it
      const builtXdr = ammWrapperService.buildSwapTransaction(
        {
          ammContractId,
          userPublicKey,
          tokenA,
          tokenB,
          amount,
          minAmountOut,
        },
        config
      );
      res.json({
        xdr: builtXdr,
        status: "ready",
        message: "Unsigned swap transaction built successfully. Sign the XDR and submit it to process the swap.",
      });
      return;
    }

    next(new AppError("Either xdr or complete swap parameters must be provided", 400, "INVALID_PARAMS"));
  } catch (error) {
    next(error);
  }
}
export default ammSwapHandler;
