"use client";

import React, { useMemo, useState, type FormEvent } from "react";
import type { AdminRole } from "@/lib/permissions";
import { ADMIN_ROLES, ROLE_LABELS } from "@/lib/permissions";
import {
  clampInvitationTtlHours,
  createTeamInvitation,
  isInvitationExpired,
  isValidInvitationEmail,
  normalizeInvitationEmail,
  type TeamInvitation,
} from "@/lib/team-invitations";

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
}

interface AdminUsersTableProps {
  users: AdminUser[];
  currentUserRole: string;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function RoleBadge({ role }: { role: string }) {
  const classes: Record<string, string> = {
    SUPER_ADMIN: "bg-purple-50 text-purple-700 ring-purple-200",
    ADMIN: "bg-blue-50 text-blue-700 ring-blue-200",
    READ_ONLY: "bg-slate-100 text-slate-600 ring-slate-200",
    BILLING: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
  const cls = classes[role] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {ROLE_LABELS[role as AdminRole] ?? role}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset bg-emerald-50 text-emerald-700 ring-emerald-200">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset bg-slate-100 text-slate-500 ring-slate-200">
      Inactive
    </span>
  );
}

interface CreateUserModalProps {
  onClose: () => void;
  onCreated: (user: AdminUser) => void;
}

function CreateUserModal({ onClose, onCreated }: CreateUserModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminRole>("READ_ONLY");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Failed to create user");
      }
      const created: AdminUser = await res.json();
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Create Admin User</h2>
          <p className="mt-1 text-sm text-slate-500">Add a new admin account with an assigned role.</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {error && (
              <p className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                {error}
              </p>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                Role
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as AdminRole)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {ADMIN_ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CreateInvitationModalProps {
  onClose: () => void;
  onCreated: (invitation: TeamInvitation) => void;
  inviterEmail: string;
  existingEmails: Set<string>;
}

function CreateInvitationModal({ onClose, onCreated, inviterEmail, existingEmails }: CreateInvitationModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("READ_ONLY");
  const [ttlHours, setTtlHours] = useState(72);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const normalizedEmail = normalizeInvitationEmail(email);
    if (!isValidInvitationEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (existingEmails.has(normalizedEmail)) {
      setError("This member already has a pending invitation.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        email: normalizedEmail,
        role,
        ttlHours: clampInvitationTtlHours(ttlHours),
      };

      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const serverInvitation = await response.json() as TeamInvitation;
        onCreated(serverInvitation);
        return;
      }

      const fallbackInvitation = createTeamInvitation({
        email: normalizedEmail,
        role,
        invitedBy: inviterEmail || "admin@fluid.dev",
        ttlHours,
        appOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
      });

      onCreated(fallbackInvitation);
    } catch {
      const fallbackInvitation = createTeamInvitation({
        email: normalizedEmail,
        role,
        invitedBy: inviterEmail || "admin@fluid.dev",
        ttlHours,
        appOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
      });

      onCreated(fallbackInvitation);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Invite Team Member</h2>
          <p className="mt-1 text-sm text-slate-500">Generate an expiring invitation link for a new admin user.</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-6 py-4">
            {error && (
              <p className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                {error}
              </p>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Team Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ops@company.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Role
              </label>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as AdminRole)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {ADMIN_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Expires In (Hours)
              </label>
              <input
                type="number"
                min={1}
                max={168}
                required
                value={ttlHours}
                onChange={(event) => setTtlHours(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <p className="mt-1 text-xs text-slate-500">Allowed range: 1 to 168 hours.</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Generate Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AdminUsersTable({ users: initialUsers, currentUserRole }: AdminUsersTableProps) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const isSuperAdmin = currentUserRole === "SUPER_ADMIN";
  const canManageInvites = isSuperAdmin || currentUserRole === "ADMIN";

  const activeInvitationEmails = useMemo(() => {
    return new Set(
      invitations
        .filter((invitation) => !isInvitationExpired(invitation))
        .map((invitation) => invitation.email),
    );
  }, [invitations]);

  function showToast(message: string, kind: "success" | "error" = "success") {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  }

  function handleUserCreated(user: AdminUser) {
    setUsers(prev => [user, ...prev]);
    setShowCreateModal(false);
    showToast(`User ${user.email} created.`);
  }

  function handleInvitationCreated(invitation: TeamInvitation) {
    setInvitations((prev) => [invitation, ...prev]);
    setShowInviteModal(false);
    showToast(`Invitation created for ${invitation.email}.`);
  }

  async function copyInvitationLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      showToast("Invitation link copied.");
    } catch {
      showToast("Unable to copy invitation link.", "error");
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setChangingRole(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      setUsers(prev =>
        prev.map(u => u.id === userId ? { ...u, role: newRole } : u)
      );
      showToast("Role updated.");
    } catch {
      showToast("Failed to update role.", "error");
    } finally {
      setChangingRole(null);
    }
  }

  async function handleDeactivate(userId: string, email: string) {
    setDeactivating(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to deactivate user");
      setUsers(prev =>
        prev.map(u => u.id === userId ? { ...u, active: false } : u)
      );
      showToast(`${email} deactivated.`);
    } catch {
      showToast("Failed to deactivate user.", "error");
    } finally {
      setDeactivating(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {users.length} {users.length === 1 ? "user" : "users"}
        </p>
        <div className="flex items-center gap-2">
          {canManageInvites && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100"
            >
              Invite Member
            </button>
          )}
          {isSuperAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Create User
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {users.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            No admin users found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-800">
                      {user.email}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge active={user.active} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <select
                          value={user.role}
                          disabled={!isSuperAdmin || changingRole === user.id}
                          onChange={e => handleRoleChange(user.id, e.target.value)}
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {ADMIN_ROLES.map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                        {user.active && isSuperAdmin && (
                          <button
                            onClick={() => handleDeactivate(user.id, user.email)}
                            disabled={deactivating === user.id}
                            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            {deactivating === user.id ? "Deactivating..." : "Deactivate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {invitations.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">Pending Invitations</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Expires</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.map((invitation) => {
                  const expired = isInvitationExpired(invitation);
                  return (
                    <tr key={invitation.id} className="hover:bg-slate-50/50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-800">
                        {invitation.email}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <RoleBadge role={invitation.role} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                        {expired ? (
                          <span className="font-semibold text-rose-600">Expired</span>
                        ) : (
                          new Date(invitation.expiresAt).toLocaleString()
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          disabled={expired}
                          onClick={() => copyInvitationLink(invitation.inviteUrl)}
                          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Copy link
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create user modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleUserCreated}
        />
      )}

      {showInviteModal && (
        <CreateInvitationModal
          onClose={() => setShowInviteModal(false)}
          onCreated={handleInvitationCreated}
          inviterEmail={users[0]?.email ?? "admin@fluid.dev"}
          existingEmails={activeInvitationEmails}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-lg ${
            toast.kind === "error" ? "bg-rose-600" : "bg-slate-900"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
