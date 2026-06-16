import { Router } from "express";
import {
  adminLoginHandler,
  changeAdminPasswordHandler,
  listAdminUsersHandler,
  createAdminUserHandler,
  updateAdminUserRoleHandler,
  deactivateAdminUserHandler,
} from "../../handlers/adminUsers";
import { requireAuthenticatedAdmin, requirePermission } from "../../utils/adminAuth";

export const adminUsersRouter = Router();

adminUsersRouter.post("/auth/login", adminLoginHandler);
adminUsersRouter.post("/auth/change-password", requireAuthenticatedAdmin(), changeAdminPasswordHandler);
adminUsersRouter.get("/users", requirePermission("manage_users"), listAdminUsersHandler);
adminUsersRouter.post("/users", requirePermission("manage_users"), createAdminUserHandler);
adminUsersRouter.patch("/users/:id/role", requirePermission("manage_users"), updateAdminUserRoleHandler);
adminUsersRouter.delete("/users/:id", requirePermission("manage_users"), deactivateAdminUserHandler);
