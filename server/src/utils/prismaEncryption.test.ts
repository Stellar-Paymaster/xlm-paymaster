import { describe, it, expect, vi } from "vitest";
import { encryptionExtension } from "./prismaEncryption";
import { encrypt } from "./encryption";

describe("Prisma Encryption Extension", () => {
  it("should securely encrypt configured fields on write operations", async () => {
    const mockQuery = vi.fn().mockResolvedValue({ id: 1, secret: "enc:v1:..." });
    const args = { data: { name: "test", secret: "my-secret-123", metadata: { token: "abc" } } };
    
    await encryptionExtension.query.$allModels.$allOperations({
      model: "Tenant",
      operation: "create",
      args,
      query: mockQuery
    } as any);

    expect(mockQuery).toHaveBeenCalled();
    const queryArgs = mockQuery.mock.calls[0][0];
    expect(queryArgs.data.name).toBe("test"); // Skips standard strings
    expect(queryArgs.data.secret).not.toBe("my-secret-123");
    expect(queryArgs.data.secret.startsWith("enc:v1:")).toBe(true); // Encrypts flat keys
    
    expect(queryArgs.data.metadata.token).not.toBe("abc");
    expect(queryArgs.data.metadata.token.startsWith("enc:v1:")).toBe(true); // Traverses embedded structures
  });

  it("should transparently decrypt fields natively on read operations", async () => {
    const plainSecret = "my-secret-123";
    const encryptedSecret = encrypt(plainSecret);
    const mockQuery = vi.fn().mockResolvedValue({ id: 1, name: "test", secret: encryptedSecret });
    
    const result = await encryptionExtension.query.$allModels.$allOperations({
      model: "Tenant",
      operation: "findUnique",
      args: { where: { id: 1 } },
      query: mockQuery
    } as any);

    expect(result.name).toBe("test");
    expect(result.secret).toBe(plainSecret);
  });

  it("should safely skip arbitrary Data/Buffer objects and not halt operations", async () => {
    const date = new Date();
    const buffer = Buffer.from("test");
    const mockQuery = vi.fn().mockResolvedValue({ id: 1, createdAt: date, data: buffer });
    
    const result = await encryptionExtension.query.$allModels.$allOperations({
      model: "Tenant",
      operation: "findUnique",
      args: { where: { id: 1 } },
      query: mockQuery
    } as any);

    expect(result.createdAt).toBe(date);
    expect(result.data).toBe(buffer);
  });
});