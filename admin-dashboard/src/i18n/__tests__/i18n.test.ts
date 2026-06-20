import test from "node:test";
import assert from "node:assert/strict";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, LANGUAGE_STORAGE_KEY, normalizeLocale } from "../config.ts";

import en from "../../locales/en.json" assert { type: "json" };
import es from "../../locales/es.json" assert { type: "json" };
import fr from "../../locales/fr.json" assert { type: "json" };
import ja from "../../locales/ja.json" assert { type: "json" };
import pt from "../../locales/pt.json" assert { type: "json" };
import zh from "../../locales/zh.json" assert { type: "json" };

test("i18n config has all supported locales", () => {
  assert.deepEqual(SUPPORTED_LOCALES, ["en", "es", "fr", "ja", "pt", "zh"]);
  assert.equal(DEFAULT_LOCALE, "en");
  assert.equal(normalizeLocale("es-MX"), "es");
  assert.equal(normalizeLocale("unknown"), "en");
});

test("translation files contain required keys", () => {
  // Check navigation keys exist
  assert.ok(en.navigation.dashboard);
  assert.ok(es.navigation.dashboard);
  assert.ok(fr.languageSwitcher.select);
  assert.ok(ja.languageSwitcher.select);
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
  assert.ok(fr.languageSwitcher.options);
  assert.ok(ja.languageSwitcher.options);
});

test("LanguageSwitcher storage key is defined", () => {
  assert.equal(LANGUAGE_STORAGE_KEY, "paymaster-admin-locale");
});