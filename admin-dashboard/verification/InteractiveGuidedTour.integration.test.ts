import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardSource = readFileSync(
  new URL("../app/admin/dashboard/page.tsx", import.meta.url),
  "utf8",
);
const helperSource = readFileSync(
  new URL("../lib/admin-guided-tour.ts", import.meta.url),
  "utf8",
);
const tourSource = readFileSync(
  new URL("../components/dashboard/AdminGuidedTour.tsx", import.meta.url),
  "utf8",
);

test("dashboard wires the guided tour to the three first-login actions", () => {
  assert.match(dashboardSource, /data-tour-step="create-key"/);
  assert.match(dashboardSource, /data-tour-step="manage-signer-pool"/);
  assert.match(dashboardSource, /data-tour-step="billing-config"/);
  assert.match(dashboardSource, /<AdminGuidedTour userKey=/);
});

test("tour implementation persists completion state and observes the target anchors", () => {
  assert.match(tourSource, /localStorage\.setItem\(/);
  assert.match(tourSource, /scrollIntoView\(/);
  assert.match(helperSource, /Create a new API key/);
  assert.match(helperSource, /Manage the signer pool/);
  assert.match(helperSource, /Configure billing and quota/);
});
