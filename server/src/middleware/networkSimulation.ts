import { NextFunction, Request, Response } from "express";
import { Config } from "../config";
import { createLogger } from "../utils/logger";

const logger = createLogger({ component: "network_simulation_middleware" });

/**
 * Middleware to simulate network latency and packet loss.
 * Useful for testing SDK resilience under poor network conditions.
 */
export function networkSimulationMiddleware(config: Config) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { enabled, latencyMs, packetLossRate } = config.networkSimulation;

    if (!enabled) {
      return next();
    }

    // Simulate packet loss
    if (packetLossRate > 0 && Math.random() < packetLossRate) {
      const errorType = Math.random() > 0.5 ? 503 : 504;
      const errorMsg = errorType === 503 ? "Service Unavailable (Simulated)" : "Gateway Timeout (Simulated)";
      
      logger.warn({ 
        url: req.url, 
        method: req.method, 
        errorType,
        packetLossRate 
      }, "Simulating packet loss");

      return res.status(errorType).json({
        error: errorMsg,
        code: "NETWORK_ERROR_SIMULATED",
      });
    }

    // Simulate latency
    if (latencyMs > 0) {
      logger.debug({ 
        url: req.url, 
        method: req.method, 
        latencyMs 
      }, "Simulating network latency");
      
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }

    next();
  };
}
