import { LucideIcon } from "lucide-react";
import React from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  delta?: string;
  icon: LucideIcon;
  action?: React.ReactNode;
}

export function StatCard({ title, value, delta, icon: Icon, action }: StatCardProps) {
  return (
    <div className="group relative rounded-3xl border border-border/50 glass p-6 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-foreground">{value}</p>
          {delta && (
            <p className="mt-1 text-xs font-medium text-primary">{delta}</p>
          )}
        </div>
        <div className="flex flex-col items-end justify-between self-stretch">
          <div className="rounded-2xl bg-primary/10 p-3">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          {action && <div className="mt-auto pt-4">{action}</div>}
        </div>
      </div>
    </div>
  );
}