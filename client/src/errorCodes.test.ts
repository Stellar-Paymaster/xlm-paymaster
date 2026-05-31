/**
 * errorCodes.test.ts
 * Tests for Interactive Error Codes (#503)
 */

import { describe, it, expect } from "vitest";
import {
  lookupByCode,
  lookupByStatus,
  searchErrorCodes,
  formatErrorHelp,
  listAllCodes,
  ERROR_CODE_REGISTRY,
} from "./errorCodes";

describe("Interactive Error Codes", () => {
  describe("lookupByCode", () => {
    it("finds entry by exact uppercase code", () => {
      const entry = lookupByCode("FLUID_001");
      expect(entry).toBeDefined();
      expect(entry?.title).toBe("Invalid Transaction XDR");
    });

    it("finds entry by lowercase code", () => {
      const entry = lookupByCode("fluid_001");
      expect(entry).toBeDefined();
      expect(entry?.title).toBe("Invalid Transaction XDR");
    });

    it("returns undefined for non-existent code", () => {
      const entry = lookupByCode("FLUID_999");
      expect(entry).toBeUndefined();
    });
  });

  describe("lookupByStatus", () => {
    it("finds entries with matching HTTP status", () => {
      const entries = lookupByStatus(400);
      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries.every((e) => e.httpStatus === 400)).toBe(true);
    });

    it("returns empty array for status with no errors", () => {
      const entries = lookupByStatus(418); // I'm a teapot
      expect(entries).toEqual([]);
    });
  });

  describe("searchErrorCodes", () => {
    it("finds entries by title search", () => {
      const results = searchErrorCodes("Quota");
      expect(results.length).toBe(1);
      expect(results[0].code).toBe("FLUID_004");
    });

    it("finds entries by description search", () => {
      const results = searchErrorCodes("unexpected error");
      expect(results.length).toBe(1);
      expect(results[0].code).toBe("FLUID_008");
    });

    it("finds entries by cause search", () => {
      const results = searchErrorCodes("sequence number");
      expect(results.length).toBe(1);
      expect(results[0].code).toBe("FLUID_006");
    });

    it("returns empty array for query with no matches", () => {
      const results = searchErrorCodes("random gibberish");
      expect(results).toEqual([]);
    });
  });

  describe("formatErrorHelp", () => {
    it("formats a valid error entry into a helpful string", () => {
      const output = formatErrorHelp("FLUID_001");
      expect(output).toContain("FLUID_001");
      expect(output).toContain("HTTP 400");
      expect(output).toContain("Invalid Transaction XDR");
      expect(output).toContain("Common Causes");
      expect(output).toContain("Remediation");
      expect(output).toContain("https://docs.fluid.dev/errors#fluid-001");
    });

    it("handles unknown codes gracefully", () => {
      const output = formatErrorHelp("FLUID_999");
      expect(output).toContain("Unknown error code: FLUID_999");
    });
  });

  describe("listAllCodes", () => {
    it("lists all registered codes", () => {
      const output = listAllCodes();
      expect(output).toContain("All Fluid API Error Codes");
      expect(output).toContain("FLUID_001");
      expect(output).toContain("FLUID_010");
    });
  });
});
