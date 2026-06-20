import { Request, Response, NextFunction } from "express";
import { Config } from "../config";
import { createLogger } from "../utils/logger";
import { StatusMonitorService } from "../services/statusMonitorService";
import prisma from "../utils/db";

const logger = createLogger({ component: "status_page" });

// Global status monitor instance
let statusMonitor: StatusMonitorService | null = null;

function getStatusMonitor(config: Config): StatusMonitorService {
  if (!statusMonitor) {
    statusMonitor = new StatusMonitorService(prisma, config);
  }
  return statusMonitor;
}

/**
 * @openapi
 * /status:
 *   get:
 *     summary: Public status page
 *     description: >
 *       Returns the current status of all Paymaster API components including
 *       API status, Horizon connectivity, and database connectivity.
 *       No authentication required. This endpoint provides real-time
 *       status information for tenants to check service availability.
 *     tags:
 *       - Status
 *     responses:
 *       200:
 *         description: Status information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [operational, degraded, down, unknown]
 *                   description: Overall system status
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: When the status was last updated
 *                 components:
 *                   type: object
 *                   properties:
 *                     api:
 *                       $ref: '#/components/schemas/ComponentStatus'
 *                     horizon:
 *                       $ref: '#/components/schemas/ComponentStatus'
 *                     database:
 *                       $ref: '#/components/schemas/ComponentStatus'
 *             examples:
 *               operational:
 *                 summary: All systems operational
 *                 value:
 *                   status: operational
 *                   timestamp: "2026-03-28T12:00:00.000Z"
 *                   components:
 *                     api:
 *                       component: api
 *                       status: operational
 *                       lastUpdated: "2026-03-28T12:00:00.000Z"
 *                     horizon:
 *                       component: horizon
 *                       status: operational
 *                       lastUpdated: "2026-03-28T12:00:00.000Z"
 *                     database:
 *                       component: database
 *                       status: operational
 *                       lastUpdated: "2026-03-28T12:00:00.000Z"
 *               degraded:
 *                 summary: System experiencing issues
 *                 value:
 *                   status: degraded
 *                   timestamp: "2026-03-28T12:00:00.000Z"
 *                   components:
 *                     api:
 *                       component: api
 *                       status: operational
 *                       lastUpdated: "2026-03-28T12:00:00.000Z"
 *                     horizon:
 *                       component: horizon
 *                       status: degraded
 *                       message: "High response time"
 *                       lastUpdated: "2026-03-28T11:55:00.000Z"
 *                     database:
 *                       component: database
 *                       status: operational
 *                       lastUpdated: "2026-03-28T12:00:00.000Z"
 */
export async function statusPageHandler(
  req: Request,
  res: Response,
  next: NextFunction,
  config: Config,
): Promise<void> {
  try {
    const monitor = getStatusMonitor(config);
    const status = await monitor.getCurrentStatus();

    res.status(200).json(status);
  } catch (error) {
    logger.error("Failed to get status:", error);
    
    // Return a fallback status even if there's an error
    res.status(200).json({
      status: "unknown",
      timestamp: new Date().toISOString(),
      components: {
        api: {
          component: "api",
          status: "unknown",
          message: "Status check failed",
        },
        horizon: {
          component: "horizon",
          status: "unknown",
          message: "Status check failed",
        },
        database: {
          component: "database",
          status: "unknown",
          message: "Status check failed",
        },
      },
    });
  }
}

/**
 * @openapi
 * /status/uptime:
 *   get:
 *     summary: Get uptime statistics
 *     description: >
 *       Returns uptime statistics for all components over a specified period.
 *       Defaults to 90 days. No authentication required.
 *     tags:
 *       - Status
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 90
 *         description: Number of days to calculate uptime for
 *     responses:
 *       200:
 *         description: Uptime statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period:
 *                   type: string
 *                   example: "90 days"
 *                 startDate:
 *                   type: string
 *                   format: date-time
 *                 endDate:
 *                   type: string
 *                   format: date-time
 *                 components:
 *                   type: object
 *                   additionalProperties:
 *                     $ref: '#/components/schemas/UptimeStats'
 */
export async function uptimeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
  config: Config,
): Promise<void> {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 90, 1), 365);
    const monitor = getStatusMonitor(config);
    const uptime = await monitor.getUptimeStats(days);

    res.status(200).json(uptime);
  } catch (error) {
    logger.error("Failed to get uptime stats:", error);
    next(error);
  }
}

/**
 * @openapi
 * /status/incidents:
 *   get:
 *     summary: Get incident history
 *     description: >
 *       Returns historical incidents and their resolution information.
 *       Defaults to 90 days of history. No authentication required.
 *     tags:
 *       - Status
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 90
 *         description: Number of days of incident history to retrieve
 *     responses:
 *       200:
 *         description: Incident history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period:
 *                   type: string
 *                   example: "90 days"
 *                 incidents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Incident'
 */
export async function incidentsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
  config: Config,
): Promise<void> {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 90, 1), 365);
    const monitor = getStatusMonitor(config);
    const incidents = await monitor.getIncidentHistory(days);

    res.status(200).json(incidents);
  } catch (error) {
    logger.error("Failed to get incident history:", error);
    next(error);
  }
}

/**
 * @openapi
 * /status/subscribe:
 *   post:
 *     summary: Subscribe to status updates
 *     description: >
 *       Subscribe to email notifications for status changes and incidents.
 *       No authentication required.
 *     tags:
 *       - Status
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to receive status notifications
 *     responses:
 *       200:
 *         description: Successfully subscribed to status updates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Successfully subscribed to status updates"
 *                 subscriptionId:
 *                   type: string
 *                   format: uuid
 *       409:
 *         description: Email already subscribed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Email already subscribed to status updates"
 *       400:
 *         description: Invalid email address
 */
export async function subscribeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({
        message: "Email address is required",
      });
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        message: "Invalid email address",
      });
      return;
    }

    // Check if already subscribed
    const existingSubscription = await prisma.statusSubscription.findUnique({
      where: { email },
    });

    if (existingSubscription) {
      if (existingSubscription.active) {
        res.status(409).json({
          message: "Email already subscribed to status updates",
        });
        return;
      } else {
        // Reactivate existing subscription
        await prisma.statusSubscription.update({
          where: { email },
          data: { active: true },
        });
        
        res.status(200).json({
          message: "Successfully reactivated subscription",
          subscriptionId: existingSubscription.id,
        });
        return;
      }
    }

    // Create new subscription
    const subscription = await prisma.statusSubscription.create({
      data: {
        email,
        active: true,
      },
    });

    logger.info(`New status subscription: ${email}`);

    res.status(200).json({
      message: "Successfully subscribed to status updates",
      subscriptionId: subscription.id,
    });
  } catch (error) {
    logger.error("Failed to create subscription:", error);
    next(error);
  }
}

/**
 * @openapi
 * /status/unsubscribe:
 *   post:
 *     summary: Unsubscribe from status updates
 *     description: >
 *       Unsubscribe from email notifications for status changes.
 *       No authentication required.
 *     tags:
 *       - Status
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to unsubscribe
 *     responses:
 *       200:
 *         description: Successfully unsubscribed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Successfully unsubscribed from status updates"
 *       404:
 *         description: Email not found in subscription list
 */
export async function unsubscribeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({
        message: "Email address is required",
      });
      return;
    }

    const subscription = await prisma.statusSubscription.findUnique({
      where: { email },
    });

    if (!subscription) {
      res.status(404).json({
        message: "Email not found in subscription list",
      });
      return;
    }

    await prisma.statusSubscription.update({
      where: { email },
      data: { active: false },
    });

    logger.info(`Status subscription deactivated: ${email}`);

    res.status(200).json({
      message: "Successfully unsubscribed from status updates",
    });
  } catch (error) {
    logger.error("Failed to unsubscribe:", error);
    next(error);
  }
}
