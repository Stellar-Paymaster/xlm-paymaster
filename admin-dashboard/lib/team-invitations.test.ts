import { describe, expect, it } from "vitest";
import {
  clampInvitationTtlHours,
  createTeamInvitation,
  isInvitationExpired,
  isValidInvitationEmail,
  normalizeInvitationEmail,
} from "./team-invitations";

describe("team invitations", () => {
  it("normalizes and validates invitation email", () => {
    expect(normalizeInvitationEmail("  Admin@Fluid.dev ")).toBe("admin@fluid.dev");
    expect(isValidInvitationEmail("admin@fluid.dev")).toBe(true);
    expect(isValidInvitationEmail("invalid-email")).toBe(false);
  });

  it("clamps ttl values to safe boundaries", () => {
    expect(clampInvitationTtlHours(undefined)).toBe(72);
    expect(clampInvitationTtlHours(-5)).toBe(1);
    expect(clampInvitationTtlHours(1000)).toBe(168);
  });

  it("creates invitation links with expiry and token", () => {
    const invitation = createTeamInvitation({
      email: "ops@fluid.dev",
      role: "ADMIN",
      invitedBy: "owner@fluid.dev",
      ttlHours: 24,
      now: new Date("2026-04-27T12:00:00Z"),
      appOrigin: "https://dashboard.fluid.dev",
    });

    expect(invitation.email).toBe("ops@fluid.dev");
    expect(invitation.role).toBe("ADMIN");
    expect(invitation.expiresAt).toBe("2026-04-28T12:00:00.000Z");
    expect(invitation.inviteUrl.startsWith("https://dashboard.fluid.dev/signup?invite=")).toBe(true);
  });

  it("detects expiration state", () => {
    expect(isInvitationExpired({ expiresAt: "2026-04-27T11:00:00Z" }, new Date("2026-04-27T12:00:00Z"))).toBe(true);
    expect(isInvitationExpired({ expiresAt: "2026-04-27T13:00:00Z" }, new Date("2026-04-27T12:00:00Z"))).toBe(false);
  });
});
