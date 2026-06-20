import { PaymasterClient } from "../PaymasterClient";

const PRIMARY_SERVER_URL = "https://primary-paymaster.example";
const SECONDARY_SERVER_URL = "https://secondary-paymaster.example";

const responses = [
  new Response(JSON.stringify({ error: "primary unavailable" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  }),
  new Response(
    JSON.stringify({
      xdr: "fallback-xdr",
      status: "ready",
      hash: "demo-hash",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  ),
];

globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
  console.log(`[demo] fetch -> ${String(input)}`);

  const next = responses.shift();
  if (!next) {
    throw new Error("No mock response configured");
  }

  return next;
};

async function main(): Promise<void> {
  const client = new PaymasterClient({
    serverUrls: [PRIMARY_SERVER_URL, SECONDARY_SERVER_URL],
    networkPassphrase: "Test SDF Network ; September 2015",
  });

  const result = await client.requestFeeBump("AAAAFAKEFAKEFAKE", false);
  console.log(`[demo] final result -> ${JSON.stringify(result)}`);
}

main().catch((error) => {
  console.error("[demo] fallback demo failed:", error);
  process.exitCode = 1;
});
