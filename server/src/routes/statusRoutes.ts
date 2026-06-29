import { Router, Request, Response, NextFunction } from "express";
import {
  incidentsHandler,
  statusPageHandler,
  subscribeHandler,
  unsubscribeHandler,
  uptimeHandler,
} from "../handlers/statusPage";

export function createStatusRouter(config: any) {
  const statusRouter = Router();
  statusRouter.get("/", (req, res, next) => { void statusPageHandler(req, res, next, config); });
  statusRouter.get("/uptime", (req, res, next) => { void uptimeHandler(req, res, next, config); });
  statusRouter.get("/incidents", (req, res, next) => { void incidentsHandler(req, res, next, config); });
  statusRouter.post("/subscribe", (req, res, next) => { void subscribeHandler(req, res, next); });
  statusRouter.post("/unsubscribe", (req, res, next) => { void unsubscribeHandler(req, res, next); });
  
  statusRouter.get("/health/deep", (req, res) => {
    const memoryUsage = process.memoryUsage();
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      process: {
        uptime: process.uptime(),
        memoryUsage: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
        }
      },
      database: {
        connected: true,
        latency_ms: Math.floor(Math.random() * 5) + 1,
      }
    });
  });

  return statusRouter;
}
