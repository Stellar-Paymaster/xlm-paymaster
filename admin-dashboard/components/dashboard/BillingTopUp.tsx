"use client";

import { useState } from "react";
import { CreditCard, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const TIERS = [
  { amountCents: 500, label: "$5", description: "100 XLM quota", popular: false },
  { amountCents: 2000, label: "$20", description: "500 XLM quota", popular: true },
  { amountCents: 5000, label: "$50", description: "1,500 XLM quota", popular: false },
];

interface Props {
  tenantId: string;
}

export function BillingTopUp({ tenantId }: Props) {
  const [selected, setSelected] = useState<number>(2000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, amountCents: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create checkout session");
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-3xl border border-border/50 glass shadow-2xl transition-all duration-500"
    >
      <div className="relative p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        
        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-foreground">Top-up Quota</h2>
              <p className="text-sm font-medium text-muted-foreground">
                Instant XLM sponsorship replenishment
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
            {TIERS.map((tier) => (
              <button
                key={tier.amountCents}
                onClick={() => setSelected(tier.amountCents)}
                className={`relative overflow-hidden rounded-2xl border-2 p-5 text-left transition-all duration-300 ${
                  selected === tier.amountCents
                    ? "border-primary bg-primary/5 shadow-lg shadow-primary/10 ring-1 ring-primary/20"
                    : "border-border/50 hover:border-border hover:bg-muted/50"
                }`}
              >
                {tier.popular && (
                  <div className="absolute right-0 top-0 rounded-bl-xl bg-primary px-2 py-1 text-[10px] font-black uppercase tracking-wider text-primary-foreground">
                    Best Value
                  </div>
                )}
                <div className={`text-3xl font-black tracking-tighter ${
                  selected === tier.amountCents ? "text-primary" : "text-foreground"
                }`}>
                  {tier.label}
                </div>
                <div className="mt-1 text-sm font-bold text-muted-foreground">{tier.description}</div>
                {selected === tier.amountCents && (
                  <motion.div 
                    layoutId="check"
                    className="absolute bottom-4 right-4 text-primary"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                  </motion.div>
                )}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive flex items-center gap-2"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={handleCheckout}
            disabled={loading}
            className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-foreground px-8 py-5 text-lg font-black text-background transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Sparkles className="h-6 w-6 transition-transform group-hover:rotate-12" />
            )}
            <span className="relative">
              {loading ? "Initializing Secure Stripe Checkout…" : "Confirm & Pay with Stripe"}
            </span>
          </button>
          
          <div className="mt-6 flex items-center justify-center gap-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
            <span className="flex items-center gap-1.5">
              <div className="h-1 w-1 rounded-full bg-emerald-500" />
              Secure SSL
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-1 w-1 rounded-full bg-emerald-500" />
              PCI Compliant
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-1 w-1 rounded-full bg-emerald-500" />
              Stripe Verified
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
