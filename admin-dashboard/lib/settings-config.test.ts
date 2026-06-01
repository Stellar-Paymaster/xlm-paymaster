import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  SETTINGS_FIELDS,
  mergeWithDefaults,
  validateSettings,
} from "./settings-config.ts";

test("DEFAULT_SETTINGS has a positive base_fee", () => {
  assert.ok(DEFAULT_SETTINGS.base_fee >= 0);
});

test("DEFAULT_SETTINGS has fee_multiplier of at least 1", () => {
  assert.ok(DEFAULT_SETTINGS.fee_multiplier >= 1);
});

test("DEFAULT_SETTINGS rate_limit_per_minute is at least 1", () => {
  assert.ok(DEFAULT_SETTINGS.rate_limit_per_minute >= 1);
});

test("validateSettings accepts a valid config", () => {
  assert.equal(validateSettings(DEFAULT_SETTINGS), true);
});

test("validateSettings rejects null", () => {
  assert.equal(validateSettings(null), false);
});

test("validateSettings rejects config with fee_multiplier below 1", () => {
  assert.equal(
    validateSettings({ ...DEFAULT_SETTINGS, fee_multiplier: 0.5 }),
    false,
  );
});

test("validateSettings rejects config with negative base_fee", () => {
  assert.equal(
    validateSettings({ ...DEFAULT_SETTINGS, base_fee: -1 }),
    false,
  );
});

test("validateSettings rejects config with rate_limit_per_minute of 0", () => {
  assert.equal(
    validateSettings({ ...DEFAULT_SETTINGS, rate_limit_per_minute: 0 }),
    false,
  );
});

test("validateSettings rejects non-object input", () => {
  assert.equal(validateSettings("not-an-object"), false);
  assert.equal(validateSettings(42), false);
  assert.equal(validateSettings(undefined), false);
});

test("mergeWithDefaults fills in missing fields with defaults", () => {
  const result = mergeWithDefaults({ base_fee: 200 });
  assert.equal(result.base_fee, 200);
  assert.equal(result.fee_multiplier, DEFAULT_SETTINGS.fee_multiplier);
  assert.equal(result.rate_limit_per_minute, DEFAULT_SETTINGS.rate_limit_per_minute);
});

test("mergeWithDefaults does not mutate DEFAULT_SETTINGS", () => {
  const original = DEFAULT_SETTINGS.base_fee;
  mergeWithDefaults({ base_fee: 9999 });
  assert.equal(DEFAULT_SETTINGS.base_fee, original);
});

test("SETTINGS_FIELDS covers every key in DEFAULT_SETTINGS", () => {
  const fieldKeys = SETTINGS_FIELDS.map((f) => f.key);
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    assert.ok(
      fieldKeys.includes(key as keyof typeof DEFAULT_SETTINGS),
      `${key} should have a field definition`,
    );
  }
});

test("every SETTINGS_FIELD has a non-empty label and description", () => {
  for (const field of SETTINGS_FIELDS) {
    assert.ok(field.label.length > 0, `${field.key} label is empty`);
    assert.ok(field.description.length > 0, `${field.key} description is empty`);
  }
});
