"use client";

import { motion } from "framer-motion";
import { Box, Layers, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { getPortalLinks } from "@/lib/portal-links";
import { cn } from "@/lib/utils";

// Leaflet requires browser APIs — load without SSR
const NodeNetworkMap = dynamic(
  () => import("./NodeNetworkMap").then((m) => ({ default: m.NodeNetworkMap })),
  { ssr: false },
);

const SDK_SNIPPET = `import { FluidClient } from "fluid-client";

const client = new FluidClient({
  serverUrl: "https://api.example.com",
  networkPassphrase: "Test SDF Network ; September 2015",
  horizonUrl: "https://horizon-testnet.stellar.org",
});

// User-signed transaction XDR → Fluid returns a fee-bump wrapper
const { xdr, status, hash } = await client.requestFeeBump(signedXdr, true);
console.log(status, hash);`;

export function DeveloperPortalLanding() {
  const { docs, github, discord } = getPortalLinks();
  const [copied, setCopied] = useState(false);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(SDK_SNIPPET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
              Ship gasless Stellar experiences
            </h1>
            <p className="mt-2 text-muted-foreground max-w-2xl text-balance">
              Sponsor network fees so your users never hold XLM for gas. Secure, server-side bumps for every stack.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" className="shadow-lg" asChild>
              <Link href="/login">Get API Key</Link>
            </Button>
            <Button size="lg" variant="secondary" className="shadow-md" asChild>
              <Link href="/admin/dashboard">Admin Dashboard</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={docs} target="_blank" rel="noopener noreferrer">
                Read the docs
              </a>
            </Button>
          </div>
        </div>
      </div>

      <section
        id="features"
        className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
        aria-labelledby="features-heading"
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2
            id="features-heading"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Built for real-world Stellar apps
          </h2>
          <p className="mt-4 text-muted-foreground">
            Everything you need to abstract fees while keeping users in control
            of their keys.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {[
            {
              icon: Zap,
              title: "Gasless by design",
              body: "End users sign transactions; Fluid wraps them in fee-bump transactions so your app covers XLM network costs without exposing fee payer keys.",
            },
            {
              icon: Layers,
              title: "Multi-asset flows",
              body: "Sponsor fees while users move SAC tokens, liquidity pool shares, or any Stellar asset—stay aligned with how your product actually settles value.",
            },
            {
              icon: Box,
              title: "Soroban-ready",
              body: "Pair Horizon and Soroban RPC in one client: build smart contract calls, then let Fluid handle the fee bump so contract invocations stay seamless.",
            },
          ].map((item, index) => (
            <motion.article
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: index * 0.08, duration: 0.45 }}
              className={cn(
                "flex flex-col rounded-2xl border p-8 shadow-sm transition-all duration-300",
                "glass",
                "border-border/50 hover:border-primary/30 hover:shadow-xl hover:-translate-y-1",
              )}
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <item.icon className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </motion.article>
          ))}
        </div>
      </section>

      <NodeNetworkMap />

      <section
        className="border-y border-border bg-muted/30"
        aria-labelledby="sdk-heading"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="mx-auto max-w-3xl text-center"
          >
            <h2
              id="sdk-heading"
              className="text-3xl font-bold tracking-tight sm:text-4xl"
            >
              Integrate in minutes
            </h2>
            <p className="mt-4 text-muted-foreground">
              The TypeScript SDK talks to your Fluid deployment over HTTPS—drop
              it into web or Node and start requesting fee bumps.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="relative mx-auto mt-10 max-w-4xl overflow-hidden rounded-2xl border border-border bg-zinc-950 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <span className="text-xs font-medium text-zinc-400">
                quickstart.ts
              </span>
              <button
                type="button"
                onClick={copySnippet}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre
              className="overflow-x-auto p-4 text-left text-sm leading-relaxed text-zinc-100"
              tabIndex={0}
            >
              <code>{SDK_SNIPPET}</code>
            </pre>
          </motion.div>
        </div>
      </section>

      <footer
        className="mt-auto border-t border-border bg-card/50"
        role="contentinfo"
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-semibold text-foreground">Fluid</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Fee sponsorship infrastructure for Stellar developers.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-8 gap-y-3" aria-label="Footer">
            <a
              href={docs}
              className="text-sm font-medium text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Documentation
            </a>
            <Link
              href="/plugins"
              className="text-sm font-medium text-primary hover:underline"
            >
              Plugin Marketplace
            </Link>
            <Link
              href="/sdk"
              className="text-sm font-medium text-primary hover:underline"
            >
              SDK Registry
            </Link>
            <a
              href={github}
              className="text-sm font-medium text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
