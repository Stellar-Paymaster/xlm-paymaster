import { Request, Response } from "express";
import { Config } from "../config";
import {
  addSignerToRegistry,
  listAdminSigners,
  removeSignerFromRegistry,
} from "../services/signerRegistry";

function isAuthorized(req: Request): boolean {
  const token = req.header("x-admin-token");
  const expected = process.env.PAYMASTER_ADMIN_TOKEN;
  return Boolean(expected) && token === expected;
}

export function listSignersHandler(config: Config) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const signers = await listAdminSigners(config);
      res.json({ signers });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to list signers",
      });
    }
  };
}

export function addSignerHandler(config: Config) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const secret = typeof req.body?.secret === "string" ? req.body.secret.trim() : "";
    if (!secret) {
      res.status(400).json({ error: "Signer secret is required" });
      return;
    }

    try {
      const signer = await addSignerToRegistry(config, secret);
      res.status(201).json({
        message: "Signer added",
        signer,
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to add signer",
      });
    }
  };
}

export function removeSignerHandler(config: Config) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const publicKey = req.params.publicKey;
    if (!publicKey) {
      res.status(400).json({ error: "Public key is required" });
      return;
    }

    try {
      await removeSignerFromRegistry(config, publicKey);
      res.json({ message: "Signer removed" });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Failed to remove signer",
      });
    }
  };
}
