import { readFileSync } from "fs";
import { resolve } from "path";
import tls, { PeerCertificate } from "tls";
import { GrpcEngineConfig, VaultConfig } from "../config";

const grpc = require("@grpc/grpc-js") as typeof import("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader") as typeof import("@grpc/proto-loader");
type GrpcBaseClient = import("@grpc/grpc-js").Client;

const PROTO_PATH_CANDIDATES = [
  resolve(process.cwd(), "proto/internal_signer.proto"),
  resolve(__dirname, "../../proto/internal_signer.proto"),
];

interface InternalSignerClient extends GrpcBaseClient {
  health(
    request: Record<string, never>,
    callback: (
      error: Error | null,
      response: { status: string },
    ) => void,
  ): void;
  signPayload(
    request: {
      payload: Buffer;
      secret: string;
    },
    callback: (
      error: Error | null,
      response: { signature: Buffer },
    ) => void,
  ): void;
  signPayloadFromVault(
    request: {
      approle_role_id: string;
      approle_secret_id: string;
      kv_mount: string;
      kv_version: number;
      payload: Buffer;
      secret_field: string;
      secret_path: string;
      vault_addr: string;
      vault_token: string;
    },
    callback: (
      error: Error | null,
      response: { signature: Buffer },
    ) => void,
  ): void;
}

interface CachedClientMaterial {
  ca: Buffer;
  cert: Buffer;
  client: InternalSignerClient;
  key: Buffer;
}

function normalizeFingerprint(value: string): string {
  return value.replace(/^sha256:/i, "").replace(/[^a-fA-F0-9]/g, "").toLowerCase();
}

function currentFingerprint(cert: PeerCertificate): string {
  return normalizeFingerprint(cert.fingerprint256 || "");
}

function resolveProtoPath(): string {
  for (const candidate of PROTO_PATH_CANDIDATES) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("Unable to locate proto/internal_signer.proto for gRPC signer client");
}

function createClientConstructor() {
  const packageDefinition = protoLoader.loadSync(resolveProtoPath(), {
    defaults: true,
    enums: String,
    keepCase: true,
    longs: String,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(packageDefinition) as unknown as {
    fluid: {
      internal: {
        signer: {
          v1: {
            InternalSigner: new (
              address: string,
              credentials: import("@grpc/grpc-js").ChannelCredentials,
              options?: Record<string, string>,
            ) => InternalSignerClient;
          };
        };
      };
    };
  };

  return loaded.fluid.internal.signer.v1.InternalSigner;
}

const InternalSignerClientConstructor = createClientConstructor();

export class GrpcEngineSignerClient {
  private cached: CachedClientMaterial | null = null;

  constructor(private readonly config: GrpcEngineConfig) {}

  async health(): Promise<string> {
    const client = this.getClient();
    return new Promise((resolve, reject) => {
      client.health({}, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response.status);
      });
    });
  }

  async signPayload(secret: string, payload: Buffer): Promise<Buffer> {
    const client = this.getClient();
    return new Promise((resolve, reject) => {
      client.signPayload({ payload, secret }, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(Buffer.from(response.signature));
      });
    });
  }

  async signPayloadFromVault(
    vaultConfig: VaultConfig,
    feePayerSecretPath: string,
    payload: Buffer,
  ): Promise<Buffer> {
    const client = this.getClient();
    return new Promise((resolve, reject) => {
      client.signPayloadFromVault(
        {
          approle_role_id: vaultConfig.appRole?.roleId ?? "",
          approle_secret_id: vaultConfig.appRole?.secretId ?? "",
          kv_mount: vaultConfig.kvMount,
          kv_version: vaultConfig.kvVersion,
          payload,
          secret_field: vaultConfig.secretField,
          secret_path: feePayerSecretPath,
          vault_addr: vaultConfig.addr,
          vault_token: vaultConfig.token ?? "",
        },
        (error, response) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(Buffer.from(response.signature));
        },
      );
    });
  }

  close(): void {
    this.cached?.client.close();
    this.cached = null;
  }

  private getClient(): InternalSignerClient {
    const ca = readFileSync(this.config.tlsCaPath);
    const cert = readFileSync(this.config.tlsCertPath);
    const key = readFileSync(this.config.tlsKeyPath);

    if (
      this.cached &&
      this.cached.ca.equals(ca) &&
      this.cached.cert.equals(cert) &&
      this.cached.key.equals(key)
    ) {
      return this.cached.client;
    }

    this.cached?.client.close();

    const credentials = grpc.credentials.createSsl(ca, key, cert, {
      checkServerIdentity: (_host, peerCertificate) => {
        const hostnameError = tls.checkServerIdentity(
          this.config.serverName,
          peerCertificate,
        );
        if (hostnameError) {
          return hostnameError;
        }

        if (this.config.pinnedServerCertSha256.length === 0) {
          return undefined;
        }

        const fingerprint = currentFingerprint(peerCertificate);
        if (this.config.pinnedServerCertSha256.includes(fingerprint)) {
          return undefined;
        }

        return new Error(
          `Pinned server certificate mismatch. Presented SHA-256 fingerprint ${fingerprint}`,
        );
      },
    });

    const client = new InternalSignerClientConstructor(
      this.config.address,
      credentials,
      {
        "grpc.default_authority": this.config.serverName,
        "grpc.ssl_target_name_override": this.config.serverName,
      },
    );

    this.cached = {
      ca,
      cert,
      client,
      key,
    };

    return client;
  }
}
