import { NextRequest, NextResponse } from "next/server";
import { getPartnerById } from "@/lib/partners-data";
import { getPortalLinks } from "@/lib/portal-links";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const partner = await getPartnerById(id);

  if (!partner || partner.status !== "approved") {
    return NextResponse.json({ error: "Partner not found or not approved" }, { status: 404 });
  }

  const { siteUrl } = getPortalLinks();
  const verifyUrl = `${siteUrl}/partners?verify=${encodeURIComponent(id)}`;
  const label = "Paymaster Certified Partner";
  const name = partner.projectName.replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] ?? c),
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="28" role="img" aria-label="${label}: ${name}">
  <title>${label}: ${name}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0ea5e9"/>
      <stop offset="1" stop-color="#0284c7"/>
    </linearGradient>
  </defs>
  <rect width="220" height="28" rx="6" fill="url(#bg)"/>
  <rect x="1" y="1" width="218" height="26" rx="5" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>
  <!-- checkmark icon -->
  <circle cx="14" cy="14" r="8" fill="rgba(255,255,255,0.2)"/>
  <polyline points="10,14 13,17 18,11" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- label text -->
  <text x="28" y="10" font-family="system-ui,sans-serif" font-size="7" font-weight="600" fill="rgba(255,255,255,0.85)" letter-spacing="0.5">PAYMASTER CERTIFIED PARTNER</text>
  <!-- project name -->
  <text x="28" y="21" font-family="system-ui,sans-serif" font-size="9" font-weight="700" fill="white">${name}</text>
  <!-- verify link hint -->
  <a href="${verifyUrl}" target="_blank">
    <rect width="220" height="28" rx="6" fill="transparent"/>
  </a>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
