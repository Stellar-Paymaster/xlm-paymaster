/**
 * /gallery — Paymaster Design System Component Gallery
 *
 * Shows every shadcn/ui component installed for the Paymaster Admin Dashboard so
 * that designers, reviewers, and developers can inspect the brand tokens in
 * context.  This page is unauthenticated and purely for visual verification.
 */

"use client";

import { useState } from "react";
import {
  Zap,
  CreditCard,
  AlertTriangle,
  Info,
  Search,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Demo data ────────────────────────────────────────────────────────────────

const SAMPLE_TRANSACTIONS = [
  {
    id: "TX-001",
    account: "GCKFBEIY…YT32",
    amount: "50.00 XLM",
    status: "success",
    time: "2 min ago",
  },
  {
    id: "TX-002",
    account: "GABCDE12…MN89",
    amount: "120.50 XLM",
    status: "pending",
    time: "5 min ago",
  },
  {
    id: "TX-003",
    account: "GDEFTGH3…PQ56",
    amount: "9.99 XLM",
    status: "failed",
    time: "12 min ago",
  },
  {
    id: "TX-004",
    account: "GHIJKL45…RS23",
    amount: "275.00 XLM",
    status: "success",
    time: "1 hr ago",
  },
];

const STATUS_MAP: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  success: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    label: "Success",
    color: "text-green-600",
  },
  pending: {
    icon: <Clock className="h-4 w-4" />,
    label: "Pending",
    color: "text-yellow-600",
  },
  failed: {
    icon: <XCircle className="h-4 w-4" />,
    label: "Failed",
    color: "text-red-600",
  },
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="border-b border-border pb-2">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

// ─── Color swatch ─────────────────────────────────────────────────────────────

function Swatch({
  label,
  bg,
  text = "text-white",
}: {
  label: string;
  bg: string;
  text?: string;
}) {
  return (
    <div
      className={`flex h-16 items-end rounded-lg px-3 pb-2 text-xs font-medium ${bg} ${text} shadow`}
    >
      {label}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GalleryPage() {
  const [searchValue, setSearchValue] = useState("");

  return (
    <div className="min-h-screen bg-background px-6 py-12">
      {/* Header */}
      <div className="mb-12 space-y-1">
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          <span className="text-sm font-semibold tracking-widest uppercase text-muted-foreground">
            Paymaster Design System
          </span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Component Gallery
        </h1>
        <p className="text-lg text-muted-foreground">
          Shadcn UI + Tailwind CSS v4 — Paymaster brand tokens applied.
        </p>
      </div>

      <div className="mx-auto max-w-5xl space-y-16">
        {/* ── Color Tokens ───────────────────────────────────────────────── */}
        <Section
          title="Color Tokens"
          description="Brand palette mapped to CSS variables and Tailwind utility classes."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Swatch label="primary" bg="bg-primary" />
            <Swatch label="accent" bg="bg-accent" />
            <Swatch label="secondary" bg="bg-secondary" text="text-secondary-foreground" />
            <Swatch label="muted" bg="bg-muted" text="text-muted-foreground" />
            <Swatch label="destructive" bg="bg-destructive" />
            <Swatch label="card" bg="bg-card" text="text-card-foreground border border-border" />
            <Swatch label="border" bg="bg-border" text="text-foreground" />
            <Swatch label="foreground" bg="bg-foreground" />
          </div>
        </Section>

        {/* ── Buttons ─────────────────────────────────────────────────────── */}
        <Section
          title="Button"
          description="All variants and sizes for interactive actions."
        >
          <Card>
            <CardHeader>
              <CardTitle>Variants</CardTitle>
              <CardDescription>
                Six semantic variants for every UI context.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button variant="default">
                <Zap /> Default
              </Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">
                <ExternalLink /> Outline
              </Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button variant="destructive">
                <Trash2 /> Destructive
              </Button>
            </CardContent>
            <CardContent className="flex flex-wrap gap-3 pt-0">
              <CardDescription className="w-full mb-2">Sizes</CardDescription>
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Add">
                <Plus />
              </Button>
            </CardContent>
            <CardContent className="flex flex-wrap gap-3 pt-0">
              <CardDescription className="w-full mb-2">States</CardDescription>
              <Button disabled>Disabled</Button>
              <Button variant="outline" disabled>
                Disabled Outline
              </Button>
            </CardContent>
          </Card>
        </Section>

        {/* ── Cards ───────────────────────────────────────────────────────── */}
        <Section
          title="Card"
          description="Surface container for dashboard widgets and information panels."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Stat card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Sponsored
                </CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  24,501 XLM
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  +12.4% from last month
                </p>
              </CardContent>
            </Card>

            {/* Info card */}
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Paymaster Blue Accent</CardTitle>
                </div>
                <CardDescription>
                  Cards can carry brand emphasis via subtle tinting.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Use{" "}
                <code className="rounded bg-muted px-1 text-xs">
                  border-primary/30
                </code>{" "}
                and{" "}
                <code className="rounded bg-muted px-1 text-xs">
                  bg-primary/5
                </code>{" "}
                for subtle highlights.
              </CardContent>
            </Card>

            {/* Warning card */}
            <Card className="border-yellow-400/40 bg-yellow-50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <CardTitle className="text-sm text-yellow-800">
                    Warning State
                  </CardTitle>
                </div>
                <CardDescription className="text-yellow-700">
                  Semantic card for alerts and warnings.
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button size="sm" variant="outline" className="border-yellow-400 text-yellow-700 hover:bg-yellow-100">
                  Acknowledge
                </Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        {/* ── Input ───────────────────────────────────────────────────────── */}
        <Section
          title="Input"
          description="Text fields for search, forms, and filters."
        >
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Default
                </label>
                <Input placeholder="Stellar account address…" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  With icon
                </label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Search transactions…"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Disabled
                </label>
                <Input placeholder="Read-only field" disabled />
              </div>
            </CardContent>
          </Card>
        </Section>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <Section
          title="Table"
          description="Data table for transaction lists, account ledgers, and audit logs."
        >
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>
                Stellar fee sponsorship activity feed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableCaption>
                  Showing the 4 most recent sponsored transactions.
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>TX ID</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SAMPLE_TRANSACTIONS.map((tx) => {
                    const status = STATUS_MAP[tx.status];
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-xs">
                          {tx.id}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {tx.account}
                        </TableCell>
                        <TableCell className="font-medium">{tx.amount}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${status.color}`}
                          >
                            {status.icon}
                            {status.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-xs">
                          {tx.time}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Section>

        {/* ── Dialog ──────────────────────────────────────────────────────── */}
        <Section
          title="Dialog"
          description="Modal dialogs for confirmations, forms, and detailed views."
        >
          <Card>
            <CardContent className="pt-6 flex flex-wrap gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button>
                    <Plus /> Open Dialog
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Signing Account</DialogTitle>
                    <DialogDescription>
                      Add a new Stellar account to the fee-sponsorship signing
                      pool. Ensure the account has at least 1 XLM reserve.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        Account Address
                      </label>
                      <Input placeholder="G…" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        Label (optional)
                      </label>
                      <Input placeholder="e.g. Pool Account #3" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline">Cancel</Button>
                    <Button>Add Account</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 /> Destructive Action
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Revoke Signing Account</DialogTitle>
                    <DialogDescription>
                      This will permanently remove the account from the signing
                      pool. Pending transactions may fail. This action cannot be
                      undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline">Cancel</Button>
                    <Button variant="destructive">Yes, Revoke</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </Section>

        {/* Footer */}
        <footer className="border-t border-border pt-6 text-center text-xs text-muted-foreground">
          Paymaster Design System · Shadcn UI · Tailwind CSS v4 ·{" "}
          <span className="text-primary font-medium">lucide-react</span>
        </footer>
      </div>
    </div>
  );
}
