/**
 * Validation result returned by compliance hooks.
 */
export interface ValidationResult {
  /** The region code this hook handles (e.g., 'BR', 'US', 'EU') */
  region: string;
  /** Whether the validation passed */
  valid: boolean;
  /** Error message if validation failed, null if passed */
  errorMessage: string | null;
  /** Additional metadata about the validation */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for compliance hook plugins.
 * Each hook validates region-specific compliance requirements.
 */
export interface ComplianceHook {
  /** Region code this hook handles (e.g., 'BR' for Brazil) */
  readonly region: string;
  /**
   * Validates the provided data against regional compliance rules.
   * @param data - The data to validate (typically a form submission object)
   * @returns Promise resolving to a ValidationResult
   */
  validate(data: unknown): Promise<ValidationResult> | ValidationResult;
  /** Default error message when validation fails */
  readonly errorMessage: string;
}