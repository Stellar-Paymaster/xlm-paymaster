import { describe, it, expect } from "vitest";
import { 
  FluidConfigurationError, 
  FluidNetworkError, 
  FluidServerError, 
  FluidNoAvailableServerError,
  FluidWalletError
} from "../src/errors";

describe("Interactive Error Codes", () => {
  it("should generate correct help URLs for standard errors", () => {
    const configErr = new FluidConfigurationError("Invalid config");
    expect(configErr.helpUrl).toBe("https://docs.fluid.dev/errors#configuration");

    const networkErr = new FluidNetworkError("Timeout", "https://node.com");
    expect(networkErr.helpUrl).toBe("https://docs.fluid.dev/errors#network");

    const walletErr = new FluidWalletError("User rejected");
    expect(walletErr.helpUrl).toBe("https://docs.fluid.dev/errors#wallet");
  });

  it("should use server-provided error codes for specific help URLs", () => {
    const serverErr = new FluidServerError("Forbidden", 403, "https://node.com", {
      code: "rate-limit-exceeded"
    });
    expect(serverErr.helpUrl).toBe("https://docs.fluid.dev/errors#rate-limit-exceeded");
    
    const serverErrFallback = new FluidServerError("Internal error", 500, "https://node.com");
    expect(serverErrFallback.helpUrl).toBe("https://docs.fluid.dev/errors#server");
  });

  it("should include help URL in toString()", () => {
    const err = new FluidNoAvailableServerError("All nodes down", "https://node.com");
    const str = err.toString();
    expect(str).toContain("[Docs: https://docs.fluid.dev/errors#no-available-server]");
  });
});
