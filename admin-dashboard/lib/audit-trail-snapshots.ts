import type { AuditLogEntry } from "@/lib/audit-logs-data";

export interface SnapshotChange {
  field: string;
  before: string;
  after: string;
}

export interface AuditTrailSnapshot {
  hasChanges: boolean;
  changes: SnapshotChange[];
  summary: string;
}

type MetadataMap = Record<string, unknown>;

function formatValue(value: unknown): string {
  if (value === null || typeof value === "undefined") return "(empty)";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function parseMetadata(raw: string | null): MetadataMap {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as MetadataMap;
    }
    return { value: parsed };
  } catch {
    return { _raw: raw };
  }
}

export function buildAuditTrailSnapshot(
  current: Pick<AuditLogEntry, "metadata" | "action" | "id">,
  baseline: Pick<AuditLogEntry, "metadata" | "action" | "id"> | null,
): AuditTrailSnapshot {
  if (!baseline) {
    return {
      hasChanges: false,
      changes: [],
      summary: "No baseline entry available for diff.",
    };
  }

  const beforeMetadata = parseMetadata(baseline.metadata);
  const afterMetadata = parseMetadata(current.metadata);
  const keys = new Set([...Object.keys(beforeMetadata), ...Object.keys(afterMetadata)]);

  const changes = [...keys]
    .filter((key) => JSON.stringify(beforeMetadata[key]) !== JSON.stringify(afterMetadata[key]))
    .map((key) => ({
      field: key,
      before: formatValue(beforeMetadata[key]),
      after: formatValue(afterMetadata[key]),
    }));

  if (changes.length === 0) {
    return {
      hasChanges: false,
      changes: [],
      summary: `No metadata changes between ${baseline.action} and ${current.action}.`,
    };
  }

  return {
    hasChanges: true,
    changes,
    summary: `${changes.length} field${changes.length === 1 ? "" : "s"} changed between ${baseline.action} and ${current.action}.`,
  };
}
