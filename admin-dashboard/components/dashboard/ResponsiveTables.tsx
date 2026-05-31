"use client";

import { useState, type ReactNode } from "react";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { CategoryBadge } from "@/components/dashboard/CategoryBadge";
import type { DashboardSigner, DashboardTransaction } from "@/components/dashboard/types";

function formatHash(value: string) {
  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function StatusBadge({
  tone,
  label,
}: {
  tone: "green" | "amber" | "slate" | "red";
  label: string;
}) {
  const toneClassName = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    red: "bg-rose-50 text-rose-700 ring-rose-200",
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${toneClassName}`}
    >
      {label}
    </span>
  );
}

function transactionTone(status: DashboardTransaction["status"]) {
  switch (status) {
    case "success":
      return "green";
    case "pending":
    case "submitted":
      return "amber";
    case "failed":
      return "red";
    default:
      return "slate";
  }
}

function signerTone(status: DashboardSigner["status"]) {
  switch (status) {
    case "Active":
      return "green";
    case "Low Balance":
      return "amber";
    case "Sequence Error":
      return "red";
    default:
      return "slate";
  }
}

function MobileDisclosure({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex min-h-9 items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 md:hidden"
      aria-expanded={open}
    >
      {open ? "Hide details" : "View details"}
    </button>
  );
}

export function TransactionsTable({
  transactions,
}: {
  transactions: DashboardTransaction[];
}) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  function toggleRow(id: string) {
    setExpandedRows((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-border/50 px-6 py-5">
        <h2 className="text-xl font-black tracking-tight text-foreground">Transactions</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <th className="px-5 py-3">Amount</th>
              <th className="px-5 py-3">Hash</th>
              <th className="px-5 py-3">Status</th>
              <th className="hidden px-5 py-3 md:table-cell">Asset</th>
              <th className="hidden px-5 py-3 lg:table-cell">Category</th>
              <th className="hidden px-5 py-3 lg:table-cell">Tenant</th>
              <th className="hidden px-5 py-3 xl:table-cell">Date Created</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {transactions.map((transaction) => {
              const isOpen = expandedRows[transaction.id] ?? false;

              return (
                <FragmentRow key={transaction.id}>
                  <tr className="align-top">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">{transaction.amount}</div>
                      <div className="text-xs text-slate-500 md:hidden">{transaction.asset}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-900">{formatHash(transaction.hash)}</div>
                      <div className="mt-2 md:hidden">
                        <CopyButton value={transaction.hash} label="Tap to copy" />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge tone={transactionTone(transaction.status)} label={transaction.status} />
                    </td>
                    <td className="hidden px-5 py-4 text-sm text-slate-600 md:table-cell">
                      {transaction.asset}
                    </td>
                    <td className="hidden px-5 py-4 text-sm text-slate-600 lg:table-cell">
                      <CategoryBadge category={transaction.category} />
                    </td>
                    <td className="hidden px-5 py-4 text-sm text-slate-600 lg:table-cell">
                      {transaction.tenantId}
                    </td>
                    <td className="hidden px-5 py-4 text-sm text-slate-600 xl:table-cell">
                      {transaction.createdAt}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <div className="hidden md:block">
                          <CopyButton value={transaction.hash} />
                        </div>
                        <MobileDisclosure open={isOpen} onToggle={() => toggleRow(transaction.id)} />
                      </div>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="bg-slate-50 md:hidden">
                      <td colSpan={4} className="px-5 py-4">
                        <dl className="grid grid-cols-1 gap-3 text-sm text-slate-600">
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Full Hash
                            </dt>
                            <dd className="mt-1 break-all text-slate-900">{transaction.hash}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Tenant
                            </dt>
                            <dd className="mt-1 text-slate-900">{transaction.tenantId}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Category
                            </dt>
                            <dd className="mt-1 text-slate-900">
                              <CategoryBadge category={transaction.category} />
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Date Created
                            </dt>
                            <dd className="mt-1 text-slate-900">{transaction.createdAt}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Last Updated
                            </dt>
                            <dd className="mt-1 text-slate-900">{transaction.updatedAt}</dd>
                          </div>
                        </dl>
                      </td>
                    </tr>
                  ) : null}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SignersTable({ signers }: { signers: DashboardSigner[] }) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  function toggleRow(id: string) {
    setExpandedRows((current) => ({
      ...current,
      [id]: !current[id],
    }));
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-border/50 px-6 py-5">
        <h2 className="text-xl font-black tracking-tight text-foreground">Signer Accounts</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <th className="px-5 py-3">Signer</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Balance</th>
              <th className="hidden px-5 py-3 lg:table-cell">In Flight</th>
              <th className="hidden px-5 py-3 xl:table-cell">Sequence</th>
              <th className="hidden px-5 py-3 xl:table-cell">ID</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {signers.map((signer) => {
              const isOpen = expandedRows[signer.id] ?? false;

              return (
                <FragmentRow key={signer.id}>
                  <tr className="align-top">
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-900">{formatHash(signer.publicKey)}</div>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge tone={signerTone(signer.status)} label={signer.status} />
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-900">{signer.balance}</td>
                    <td className="hidden px-5 py-4 text-sm text-slate-600 lg:table-cell">
                      {signer.inFlight}
                    </td>
                    <td className="hidden px-5 py-4 text-sm text-slate-600 xl:table-cell">
                      {signer.sequenceNumber}
                    </td>
                    <td className="hidden px-5 py-4 text-sm text-slate-600 xl:table-cell">
                      {signer.id}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <div className="hidden md:block">
                          <CopyButton value={signer.publicKey} label="Copy key" />
                        </div>
                        <MobileDisclosure open={isOpen} onToggle={() => toggleRow(signer.id)} />
                      </div>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="bg-slate-50 md:hidden">
                      <td colSpan={4} className="px-5 py-4">
                        <dl className="grid grid-cols-1 gap-3 text-sm text-slate-600">
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Full Public Key
                            </dt>
                            <dd className="mt-1 break-all text-slate-900">{signer.publicKey}</dd>
                          </div>
                          <div className="pt-1">
                            <CopyButton value={signer.publicKey} label="Tap to copy" />
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              In Flight
                            </dt>
                            <dd className="mt-1 text-slate-900">{signer.inFlight}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Sequence
                            </dt>
                            <dd className="mt-1 text-slate-900">{signer.sequenceNumber}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Signer ID
                            </dt>
                            <dd className="mt-1 text-slate-900">{signer.id}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Total Uses
                            </dt>
                            <dd className="mt-1 text-slate-900">{signer.totalUses}</dd>
                          </div>
                        </dl>
                      </td>
                    </tr>
                  ) : null}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
