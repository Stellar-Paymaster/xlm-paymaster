import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdminUsersTable, type AdminUser } from "./AdminUsersTable";

const USERS: AdminUser[] = [
  {
    id: "u_1",
    email: "owner@fluid.dev",
    role: "SUPER_ADMIN",
    active: true,
    createdAt: "2026-04-01T00:00:00.000Z",
  },
];

describe("AdminUsersTable invitations", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false })));
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows invite action for super admins", () => {
    render(<AdminUsersTable users={USERS} currentUserRole="SUPER_ADMIN" />);
    expect(screen.getByText("Invite Member")).toBeInTheDocument();
  });

  it("creates fallback invitation when API is unavailable", async () => {
    render(<AdminUsersTable users={USERS} currentUserRole="SUPER_ADMIN" />);

    fireEvent.click(screen.getByText("Invite Member"));

    fireEvent.change(screen.getByPlaceholderText("ops@company.com"), {
      target: { value: "ops@fluid.dev" },
    });

    fireEvent.click(screen.getByText("Generate Invite"));

    expect(await screen.findByText("ops@fluid.dev")).toBeInTheDocument();
    expect(screen.getByText("Pending Invitations")).toBeInTheDocument();
  });
});
