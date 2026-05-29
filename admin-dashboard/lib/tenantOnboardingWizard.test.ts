import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import {
  initializeWizard,
  advanceStep,
  regressStep,
  updateTenantData,
  validateTenantData,
  generateApiKey,
  setApiKey,
  completeWizard,
  resetWizard,
  type WizardState,
  type TenantData,
} from "./tenantOnboardingWizard.ts";

describe("Tenant Onboarding Wizard", () => {
  let state: WizardState;

  beforeEach(() => {
    state = initializeWizard();
  });

  test("should initialize wizard in welcome step", () => {
    assert.strictEqual(state.currentStep, "welcome");
    assert.deepStrictEqual(state.completedSteps, []);
    assert.strictEqual(state.tenantData, null);
    assert.strictEqual(state.apiKey, null);
  });

  test("should advance from welcome to tenant-info", () => {
    const nextState = advanceStep(state);
    assert.strictEqual(nextState.currentStep, "tenant-info");
    assert.deepStrictEqual(nextState.completedSteps, ["welcome"]);
  });

  test("should advance through all steps sequentially", () => {
    let current = state;

    current = advanceStep(current);
    assert.strictEqual(current.currentStep, "tenant-info");

    current = advanceStep(current);
    assert.strictEqual(current.currentStep, "api-key-generation");

    current = advanceStep(current);
    assert.strictEqual(current.currentStep, "api-key-verification");

    current = advanceStep(current);
    assert.strictEqual(current.currentStep, "completion");

    const afterCompletion = advanceStep(current);
    assert.strictEqual(afterCompletion.currentStep, "completion");
  });

  test("should regress to previous step", () => {
    let current = advanceStep(state);
    current = advanceStep(current);
    assert.strictEqual(current.currentStep, "api-key-generation");

    current = regressStep(current);
    assert.strictEqual(current.currentStep, "tenant-info");
    assert.deepStrictEqual(current.completedSteps, ["welcome"]);
  });

  test("should not regress from welcome step", () => {
    const afterRegress = regressStep(state);
    assert.strictEqual(afterRegress.currentStep, "welcome");
    assert.deepStrictEqual(afterRegress.completedSteps, []);
  });

  test("should update tenant data", () => {
    const tenantData: TenantData = {
      tenantName: "Acme Corp",
      tenantEmail: "contact@acme.com",
      tenantDescription: "A great company",
    };

    const updated = updateTenantData(state, tenantData);
    assert.deepStrictEqual(updated.tenantData, tenantData);
  });

  test("should partially update tenant data", () => {
    let current = updateTenantData(state, {
      tenantName: "Acme Corp",
      tenantEmail: "contact@acme.com",
    });

    current = updateTenantData(current, {
      tenantDescription: "Updated description",
    });

    assert.strictEqual(current.tenantData?.tenantName, "Acme Corp");
    assert.strictEqual(current.tenantData?.tenantEmail, "contact@acme.com");
    assert.strictEqual(
      current.tenantData?.tenantDescription,
      "Updated description"
    );
  });

  test("should validate valid tenant data", () => {
    const validData: TenantData = {
      tenantName: "Test Company",
      tenantEmail: "test@example.com",
      tenantDescription: "Test description",
      webhookUrl: "https://example.com/webhook",
    };

    const result = validateTenantData(validData);
    assert.strictEqual(result.valid, true);
    assert.deepStrictEqual(result.errors, {});
  });

  test("should validate tenant name length", () => {
    const shortName: TenantData = {
      tenantName: "AB",
      tenantEmail: "test@example.com",
    };

    const result = validateTenantData(shortName);
    assert.strictEqual(result.valid, false);
    assert.ok("tenantName" in result.errors);
  });

  test("should validate email format", () => {
    const invalidEmail: TenantData = {
      tenantName: "Test Company",
      tenantEmail: "not-an-email",
    };

    const result = validateTenantData(invalidEmail);
    assert.strictEqual(result.valid, false);
    assert.ok("tenantEmail" in result.errors);
  });

  test("should validate webhook URL format", () => {
    const invalidUrl: TenantData = {
      tenantName: "Test Company",
      tenantEmail: "test@example.com",
      webhookUrl: "not-a-url",
    };

    const result = validateTenantData(invalidUrl);
    assert.strictEqual(result.valid, false);
    assert.ok("webhookUrl" in result.errors);
  });

  test("should allow empty webhook URL", () => {
    const noWebhook: TenantData = {
      tenantName: "Test Company",
      tenantEmail: "test@example.com",
      webhookUrl: "",
    };

    const result = validateTenantData(noWebhook);
    assert.strictEqual(result.valid, true);
  });

  test("should allow missing optional fields", () => {
    const minimalData: TenantData = {
      tenantName: "Test Company",
      tenantEmail: "test@example.com",
    };

    const result = validateTenantData(minimalData);
    assert.strictEqual(result.valid, true);
  });

  test("should generate valid API key", () => {
    const apiKey = generateApiKey();
    assert.ok(apiKey.startsWith("sk_admin_"));
    assert.ok(apiKey.length > "sk_admin_".length);
  });

  test("should generate unique API keys", () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    assert.notStrictEqual(key1, key2);
  });

  test("should set API key", () => {
    const apiKey = generateApiKey();
    const updated = setApiKey(state, apiKey);
    assert.strictEqual(updated.apiKey, apiKey);
  });

  test("should complete wizard with valid data", () => {
    let current = state;
    current = updateTenantData(current, {
      tenantName: "Test Company",
      tenantEmail: "test@example.com",
    });
    current = setApiKey(current, generateApiKey());

    const completed = completeWizard(current);
    assert.strictEqual(completed.currentStep, "completion");
    assert.deepStrictEqual(completed.completedSteps, [
      "welcome",
      "tenant-info",
      "api-key-generation",
      "api-key-verification",
    ]);
  });

  test("should not complete wizard without tenant data", () => {
    const current = setApiKey(state, generateApiKey());
    const result = completeWizard(current);
    assert.ok("general" in result.errors);
  });

  test("should not complete wizard without API key", () => {
    let current = state;
    current = updateTenantData(current, {
      tenantName: "Test Company",
      tenantEmail: "test@example.com",
    });

    const result = completeWizard(current);
    assert.ok("general" in result.errors);
  });

  test("should reset wizard to initial state", () => {
    let current = advanceStep(state);
    current = updateTenantData(current, {
      tenantName: "Test Company",
      tenantEmail: "test@example.com",
    });
    current = setApiKey(current, generateApiKey());

    const reset = resetWizard();
    assert.strictEqual(reset.currentStep, "welcome");
    assert.deepStrictEqual(reset.completedSteps, []);
    assert.strictEqual(reset.tenantData, null);
    assert.strictEqual(reset.apiKey, null);
  });

  test("should clear errors when updating tenant data", () => {
    let current = state;
    current = {
      ...current,
      errors: { tenantName: "Error message" },
    };

    current = updateTenantData(current, {
      tenantName: "Valid Name",
      tenantEmail: "test@example.com",
    });

    assert.deepStrictEqual(current.errors, {});
  });
});
