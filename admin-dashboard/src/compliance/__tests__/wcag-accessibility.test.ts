import test from "node:test";
import assert from "node:assert/strict";
import { WCAGAudit } from "../accessibility/WCAGAudit.ts";
import { WCAGAccessibilityHook } from "../hooks/wcag-accessibility-hook.ts";

test("WCAGAudit calculates relative luminance of black and white exactly", () => {
  const whiteLum = WCAGAudit.calculateLuminance("#FFFFFF");
  const blackLum = WCAGAudit.calculateLuminance("#000000");

  assert.equal(whiteLum, 1.0);
  assert.equal(blackLum, 0.0);
});

test("WCAGAudit calculates contrast ratio of black vs white exactly as 21:1", () => {
  const contrast = WCAGAudit.calculateContrastRatio("#FFFFFF", "#000000");
  assert.equal(Number(contrast.toFixed(1)), 21.0);
});

test("WCAGAudit verifies compliant and non-compliant contrast ratios", () => {
  // Compliant: High contrast black on white (21:1)
  assert.equal(WCAGAudit.verifyContrast("#000000", "#FFFFFF"), true);

  // Compliant: Low contrast gray on white (should fail for regular text, but pass if we check custom ratio)
  // Gray #767676 has exactly 4.5:1 contrast against white (#FFFFFF)
  assert.equal(WCAGAudit.verifyContrast("#767676", "#FFFFFF"), true);

  // Non-compliant: Light gray on white (#CCCCCC on #FFFFFF, ~1.6:1)
  assert.equal(WCAGAudit.verifyContrast("#CCCCCC", "#FFFFFF"), false);
});

test("WCAGAudit audits heading sequences and flags skipped levels", () => {
  // Valid heading order
  const validHtml = "<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>";
  const resultValid = WCAGAudit.auditHtml(validHtml);
  assert.equal(resultValid.valid, true);
  assert.equal(resultValid.violations.length, 0);

  // Invalid heading order (skips h1 -> h3)
  const invalidHtml = "<h1>Title</h1><h3>Skipped Subtitle</h3>";
  const resultInvalid = WCAGAudit.auditHtml(invalidHtml);
  assert.equal(resultInvalid.valid, false);
  assert.equal(resultInvalid.metadata.headingViolations, 1);
  assert.ok(resultInvalid.violations[0].includes("Heading level skipped: h1 directly to h3"));
});

test("WCAGAudit audits negative tabIndexes for keyboard accessibility", () => {
  const invalidHtml = `<button tabindex="-1">Can't tab here</button>`;
  const result = WCAGAudit.auditHtml(invalidHtml);
  
  assert.equal(result.valid, false);
  assert.equal(result.metadata.tabIndexViolations, 1);
  assert.ok(result.violations[0].includes("negative tabIndex"));
});

test("WCAGAudit audits images for alt descriptive labels", () => {
  const validHtml1 = `<img src="logo.png" alt="Fluid Logo" />`;
  const validHtml2 = `<img src="spacer.png" aria-hidden="true" />`;
  const invalidHtml = `<img src="ad.png" />`;

  assert.equal(WCAGAudit.auditHtml(validHtml1).valid, true);
  assert.equal(WCAGAudit.auditHtml(validHtml2).valid, true);

  const result = WCAGAudit.auditHtml(invalidHtml);
  assert.equal(result.valid, false);
  assert.equal(result.metadata.imageViolations, 1);
  assert.ok(result.violations[0].includes("missing alternate 'alt' text"));
});

test("WCAGAudit audits form controls for valid label pairings", () => {
  // Enclosing label or associated label via ID
  const validHtml = `
    <label for="username">Username</label>
    <input type="text" id="username" />
    <input type="text" aria-label="Search" />
  `;
  const invalidHtml = `
    <input type="text" id="password" />
  `;

  assert.equal(WCAGAudit.auditHtml(validHtml).valid, true);

  const result = WCAGAudit.auditHtml(invalidHtml);
  assert.equal(result.valid, false);
  assert.equal(result.metadata.formViolations, 1);
  assert.ok(result.violations[0].includes("lacks matching associated <label>"));
});

test("WCAGAccessibilityHook executes through compliance framework", () => {
  const hook = new WCAGAccessibilityHook();

  // Valid validation
  const validResult = hook.validate("<h1>Portal</h1><h2>Dashboard</h2>");
  assert.equal(validResult.valid, true);

  // Invalid validation
  const invalidResult = hook.validate("<h1>Portal</h1><h3>Violating h3</h3>");
  assert.equal(invalidResult.valid, false);
  assert.equal(invalidResult.region, "US");
  assert.ok(invalidResult.errorMessage?.includes("Accessibility audit violations detected"));
});

test("WCAGAccessibilityHook handles null, undefined, and non-string inputs gracefully", () => {
  const hook = new WCAGAccessibilityHook();

  const nullResult = hook.validate(null);
  assert.equal(nullResult.valid, false);

  const undefinedResult = hook.validate(undefined);
  assert.equal(undefinedResult.valid, false);

  // Object with html field should work
  const objResult = hook.validate({ html: "<h1>Good</h1><h2>Sub</h2>" });
  assert.equal(objResult.valid, true);
});
