import { NextResponse } from "next/server";
import { initializeWizard } from "@/src/tenantOnboardingWizard";

export async function GET() {
  const wizardState = initializeWizard();
  return NextResponse.json(wizardState);
}
