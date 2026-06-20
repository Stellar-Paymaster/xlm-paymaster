import { describe, it, expect } from "vitest";
import { 
  PaymasterConfigurationError, 
  PaymasterNetworkError, 
  PaymasterServerError, 
  PaymasterNoAvailableServerError,
  PaymasterWalletError
} from "../src/errors";

describe("Interactive Error Codes", () => {
  it("should generate correct help URLs for standard errors", () => {
    const configErr = new PaymasterConfigurationError("Invalid config");
    expect(configErr.helpUrl).toBe("https://docs.xlm-paymaster.com/errors#configuration");

    const networkErr = new PaymasterNetworkError("Timeout", "https://node.com");
    expect(networkErr.helpUrl).toBe("https://docs.xlm-paymaster.com/errors#network");

    const walletErr = new PaymasterWalletError("User rejected");
    expect(walletErr.helpUrl).toBe("https://docs.xlm-paymaster.com/errors#wallet");
  });

  it("should use server-provided error codes for specific help URLs", () => {
    const serverErr = new PaymasterServerError("Forbidden", 403, "https://node.com", {
      code: "rate-limit-exceeded"
    });
    expect(serverErr.helpUrl).toBe("https://docs.xlm-paymaster.com/errors#rate-limit-exceeded");
    
    const serverErrFallback = new PaymasterServerError("Internal error", 500, "https://node.com");
    expect(serverErrFallback.helpUrl).toBe("https://docs.xlm-paymaster.com/errors#server");
  });

  it("should include help URL in toString()", () => {
    const err = new PaymasterNoAvailableServerError("All nodes down", "https://node.com");
    const str = err.toString();
    expect(str).toContain("[Docs: https://docs.xlm-paymaster.com/errors#no-available-server]");
  });
});
