import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSubTenant, getSubTenants } from "./subTenantService";
import prisma from "../utils/db";

// Mock prisma client
vi.mock("../utils/db", () => ({
  default: {
    tenant: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("subTenantService", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createSubTenant", () => {
    it("should throw error if parentId is not provided", async () => {
      await expect(createSubTenant("", { name: "Sub-Tenant 1" })).rejects.toThrow(
        "Parent tenant id is required"
      );
    });

    it("should call prisma.tenant.create with parentId and data", async () => {
      const mockResult = { id: "sub-1", name: "Sub-Tenant 1", parentId: "parent-123" };
      vi.mocked(prisma.tenant.create).mockResolvedValue(mockResult);

      const result = await createSubTenant("parent-123", { name: "Sub-Tenant 1" });

      expect(prisma.tenant.create).toHaveBeenCalledWith({
        data: {
          name: "Sub-Tenant 1",
          parentId: "parent-123",
        },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe("getSubTenants", () => {
    it("should throw error if parentId is not provided", async () => {
      await expect(getSubTenants("")).rejects.toThrow("Parent tenant id is required");
    });

    it("should return sub-tenants belonging to the parentId", async () => {
      const mockList = [
        { id: "sub-1", name: "Sub-Tenant 1", parentId: "parent-123" },
        { id: "sub-2", name: "Sub-Tenant 2", parentId: "parent-123" },
      ];
      vi.mocked(prisma.tenant.findMany).mockResolvedValue(mockList);

      const result = await getSubTenants("parent-123");

      expect(prisma.tenant.findMany).toHaveBeenCalledWith({
        where: { parentId: "parent-123" },
      });
      expect(result).toEqual(mockList);
    });
  });
});
