import assert from "node:assert/strict";
import test from "node:test";
import {
  getAdminGuidedTourSteps,
  getAdminGuidedTourStorageKey,
  getAdminTourCardPosition,
} from "./admin-guided-tour.ts";

test("admin guided tour helpers build a stable per-user storage key", () => {
  assert.equal(
    getAdminGuidedTourStorageKey("Alice Admin@example.com"),
    "fluid-admin-guided-tour:v1:alice-admin-example.com",
  );
  assert.equal(
    getAdminGuidedTourStorageKey("   "),
    "fluid-admin-guided-tour:v1:anonymous",
  );
});

test("admin guided tour helpers define the three production steps", () => {
  const steps = getAdminGuidedTourSteps();

  assert.equal(steps.length, 3);
  assert.deepEqual(steps.map((step) => step.id), [
    "create-key",
    "manage-signer-pool",
    "billing-config",
  ]);
});

test("admin guided tour helpers position the card near the target", () => {
  const position = getAdminTourCardPosition(
    {
      top: 180,
      left: 860,
      width: 180,
      height: 48,
      right: 1040,
      bottom: 228,
    },
    { width: 1440, height: 900 },
  );

  assert.equal(position.placement, "bottom");
  assert.ok(position.top > 200);
  assert.ok(position.left >= 16);
  assert.ok(position.left <= 1440 - 360 - 16);
});

test("admin guided tour helpers fall back when the target is missing", () => {
  const position = getAdminTourCardPosition(null, { width: 320, height: 640 });

  assert.equal(position.placement, "center");
  assert.equal(position.top, 88);
  assert.equal(position.left, 16);
});
