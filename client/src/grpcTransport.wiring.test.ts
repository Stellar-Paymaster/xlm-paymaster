import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fluidClientSource = readFileSync(new URL("./FluidClient.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const readmeSource = readFileSync(new URL("../README.md", import.meta.url), "utf8");

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
