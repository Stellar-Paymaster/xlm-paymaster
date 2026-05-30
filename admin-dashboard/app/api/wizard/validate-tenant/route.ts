import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { validateTenantData, type TenantData } from "@/src/tenantOnboardingWizard";

export async function POST(request: NextRequest) {
  try {
    const data = (await request.json()) as TenantData;
    const result = validateTenantData(data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { valid: false, errors: { general: "Invalid request" } },
      { status: 400 }
    );
  }
}
