import test from "node:test";
import assert from "node:assert/strict";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, LANGUAGE_STORAGE_KEY } from "../config.ts";

import en from "../../locales/en.json" assert { type: "json" };
import es from "../../locales/es.json" assert { type: "json" };
import pt from "../../locales/pt.json" assert { type: "json" };
import zh from "../../locales/zh.json" assert { type: "json" };

test("i18n config has all supported locales", () => {
  assert.deepEqual(SUPPORTED_LOCALES, ["en", "es", "pt", "zh"]);
  assert.equal(DEFAULT_LOCALE, "en");
});

test("translation files contain required keys", () => {
  // Check navigation keys exist
  assert.ok(en.navigation.dashboard);
  assert.ok(es.navigation.dashboard);
  assert.ok(pt.navigation.dashboard);
  assert.ok(zh.navigation.dashboard);

  // Check fee keys exist
  assert.ok(en.fee.estimatedFee);
  assert.ok(es.fee.estimatedFee);
  assert.ok(pt.fee.estimatedFee);
  assert.ok(zh.fee.estimatedFee);
});

test("fee estimation test key exists in all locales", () => {
  assert.equal(en.fee.estimatedFee, "Estimated Fee");
  assert.equal(es.fee.estimatedFee, "Tarifa Estimada");
  assert.equal(pt.fee.estimatedFee, "Taxa Estimada");
  assert.ok(zh.fee.estimatedFee);
});

test("LanguageSwitcher storage key is defined", () => {
  assert.equal(LANGUAGE_STORAGE_KEY, "fluid-admin-language");
});