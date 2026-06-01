import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { networkSimulationMiddleware } from "./networkSimulation";
import { Config } from "../config";

describe("networkSimulationMiddleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction = vi.fn();

  beforeEach(() => {
    mockRequest = {
      url: "/test",
      method: "POST",
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    nextFunction = vi.fn();
    vi.useFakeTimers();
  });

  it("should call next() immediately if simulation is disabled", async () => {
    const config = {
      networkSimulation: {
        enabled: false,
        latencyMs: 1000,
        packetLossRate: 0.5,
      },
    } as Config;

    const middleware = networkSimulationMiddleware(config);
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
  });

  it("should introduce latency if enabled", async () => {
    const config = {
      networkSimulation: {
        enabled: true,
        latencyMs: 500,
        packetLossRate: 0,
      },
    } as Config;

    const middleware = networkSimulationMiddleware(config);
    const promise = middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(nextFunction).not.toHaveBeenCalled();
    
    vi.advanceTimersByTime(500);
    await promise;

    expect(nextFunction).toHaveBeenCalled();
  });

  it("should simulate packet loss if rate is 1.0", async () => {
    const config = {
      networkSimulation: {
        enabled: true,
        latencyMs: 0,
        packetLossRate: 1.0,
      },
    } as Config;

    const middleware = networkSimulationMiddleware(config);
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(nextFunction).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(expect.any(Number));
    expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      code: "NETWORK_ERROR_SIMULATED"
    }));
  });

  it("should not drop requests if packet loss rate is 0", async () => {
    const config = {
      networkSimulation: {
        enabled: true,
        latencyMs: 0,
        packetLossRate: 0,
      },
    } as Config;

    const middleware = networkSimulationMiddleware(config);
    await middleware(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });
});
