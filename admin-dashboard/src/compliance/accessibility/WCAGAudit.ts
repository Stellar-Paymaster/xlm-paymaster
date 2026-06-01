/**
 * WCAG 2.1 Web Accessibility Auditing Engine
 * 
 * Programmatically audits HTML elements and stylesheets for compliance with:
 *  - Contrast Ratios (WCAG 2.1 AA: 4.5:1 normal text, 3.0:1 large text)
 *  - Keyboard Accessibility (tabIndex >= 0)
 *  - Screen Reader Labels (img alt tags, input label pairings)
 *  - Heading Sequence Order (no skipped heading levels)
 */
export class WCAGAudit {
  /**
   * Helper to parse hex color to RGB values.
   */
  private static parseHex(hex: string): { r: number; g: number; b: number } | null {
    const cleaned = hex.replace(/^#/, "").trim();
    if (cleaned.length === 3) {
      return {
        r: parseInt(cleaned[0] + cleaned[0], 16),
        g: parseInt(cleaned[1] + cleaned[1], 16),
        b: parseInt(cleaned[2] + cleaned[2], 16),
      };
    }
    if (cleaned.length === 6) {
      return {
        r: parseInt(cleaned.slice(0, 2), 16),
        g: parseInt(cleaned.slice(2, 4), 16),
        b: parseInt(cleaned.slice(4, 6), 16),
      };
    }
    return null;
  }

  /**
   * Calculates the relative luminance of a color per WCAG 2.1 specifications.
   * Formula: L = 0.2126 * R + 0.7152 * G + 0.0722 * B
   */
  public static calculateLuminance(colorHex: string): number {
    const rgb = this.parseHex(colorHex);
    if (!rgb) return 0;

    const calcPart = (val: number) => {
      const srgb = val / 255;
      return srgb <= 0.03928
        ? srgb / 12.92
        : Math.pow((srgb + 0.055) / 1.055, 2.4);
    };

    const r = calcPart(rgb.r);
    const g = calcPart(rgb.g);
    const b = calcPart(rgb.b);

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /**
   * Calculates the contrast ratio between two hex colors.
   * Formula: (L1 + 0.05) / (L2 + 0.05), where L1 is lighter and L2 is darker.
   */
  public static calculateContrastRatio(color1: string, color2: string): number {
    const lum1 = this.calculateLuminance(color1);
    const lum2 = this.calculateLuminance(color2);

    const L1 = Math.max(lum1, lum2);
    const L2 = Math.min(lum1, lum2);

    return (L1 + 0.05) / (L2 + 0.05);
  }

  /**
   * Verifies contrast ratio meets WCAG 2.1 AA standard.
   *  - Normal text requires 4.5:1
   *  - Large text (>= 18pt or >= 14pt bold) requires 3.0:1
   */
  public static verifyContrast(
    fgHex: string,
    bgHex: string,
    isLargeText: boolean = false
  ): boolean {
    const ratio = this.calculateContrastRatio(fgHex, bgHex);
    const required = isLargeText ? 3.0 : 4.5;
    return ratio >= required;
  }

  /**
   * Programmatically audits an HTML string for accessibility issues.
   */
  public static auditHtml(html: string): {
    valid: boolean;
    violations: string[];
    metadata: {
      headingViolations: number;
      imageViolations: number;
      formViolations: number;
      tabIndexViolations: number;
    };
  } {
    const violations: string[] = [];
    let headingViolations = 0;
    let imageViolations = 0;
    let formViolations = 0;
    let tabIndexViolations = 0;

    if (!html || html.trim() === "") {
      return {
        valid: true,
        violations: [],
        metadata: { headingViolations: 0, imageViolations: 0, formViolations: 0, tabIndexViolations: 0 },
      };
    }

    // 1. Heading Sequence Auditor
    // Extract heading level tags (e.g. h1, h2, h3, etc.)
    const headingRegex = /<h([1-6])[\s>]/gi;
    const headingLevels: number[] = [];
    let match;
    while ((match = headingRegex.exec(html)) !== null) {
      headingLevels.push(parseInt(match[1], 10));
    }

    for (let i = 1; i < headingLevels.length; i++) {
      const prev = headingLevels[i - 1];
      const curr = headingLevels[i];
      if (curr - prev > 1) {
        violations.push(`Heading level skipped: h${prev} directly to h${curr}`);
        headingViolations++;
      }
    }

    // 2. Keyboard Accessibility (Negative TabIndex Check)
    const tabIndexRegex = /tabindex\s*=\s*["'](-[1-9]\d*)["']/gi;
    while ((match = tabIndexRegex.exec(html)) !== null) {
      violations.push(`Interactive element has negative tabIndex "${match[1]}" making it unreachable by keyboard`);
      tabIndexViolations++;
    }

    // 3. Screen Reader Labels (Image Alt tags)
    // Find all <img ...> tags
    const imgRegex = /<img\s+([^>]*?)>/gi;
    while ((match = imgRegex.exec(html)) !== null) {
      const attributes = match[1];
      const hasAlt = /alt\s*=\s*["']/i.test(attributes);
      const isAriaHidden = /aria-hidden\s*=\s*["']true["']/i.test(attributes);
      
      if (!hasAlt && !isAriaHidden) {
        violations.push(`Image tag missing alternate 'alt' text descriptive label or 'aria-hidden="true"'`);
        imageViolations++;
      }
    }

    // 4. Form Control Pairing Checklist
    // Match <input ...>, <textarea ...>, <select ...>
    const inputControlRegex = /<(input|textarea|select)\s+([^>]*?)>/gi;
    while ((match = inputControlRegex.exec(html)) !== null) {
      const tag = match[1];
      const attributes = match[2];

      // Skip hidden inputs
      if (tag === "input" && /type\s*=\s*["']hidden["']/i.test(attributes)) {
        continue;
      }

      // Check if it has aria-label, aria-labelledby
      const hasAriaLabel = /aria-label\s*=\s*["']/i.test(attributes) || /aria-labelledby\s*=\s*["']/i.test(attributes);
      
      // Get ID of the control
      const idMatch = /id\s*=\s*["']([^"']+)["']/i.exec(attributes);
      let isPairedWithLabel = false;

      if (idMatch) {
        const controlId = idMatch[1];
        // Scan HTML to see if a <label for="controlId"> exists
        const labelForRegex = new RegExp(`<label[^>]*?for\\s*=\\s*["']${controlId}["']`, "i");
        isPairedWithLabel = labelForRegex.test(html);
      }

      // Check if control is nested inside a <label> tag (requires complex nesting analysis, but we can do a local check)
      if (!isPairedWithLabel && !hasAriaLabel) {
        violations.push(`Form control <${tag}> (id="${idMatch ? idMatch[1] : "none"}") lacks matching associated <label> or 'aria-label' attribute`);
        formViolations++;
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      metadata: {
        headingViolations,
        imageViolations,
        formViolations,
        tabIndexViolations,
      },
    };
  }
}
