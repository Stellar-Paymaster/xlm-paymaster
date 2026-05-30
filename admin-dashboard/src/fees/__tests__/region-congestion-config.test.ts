import test from "node:test";
import assert from "node:assert/strict";
import { getCongestionConfig, getCongestionMultiplier } from "../config/region-congestion-config.ts";

test("getCongestionConfig returns default values", () => {
  const config = getCongestionConfig();
  assert.ok(Array.isArray(config));
  assert.ok(config.length > 0);
});

test("getCongestionMultiplier returns correct values for known regions", () => {
  // BR region
  assert.equal(getCongestionMultiplier("BR", "low"), 1.2);
  assert.equal(getCongestionMultiplier("BR", "medium"), 1.4);
  assert.equal(getCongestionMultiplier("BR", "high"), 1.6);
  
  // EU region
  assert.equal(getCongestionMultiplier("EU", "low"), 1.1);
  
  // US region
  assert.equal(getCongestionMultiplier("US", "high"), 1.2);
});

test("getCongestionMultiplier returns global average for unknown region", () => {
  const result = getCongestionMultiplier("XX", "medium");
  assert.equal(result, 1.1);
});

test("getCongestionMultiplier is case insensitive", () => {
  assert.equal(getCongestionMultiplier("br", "low"), 1.2);
  assert.equal(getCongestionMultiplier("Br", "medium"), 1.4);
});

test("getCongestionConfig handles invalid JSON env var", () => {
  const originalEnv = process.env.FLUID_CONGESTION_CONFIG;
  // @ts-expect-error - testing with invalid value
  process.env.FLUID_CONGESTION_CONFIG = "invalid-json";
  
  const config = getCongestionConfig();
  assert.ok(Array.isArray(config));
  assert.ok(config.length > 0);
  
  process.env.FLUID_CONGESTION_CONFIG = originalEnv;
});