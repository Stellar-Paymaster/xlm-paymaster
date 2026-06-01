import { compareErrorParity, defaultErrorParityCases } from "../src/test/errorResponseParity";

const nodeBaseUrl = process.env.NODE_PARITY_BASE_URL ?? "http://127.0.0.1:3000";
const rustBaseUrl = process.env.RUST_PARITY_BASE_URL ?? "http://127.0.0.1:3001";

async function main(): Promise<void> {
  const results = await compareErrorParity(nodeBaseUrl, rustBaseUrl, defaultErrorParityCases);
  const failures = results.filter((result) => result.mismatches.length > 0);

  for (const result of results) {
    if (result.mismatches.length === 0) {
      console.log(`ERROR_PARITY_OK ${result.caseName}`);
      continue;
    }

    console.error(`ERROR_PARITY_FAIL ${result.caseName}`);
    console.error(
      JSON.stringify(
        {
          mismatches: result.mismatches,
          node: result.node,
          rust: result.rust,
        },
        null,
        2,
      ),
    );
  }

  if (failures.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(
    `ERROR_PARITY_COMPLETE checked=${results.length} node=${nodeBaseUrl} rust=${rustBaseUrl}`,
  );
}

main().catch((error) => {
  process.exitCode = 1;
  console.error("ERROR_PARITY_ERROR");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
});
