import { TenantOnboardingWizard } from "@/components/TenantOnboardingWizard";

export const metadata = {
  title: "Tenant Onboarding - Fluid Admin",
};

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto">
        <TenantOnboardingWizard />
      </div>
    </div>
  );
}
