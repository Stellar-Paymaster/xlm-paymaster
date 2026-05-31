#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import path from "path";
import { FluidClient } from "../FluidClient";
import StellarSdk from "@stellar/stellar-sdk";
import { simulateFeeBump, formatSimulationResult } from "./transactionSimulator";
import { lookupByCode, searchErrorCodes, formatErrorHelp, listAllCodes } from "../errorCodes";

export function createProgram() {
  const program = new Command();

  program
    .name("fluid")
    .description("Fluid Platform CLI for developers")
    .version("0.1.0");

  const config = program.command("config").description("Manage platform configurations");

  config
    .command("upload")
    .description("Upload a local configuration file to the Fluid platform")
    .argument("<file>", "Path to the configuration file (JSON)")
    .option("-s, --server <url>", "Fluid server URL", "http://localhost:3000")
    .action(async (file, options) => {
      try {
        const filePath = path.resolve(process.cwd(), file);
        if (!fs.existsSync(filePath)) {
          console.error(`Error: File not found at ${filePath}`);
          process.exit(1);
        }

        const content = fs.readFileSync(filePath, "utf8");
        const configData = JSON.parse(content);

        console.log(`Uploading configuration from ${file} to ${options.server}...`);
        
        // Mocked implementation for config upload
        // In a real scenario, this would call a protected endpoint on the Fluid server
        const response = await fetch(`${options.server}/cli/config/upload`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Fluid-CLI-Version": "0.1.0",
          },
          body: JSON.stringify(configData),
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${await response.text()}`);
        }

        console.log("✅ Configuration uploaded successfully!");
      } catch (error) {
        console.error(`❌ Upload failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  config
    .command("download")
    .description("Download the latest platform configuration")
    .argument("[destination]", "Path to save the configuration", "./fluid.config.json")
    .option("-s, --server <url>", "Fluid server URL", "http://localhost:3000")
    .action(async (destination, options) => {
      try {
        console.log(`Downloading configuration from ${options.server}...`);

        const response = await fetch(`${options.server}/cli/config/download`, {
          method: "GET",
          headers: {
            "X-Fluid-CLI-Version": "0.1.0",
          },
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${await response.text()}`);
        }

        const configData = await response.json();
        const destPath = path.resolve(process.cwd(), destination);
        
        fs.writeFileSync(destPath, JSON.stringify(configData, null, 2));
        console.log(`✅ Configuration saved to ${destPath}`);
      } catch (error) {
        console.error(`❌ Download failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  program
    .command("simulate")
    .description("Simulate a fee-bump request without submitting it to the network")
    .argument("<xdr>", "The inner transaction XDR to fee-bump")
    .option("-s, --server <url>", "Fluid server URL", "http://localhost:3000")
    .option("-n, --network <passphrase>", "Stellar network passphrase", StellarSdk.Networks.TESTNET)
    .option("-j, --json", "Output the result as JSON", false)
    .option("-l, --local", "Simulate locally offline without contacting the Fluid server", false)
    .option("-f, --fee-payer <public-key>", "Fee payer public key (required/used for local simulation)")
    .option("-b, --base-fee <fee>", "Base fee in stroops for local simulation", "100")
    .action(async (xdr, options) => {
      try {
        if (options.local) {
          if (!options.json) {
            console.log(`🔍 Simulating fee-bump locally (offline)...`);
          }
          const result = simulateFeeBump({
            innerXdr: xdr,
            networkPassphrase: options.network,
            feePayerPublicKey: options.feePayer,
            baseFee: parseInt(options.baseFee, 10),
          });
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(formatSimulationResult(result));
          }
          if (!result.success) {
            process.exit(1);
          }
          return;
        }

        if (!options.json) {
          console.log(`🔍 Simulating fee-bump for transaction...`);
          console.log(`   Server: ${options.server}`);
          console.log(`   Network: ${options.network}`);
        }

        const client = new FluidClient({
          serverUrl: options.server,
          networkPassphrase: options.network,
        });

        const response = await client.requestFeeBump(xdr, false);

        if (options.json) {
          console.log(JSON.stringify(response, null, 2));
        } else {
          console.log("\n✅ Fee-bump simulation successful!");
          console.log("--------------------------------------------------");
          console.log(`Status:      ${response.status}`);
          console.log(`Hash:        ${response.hash || "N/A"}`);
          console.log(`Fee Payer:   ${response.fee_payer || "N/A"}`);
          console.log(`Fee-Bump XDR:`);
          console.log(response.xdr);
          console.log("--------------------------------------------------");
          console.log("\n(Note: This transaction has NOT been submitted to the network)");
        }
      } catch (error) {
        if (options.json) {
          console.error(JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            type: error && typeof error === 'object' && 'name' in error ? error.name : 'Error',
            serverUrl: error && typeof error === 'object' && 'serverUrl' in error ? (error as any).serverUrl : undefined,
            statusCode: error && typeof error === 'object' && 'statusCode' in error ? (error as any).statusCode : undefined,
          }, null, 2));
        } else {
          console.error(`\n❌ Simulation failed!`);
          if (error && typeof error === 'object' && 'name' in error) {
            console.error(`   Error Type: ${error.name}`);
          }
          console.error(`   Message:    ${error instanceof Error ? error.message : String(error)}`);
          if (error && typeof error === 'object' && 'serverUrl' in error) {
            console.error(`   Server:     ${(error as any).serverUrl}`);
          }
        }
        process.exit(1);
      }
    });

  program
    .command("errors")
    .description("Look up or search Fluid API error codes wiki")
    .argument("[query]", "Error code (e.g., FLUID_001) or search query")
    .option("-l, --list", "List all registered Fluid API error codes", false)
    .option("-s, --search", "Treat the query as a free-text search query rather than a code", false)
    .action((query, options) => {
      if (options.list) {
        console.log(listAllCodes());
        return;
      }

      if (!query) {
        console.error("❌ Error: A query or error code must be specified, or use --list to see all codes.");
        process.exit(1);
      }

      if (options.search) {
        const results = searchErrorCodes(query);
        if (results.length === 0) {
          console.log(`No error codes matched search query: "${query}"`);
          return;
        }
        console.log(`Found ${results.length} matching error code(s):`);
        for (const res of results) {
          console.log(formatErrorHelp(res.code));
          console.log("");
        }
        return;
      }

      // Default: look up by exact code, fall back to search if not found
      const entry = lookupByCode(query);
      if (entry) {
        console.log(formatErrorHelp(entry.code));
      } else {
        const searchResults = searchErrorCodes(query);
        if (searchResults.length > 0) {
          console.log(`Code "${query}" not found. Showing ${searchResults.length} partial search match(es):`);
          for (const res of searchResults) {
            console.log(formatErrorHelp(res.code));
            console.log("");
          }
        } else {
          console.log(formatErrorHelp(query));
        }
      }
    });

  return program;
}

if (require.main === module) {
  createProgram().parse();
}

