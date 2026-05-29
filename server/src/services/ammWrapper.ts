import StellarSdk from "@stellar/stellar-sdk";
import { Config, FeePayerAccount } from "../config";
import { Tenant } from "../models/tenantStore";
import { AppError } from "../errors/AppError";
import { createLogger } from "../utils/logger";
import { processFeeBump } from "../handlers/feeBump";

const logger = createLogger({ component: "amm_wrapper_service" });

export interface AmmSwapParams {
  ammContractId: string;
  userPublicKey: string;
  tokenA: string;
  tokenB: string;
  amount: string;
  minAmountOut: string;
  submit?: boolean;
}

export class AmmWrapperService {
  /**
   * Helper to build an unsigned Soroban swap transaction.
   */
  public buildSwapTransaction(params: AmmSwapParams, config: Config): string {
    try {
      const sourceAccount = new StellarSdk.Account(params.userPublicKey, "0");

      // Construct the Soroban invocation for the AMM contract
      // Calling method "swap(user, tokenA, tokenB, amount, minAmountOut)"
      const op = StellarSdk.Operation.invokeHostFunction({
        func: StellarSdk.xdr.HostFunction.hostFunctionTypeInvokeContract(
          new StellarSdk.xdr.InvokeContractArgs({
            contractAddress: StellarSdk.Address.fromString(params.ammContractId).toScAddress(),
            functionName: "swap",
            args: [
              StellarSdk.nativeToScVal(StellarSdk.Address.fromString(params.userPublicKey)),
              StellarSdk.nativeToScVal(StellarSdk.Address.fromString(params.tokenA)),
              StellarSdk.nativeToScVal(StellarSdk.Address.fromString(params.tokenB)),
              StellarSdk.nativeToScVal(BigInt(params.amount)),
              StellarSdk.nativeToScVal(BigInt(params.minAmountOut)),
            ],
          })
        ),
        auth: [],
      });

      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: config.networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

      return tx.toXDR();
    } catch (error: any) {
      logger.error({ error: error.message }, "Failed to build AMM swap transaction");
      throw new AppError(`Failed to build AMM swap transaction: ${error.message}`, 400, "INVALID_AMM_PARAMS");
    }
  }

  /**
   * Sponsoring (fee-bumping) and optionally submitting a pre-signed swap transaction.
   */
  public async processSponseredSwap(
    xdr: string,
    submit: boolean,
    config: Config,
    tenant: Tenant,
    feePayerAccount: FeePayerAccount
  ) {
    return processFeeBump(xdr, submit, config, tenant, feePayerAccount);
  }
}
