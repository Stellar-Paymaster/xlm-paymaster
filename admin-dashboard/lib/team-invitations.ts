import type { AdminRole } from "@/lib/permissions";

export interface TeamInvitation {
  id: string;
  email: string;
  role: AdminRole;
  invitedBy: string;
  expiresAt: string;
  inviteUrl: string;
  token: string;
  createdAt: string;
}

export interface TeamInvitationInput {
  email: string;
  role: AdminRole;
  invitedBy: string;
  ttlHours?: number;
  now?: Date;
  appOrigin?: string;
}

const DEFAULT_TTL_HOURS = 72;
const MIN_TTL_HOURS = 1;
const MAX_TTL_HOURS = 168;

export function normalizeInvitationEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidInvitationEmail(value: string): boolean {
  const normalized = normalizeInvitationEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function clampInvitationTtlHours(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TTL_HOURS;
  }
  return Math.max(MIN_TTL_HOURS, Math.min(MAX_TTL_HOURS, Math.floor(value)));
}

function randomHex(bytes: number): string {
  const fallback = Array.from({ length: bytes }, () => Math.floor(Math.random() * 256));

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const data = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(data);
    return Array.from(data, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  return fallback.map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function createTeamInvitation(input: TeamInvitationInput): TeamInvitation {
  const now = input.now ?? new Date();
  const ttlHours = clampInvitationTtlHours(input.ttlHours);
  const token = randomHex(18);
  const id = `inv_${randomHex(8)}`;
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
  const email = normalizeInvitationEmail(input.email);
  const origin = input.appOrigin?.replace(/\/$/, "") ?? "https://admin.fluid.dev";

  return {
    id,
    email,
    role: input.role,
    invitedBy: input.invitedBy,
    expiresAt: expiresAt.toISOString(),
    inviteUrl: `${origin}/signup?invite=${token}`,
    token,
    createdAt: now.toISOString(),
  };
}

export function isInvitationExpired(invitation: Pick<TeamInvitation, "expiresAt">, now = new Date()): boolean {
  const expiry = Date.parse(invitation.expiresAt);
  if (Number.isNaN(expiry)) return true;
  return expiry <= now.getTime();
}
