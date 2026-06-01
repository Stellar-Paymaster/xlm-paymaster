/**
 * Pure helpers for the skeleton components. Extracted so the sizing and
 * layout logic is unit-testable without a React renderer.
 */

export const DEFAULT_TABLE_ROWS = 5;
export const DEFAULT_TABLE_COLUMNS = 4;
export const MAX_TABLE_ROWS = 50;
export const MAX_TABLE_COLUMNS = 12;
export const MIN_TABLE_ROWS = 1;
export const MIN_TABLE_COLUMNS = 1;

export const MIN_LEGEND_ROWS = 0;
export const MAX_LEGEND_ROWS = 6;

export const MIN_TOOLBARS = 0;
export const MAX_TOOLBARS = 4;

/**
 * Clamps a user-provided dimension count into a safe, bounded integer.
 * Non-finite values, NaN, or out-of-range numbers fall back to `min`.
 */
export function clampCount(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  const truncated = Math.trunc(value);
  if (truncated < min) return min;
  if (truncated > max) return max;
  return truncated;
}

export function clampTableRows(rows: number | undefined): number {
  return clampCount(rows, MIN_TABLE_ROWS, MAX_TABLE_ROWS, DEFAULT_TABLE_ROWS);
}

export function clampTableColumns(columns: number | undefined): number {
  return clampCount(
    columns,
    MIN_TABLE_COLUMNS,
    MAX_TABLE_COLUMNS,
    DEFAULT_TABLE_COLUMNS,
  );
}

export function clampLegendRows(rows: number | undefined): number {
  return clampCount(rows, MIN_LEGEND_ROWS, MAX_LEGEND_ROWS, 2);
}

export function clampToolbars(toolbars: number | undefined): number {
  return clampCount(toolbars, MIN_TOOLBARS, MAX_TOOLBARS, 1);
}

export interface GridTemplateStyle {
  gridTemplateColumns: string;
}

export function gridStyleForColumns(columns: number): GridTemplateStyle {
  const safe = clampTableColumns(columns);
  return { gridTemplateColumns: `repeat(${safe}, minmax(0, 1fr))` };
}

/**
 * Returns the total number of skeleton cells a table of `rows x columns`
 * will render, including the header row. Used to sanity-check placeholders
 * stay under a cheap rendering budget under the documented `MAX_*` caps.
 */
export function totalTableSkeletonCells(
  rows: number,
  columns: number,
): number {
  const safeRows = clampTableRows(rows);
  const safeColumns = clampTableColumns(columns);
  return safeColumns * (safeRows + 1);
}
