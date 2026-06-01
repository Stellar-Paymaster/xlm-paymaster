import { test } from "node:test";
import assert from "node:assert/strict";

import {
  clampCount,
  clampLegendRows,
  clampTableColumns,
  clampTableRows,
  clampToolbars,
  DEFAULT_TABLE_COLUMNS,
  DEFAULT_TABLE_ROWS,
  MAX_LEGEND_ROWS,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  MAX_TOOLBARS,
  gridStyleForColumns,
  totalTableSkeletonCells,
} from "./skeleton-utils.ts";

// ─── clampCount ──────────────────────────────────────────────────────────────

test("clampCount returns the fallback for undefined input", () => {
  assert.equal(clampCount(undefined, 0, 10, 4), 4);
});

test("clampCount returns the fallback for NaN and +/-Infinity", () => {
  assert.equal(clampCount(Number.NaN, 0, 10, 3), 3);
  assert.equal(clampCount(Number.POSITIVE_INFINITY, 0, 10, 3), 3);
  assert.equal(clampCount(Number.NEGATIVE_INFINITY, 0, 10, 3), 3);
});

test("clampCount truncates fractional input", () => {
  assert.equal(clampCount(5.7, 0, 10, 0), 5);
  assert.equal(clampCount(-1.9, 0, 10, 0), 0);
});

test("clampCount pins values below the minimum to the minimum", () => {
  assert.equal(clampCount(-10, 2, 5, 3), 2);
});

test("clampCount pins values above the maximum to the maximum", () => {
  assert.equal(clampCount(9999, 0, 50, 0), 50);
});

test("clampCount preserves in-range integer input", () => {
  assert.equal(clampCount(7, 0, 10, 0), 7);
  assert.equal(clampCount(0, 0, 10, 5), 0);
});

// ─── clamp wrappers apply the documented caps ────────────────────────────────

test("clampTableRows enforces MIN_TABLE_ROWS / MAX_TABLE_ROWS", () => {
  assert.equal(clampTableRows(undefined), DEFAULT_TABLE_ROWS);
  assert.equal(clampTableRows(0), 1);
  assert.equal(clampTableRows(-5), 1);
  assert.equal(clampTableRows(MAX_TABLE_ROWS + 100), MAX_TABLE_ROWS);
  assert.equal(clampTableRows(12), 12);
});

test("clampTableColumns enforces MIN_TABLE_COLUMNS / MAX_TABLE_COLUMNS", () => {
  assert.equal(clampTableColumns(undefined), DEFAULT_TABLE_COLUMNS);
  assert.equal(clampTableColumns(0), 1);
  assert.equal(clampTableColumns(MAX_TABLE_COLUMNS + 5), MAX_TABLE_COLUMNS);
});

test("clampLegendRows allows zero (no legend) and caps at MAX_LEGEND_ROWS", () => {
  assert.equal(clampLegendRows(undefined), 2);
  assert.equal(clampLegendRows(0), 0);
  assert.equal(clampLegendRows(MAX_LEGEND_ROWS + 4), MAX_LEGEND_ROWS);
});

test("clampToolbars allows zero and caps at MAX_TOOLBARS", () => {
  assert.equal(clampToolbars(0), 0);
  assert.equal(clampToolbars(99), MAX_TOOLBARS);
  assert.equal(clampToolbars(undefined), 1);
});

// ─── gridStyleForColumns ─────────────────────────────────────────────────────

test("gridStyleForColumns emits an equal-fraction repeat template", () => {
  assert.deepEqual(gridStyleForColumns(3), {
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  });
});

test("gridStyleForColumns clamps oversized and invalid column counts", () => {
  assert.equal(
    gridStyleForColumns(MAX_TABLE_COLUMNS + 8).gridTemplateColumns,
    `repeat(${MAX_TABLE_COLUMNS}, minmax(0, 1fr))`,
  );
  assert.equal(
    gridStyleForColumns(Number.NaN).gridTemplateColumns,
    `repeat(${DEFAULT_TABLE_COLUMNS}, minmax(0, 1fr))`,
  );
  assert.equal(
    gridStyleForColumns(-5).gridTemplateColumns,
    `repeat(1, minmax(0, 1fr))`,
  );
});

// ─── totalTableSkeletonCells ─────────────────────────────────────────────────

test("totalTableSkeletonCells multiplies clamped rows by clamped columns", () => {
  assert.equal(totalTableSkeletonCells(5, 4), 4 * (5 + 1));
  assert.equal(totalTableSkeletonCells(0, 0), 1 * (1 + 1));
  assert.equal(totalTableSkeletonCells(MAX_TABLE_ROWS + 10, MAX_TABLE_COLUMNS + 10), MAX_TABLE_COLUMNS * (MAX_TABLE_ROWS + 1));
});

test("totalTableSkeletonCells stays under the render budget at the documented caps", () => {
  const cells = totalTableSkeletonCells(MAX_TABLE_ROWS, MAX_TABLE_COLUMNS);
  // Hard ceiling: capped defaults should never exceed ~650 cells so the
  // skeleton does not blow the render budget on low-end devices.
  assert.ok(cells <= 650, `cells=${cells}`);
});
