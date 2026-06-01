import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverScript = path.join(__dirname, "server.mjs");

async function waitForServer(serverProcess) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for the demo server")), 30000); // Increased to 30s
    serverProcess.stdout.on("data", (chunk) => {
      const message = chunk.toString();
      if (message.includes("Fluid WASM demo server listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    serverProcess.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Demo server exited early with code ${code}`));
    });
  });
}

async function main() {
  console.log("Starting WASM browser validation...");
  const serverProcess = startServer();
  
  // Log server output to help debug in CI
  serverProcess.stdout.on("data", (chunk) => console.log(`[Server]: ${chunk.toString().trim()}`));
  serverProcess.stderr.on("data", (chunk) => console.error(`[Server Error]: ${chunk.toString().trim()}`));

  try {
    console.log("Waiting for demo server to be ready...");
    await waitForServer(serverProcess);
    console.log("Server ready. Launching chromium...");

    const browser = await chromium.launch({
      headless: true
    });

    try {
      const page = await browser.newPage();
      const consoleMessages = [];
      page.on("console", (message) => {
        consoleMessages.push(message.text());
        console.log(`[Browser Console]: ${message.text()}`);
      });

      console.log("Navigating to demo page...");
      await page.goto("http://127.0.0.1:4173/wasm-demo/index.html", {
        waitUntil: "networkidle",
        timeout: 60000
      });

      console.log("Waiting for WASM execution to complete...");
      await page.waitForFunction(() => document.body.dataset.status !== "running", undefined, {
        timeout: 120000 // Increased to 2 minutes for slow CI runners
      });

      const status = await page.evaluate(() => document.body.dataset.status);
      console.log(`Execution finished with status: ${status}`);

      if (status !== "success") {
        const mirroredOutput = await page.evaluate(() => {
          const output = document.getElementById("console-output");
          return output ? output.textContent : "";
        });
        throw new Error(
          `WASM demo did not reach success state (status=${status}). Output: ${mirroredOutput}`
        );
      }

      const successMessage = consoleMessages.find((entry) =>
        entry.includes("WASM signing successful")
      );

      if (!successMessage) {
        throw new Error(`Expected browser console success log, got: ${consoleMessages.join(" | ")}`);
      }

      console.log("✅ WASM signing successful in browser");
    } finally {
      await browser.close();
    }
  } finally {
    serverProcess.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
