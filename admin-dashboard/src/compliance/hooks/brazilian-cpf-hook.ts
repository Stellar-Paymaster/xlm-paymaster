import type { ComplianceHook, ValidationResult } from "../types";

/**
 * Validates Brazilian CPF (Cadastro de Pessoas Físicas) numbers.
 * 
 * CPF format: 11 digits with optional formatting (e.g., "123.456.789-09")
 * Checksum algorithm: Uses modulo 11 verification for both check digits.
 */
export class BrazilCPFHook implements ComplianceHook {
  readonly region = "BR";
  readonly errorMessage = "Invalid CPF format";

  /**
   * Strips formatting characters from a CPF string.
   * @param cpf - The CPF string to clean
   * @returns CPF with only digits remaining
   */
  private stripFormatting(cpf: string): string {
    return cpf.replace(/\D/g, "");
  }

  /**
   * Validates the CPF checksum digits.
   * @param digits - 11-digit CPF string
   * @returns Whether the checksum is valid
   */
  private validateChecksum(digits: string): boolean {
    if (digits.length !== 11) return false;

    // Check for all same digits (invalid CPF)
    if (/^(\d)\1{10}$/.test(digits)) return false;

    // Calculate first check digit
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += Number(digits[i]) * (10 - i);
    }
    let remainder = (sum * 10) % 11;
    const firstCheck = remainder === 10 ? 0 : remainder;

    if (firstCheck !== Number(digits[9])) return false;

    // Calculate second check digit
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += Number(digits[i]) * (11 - i);
    }
    remainder = (sum * 10) % 11;
    const secondCheck = remainder === 10 ? 0 : remainder;

    return secondCheck === Number(digits[10]);
  }

  /**
   * Validates CPF data within a submission.
   * @param data - Data object potentially containing a CPF field
   * @returns ValidationResult indicating pass/fail and any error details
   */
  validate(data: unknown): ValidationResult {
    // Handle null/undefined input
    if (data === null || data === undefined) {
      return {
        region: this.region,
        valid: false,
        errorMessage: this.errorMessage,
      };
    }

    // Coerce non-string input to string
    let cpf: string;
    if (typeof data === "string") {
      cpf = data;
    } else if (typeof data === "number") {
      cpf = String(data);
    } else if (typeof data === "object" && data !== null && "cpf" in data) {
      const cpfValue = (data as Record<string, unknown>).cpf;
      cpf = typeof cpfValue === "string" || typeof cpfValue === "number"
        ? String(cpfValue)
        : "";
    } else {
      return {
        region: this.region,
        valid: true,
        errorMessage: null,
      };
    }

    const cleanedCpf = this.stripFormatting(cpf);

    // Validate length (must be exactly 11 digits)
    if (cleanedCpf.length !== 11) {
      return {
        region: this.region,
        valid: false,
        errorMessage: "CPF must have exactly 11 digits",
      };
    }

    // Validate all digits
    if (!/^\d{11}$/.test(cleanedCpf)) {
      return {
        region: this.region,
        valid: false,
        errorMessage: "CPF must contain only digits",
      };
    }

    // Validate checksum
    if (!this.validateChecksum(cleanedCpf)) {
      return {
        region: this.region,
        valid: false,
        errorMessage: "Invalid CPF checksum",
      };
    }

    return {
      region: this.region,
      valid: true,
      errorMessage: null,
      metadata: {
        cleanedCpf,
      },
    };
  }
}