"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { CopyButton } from "@/components/dashboard/CopyButton";
import { ExportDropdown } from "@/components/dashboard/ExportDropdown";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { CategoryBadge } from "@/components/dashboard/CategoryBadge";
import type {
  TransactionHistoryPageData,
  TransactionHistoryRow,
  TransactionHistorySort,
} from "@/components/dashboard/types";

interface TransactionTableProps {
  data: TransactionHistoryPageData;
  basePath?: string;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortenHash(value: string) {
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function buildHref(
  basePath: string,
  data: TransactionHistoryPageData,
  updates: Partial<{
    page: number;
    pageSize: number;
    q: string;
    sort: TransactionHistorySort;
  }>,
) {
  const params = new URLSearchParams();
  const page = updates.page ?? data.page;
  const pageSize = updates.pageSize ?? data.pageSize;
  const search = updates.q ?? data.search;
  const sort = updates.sort ?? data.sort;

  params.set("page", `${page}`);
  params.set("pageSize", `${pageSize}`);
  params.set("sort", sort);
  if (search) {
    params.set("q", search);
  }

  return `${basePath}?${params.toString()}`;
}

function getNextSort(current: TransactionHistorySort, key: "time" | "cost"): TransactionHistorySort {
  if (key === "time") {
    return current === "time_desc" ? "time_asc" : "time_desc";
  }

  return current === "cost_desc" ? "cost_asc" : "cost_desc";
}

function SortLink({
  label,
  sortKey,
  data,
  basePath,
}: {
  label: string;
  sortKey: "time" | "cost";
  data: TransactionHistoryPageData;
  basePath: string;
}) {
  const isActive = data.sort.startsWith(sortKey);
  const arrow =
    !isActive ? "Sort" : data.sort.endsWith("desc") ? "Down" : "Up";

  return (
    <Link
      href={buildHref(basePath, data, {
        page: 1,
        sort: getNextSort(data.sort, sortKey),
      })}
      className="inline-flex items-center gap-2 text-slate-600 transition hover:text-slate-900"
    >
      <span>{label}</span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
        {arrow}
      </span>
    </Link>
  );
}

function PaginationButton({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const className = disabled
    ? "pointer-events-none border-slate-200 bg-slate-100 text-slate-400"
    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50";

  return (
    <Link
      href={disabled ? "#" : href}
      aria-disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center rounded-full border px-4 text-sm font-semibold transition ${className}`}
    >
      {children}
    </Link>
  );
}

export function TransactionTable({
  data,
  basePath = "/admin/transactions",
}: TransactionTableProps) {
  const columns: ColumnDef<TransactionHistoryRow>[] = [
    {
      accessorKey: "timestamp",
      header: () => <SortLink label="Time" sortKey="time" data={data} basePath={basePath} />,
      cell: ({ row }) => (
        <div className="min-w-32">
          <div className="font-medium text-slate-900">
            {formatTimestamp(row.original.timestamp)}
          </div>
          <div className="text-xs text-slate-500">
            {new Date(row.original.timestamp).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "innerHash",
      header: "Inner Hash",
      cell: ({ row }) => (
        <div className="min-w-44">
          <div className="font-mono text-sm text-slate-900">
            {shortenHash(row.original.innerHash)}
          </div>
          <div className="mt-2">
            <CopyButton value={row.original.innerHash} label="Copy hash" />
          </div>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => <CategoryBadge category={row.original.category} />,
    },
    {
      accessorKey: "costStroops",
      header: () => <SortLink label="Cost" sortKey="cost" data={data} basePath={basePath} />,
      cell: ({ row }) => (
        <div className="font-semibold text-slate-900">
          {row.original.costStroops.toLocaleString()} stroops
        </div>
      ),
    },
    {
      accessorKey: "tenant",
      header: "Tenant",
      cell: ({ row }) => (
        <div className="min-w-28">
          <div className="font-medium text-slate-900">{row.original.tenant}</div>
        </div>
      ),
    },
  ];

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: data.totalPages,
  });

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Transaction History</h2>
          <p className="mt-1 text-sm text-slate-500">
            Auditable fee-bump activity with server-side pagination and sorting.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form action={basePath} className="flex flex-col gap-3 sm:flex-row">
            <input type="hidden" name="page" value="1" />
            <input type="hidden" name="pageSize" value={`${data.pageSize}`} />
            <input type="hidden" name="sort" value={data.sort} />
            <label className="sr-only" htmlFor="transaction-search">
              Search transactions
            </label>
            <input
              id="transaction-search"
              name="q"
              defaultValue={data.search}
              placeholder="Search hash, tenant, status, or category"
              className="min-w-0 rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400"
            />
            <button
              type="submit"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Search
            </button>
          </form>
          <ExportDropdown rows={data.rows} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-slate-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-200">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="align-top">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-5 py-4 text-sm text-slate-600">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-4 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-500">
          Showing page {data.page} of {data.totalPages} with {data.totalRows} total transactions.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PaginationButton
            href={buildHref(basePath, data, { page: data.page - 1 })}
            disabled={data.page <= 1}
          >
            Previous
          </PaginationButton>
          <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
            Page {data.page}
          </span>
          <PaginationButton
            href={buildHref(basePath, data, { page: data.page + 1 })}
            disabled={data.page >= data.totalPages}
          >
            Next
          </PaginationButton>
        </div>
      </div>
    </div>
  );
}
