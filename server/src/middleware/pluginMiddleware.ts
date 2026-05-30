import { Request } from "express";
import { AppError } from "../errors/AppError";

export interface PluginContext {
  tenantId: string;
  chainId: string;
  xdr?: string;
  submit?: boolean;
}

type PluginResult = {
  allow: boolean;
  reason?: string;
  modifiedXdr?: string;
};

type PluginFunction = (req: Request, ctx: PluginContext) => Promise<PluginResult>;

// 🔥 In-memory plugin registry (can be replaced with DB later)
const plugins: PluginFunction[] = [];

// Register plugin
export function registerPlugin(plugin: PluginFunction) {
  plugins.push(plugin);
}

// Execute plugins
export async function runPlugins(
  req: Request,
  ctx: PluginContext
): Promise<PluginContext> {
  let currentCtx = { ...ctx };

  for (const plugin of plugins) {
    const result = await plugin(req, currentCtx);

    if (!result.allow) {
      throw new AppError(
        result.reason || "Blocked by plugin",
        403,
        "AUTH_FAILED"
      );
    }

    if (result.modifiedXdr) {
      currentCtx.xdr = result.modifiedXdr;
    }
  }

  return currentCtx;
}