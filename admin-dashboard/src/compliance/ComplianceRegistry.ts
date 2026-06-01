import type { ComplianceHook, ValidationResult } from "./types";

/**
 * Registry for managing and executing compliance hooks by region.
 * Supports registering multiple hooks and executing them by region code.
 */
export class ComplianceRegistry {
  private hooks: Map<string, ComplianceHook[]> = new Map();

  /**
   * Registers a compliance hook for its associated region.
   * If a hook already exists for the region, it will be appended to the list.
   * @param hook - The compliance hook to register
   */
  register(hook: ComplianceHook): void {
    const region = hook.region.toUpperCase();
    const existing = this.hooks.get(region) || [];
    existing.push(hook);
    this.hooks.set(region, existing);
  }

  /**
   * Unregisters all hooks for a given region.
   * @param region - The region code to clear hooks for
   */
  unregister(region: string): void {
    this.hooks.delete(region.toUpperCase());
  }

  /**
   * Gets all registered hooks for a region.
   * @param region - The region code to look up
   * @returns Array of hooks for the region, or empty array if none registered
   */
  getHooks(region: string): ComplianceHook[] {
    return this.hooks.get(region.toUpperCase()) || [];
  }

  /**
   * Executes all hooks registered for a given region.
   * @param region - The region code to execute hooks for
   * @param data - The data to validate
   * @returns Array of ValidationResults from all hooks
   */
  async execute(region: string, data: unknown): Promise<ValidationResult[]> {
    const hooks = this.getHooks(region);
    const results = await Promise.all(
      hooks.map((hook) => Promise.resolve(hook.validate(data)))
    );
    return results;
  }
}

// Global singleton registry instance
const globalRegistry = new ComplianceRegistry();

/**
 * Runs compliance hooks for a specific region.
 * Unknown regions return empty results rather than errors.
 * @param region - The region code to validate against
 * @param data - The data to validate
 * @returns Array of ValidationResults (empty if no hooks registered)
 */
export function runComplianceHooks(
  region: string,
  data: unknown
): ValidationResult[] {
  const hooks = globalRegistry.getHooks(region);
  return hooks.map((hook) => hook.validate(data)) as ValidationResult[];
}

/**
 * Gets the global registry instance for direct manipulation.
 * @returns The global ComplianceRegistry instance
 */
export function getComplianceRegistry(): ComplianceRegistry {
  return globalRegistry;
}