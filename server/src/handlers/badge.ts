import { Request, Response } from "express";
import { Config } from "../config";

export type BadgeStyle = "light" | "dark" | "minimal";

const VALID_STYLES: BadgeStyle[] = ["light", "dark", "minimal"];

function parseStyle(raw: unknown): BadgeStyle {
  return VALID_STYLES.includes(raw as BadgeStyle) ? (raw as BadgeStyle) : "light";
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function buildSvg(style: BadgeStyle, txCount: number | null, portalUrl: string): string {
  const showStats = txCount !== null;
  const statLabel = showStats ? `${formatCount(txCount)} txs sponsored` : "";

  // Palette per style
  type Palette = {
    bg: string;
    border: string;
    logoFill: string;
    labelColor: string;
    statColor: string;
    shadow: string;
  };

  const palettes: Record<BadgeStyle, Palette> = {
    light: {
      bg: "#ffffff",
      border: "#e2e8f0",
      logoFill: "#0ea5e9",
      labelColor: "#0f172a",
      statColor: "#64748b",
      shadow: "drop-shadow(0 1px 2px rgba(0,0,0,0.08))",
    },
    dark: {
      bg: "#0f172a",
      border: "#1e293b",
      logoFill: "#38bdf8",
      labelColor: "#f8fafc",
      statColor: "#94a3b8",
      shadow: "drop-shadow(0 1px 3px rgba(0,0,0,0.4))",
    },
    minimal: {
      bg: "transparent",
      border: "transparent",
      logoFill: "#0ea5e9",
      labelColor: "#0f172a",
      statColor: "#64748b",
      shadow: "none",
    },
  };

  const p = palettes[style];

  // Geometry
  const height = 28;
  const logoSize = 14;
  const logoPad = 9;
  const labelText = "Powered by Paymaster";
  const charWidth = 6.6; // approx px per char at 12px
  const labelWidth = Math.ceil(labelText.length * charWidth);
  const labelPad = 8;

  let totalWidth: number;
  let statX = 0;
  let statWidth = 0;

  if (showStats) {
    statWidth = Math.ceil(statLabel.length * 5.8) + labelPad * 2;
    totalWidth = logoPad + logoSize + labelPad + labelWidth + labelPad + 1 + statWidth;
    statX = logoPad + logoSize + labelPad + labelWidth + labelPad + 1;
  } else {
    totalWidth = logoPad + logoSize + labelPad + labelWidth + labelPad;
  }

  const borderRadius = style === "minimal" ? 0 : 6;
  const mid = height / 2;

  // Paymaster logo mark — simplified droplet/wave shape
  const lx = logoPad;
  const ly = (height - logoSize) / 2;

  const logoPath = `M${lx + logoSize / 2} ${ly}
    C${lx + logoSize * 0.85} ${ly + logoSize * 0.2}
     ${lx + logoSize} ${ly + logoSize * 0.45}
     ${lx + logoSize / 2} ${ly + logoSize}
    C${lx} ${ly + logoSize * 0.45}
     ${lx + logoSize * 0.15} ${ly + logoSize * 0.2}
     ${lx + logoSize / 2} ${ly}Z`;

  const labelX = lx + logoSize + labelPad;

  const divider =
    showStats
      ? `<line x1="${statX}" y1="5" x2="${statX}" y2="${height - 5}" stroke="${p.border}" stroke-width="1"/>`
      : "";

  const statEl = showStats
    ? `<text
        x="${statX + statWidth / 2}"
        y="${mid + 1}"
        font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
        font-size="10"
        fill="${p.statColor}"
        text-anchor="middle"
        dominant-baseline="middle"
      >${statLabel}</text>`
    : "";

  const filter =
    style !== "minimal"
      ? `<defs><filter id="s" x="-10%" y="-10%" width="120%" height="130%">
           <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.08"/>
         </filter></defs>`
      : "";

  const filterAttr = style !== "minimal" ? ' filter="url(#s)"' : "";

  return `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${totalWidth}"
  height="${height}"
  role="img"
  aria-label="${labelText}"
  viewBox="0 0 ${totalWidth} ${height}"
>
  <title>${labelText}</title>
  ${filter}
  <a href="${portalUrl}" target="_blank" rel="noopener noreferrer">
    <rect
      x="0.5" y="0.5"
      width="${totalWidth - 1}" height="${height - 1}"
      rx="${borderRadius}" ry="${borderRadius}"
      fill="${p.bg}"
      stroke="${p.border}"
      stroke-width="1"
      ${filterAttr}
    />
    <path d="${logoPath}" fill="${p.logoFill}"/>
    <text
      x="${labelX}"
      y="${mid + 1}"
      font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
      font-size="12"
      font-weight="600"
      fill="${p.labelColor}"
      dominant-baseline="middle"
    >${labelText}</text>
    ${divider}
    ${statEl}
  </a>
</svg>`.trim();
}

export async function badgeHandler(
  req: Request,
  res: Response,
  config: Config,
): Promise<void> {
  const style = parseStyle(req.query.style);
  const showStats = req.query.stats !== "false";

  let txCount: number | null = null;
  if (showStats) {
    try {
      const snapshot = config.signerPool.getSnapshot();
      txCount = snapshot.reduce((sum, s) => sum + (s.totalUses ?? 0), 0);
    } catch {
      // stats are optional — serve badge without them on error
    }
  }

  const portalUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://paymaster.dev";
  const svg = buildSvg(style, txCount, portalUrl);

  // Cache for 60 s (stats refresh); immutable for style-only badges
  const cacheControl = showStats
    ? "public, max-age=60, stale-while-revalidate=300"
    : "public, max-age=86400, immutable";

  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(svg);
}
