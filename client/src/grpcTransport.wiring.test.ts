import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { existsSync } from "node:fs";

function getFilePath(relativePath: string): string {
  const metaUrl = import.meta.url;
  let basePath = "";
  if (metaUrl.startsWith("file://")) {
    basePath = dirname(fileURLToPath(metaUrl));
  } else {
    basePath = metaUrl.includes("/") ? metaUrl.substring(0, metaUrl.lastIndexOf("/")) : ".";
  }

  const targetPath = join(basePath, relativePath);
  if (!existsSync(targetPath) && basePath.endsWith("dist")) {
    const parentDir = dirname(basePath);
    const srcPath = join(parentDir, "src", relativePath.replace("../", ""));
    if (existsSync(srcPath)) {
      return srcPath;
    }
  }
  return targetPath;
}

const fluidClientSource = readFileSync(getFilePath("./FluidClient.ts"), "utf8");
const indexSource = readFileSync(getFilePath("./index.ts"), "utf8");
const readmeSource = readFileSync(getFilePath("../README.md"), "utf8");

test("FluidClient exposes an optional grpc-web transport mode", () => {
  assert.match(fluidClientSource, /transport\?: "http" \| "grpc-web"/);
  assert.match(fluidClientSource, /grpc\?: GrpcTransportConfig/);
  assert.match(fluidClientSource, /this\.transportMode = config\.transport \?\? "http"/);
  assert.match(fluidClientSource, /performGrpcWebUnary\(/);
});

test("package exports the grpc transport helpers", () => {
  assert.match(indexSource, /DEFAULT_GRPC_SERVICE_NAME/);
  assert.match(indexSource, /performGrpcWebUnary/);
  assert.match(indexSource, /GrpcWebTransportError/);
});

test("README documents the optional grpc-web transport", () => {
  assert.match(readmeSource, /grpc-web/i);
  assert.match(readmeSource, /transport: "grpc-web"/);
});
