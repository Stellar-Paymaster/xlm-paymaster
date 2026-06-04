import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import supertest from "supertest";
import { createSubTenant, getSubTenants } from "../../services/subTenantService";
import {
  createSubTenantHandler,
  getSubTenantsHandler,
} from "../../handlers/subTenantHandler";

vi.mock("../../services/subTenantService", () => ({
  createSubTenant: vi.fn(),
  getSubTenants: vi.fn(),
}));

describe("Sub-Tenant Route Handlers", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Inject routes
    app.post("/admin/sub-tenants", (req, res, next) => {
      void createSubTenantHandler(req, res, next);
    });
    app.get("/admin/sub-tenants", (req, res, next) => {
      void getSubTenantsHandler(req, res, next);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /admin/sub-tenants", () => {
    it("should return 400 if parent tenant context is missing", async () => {
      const res = await supertest(app)
        .post("/admin/sub-tenants")
        .send({ name: "Sub-Tenant A" });
      expect(res.status).toBe(400);
    });

    it("should create a sub-tenant and return 201 on success", async () => {
      const mockSubTenant = { id: "sub-1", name: "Sub-Tenant A", parentId: "parent-123" };
      vi.mocked(createSubTenant).mockResolvedValue(mockSubTenant);

      const res = await supertest(app)
        .post("/admin/sub-tenants")
        .set("x-tenant-id", "parent-123") // mock authentication context
        .send({ name: "Sub-Tenant A" });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Sub-Tenant A");
    });
  });

  describe("GET /admin/sub-tenants", () => {
    it("should return a list of sub-tenants belonging to the parent", async () => {
      const mockList = [
        { id: "sub-1", name: "Sub 1", parentId: "parent-123" },
        { id: "sub-2", name: "Sub 2", parentId: "parent-123" },
      ];
      vi.mocked(getSubTenants).mockResolvedValue(mockList);

      const res = await supertest(app)
        .get("/admin/sub-tenants")
        .set("x-tenant-id", "parent-123");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });
});
