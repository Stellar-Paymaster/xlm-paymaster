import { NextResponse } from "next/server";
import { generateApiKey } from "@/src/tenantOnboardingWizard";

export async function POST() {
  const apiKey = generateApiKey();
  return NextResponse.json({ apiKey });
}
