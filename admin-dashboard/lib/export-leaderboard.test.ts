import assert from "node:assert/strict";
import test from "node:test";

// Pure helper functions extracted for unit testing without DOM or jsPDF.

function escapeCSVField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function formatStroops(stroops: number): string {
  if (stroops >= 10_000_000) {
    return `${(stroops / 10_000_000).toFixed(2)} XLM`;
  }
  return `${stroops.toLocaleString()} stroops`;
}

test("escapeCSVField wraps fields containing commas in quotes", () => {
  assert.equal(escapeCSVField("hello,world"), '"hello,world"');
});

test("escapeCSVField escapes embedded double-quotes", () => {
  assert.equal(escapeCSVField('say "hi"'), '"say ""hi"""');
});

test("escapeCSVField wraps fields containing newlines", () => {
  assert.equal(escapeCSVField("line1\nline2"), '"line1\nline2"');
});

test("escapeCSVField returns plain fields unchanged", () => {
  assert.equal(escapeCSVField("simple"), "simple");
  assert.equal(escapeCSVField("tenant-x"), "tenant-x");
});

test("formatStroops renders raw stroops for small amounts", () => {
  assert.match(formatStroops(500), /stroops/);
  assert.ok(!formatStroops(500).includes("XLM"));
});

test("formatStroops converts to XLM for amounts >= 10_000_000", () => {
  assert.match(formatStroops(10_000_000), /XLM/);
  assert.equal(formatStroops(10_000_000), "1.00 XLM");
  assert.equal(formatStroops(25_000_000), "2.50 XLM");
});

test("formatStroops boundary: 9_999_999 stays in stroops", () => {
  assert.match(formatStroops(9_999_999), /stroops/);
});
