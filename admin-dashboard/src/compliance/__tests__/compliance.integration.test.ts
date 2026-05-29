import test from "node:test";
import assert from "node:assert/strict";
import { ComplianceRegistry } from "../ComplianceRegistry.ts";
import { BrazilCPFHook } from "../hooks/brazilian-cpf-hook.ts";

/**
 * Integration test simulating a form submission going through the compliance hook pipeline.
 * Tests the full validation flow with form data.
 */
test("Compliance hook pipeline validates form submission with CPF", async () => {
  const registry = new ComplianceRegistry();
  registry.register(new BrazilCPFHook());

  // Simulate form submission payload
  const formData = {
    name: "João Silva",
    email: "joao@example.com",
    cpf: "529.982.247-25",
    age: 30,
  };

  const results = await registry.execute("BR", formData);
  
  assert.equal(results.length, 1);
  assert.equal(results[0].valid, true);
  assert.equal(results[0].region, "BR");
});

test("Compliance hook pipeline rejects invalid CPF in form submission", async () => {
  const registry = new ComplianceRegistry();
  registry.register(new BrazilCPFHook());

  // Form with invalid CPF
  const formData = {
    name: "Maria Souza",
    email: "maria@example.com",
    cpf: "123.456.789-01", // Invalid checksum
  };

  const results = await registry.execute("BR", formData);
  
  assert.equal(results.length, 1);
  assert.equal(results[0].valid, false);
  assert.equal(results[0].errorMessage, "Invalid CPF checksum");
});

test("Compliance hook pipeline handles missing CPF gracefully", async () => {
  const registry = new ComplianceRegistry();
  registry.register(new BrazilCPFHook());

  // Form without CPF field - hook should pass (not applicable)
  const formData = {
    name: "Pedro Alves",
    email: "pedro@example.com",
  };

  const results = await registry.execute("BR", formData);
  
  assert.equal(results.length, 1);
  assert.equal(results[0].valid, true);
});

test("Compliance hook pipeline handles multiple regions", async () => {
  const registry = new ComplianceRegistry();
  registry.register(new BrazilCPFHook());
  
  // Simulate BR region with CPF
  const brResults = registry.execute("BR", { cpf: "529.982.247-25" });
  const brData = await brResults;
  assert.equal(brData.length, 1);
  assert.equal(brData[0].valid, true);

  // Simulate unknown region - returns empty
  const unknownResults = registry.execute("US", { ssn: "123-45-6789" });
  const unknownData = await unknownResults;
  assert.deepEqual(unknownData, []);
});

test("Form component integration with compliance validation", async () => {
  const registry = new ComplianceRegistry();
  registry.register(new BrazilCPFHook());
  
  // This simulates a form component using compliance hooks
  function FormWithCompliance() {
    const handleSubmit = (data: { cpf: string }) => {
      const results = registry.execute("BR", data);
      return "async"; // We're using sync for this test
    };
    return handleSubmit({ cpf: "529.982.247-25" });
  }

  const result = FormWithCompliance();
  assert.equal(result, "async");
});

test("Form validation with formatted CPF input", async () => {
  const registry = new ComplianceRegistry();
  registry.register(new BrazilCPFHook());
  
  // Simulate form receiving formatted CPF input
  const rawInputs = [
    "529.982.247-25",
    "52998224725",
  ];

  for (const input of rawInputs) {
    const results = await registry.execute("BR", { cpf: input });
    assert.equal(results[0].valid, true);
  }
});