"use client";

import { motion } from "framer-motion";
import { BookOpen, Download, ExternalLink, Tag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPortalLinks } from "@/lib/portal-links";
import {
  getLanguageColor,
  getRegistryUrl,
  type Sdk,
} from "@/lib/sdk-registry";
import { cn } from "@/lib/utils";

interface SdkRegistryProps {
  sdks: Sdk[];
}

export function SdkRegistry({ sdks }: SdkRegistryProps) {
  const { docs } = getPortalLinks();
  const [activeSdkId, setActiveSdkId] = useState(sdks[0]?.id ?? "");
  const activeSdk = sdks.find((s) => s.id === activeSdkId) ?? sdks[0];

  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        className="relative isolate overflow-hidden border-b border-border/80"
        aria-labelledby="sdk-registry-heading"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.15),transparent)]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="mb-4 text-sm font-semibold uppercase tracking-widest text-primary"
            >
              SDK registry
            </motion.p>
            <motion.h1
              id="sdk-registry-heading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl"
            >
              Official Paymaster SDKs
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 text-lg text-muted-foreground sm:text-xl"
            >
              Every language. One registry. Pick your SDK, grab the install command,
              and browse changelogs and API docs — all in one place.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
            >
              <Button size="lg" className="min-w-[200px] text-base shadow-lg" asChild>
                <a href={docs} target="_blank" rel="noopener noreferrer">
                  Read the docs
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/">Back to portal</Link>
              </Button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── SDK cards grid ────────────────────────────────────────────────── */}
      <section
        className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8"
        aria-labelledby="sdk-cards-heading"
      >
        <motion.h2
          id="sdk-cards-heading"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="text-2xl font-bold tracking-tight sm:text-3xl"
        >
          Available SDKs
        </motion.h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Select an SDK to view its changelog and API documentation.
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sdks.map((sdk, index) => (
            <SdkCard
              key={sdk.id}
              sdk={sdk}
              index={index}
              active={sdk.id === activeSdkId}
              onClick={() => setActiveSdkId(sdk.id)}
            />
          ))}
        </div>
      </section>

      {/* ── Changelog + API docs ──────────────────────────────────────────── */}
      {activeSdk && (
        <section
          className="border-t border-border bg-muted/30"
          aria-labelledby="changelog-heading"
        >
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <motion.div
              key={activeSdk.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2
                    id="changelog-heading"
                    className="text-2xl font-bold tracking-tight sm:text-3xl"
                  >
                    {activeSdk.name} — changelog
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Latest:{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {activeSdk.latestVersion}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={activeSdk.typeDocUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${activeSdk.name} API documentation`}
                    >
                      <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      API docs
                      <ExternalLink className="ml-1 h-3 w-3 opacity-60" aria-hidden />
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={getRegistryUrl(activeSdk)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${activeSdk.name} on ${activeSdk.registry}`}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      {activeSdk.registry}
                      <ExternalLink className="ml-1 h-3 w-3 opacity-60" aria-hidden />
                    </a>
                  </Button>
                </div>
              </div>

              {/* Version tabs */}
              <div className="mt-8">
                <Tabs defaultValue={activeSdk.versions[0]?.version ?? ""}>
                  <TabsList aria-label="SDK versions">
                    {activeSdk.versions.map((v) => (
                      <TabsTrigger key={v.version} value={v.version}>
                        {v.version}
                        {v.version === activeSdk.latestVersion && (
                          <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                            latest
                          </span>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {activeSdk.versions.map((v) => (
                    <TabsContent key={v.version} value={v.version}>
                      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                        <div className="mb-4 flex items-center gap-3">
                          <span className="font-mono text-lg font-bold">{v.version}</span>
                          <span className="text-sm text-muted-foreground">
                            {new Date(v.date).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <ul className="space-y-2.5" aria-label="Changes in this version">
                          {v.changes.map((change, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-sm">
                              <span
                                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                                aria-hidden
                              />
                              {change}
                            </li>
                          ))}
                        </ul>

                        {/* Install command for this version */}
                        <div className="mt-6 rounded-lg border border-border bg-muted/50 px-4 py-3 font-mono text-sm">
                          <span className="text-muted-foreground">$ </span>
                          <span>{activeSdk.installCommand}</span>
                        </div>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-border bg-card/50" role="contentinfo">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-semibold text-foreground">Paymaster</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Fee sponsorship infrastructure for Stellar developers.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-8 gap-y-3" aria-label="Footer">
            <Link href="/" className="text-sm font-medium text-primary hover:underline">
              Developer portal
            </Link>
            <Link href="/plugins" className="text-sm font-medium text-primary hover:underline">
              Plugin marketplace
            </Link>
            <a
              href={docs}
              className="text-sm font-medium text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Documentation
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

// ── SdkCard ─────────────────────────────────────────────────────────────────

interface SdkCardProps {
  sdk: Sdk;
  index: number;
  active: boolean;
  onClick: () => void;
}

function SdkCard({ sdk, index, active, onClick }: SdkCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: index * 0.06, duration: 0.45 }}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-start rounded-2xl border p-6 text-left shadow-sm transition-all",
        active
          ? "border-primary bg-card ring-2 ring-primary/30 shadow-md"
          : "border-border bg-card hover:border-primary/40 hover:shadow-md",
      )}
    >
      {/* Language badge */}
      <span
        className={cn(
          "mb-3 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
          getLanguageColor(sdk.language),
        )}
      >
        <Tag className="h-3 w-3" aria-hidden />
        {sdk.language}
      </span>

      <h3 className="font-semibold leading-tight">{sdk.name}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground line-clamp-2">
        {sdk.description}
      </p>

      {/* Latest version badge */}
      <div className="mt-4 flex items-center gap-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary">
          {sdk.latestVersion}
        </span>
        <span className="text-xs text-muted-foreground">latest</span>
      </div>

      {/* Install command */}
      <div className="mt-3 w-full overflow-hidden rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-xs">
        <span className="text-muted-foreground">$ </span>
        <span className="truncate">{sdk.installCommand}</span>
      </div>
    </motion.button>
  );
}
