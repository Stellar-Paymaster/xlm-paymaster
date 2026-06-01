# WCAG 2.1 Web Accessibility Audit Framework

## Overview

The WCAG 2.1 Web Accessibility Audit framework provides programmatical checks for Fluid Dashboard modules to conform with **WCAG 2.1 Level AA** standards. It is integrated directly into the compliance hook pipeline as `WCAGAccessibilityHook`, enabling automatic screen reader, keyboard, contrast, and structure validation.

---

## Key Verification Rules

The auditing engine `WCAGAudit` verifies compliance on four key vectors:

### 1. Relative Luminance & Contrast Ratio
To guarantee readability for low-vision users, text color and background color combinations must satisfy WCAG contrast ratio requirements:
- **Normal Text** (< 18pt / 24px): **4.5:1** contrast ratio.
- **Large Text** (>= 18pt or >= 14pt bold): **3.0:1** contrast ratio.

**Math Formula**:
$$L = 0.2126 \times R + 0.7152 \times G + 0.0722 \times B$$
Where each color component is linearized:
- If $sRGB \le 0.03928$ then $sRGB / 12.92$
- Else $((sRGB + 0.055) / 1.055)^{2.4}$

Contrast Ratio is computed as:
$$\text{Ratio} = \frac{L_1 + 0.05}{L_2 + 0.05}$$
*(Where $L_1$ is the lighter luminance and $L_2$ is the darker).*

### 2. Keyboard Accessibility
All interactive controls must be focusable. The audit flags any interactive tags containing a negative `tabindex` attribute, which blocks keyboard-only navigation.

### 3. Screen Reader Labels
- **Images**: `<img>` tags must include alternate descriptive text `alt="..."` or be explicit decorative images with `aria-hidden="true"`.
- **Form Controls**: `<input>`, `<textarea>`, and `<select>` tags must be paired with `<label for="...">` matching tags, nested within `<label>`, or carry descriptive `aria-label` or `aria-labelledby` tags.

### 4. Heading Sequence Hierarchy
Heading sequence hierarchies (`<h1>` through `<h6>`) must follow logical sequential order. Skipping heading levels (e.g. `<h1>` followed by `<h3>` skipping `<h2>`) is flagged as a structure violation.

---

## API Reference

### `WCAGAudit`

```typescript
import { WCAGAudit } from "@/src/compliance/accessibility/WCAGAudit";

// 1. Check Color Contrast Compliance
const passesContrast = WCAGAudit.verifyContrast("#767676", "#FFFFFF"); // true (exactly 4.5:1)

// 2. Perform programmatical HTML audit
const auditResult = WCAGAudit.auditHtml(`
  <h1>Fluid Accessibility</h1>
  <img src="banner.jpg" /> <!-- Violation: Missing Alt attribute -->
`);

// Returns:
// {
//   valid: false,
//   violations: ["Image tag missing alternate 'alt' text descriptive label or 'aria-hidden=\"true\"'"],
//   metadata: { headingViolations: 0, imageViolations: 1, formViolations: 0, tabIndexViolations: 0 }
// }
```

### `WCAGAccessibilityHook`

A registered regional hook for validating HTML pages in the compliance pipeline:

```typescript
import { getComplianceRegistry } from "@/src/compliance";
import { WCAGAccessibilityHook } from "@/src/compliance/hooks/wcag-accessibility-hook";

const registry = getComplianceRegistry();
registry.register(new WCAGAccessibilityHook());
```
