import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HttpError,
  markAllNotificationsReadUrl,
  markNotificationReadUrl,
  notificationsListUrl,
} from "./useNotifications.ts";

// ─── URL builders ───────────────────────────────────────────────────────────

test("notificationsListUrl points at the canonical endpoint", () => {
  assert.equal(notificationsListUrl(), "/api/notifications");
});

test("markNotificationReadUrl encodes the id so unsafe characters can't break the URL", () => {
  assert.equal(
    markNotificationReadUrl("abc"),
    "/api/notifications/abc/read",
  );
  assert.equal(
    markNotificationReadUrl("id with space"),
    "/api/notifications/id%20with%20space/read",
  );
  assert.equal(
    markNotificationReadUrl("a/b"),
    "/api/notifications/a%2Fb/read",
  );
});

test("markNotificationReadUrl rejects empty ids before they hit the network", () => {
  assert.throws(() => markNotificationReadUrl(""), /id is required/);
});

test("markAllNotificationsReadUrl is a fixed endpoint", () => {
  assert.equal(
    markAllNotificationsReadUrl(),
    "/api/notifications/read-all",
  );
});

// ─── HttpError ──────────────────────────────────────────────────────────────

test("HttpError preserves the status code for retry classification", () => {
  const err = new HttpError(503, "upstream unavailable");
  assert.equal(err.status, 503);
  assert.equal(err.name, "HttpError");
  assert.match(err.message, /upstream unavailable/);
  assert.ok(err instanceof Error);
});

test("HttpError can be caught as a standard Error (interop with third-party handlers)", () => {
  try {
    throw new HttpError(418, "I'm a teapot");
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.ok(error instanceof HttpError);
    if (error instanceof HttpError) {
      assert.equal(error.status, 418);
    }
  }
});
