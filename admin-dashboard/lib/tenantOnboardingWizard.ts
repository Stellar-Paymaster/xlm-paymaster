import { z } from "zod";

export type OnboardingStep =
  | "welcome"
  | "tenant-info"
  | "api-key-generation"
  | "api-key-verification"
  | "completion";

export type WizardState = {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  tenantData: TenantData | null;
  apiKey: string | null;
  errors: Record<string, string>;
};

export type TenantData = {
  tenantName: string;
  tenantEmail: string;
  tenantDescription?: string;
  webhookUrl?: string;
};

const TenantDataSchema = z.object({
  tenantName: z
    .string()
    .min(3, "Tenant name must be at least 3 characters")
    .max(100, "Tenant name must be less than 100 characters"),
  tenantEmail: z.string().email("Invalid email address"),
  tenantDescription: z.string().max(500).optional(),
  webhookUrl: z.string().url("Invalid webhook URL").optional().or(z.literal("")),
});

export function initializeWizard(): WizardState {
  return {
    currentStep: "welcome",
    completedSteps: [],
    tenantData: null,
    apiKey: null,
    errors: {},
  };
}

export function advanceStep(state: WizardState): WizardState {
  const steps: OnboardingStep[] = [
    "welcome",
    "tenant-info",
    "api-key-generation",
    "api-key-verification",
    "completion",
  ];

  const currentIndex = steps.indexOf(state.currentStep);
  if (currentIndex < steps.length - 1) {
    const nextStep = steps[currentIndex + 1];
    return {
      ...state,
      currentStep: nextStep,
      completedSteps: [...state.completedSteps, state.currentStep],
    };
  }

  return state;
}

export function regressStep(state: WizardState): WizardState {
  const steps: OnboardingStep[] = [
    "welcome",
    "tenant-info",
    "api-key-generation",
    "api-key-verification",
    "completion",
  ];

  const currentIndex = steps.indexOf(state.currentStep);
  if (currentIndex > 0) {
    const prevStep = steps[currentIndex - 1];
    return {
      ...state,
      currentStep: prevStep,
      completedSteps: state.completedSteps.filter((s) => s !== prevStep),
    };
  }

  return state;
}

export function updateTenantData(
  state: WizardState,
  data: Partial<TenantData>
): WizardState {
  return {
    ...state,
    tenantData: {
      ...state.tenantData,
      ...data,
    } as TenantData,
    errors: {},
  };
}

export function validateTenantData(data: TenantData): {
  valid: boolean;
  errors: Record<string, string>;
} {
  try {
    TenantDataSchema.parse(data);
    return { valid: true, errors: {} };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.errors.forEach((err) => {
        const path = err.path.join(".");
        errors[path] = err.message;
      });
      return { valid: false, errors };
    }
    return {
      valid: false,
      errors: { general: "Validation failed" },
    };
  }
}

export function generateApiKey(): string {
  const prefix = "sk_admin_";
  const randomPart = Math.random().toString(36).substring(2, 18);
  return prefix + randomPart;
}

export function setApiKey(state: WizardState, apiKey: string): WizardState {
  return {
    ...state,
    apiKey,
  };
}

export function completeWizard(state: WizardState): WizardState {
  if (!state.tenantData || !state.apiKey) {
    return {
      ...state,
      errors: {
        general: "Wizard not properly completed",
      },
    };
  }

  return {
    ...state,
    currentStep: "completion",
    completedSteps: [
      "welcome",
      "tenant-info",
      "api-key-generation",
      "api-key-verification",
    ],
  };
}

export function resetWizard(): WizardState {
  return initializeWizard();
}
