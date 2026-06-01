import type { ComplianceHook, ValidationResult } from "../types";
import { WCAGAudit } from "../accessibility/WCAGAudit.ts";

/**
 * Compliance Hook for WCAG 2.1 Web Accessibility Audits.
 * Executes accessibility checks against HTML page segments or templates.
 */
export class WCAGAccessibilityHook implements ComplianceHook {
  readonly region = "US";
  readonly errorMessage = "Accessibility audit violations detected";

  /**
   * Validates target HTML code or form objects containing HTML templates for accessibility compliance.
   * @param data - The data to validate (either HTML string directly or object containing template)
   * @returns ValidationResult details
   */
  validate(data: unknown): ValidationResult {
    // Handle null/undefined
    if (data === null || data === undefined) {
      return {
        region: this.region,
        valid: false,
        errorMessage: "Input data is null or undefined",
      };
    }

    let html = "";
    if (typeof data === "string") {
      html = data;
    } else if (typeof data === "object" && data !== null && "html" in data) {
      const htmlValue = (data as Record<string, unknown>).html;
      html = typeof htmlValue === "string" ? htmlValue : "";
    } else {
      // Coerce other inputs to string
      html = String(data);
    }

    const auditResult = WCAGAudit.auditHtml(html);

    if (!auditResult.valid) {
      return {
        region: this.region,
        valid: false,
        errorMessage: `${this.errorMessage}: ${auditResult.violations.join("; ")}`,
        metadata: {
          violationsCount: auditResult.violations.length,
          violations: auditResult.violations,
          auditMetadata: auditResult.metadata,
        },
      };
    }

    return {
      region: this.region,
      valid: true,
      errorMessage: null,
      metadata: {
        auditMetadata: auditResult.metadata,
      },
    };
  }
}
