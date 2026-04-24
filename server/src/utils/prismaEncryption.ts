import { encrypt, decrypt } from "./encryption";

export const ENCRYPTED_FIELDS = ["secret", "apiKey", "token", "privateKey"];

export const encryptionExtension = {
  name: "encryption",
  query: {
    $allModels: {
      async $allOperations({ operation, args, query }: any) {
        // Encrypt mutable payload operations
        if (["create", "update", "createMany", "updateMany", "upsert"].includes(operation)) {
          if (args.data) encryptFields(args.data);
          if (args.create) encryptFields(args.create);
          if (args.update) encryptFields(args.update);
        }

        const result = await query(args);

        if (result) decryptFields(result);

        return result;
      },
    },
  },
};

function isTraversable(obj: any): boolean {
  return typeof obj === "object" && obj !== null && !(obj instanceof Date) && !(obj instanceof Buffer);
}

function encryptFields(data: any) {
  if (!isTraversable(data)) return;
  if (Array.isArray(data)) return data.forEach(encryptFields);
  
  for (const [key, value] of Object.entries(data)) {
    if (ENCRYPTED_FIELDS.includes(key) && typeof value === "string") {
      data[key] = encrypt(value);
    } else if (isTraversable(value)) {
      encryptFields(value);
    }
  }
}

function decryptFields(data: any) {
  if (!isTraversable(data)) return;
  if (Array.isArray(data)) return data.forEach(decryptFields);
  
  for (const [key, value] of Object.entries(data)) {
    if (ENCRYPTED_FIELDS.includes(key) && typeof value === "string") {
      try {
        data[key] = decrypt(value);
      } catch (err) {
        console.error(`[PrismaEncryption] Failed to decrypt field: ${key}`);
      }
    } else if (isTraversable(value)) {
      decryptFields(value);
    }
  }
}