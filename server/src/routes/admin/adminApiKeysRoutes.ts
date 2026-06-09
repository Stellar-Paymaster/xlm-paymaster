import { Router } from "express";
import {
  listApiKeysHandler,
  revokeApiKeyHandler,
  updateApiKeyChainsHandler,
  upsertApiKeyHandler,
} from "../../handlers/adminApiKeys";
import { requirePermission } from "../../utils/adminAuth";
import { createSandboxApiKeyHandler } from "../../handlers/sandbox";

export const adminApiKeysRouter = Router();

adminApiKeysRouter.get("/api-keys", requirePermission("view_api_keys"), listApiKeysHandler);
adminApiKeysRouter.post("/api-keys", requirePermission("manage_api_keys"), upsertApiKeyHandler);
adminApiKeysRouter.post("/sandbox/api-keys", createSandboxApiKeyHandler);
adminApiKeysRouter.patch("/api-keys/:key/revoke", requirePermission("manage_api_keys"), revokeApiKeyHandler);
adminApiKeysRouter.patch("/api-keys/:key/chains", requirePermission("manage_api_keys"), updateApiKeyChainsHandler);
adminApiKeysRouter.delete("/api-keys/:key", requirePermission("manage_api_keys"), revokeApiKeyHandler);
