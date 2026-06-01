import Link from "next/link";
import { auth } from "@/auth";
import { AdminUsersTable } from "@/components/dashboard/AdminUsersTable";
import type { AdminUser } from "@/components/dashboard/AdminUsersTable";
import { ADMIN_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/permissions";

async function fetchUsers(adminJwt: string): Promise<AdminUser[]> {
  const serverUrl = process.env.FLUID_SERVER_URL;
  const adminToken = process.env.FLUID_ADMIN_TOKEN;

  if (!serverUrl || !adminToken) return [];

  try {
    const res = await fetch(`${serverUrl}/admin/users`, {
      headers: {
        "x-admin-token": adminToken,
        "x-admin-jwt": adminJwt,
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

const ROLE_KEY_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ["Manage users", "Full operational control", "Billing & payments", "Config changes"],
  ADMIN: ["Full operational control", "View billing", "Config changes", "Manage API keys & tenants"],
  READ_ONLY: ["View transactions, analytics, signers", "View API keys & tenants", "View SAR & audit logs", "View billing"],
  BILLING: ["View transactions & analytics", "View tenants", "Manage billing & payments"],
};

export default async function AdminUsersPage() {
  const session = await auth();
  const users = await fetchUsers(session?.user?.adminJwt ?? "");

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">
                Fluid Admin — Access Control
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900">Admin Users</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Manage admin accounts and role assignments.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <div className="font-medium text-slate-900">{session?.user?.email}</div>
                <div>{session?.user?.role ?? "Unknown role"}</div>
              </div>
              <Link
                href="/admin/dashboard"
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-10">
        <AdminUsersTable users={users} currentUserRole={session?.user?.role ?? ""} />

        {/* Role permissions reference */}
        <div>
          <h2 className="mb-3 text-base font-semibold text-slate-800">Role Permissions Reference</h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Key Permissions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ADMIN_ROLES.map(role => (
                    <tr key={role} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                          role === "SUPER_ADMIN"
                            ? "bg-purple-50 text-purple-700 ring-purple-200"
                            : role === "ADMIN"
                            ? "bg-blue-50 text-blue-700 ring-blue-200"
                            : role === "BILLING"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-slate-100 text-slate-600 ring-slate-200"
                        }`}>
                          {ROLE_LABELS[role]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{ROLE_DESCRIPTIONS[role]}</td>
                      <td className="px-4 py-3">
                        <ul className="space-y-0.5">
                          {ROLE_KEY_PERMISSIONS[role].map(perm => (
                            <li key={perm} className="text-xs text-slate-500">
                              {perm}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
