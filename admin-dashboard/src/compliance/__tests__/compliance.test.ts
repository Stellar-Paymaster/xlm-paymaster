import test from "node:test";
import assert from "node:assert/strict";
import { BrazilCPFHook } from "../hooks/brazilian-cpf-hook.ts";
import { ComplianceRegistry, runComplianceHooks } from "../ComplianceRegistry.ts";

test("BrazilCPFHook validates correct CPF format", () => {
  const hook = new BrazilCPFHook();
  
  // Valid CPF with formatting
  const result1 = hook.validate("529.982.247-25");
  assert.equal(result1.valid, true);
  assert.equal(result1.errorMessage, null);
  assert.equal((result1.metadata?.cleanedCpf as string), "52998224725");

  // Valid CPF without formatting
  const result2 = hook.validate("52998224725");
  assert.equal(result2.valid, true);
});

test("BrazilCPFHook rejects invalid checksum", () => {
  const hook = new BrazilCPFHook();
  // 123.456.789-01 has invalid second checksum digit
  const result = hook.validate("123.456.789-01");
  assert.equal(result.valid, false);
  assert.equal(result.errorMessage, "Invalid CPF checksum");
});

test("BrazilCPFHook handles formatting variations", () => {
  const hook = new BrazilCPFHook();
  const variations = ["52998224725", "529.982.247-25", "529 982 247 25"];
  
  for (const variation of variations) {
    const result = hook.validate(variation);
    assert.equal(result.valid, true, `Failed for ${variation}`);
  }
});

test("BrazilCPFHook rejects wrong length", () => {
  const hook = new BrazilCPFHook();
  const short = hook.validate("123456789");
  assert.equal(short.valid, false);
  assert.equal(short.errorMessage, "CPF must have exactly 11 digits");
});

test("BrazilCPFHook rejects all same digits", () => {
  const hook = new BrazilCPFHook();
  const result = hook.validate("111.111.111-11");
  assert.equal(result.valid, false);
});

test("BrazilCPFHook handles null/undefined input", () => {
  const hook = new BrazilCPFHook();
  const nullResult = hook.validate(null);
  const undefResult = hook.validate(undefined);
  
  assert.equal(nullResult.valid, false);
  assert.equal(undefResult.valid, false);
});

test("BrazilCPFHook handles non-string input coercion", () => {
  const hook = new BrazilCPFHook();
  const numResult = hook.validate(52998224725);
  assert.equal(numResult.valid, true);
  
  const objResult = hook.validate({ cpf: "529.982.247-25" });
  assert.equal(objResult.valid, true);
});

test("ComplianceRegistry registers and executes hooks", () => {
  const registry = new ComplianceRegistry();
  const hook = new BrazilCPFHook();
  
  registry.register(hook);
  const hooks = registry.getHooks("BR");
  assert.equal(hooks.length, 1);
});

test("runComplianceHooks returns empty for unknown region", () => {
  const results = runComplianceHooks("XX", { cpf: "123" });
  assert.deepEqual(results, []);
});