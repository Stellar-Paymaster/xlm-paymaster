import prisma from "../utils/db";

export async function createSubTenant(parentId: string, data: any) {
  if (!parentId) {
    throw new Error("Parent tenant id is required");
  }

  return prisma.tenant.create({
    data: {
      ...data,
      parentId,
    },
  });
}

export async function getSubTenants(parentId: string) {
  if (!parentId) {
    throw new Error("Parent tenant id is required");
  }

  return prisma.tenant.findMany({
    where: {
      parentId,
    },
  });
}
