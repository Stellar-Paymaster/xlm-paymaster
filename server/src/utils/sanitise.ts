import crypto from "crypto";

export function isMaskingEnabled(): boolean {
  return process.env.MASK_LOGS !== "false";
}

export function hashXdr(xdr: string): string {
  const hash = crypto.createHash("sha256").update(xdr).digest("hex");
  return `XDR:${hash}`;
}

export function truncatePublicKey(pk: string): string {
  if (typeof pk === "string" && pk.length === 56 && pk.startsWith("G")) {
    return `${pk.substring(0, 4)}...${pk.substring(52)}`;
  }
  return pk;
}

const SENSITIVE_KEYS = ["secret", "key", "token"];

export function sanitise(obj: any): any {
  if (!isMaskingEnabled() || obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    if (obj.length === 56 && obj.startsWith("G")) {
      return truncatePublicKey(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitise(item));
  }

  if (typeof obj === "object") {
    const masked: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      const lowerK = k.toLowerCase();
      
      if (SENSITIVE_KEYS.some((sensitive) => lowerK.includes(sensitive))) {
        // If it happens to be a valid public key (e.g. field named 'publicKey'), truncate instead of fully redacting
        if (typeof v === "string" && v.length === 56 && v.startsWith("G")) {
          masked[k] = truncatePublicKey(v);
        } else {
          masked[k] = "[REDACTED]";
        }
      } else if (lowerK.includes("xdr") && typeof v === "string") {
        masked[k] = hashXdr(v);
      } else {
        masked[k] = sanitise(v);
      }
    }
    return masked;
  }

  return obj;
}

export function getPinoRedactConfig() {
  if (!isMaskingEnabled()) {
    return undefined;
  }

  return {
    paths: [
      "secret", "*.secret", "*.*.secret",
      "key", "*.key", "*.*.key",
      "token", "*.token", "*.*.token",
      "xdr", "*.xdr", "*.*.xdr",
      "publicKey", "*.publicKey", "*.*.publicKey",
      "account", "*.account", "*.*.account",
      "accountPublicKey", "*.accountPublicKey", "*.*.accountPublicKey",
      "feePayer", "*.feePayer", "*.*.feePayer",
    ],
    censor: (value: any, path: string[]) => {
      const key = path[path.length - 1]?.toLowerCase() || "";
      if (key.includes("xdr") && typeof value === "string") return hashXdr(value);
      if (typeof value === "string" && value.length === 56 && value.startsWith("G")) return truncatePublicKey(value);
      if (SENSITIVE_KEYS.some((s) => key.includes(s))) return "[REDACTED]";
      return value;
    },
  };
}