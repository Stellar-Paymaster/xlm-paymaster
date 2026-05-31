"use client";

import { motion } from "framer-motion";
import { Copy, Gift, Users, Zap } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { TenantReferralData } from "@/lib/referral-data";

interface ReferralDashboardProps {
  data: TenantReferralData;
  siteUrl: string;
}

export function ReferralDashboard({ data, siteUrl }: ReferralDashboardProps) {
  const referralLink = siteUrl
    ? `${siteUrl}/register?ref=${data.referralCode}`
    : `/register?ref=${data.referralCode}`;

  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(referralLink).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-8">
      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Users}
          label="Successful referrals"
          value={String(data.successfulReferrals)}
        />
        <StatCard
          icon={Zap}
          label="Total bonus earned"
          value={`${data.totalBonusStroops.toLocaleString()} stroops`}
        />
        <StatCard
          icon={Gift}
          label="Bonus per referral"
          value="1,000 stroops"
        />
      </div>

      {/* Referral link card */}
      <Card>
        <CardHeader>
          <CardTitle>Your referral link</CardTitle>
          <CardDescription>
            Share this link with developers. When they sign up and complete their first
            fee-bump, you earn 1,000 stroops of XLM quota.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 overflow-hidden rounded-lg border border-border bg-muted/50 px-4 py-2.5 font-mono text-sm">
              <span className="truncate text-foreground">{referralLink}</span>
            </div>
            <Button onClick={() => void copyLink()} className="shrink-0">
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copied!" : "Copy link"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Referral code: <span className="font-mono font-semibold">{data.referralCode}</span>
          </p>
        </CardContent>
      </Card>

      {/* History table */}
      <Card>
        <CardHeader>
          <CardTitle>Referral history</CardTitle>
          <CardDescription>
            A log of developers you have referred and the bonuses earned.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.events.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No referrals yet. Share your link to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3 pr-4">Referred tenant</th>
                    <th className="pb-3 pr-4">Bonus</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.events.map((event, i) => (
                    <motion.tr
                      key={event.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <td className="py-3 pr-4 font-mono text-xs">
                        {event.referredTenantId.slice(0, 8)}…
                      </td>
                      <td className="py-3 pr-4">
                        {event.bonusStroops.toLocaleString()} stroops
                      </td>
                      <td className="py-3 pr-4">
                        {event.creditedAt ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                            Credited
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(event.createdAt).toLocaleDateString()}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-lg font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}
