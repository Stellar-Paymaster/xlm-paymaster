import { Request, Response } from "express";
import {
  createChain,
  deleteChain,
  getChain,
  listChains,
  updateChain,
} from "../services/chainRegistryService";
import { getAuditActor, logAuditEvent } from "../services/auditLogger";
import { isAdminTokenAuthority } from "../utils/adminAuth";

function isAuthorized(req: Request): boolean {
  return isAdminTokenAuthority(req);
}

export async function listChainsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const chains = await listChains();
    res.json({ chains });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to list chains",
    });
  }
}

export async function createChainHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { chainId, name, rpcUrl, feePayerSecret } = req.body ?? {};

  if (typeof chainId !== "string" || !chainId.trim()) {
    res.status(400).json({ error: "chainId is required" });
    return;
  }
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (typeof rpcUrl !== "string" || !rpcUrl.trim()) {
    res.status(400).json({ error: "rpcUrl is required" });
    return;
  }

  try {
    const chain = await createChain({
      chainId: chainId.trim(),
      name: name.trim(),
      rpcUrl: rpcUrl.trim(),
      feePayerSecret:
        typeof feePayerSecret === "string" && feePayerSecret.trim()
          ? feePayerSecret.trim()
          : undefined,
    });
    void logAuditEvent("CHAIN_CREATED", getAuditActor(req), {
      chainId: chain.chainId,
      name: chain.name,
      rpcUrl: chain.rpcUrl,
      enabled: chain.enabled,
    });
    res.status(201).json({ chain });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Failed to create chain",
    });
  }
}

export async function updateChainHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "Chain id is required" });
    return;
  }

  const { name, rpcUrl, enabled, feePayerSecret } = req.body ?? {};

  const patch: {
    name?: string;
    rpcUrl?: string;
    enabled?: boolean;
    feePayerSecret?: string;
  } = {};

  if (typeof name === "string") patch.name = name.trim();
  if (typeof rpcUrl === "string") patch.rpcUrl = rpcUrl.trim();
  if (typeof enabled === "boolean") patch.enabled = enabled;
  if (typeof feePayerSecret === "string" && feePayerSecret.trim()) {
    patch.feePayerSecret = feePayerSecret.trim();
  }

  try {
    const chain = await updateChain(id, patch);
    void logAuditEvent("CHAIN_UPDATED", getAuditActor(req), {
      id,
      patch,
    });
    res.json({ chain });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update chain";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ error: message });
  }
}

export async function deleteChainHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: "Chain id is required" });
    return;
  }

  try {
    await deleteChain(id);
    void logAuditEvent("CHAIN_DELETED", getAuditActor(req), {
      id,
    });
    res.json({ message: "Chain deleted" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete chain";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ error: message });
  }
}
