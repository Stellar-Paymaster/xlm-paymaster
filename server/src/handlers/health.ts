import { Request, Response, NextFunction } from "express";
import { Config } from "../config";
import { getHealthStatus } from "../services/healthService";
import { probeDependencies } from "../services/dependencyProbe";

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Service health check
 *     description: >
 *       Returns the overall health of the Paymaster server, including Horizon
 *       connectivity status and per-fee-payer account balances.
 *       No authentication required.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: >
 *           All dependency probes (database, Redis, Horizon) passed within the
 *           configured timeout.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *             examples:
 *               healthy:
 *                 summary: All systems nominal
 *                 value:
 *                   status: healthy
 *                   version: "0.1.0"
 *                   network: "Test SDF Network ; September 2015"
 *                   timestamp: "2026-03-28T12:00:00.000Z"
 *                   checks:
 *                     api: ok
 *                     database:
 *                       status: healthy
 *                       latencyMs: 3
 *                     redis:
 *                       status: healthy
 *                       latencyMs: 1
 *                     horizon:
 *                       status: healthy
 *                       latencyMs: 42
 *                       url: "https://horizon-testnet.stellar.org"
 *                     feePayers:
 *                       - publicKey: "GABC...XYZ"
 *                         status: healthy
 *                         balance: 100.5
 *       503:
 *         description: >
 *           One or more dependency probes failed or timed out. The body lists
 *           each dependency's status and latency.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *             examples:
 *               unhealthy:
 *                 summary: Redis unreachable
 *                 value:
 *                   status: unhealthy
 *                   version: "0.1.0"
 *                   network: "Test SDF Network ; September 2015"
 *                   timestamp: "2026-03-28T12:00:00.000Z"
 *                   checks:
 *                     api: ok
 *                     database:
 *                       status: healthy
 *                       latencyMs: 3
 *                     redis:
 *                       status: unhealthy
 *                       latencyMs: 500
 *                       error: "Probe timed out after 500ms"
 *                     horizon:
 *                       status: healthy
 *                       latencyMs: 42
 *                       url: "https://horizon-testnet.stellar.org"
 */

export async function healthHandler(
  req: Request,
  res: Response,
  next: NextFunction,
  config: Config,
): Promise<void> {
  try {
    const [health, dependencies] = await Promise.all([
      getHealthStatus(config),
      probeDependencies(config),
    ]);

    const allDependenciesHealthy = dependencies.every(
      (probe) => probe.status === "healthy",
    );

    const statusCode =
      health.status === "unhealthy" || !allDependenciesHealthy ? 503 : 200;

    res.status(statusCode).json({
      ...health,
      status: statusCode === 503 ? "unhealthy" : health.status,
      checks: {
        ...health.checks,
        database: dependencies.find((p) => p.name === "database"),
        redis: dependencies.find((p) => p.name === "redis"),
        horizon: dependencies.find((p) => p.name === "horizon"),
      },
    });
  } catch (error) {
    next(error);
  }
}
