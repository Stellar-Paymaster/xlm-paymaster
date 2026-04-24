import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Module-surface integration test — guards the skeletons barrel and the
 * /admin/* route coverage so future edits don't silently regress layout-shift
 * protection.
 *
 * Uses static source analysis rather than runtime imports so the test stays
 * DOM-free and independent of a JSX/TS compiler.
 */

const SKELETONS_DIR = path.resolve(process.cwd(), "components", "skeletons");
const ADMIN_DIR = path.resolve(process.cwd(), "app", "admin");
const EXPECTED_COMPONENTS = [
  "AdminPageSkeleton",
  "ChartSkeleton",
  "DashboardSkeleton",
  "StatCardSkeleton",
  "TableSkeleton",
] as const;

test("components/skeletons/index.ts re-exports every public skeleton", async () => {
  const barrel = await readFile(path.join(SKELETONS_DIR, "index.ts"), "utf8");
  for (const name of EXPECTED_COMPONENTS) {
    assert.ok(
      barrel.includes(name),
      `barrel is missing export "${name}" — imports from @/components/skeletons will fail`,
    );
  }
});

test("every public skeleton is declared as an exported function in its source", async () => {
  for (const name of EXPECTED_COMPONENTS) {
    const source = await readFile(
      path.join(SKELETONS_DIR, `${name}.tsx`),
      "utf8",
    );
    const exportPattern = new RegExp(`export\\s+function\\s+${name}\\b`);
    assert.match(
      source,
      exportPattern,
      `${name}.tsx must export a function named ${name} so React DevTools displays it correctly`,
    );
  }
});

test("every public skeleton emits role=\"status\" and aria-busy for assistive tech", async () => {
  for (const name of EXPECTED_COMPONENTS) {
    const source = await readFile(
      path.join(SKELETONS_DIR, `${name}.tsx`),
      "utf8",
    );
    // Either the component sets role/aria-busy itself, or it composes exclusively
    // of the <Skeleton> primitive (which sets them). Both paths are valid.
    const usesPrimitive = source.includes(`from "@/components/ui/skeleton"`);
    const declaresRole = source.includes('role="status"');
    const declaresBusy = source.includes('aria-busy="true"');
    assert.ok(
      usesPrimitive || (declaresRole && declaresBusy),
      `${name}.tsx must be announceable — either use <Skeleton> or declare role+aria-busy`,
    );
  }
});

test("loading.tsx exists for every data-fetching admin route", async () => {
  const entries = await readdir(ADMIN_DIR, { withFileTypes: true });
  const routesWithPages: string[] = [];
  const routesWithLoading: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const routePath = path.join(ADMIN_DIR, entry.name);
    try {
      await stat(path.join(routePath, "page.tsx"));
      routesWithPages.push(entry.name);
    } catch {
      continue;
    }
    try {
      await stat(path.join(routePath, "loading.tsx"));
      routesWithLoading.push(entry.name);
    } catch {
      // missing — caught by assertion below
    }
  }

  const missing = routesWithPages.filter(
    (route) => !routesWithLoading.includes(route),
  );
  assert.deepEqual(
    missing,
    [],
    `every /admin/* page.tsx must have a sibling loading.tsx — missing for: ${missing.join(", ")}`,
  );
});

test("every /admin/*/loading.tsx renders a skeleton from the shared barrel", async () => {
  const entries = await readdir(ADMIN_DIR, { withFileTypes: true });
  const offenders: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const loadingPath = path.join(ADMIN_DIR, entry.name, "loading.tsx");
    let source: string;
    try {
      source = await readFile(loadingPath, "utf8");
    } catch {
      continue;
    }
    const importsFromBarrel = source.includes("@/components/skeletons");
    if (!importsFromBarrel) {
      offenders.push(entry.name);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `loading.tsx for these admin routes does not import from @/components/skeletons (risks layout-shift drift): ${offenders.join(", ")}`,
  );
});
