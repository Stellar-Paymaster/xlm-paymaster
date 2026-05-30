import type { Request, Response } from "express";
import {
  createSubTenant,
  getSubTenants,
} from "../services/subTenantService";

export async function createSubTenantHandler(req: Request, res: Response) {
  try {
    const parentId = req.headers["x-tenant-id"] as string;

    const tenant = await createSubTenant(parentId, req.body);

    return res.status(201).json(tenant);
  } catch (error) {
    return res.status(400).json({
      error: "Failed to create sub-tenant",
    });
  }
}

export async function getSubTenantsHandler(req: Request, res: Response) {
  try {
    const parentId = req.headers["x-tenant-id"] as string;

    const tenants = await getSubTenants(parentId);

    return res.status(200).json(tenants);
  } catch (error) {
    return res.status(400).json({
      error: "Failed to fetch sub-tenants",
    });
  }
}