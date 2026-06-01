import { ethers } from "ethers";
import { FeeSponsor, SponsorResponse } from "./base";
import { AppError } from "../errors/AppError";

export interface EvmSponsorParams {
  userOp: any;
  chainId: number;
  entryPoint: string;
  paymasterAddress: string;
  paymasterPrivKey: string;
}

export class EvmFeeSponsor implements FeeSponsor {
  async estimateFee(params: EvmSponsorParams): Promise<bigint> {
    // Standard EIP-4337 gas estimation would go here
    return BigInt(0); 
  }

  async buildSponsoredTx(params: EvmSponsorParams): Promise<SponsorResponse> {
    const { userOp, chainId, entryPoint, paymasterAddress, paymasterPrivKey } = params;

    try {
      const wallet = new ethers.Wallet(paymasterPrivKey);
      
      const packedUserOp = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes", "bytes", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes"],
        [
          userOp.sender,
          userOp.nonce,
          userOp.initCode,
          userOp.callData,
          userOp.callGasLimit,
          userOp.verificationGasLimit,
          userOp.preVerificationGas,
          userOp.maxFeePerGas,
          userOp.maxPriorityFeePerGas,
          userOp.paymasterAndData
        ]
      );

      const userOpHash = ethers.keccak256(packedUserOp);
      const entryPointPacked = ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "address", "uint256"],
        [userOpHash, entryPoint, chainId]
      );
      const finalHash = ethers.keccak256(entryPointPacked);

      const signature = await wallet.signMessage(ethers.getBytes(finalHash));
      
      const sponsoredUserOp = {
        ...userOp,
        paymasterAndData: paymasterAddress + signature.replace("0x", "")
      };

      return {
        tx: JSON.stringify(sponsoredUserOp),
        status: "ready",
        feePayer: paymasterAddress
      };
    } catch (error: any) {
      throw new AppError(`EVM Sponsorship failed: ${error.message}`, 500, "EVM_SPONSOR_FAILED");
    }
  }
}
