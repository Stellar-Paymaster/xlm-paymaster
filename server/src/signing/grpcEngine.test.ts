import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { spawn } from "child_process";
import StellarSdk from "@stellar/stellar-sdk";
import { X509Certificate } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { GrpcEngineSignerClient } from "./grpcEngineClient";

const forge = require("node-forge");

const SERVER_NAME = "fluid-grpc-engine.internal";
const TEST_SECRET =
  "SDMOYUZMPBA5SDXYC7346UPSFC3LA2QSHWI67M7ZW6G2D55TJ2H3A4IE";

interface CertAuthority {
  certPem: string;
  certSha256: string;
  keyPem: string;
}

interface IssuedCertificate {
  certPem: string;
  certSha256: string;
  keyPem: string;
}

interface CertificateSet {
  clientCa: CertAuthority;
  rogueCa: CertAuthority;
  rotatedClient: IssuedCertificate;
  rotatedServer: IssuedCertificate;
  rogueClient: IssuedCertificate;
  validClient: IssuedCertificate;
  validServer: IssuedCertificate;
}

interface RunningEngine {
  address: string;
  close(): Promise<void>;
  logs(): string;
  paths: {
    caPath: string;
    clientCertPath: string;
    clientKeyPath: string;
    serverCertPath: string;
    serverKeyPath: string;
  };
  certificates: CertificateSet;
}

const createdEngines: RunningEngine[] = [];

function randomSerial(): string {
  return Math.floor(Math.random() * 1_000_000_000).toString(16);
}

function pemFingerprint(pem: string): string {
  return new X509Certificate(pem).fingerprint256.replace(/:/g, "").toLowerCase();
}

function createCertificateAuthority(commonName: string): CertAuthority {
  const keyPair = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keyPair.publicKey;
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: "commonName", value: commonName }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    { name: "keyUsage", keyCertSign: true, cRLSign: true, digitalSignature: true },
    { name: "subjectKeyIdentifier" },
  ]);
  cert.sign(keyPair.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  return {
    certPem,
    certSha256: pemFingerprint(certPem),
    keyPem: forge.pki.privateKeyToPem(keyPair.privateKey),
  };
}

function issueLeafCertificate(options: {
  ca: CertAuthority;
  commonName: string;
  dnsNames?: string[];
  extendedKeyUsage: "clientAuth" | "serverAuth";
}): IssuedCertificate {
  const caCert = forge.pki.certificateFromPem(options.ca.certPem);
  const caKey = forge.pki.privateKeyFromPem(options.ca.keyPem);
  const keyPair = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keyPair.publicKey;
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  cert.setSubject([{ name: "commonName", value: options.commonName }]);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    {
      name: "keyUsage",
      digitalSignature: true,
      keyEncipherment: true,
    },
    {
      name: "extKeyUsage",
      clientAuth: options.extendedKeyUsage === "clientAuth",
      serverAuth: options.extendedKeyUsage === "serverAuth",
    },
    { name: "subjectKeyIdentifier" },
    { name: "authorityKeyIdentifier", keyIdentifier: true },
    ...(options.dnsNames?.length
      ? [
          {
            name: "subjectAltName",
            altNames: options.dnsNames.map((value) => ({ type: 2, value })),
          },
        ]
      : []),
  ]);
  cert.sign(caKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  return {
    certPem,
    certSha256: pemFingerprint(certPem),
    keyPem: forge.pki.privateKeyToPem(keyPair.privateKey),
  };
}

function createCertificateSet(): CertificateSet {
  const clientCa = createCertificateAuthority("fluid-internal-ca");
  const rogueCa = createCertificateAuthority("rogue-internal-ca");

  return {
    clientCa,
    rogueCa,
    rotatedClient: issueLeafCertificate({
      ca: clientCa,
      commonName: "fluid-node-api-rotated",
      extendedKeyUsage: "clientAuth",
    }),
    rotatedServer: issueLeafCertificate({
      ca: clientCa,
      commonName: SERVER_NAME,
      dnsNames: [SERVER_NAME],
      extendedKeyUsage: "serverAuth",
    }),
    rogueClient: issueLeafCertificate({
      ca: rogueCa,
      commonName: "rogue-client",
      extendedKeyUsage: "clientAuth",
    }),
    validClient: issueLeafCertificate({
      ca: clientCa,
      commonName: "fluid-node-api",
      extendedKeyUsage: "clientAuth",
    }),
    validServer: issueLeafCertificate({
      ca: clientCa,
      commonName: SERVER_NAME,
      dnsNames: [SERVER_NAME],
      extendedKeyUsage: "serverAuth",
    }),
  };
}

async function getFreePort(): Promise<number> {
  const net = await import("net");
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("failed to allocate port"));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(address.port);
      });
    });
  });
}

function cargoCommand(): string {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (home) {
    const cargoExe = resolve(home, ".cargo/bin/cargo.exe");
    if (existsSync(cargoExe)) {
      return cargoExe;
    }
  }
  return "cargo";
}

async function waitFor(
  check: () => Promise<void>,
  timeoutMs = 15_000,
): Promise<void> {
  const started = Date.now();
  let lastError: unknown;

  while (Date.now() - started < timeoutMs) {
    try {
      await check();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("timed out waiting for condition");
}

async function startEngine(): Promise<RunningEngine> {
  const port = await getFreePort();
  const address = `127.0.0.1:${port}`;
  const tmpRoot = mkdtempSync(join(tmpdir(), "fluid-grpc-engine-"));
  const certificates = createCertificateSet();

  const caPath = join(tmpRoot, "ca.pem");
  const clientCertPath = join(tmpRoot, "client.pem");
  const clientKeyPath = join(tmpRoot, "client-key.pem");
  const serverCertPath = join(tmpRoot, "server.pem");
  const serverKeyPath = join(tmpRoot, "server-key.pem");

  writeFileSync(caPath, certificates.clientCa.certPem);
  writeFileSync(clientCertPath, certificates.validClient.certPem);
  writeFileSync(clientKeyPath, certificates.validClient.keyPem);
  writeFileSync(serverCertPath, certificates.validServer.certPem);
  writeFileSync(serverKeyPath, certificates.validServer.keyPem);

  const logs: string[] = [];
  let shuttingDown = false;
  let startupFailure: Error | null = null;
  const child = spawn(
    cargoCommand(),
    ["run", "--manifest-path", "Cargo.toml", "--bin", "grpc_engine"],
    {
      cwd: resolve(process.cwd()),
      env: {
        ...process.env,
        FLUID_GRPC_ENGINE_LISTEN_ADDR: address,
        FLUID_GRPC_ENGINE_PINNED_CLIENT_CERT_SHA256: [
          certificates.validClient.certSha256,
          certificates.rotatedClient.certSha256,
        ].join(","),
        FLUID_GRPC_ENGINE_TLS_CERT_PATH: serverCertPath,
        FLUID_GRPC_ENGINE_TLS_CLIENT_CA_PATH: caPath,
        FLUID_GRPC_ENGINE_TLS_KEY_PATH: serverKeyPath,
        RUST_LOG: "info",
      },
      stdio: "pipe",
    },
  );

  const capture = (chunk: Buffer) => {
    logs.push(chunk.toString("utf8"));
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  child.once("error", (error) => {
    startupFailure = new Error(`failed to spawn grpc_engine: ${error.message}`);
  });
  child.once("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const exitDetail =
      code !== null ? `exit code ${code}` : `signal ${signal ?? "unknown"}`;
    const output = logs.join("").trim();
    startupFailure = new Error(
      output
        ? `grpc_engine exited during startup with ${exitDetail}\n${output}`
        : `grpc_engine exited during startup with ${exitDetail}`,
    );
  });

  const client = new GrpcEngineSignerClient({
    address,
    pinnedServerCertSha256: [
      certificates.validServer.certSha256,
      certificates.rotatedServer.certSha256,
    ],
    serverName: SERVER_NAME,
    tlsCaPath: caPath,
    tlsCertPath: clientCertPath,
    tlsKeyPath: clientKeyPath,
  });

  await waitFor(async () => {
    if (startupFailure) {
      throw startupFailure;
    }

    const status = await client.health();
    expect(status).toBe("ok");
  }, 30_000);

  const engine: RunningEngine = {
    address,
    certificates,
    close: async () => {
      shuttingDown = true;
      client.close();
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGINT");
      }
      await new Promise<void>((resolveClose) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolveClose();
          return;
        }

        child.once("exit", () => resolveClose());
      });
      rmSync(tmpRoot, { force: true, recursive: true });
    },
    logs: () => logs.join(""),
    paths: {
      caPath,
      clientCertPath,
      clientKeyPath,
      serverCertPath,
      serverKeyPath,
    },
  };

  createdEngines.push(engine);
  return engine;
}

afterEach(async () => {
  while (createdEngines.length > 0) {
    const engine = createdEngines.pop();
    if (engine) {
      await engine.close();
    }
  }
});

describe("GrpcEngineSignerClient", () => {
  it(
    "signs payloads over a mutually authenticated and pinned gRPC channel",
    async () => {
      const engine = await startEngine();
      const client = new GrpcEngineSignerClient({
        address: engine.address,
        pinnedServerCertSha256: [engine.certificates.validServer.certSha256],
        serverName: SERVER_NAME,
        tlsCaPath: engine.paths.caPath,
        tlsCertPath: engine.paths.clientCertPath,
        tlsKeyPath: engine.paths.clientKeyPath,
      });

      const payload = Buffer.from("fluid-grpc-mtls");
      const signature = await client.signPayload(TEST_SECRET, payload);
      const keypair = StellarSdk.Keypair.fromSecret(TEST_SECRET);

      expect(signature.length).toBe(64);
      expect(keypair.verify(payload, signature)).toBe(true);
    },
    60_000,
  );

  it(
    "rejects clients whose certificate does not chain to the pinned internal CA",
    async () => {
      const engine = await startEngine();
      writeFileSync(engine.paths.clientCertPath, engine.certificates.rogueClient.certPem);
      writeFileSync(engine.paths.clientKeyPath, engine.certificates.rogueClient.keyPem);

      const client = new GrpcEngineSignerClient({
        address: engine.address,
        pinnedServerCertSha256: [engine.certificates.validServer.certSha256],
        serverName: SERVER_NAME,
        tlsCaPath: engine.paths.caPath,
        tlsCertPath: engine.paths.clientCertPath,
        tlsKeyPath: engine.paths.clientKeyPath,
      });

      await expect(client.health()).rejects.toThrow();
      expect(engine.logs()).toMatch(/mTLS handshake failed|rejecting client certificate/i);
    },
    60_000,
  );

  it(
    "rejects servers whose certificate fingerprint is not pinned",
    async () => {
      const engine = await startEngine();
      const client = new GrpcEngineSignerClient({
        address: engine.address,
        pinnedServerCertSha256: [engine.certificates.rogueClient.certSha256],
        serverName: SERVER_NAME,
        tlsCaPath: engine.paths.caPath,
        tlsCertPath: engine.paths.clientCertPath,
        tlsKeyPath: engine.paths.clientKeyPath,
      });

      await expect(client.health()).rejects.toThrow(/Pinned server certificate mismatch/);
    },
    60_000,
  );

  it(
    "reloads server and client certificates from disk to support rotation without restarting the API",
    async () => {
      const engine = await startEngine();
      const client = new GrpcEngineSignerClient({
        address: engine.address,
        pinnedServerCertSha256: [
          engine.certificates.validServer.certSha256,
          engine.certificates.rotatedServer.certSha256,
        ],
        serverName: SERVER_NAME,
        tlsCaPath: engine.paths.caPath,
        tlsCertPath: engine.paths.clientCertPath,
        tlsKeyPath: engine.paths.clientKeyPath,
      });

      const payload = Buffer.from("rotating-mtls-certs");
      const beforeRotation = await client.signPayload(TEST_SECRET, payload);
      expect(beforeRotation.length).toBe(64);

      writeFileSync(engine.paths.serverCertPath, engine.certificates.rotatedServer.certPem);
      writeFileSync(engine.paths.serverKeyPath, engine.certificates.rotatedServer.keyPem);
      writeFileSync(engine.paths.clientCertPath, engine.certificates.rotatedClient.certPem);
      writeFileSync(engine.paths.clientKeyPath, engine.certificates.rotatedClient.keyPem);

      const afterRotation = await client.signPayload(TEST_SECRET, payload);
      const keypair = StellarSdk.Keypair.fromSecret(TEST_SECRET);

      expect(afterRotation.length).toBe(64);
      expect(keypair.verify(payload, afterRotation)).toBe(true);
      expect(engine.logs()).toMatch(/reloaded gRPC engine TLS material/i);
    },
    60_000,
  );
});
