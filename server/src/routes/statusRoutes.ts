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
  return statusRouter;
}
