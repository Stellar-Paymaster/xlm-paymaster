import { ChildProcess, spawn } from "child_process";
import { createLogger, serializeError } from "../src/utils/logger";

import StellarSdk from "@stellar/stellar-sdk";
import { setTimeout as delay } from "timers/promises";
import { once } from "events";

const logger = createLogger({ component: "parity_check" });

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface HttpResult {
  body: JsonValue | string;
  status: number;
}

function startProcess (
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  label: string
): ChildProcess {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  child.stdout?.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  return child;
}

async function stopProcess (child: ChildProcess): Promise<void> {
  if (!child.pid || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      shell: false,
    });
    await once(killer, "exit");
    return;
  }

  child.kill("SIGTERM");
  await once(child, "exit");
}

async function waitForHealth (url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}/health`);
}

async function request (
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<HttpResult> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();

  try {
    return {
      body: JSON.parse(text) as JsonValue,
      status: response.status,
    };
  } catch {
    return {
      body: text,
      status: response.status,
    };
  }
}

function normalize (result: HttpResult): JsonValue {
  if (typeof result.body === "string") {
    return {
      status: result.status,
      text: result.body,
    };
  }

  if (result.body && typeof result.body === "object" && !Array.isArray(result.body)) {
    const body = { ...(result.body as Record<string, JsonValue>) };

    if (Array.isArray(body.transactions)) {
      body.transactions = (body.transactions as JsonValue[]).map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return entry;
        }

        const tx = { ...(entry as Record<string, JsonValue>) };
        delete tx.createdAt;
        delete tx.created_at;
        delete tx.updatedAt;
        delete tx.updated_at;
        return tx;
      });
    }

    if (Array.isArray(body.fee_payers)) {
      body.fee_payers = (body.fee_payers as JsonValue[]).map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return entry;
        }

        const payer = { ...(entry as Record<string, JsonValue>) };
        delete payer.in_flight;
        delete payer.total_uses;
        delete payer.balance;
        delete payer.sequence_number;
        return payer;
      });
    }

    if (Array.isArray(body.horizon_nodes)) {
      body.horizon_nodes = (body.horizon_nodes as JsonValue[]).map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return entry;
        }

        const node = { ...(entry as Record<string, JsonValue>) };
        delete node.last_checked_at;
        delete node.last_success_at;
        delete node.last_error;
        delete node.consecutive_failures;
        return node;
      });
    }

    return sortJson({
      status: result.status,
      body,
    });
  }

  return sortJson({
    status: result.status,
    body: result.body,
  });
}

function sortJson (value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJson(entryValue as JsonValue)])
    );
  }

  return value;
}

async function buildSignedTransaction (): Promise<string> {
  const userKeypair = StellarSdk.Keypair.random();
  const sourceAccount = new StellarSdk.Account(userKeypair.publicKey(), "1");
  const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        amount: "1",
        asset: StellarSdk.Asset.native(),
        destination: StellarSdk.Keypair.random().publicKey(),
      })
    )
    .setTimeout(30)
    .build();

  tx.sign(userKeypair);
  return tx.toXDR();
}

async function buildFeeBumpXdr (feePayerSecret: string): Promise<string> {
  const userKeypair = StellarSdk.Keypair.random();
  const feePayer = StellarSdk.Keypair.fromSecret(feePayerSecret);
  const sourceAccount = new StellarSdk.Account(userKeypair.publicKey(), "1");
  const inner = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        amount: "1",
        asset: StellarSdk.Asset.native(),
        destination: feePayer.publicKey(),
      })
    )
    .setTimeout(30)
    .build();

  inner.sign(userKeypair);
  const feeBump = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
    feePayer,
    "200",
    inner,
    StellarSdk.Networks.TESTNET
  );
  feeBump.sign(feePayer);
  return feeBump.toXDR();
}

async function main (): Promise<void> {
  const serverDir = process.cwd();
  const repoDir = `${serverDir}\\..`;
  const rustDir = `${repoDir}\\paymaster-server`;
  const rustBinary =
    process.platform === "win32"
      ? `${rustDir}\\target\\debug\\paymaster-server.exe`
      : `${rustDir}/target/debug/paymaster-server`;
  const feePayer = StellarSdk.Keypair.random();
  const portSeed = 3200 + Math.floor(Math.random() * 200);
  const nodePort = String(portSeed);
  const rustPort = String(portSeed + 1);
  const envBase = {
    ...process.env,
    PAYMASTER_FEE_PAYER_SECRET: feePayer.secret(),
    NODE_ENV: "test",
    STELLAR_NETWORK_PASSPHRASE: StellarSdk.Networks.TESTNET,
    STELLAR_HORIZON_URL: "",
  };

  const nodeProcess = startProcess(
    process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npx",
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npx.cmd ts-node src/index.ts"]
      : ["ts-node", "src/index.ts"],
    serverDir,
    { ...envBase, PORT: nodePort },
    "node"
  );
  const rustProcess = startProcess(
    rustBinary,
    [],
    rustDir,
    { ...envBase, PORT: rustPort },
    "rust"
  );

  try {
    await Promise.all([
      waitForHealth(`http://127.0.0.1:${nodePort}`),
      waitForHealth(`http://127.0.0.1:${rustPort}`),
    ]);

    const signedXdr = await buildSignedTransaction();
    const feeBumpedXdr = await buildFeeBumpXdr(feePayer.secret());
    const cases: Array<[string, Promise<[HttpResult, HttpResult]>]> = [
      [
        "health",
        Promise.all([
          request(`http://127.0.0.1:${nodePort}`, "/health"),
          request(`http://127.0.0.1:${rustPort}`, "/health"),
        ]),
      ],
      [
        "missing-api-key",
        Promise.all([
          request(`http://127.0.0.1:${nodePort}`, "/fee-bump", {
            body: JSON.stringify({ xdr: signedXdr, submit: false }),
            headers: { "content-type": "application/json" },
            method: "POST",
          }),
          request(`http://127.0.0.1:${rustPort}`, "/fee-bump", {
            body: JSON.stringify({ xdr: signedXdr, submit: false }),
            headers: { "content-type": "application/json" },
            method: "POST",
          }),
        ]),
      ],
      [
        "invalid-api-key",
        Promise.all([
          request(`http://127.0.0.1:${nodePort}`, "/fee-bump", {
            body: JSON.stringify({ xdr: signedXdr, submit: false }),
            headers: { "content-type": "application/json", "x-api-key": "bad-key" },
            method: "POST",
          }),
          request(`http://127.0.0.1:${rustPort}`, "/fee-bump", {
            body: JSON.stringify({ xdr: signedXdr, submit: false }),
            headers: { "content-type": "application/json", "x-api-key": "bad-key" },
            method: "POST",
          }),
        ]),
      ],
      [
        "add-transaction",
        Promise.all([
          request(`http://127.0.0.1:${nodePort}`, "/test/add-transaction", {
            body: JSON.stringify({ hash: "test-parity-hash", status: "pending" }),
            headers: { "content-type": "application/json" },
            method: "POST",
          }),
          request(`http://127.0.0.1:${rustPort}`, "/test/add-transaction", {
            body: JSON.stringify({ hash: "test-parity-hash", status: "pending" }),
            headers: { "content-type": "application/json" },
            method: "POST",
          }),
        ]),
      ],
      [
        "transactions",
        Promise.all([
          request(`http://127.0.0.1:${nodePort}`, "/test/transactions"),
          request(`http://127.0.0.1:${rustPort}`, "/test/transactions"),
        ]),
      ],
      [
        "already-fee-bumped",
        Promise.all([
          request(`http://127.0.0.1:${nodePort}`, "/fee-bump", {
            body: JSON.stringify({ xdr: feeBumpedXdr, submit: false }),
            headers: {
              "content-type": "application/json",
              "x-api-key": "paymaster-pro-demo-key",
            },
            method: "POST",
          }),
          request(`http://127.0.0.1:${rustPort}`, "/fee-bump", {
            body: JSON.stringify({ xdr: feeBumpedXdr, submit: false }),
            headers: {
              "content-type": "application/json",
              "x-api-key": "paymaster-pro-demo-key",
            },
            method: "POST",
          }),
        ]),
      ],
      [
        "valid-fee-bump",
        Promise.all([
          request(`http://127.0.0.1:${nodePort}`, "/fee-bump", {
            body: JSON.stringify({ xdr: signedXdr, submit: false }),
            headers: {
              "content-type": "application/json",
              "x-api-key": "paymaster-pro-demo-key",
            },
            method: "POST",
          }),
          request(`http://127.0.0.1:${rustPort}`, "/fee-bump", {
            body: JSON.stringify({ xdr: signedXdr, submit: false }),
            headers: {
              "content-type": "application/json",
              "x-api-key": "paymaster-pro-demo-key",
            },
            method: "POST",
          }),
        ]),
      ],
    ];

    for (const [name, promise] of cases) {
      const [nodeResult, rustResult] = await promise;
      const normalizedNode = normalize(nodeResult);
      const normalizedRust = normalize(rustResult);

      if (JSON.stringify(normalizedNode) !== JSON.stringify(normalizedRust)) {
        logger.error(
          {
            case_name: name,
            node_result: normalizedNode,
            rust_result: normalizedRust,
          },
          "PARITY_FAIL"
        );
        process.exitCode = 1;
        return;
      }

      logger.info({ case_name: name }, "PARITY_OK");
    }

    const dashboard = await request(`http://127.0.0.1:${rustPort}`, "/");
    if (dashboard.status !== 200 || typeof dashboard.body !== "string") {
      throw new Error("Rust dashboard route failed");
    }

    logger.info({ case_name: "rust-dashboard" }, "PARITY_OK");
  } finally {
    await Promise.allSettled([stopProcess(nodeProcess), stopProcess(rustProcess)]);
  }
}

main().catch((error) => {
  logger.error({ ...serializeError(error) }, "Parity check failed");
  process.exitCode = 1;
});
