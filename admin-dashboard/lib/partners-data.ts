import "server-only";

import type { PartnerStatus } from "@/components/dashboard/types";

export interface PartnerRecord {
  contactEmail: string;
  createdAt: string;
  description: string;
  id: string;
  projectName: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  status: PartnerStatus;
  updatedAt: string;
  websiteUrl: string;
}

export interface PartnerPageData {
  partners: PartnerRecord[];
  source: "sample";
}

interface CreatePartnerInput {
  contactEmail: string;
  description: string;
  projectName: string;
  websiteUrl: string;
}

const samplePartners: PartnerRecord[] = [
  {
    id: "partner-anchor-west",
    projectName: "Anchor West",
    contactEmail: "ops@anchorwest.example",
    websiteUrl: "https://anchorwest.example",
    description: "Cross-border settlement and treasury tooling for anchors.",
    status: "approved",
    reviewNote: "Approved for public listing after compliance review.",
    reviewedAt: "2026-03-20T10:00:00.000Z",
    createdAt: "2026-03-10T09:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
  },
  {
    id: "partner-orbit-pay",
    projectName: "Orbit Pay",
    contactEmail: "team@orbitpay.example",
    websiteUrl: "https://orbitpay.example",
    description: "Merchant acceptance and payout infrastructure for Stellar.",
    status: "pending",
    reviewNote: null,
    reviewedAt: null,
    createdAt: "2026-04-01T14:15:00.000Z",
    updatedAt: "2026-04-01T14:15:00.000Z",
  },
];

const partnerStore = new Map<string, PartnerRecord>(
  samplePartners.map((partner) => [partner.id, partner]),
);

function nowIso() {
  return new Date().toISOString();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function listPartners() {
  return [...partnerStore.values()].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function getPartnerPageData(): Promise<PartnerPageData> {
  return {
    partners: listPartners(),
    source: "sample",
  };
}

export async function getPartnerById(id: string): Promise<PartnerRecord | null> {
  return partnerStore.get(id) ?? null;
}

export async function createPartner(input: CreatePartnerInput): Promise<PartnerRecord> {
  const timestamp = nowIso();
  const baseId = slugify(input.projectName) || "partner";
  const id = `${baseId}-${Math.random().toString(36).slice(2, 8)}`;

  const partner: PartnerRecord = {
    id,
    projectName: input.projectName,
    contactEmail: input.contactEmail,
    websiteUrl: input.websiteUrl,
    description: input.description,
    status: "pending",
    reviewNote: null,
    reviewedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  partnerStore.set(partner.id, partner);
  return partner;
}

export async function updatePartnerStatus(
  id: string,
  status: PartnerStatus,
  reviewNote: string | null,
): Promise<PartnerRecord | null> {
  const existing = partnerStore.get(id);
  if (!existing) {
    return null;
  }

  const reviewedAt = status === "pending" ? null : nowIso();
  const updated: PartnerRecord = {
    ...existing,
    status,
    reviewNote,
    reviewedAt,
    updatedAt: nowIso(),
  };

  partnerStore.set(id, updated);
  return updated;
}

export async function deletePartner(id: string): Promise<boolean> {
  return partnerStore.delete(id);
}
