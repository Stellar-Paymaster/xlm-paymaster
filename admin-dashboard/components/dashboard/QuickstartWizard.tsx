"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Check, Copy, ChevronRight, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const STORAGE_STEP_KEY = "paymaster_qs_step";
const STORAGE_DONE_KEY = "paymaster_qs_done";
const TOTAL_STEPS = 3;
const POLL_INTERVAL_MS = 3_000;

interface QuickstartWizardProps {
  apiKey: string;
}

function StepIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 rounded-full transition-all duration-300",
            i + 1 < current
              ? "w-6 bg-emerald-500"
              : i + 1 === current
                ? "w-6 bg-sky-500"
                : "w-2 bg-slate-200",
          )}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">
        Step {current} of {total}
      </span>
    </div>
  );
}

function InlineCopyButton({
  value,
  light = false,
}: {
  value: string;
  light?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy to clipboard"
      className={cn(
        "rounded p-1 transition",
        light
          ? "text-slate-400 hover:bg-slate-700 hover:text-slate-200"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function fireConfetti() {
  import("canvas-confetti").then(({ default: confetti }) => {
    void confetti({
      particleCount: 160,
      spread: 80,
      origin: { y: 0.6 },
      colors: ["#0ea5e9", "#10b981", "#6366f1", "#f59e0b"],
    });
  });
}

export function QuickstartWizard({ apiKey }: QuickstartWizardProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(1);
  const [copied, setCopied] = useState(false);
  const [polling, setPolling] = useState(false);
  const [detected, setDetected] = useState(false);
  const baselineRef = useRef<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore state from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setMounted(true);
    const isDone = localStorage.getItem(STORAGE_DONE_KEY) === "true";
    if (isDone) {
      setDone(true);
      return;
    }
    const saved = localStorage.getItem(STORAGE_STEP_KEY);
    const savedStep = saved ? parseInt(saved, 10) : 1;
    setStep(Number.isNaN(savedStep) ? 1 : Math.min(savedStep, TOTAL_STEPS));
    setOpen(true);
  }, []);

  // Persist current step
  useEffect(() => {
    if (mounted && open) {
      localStorage.setItem(STORAGE_STEP_KEY, String(step));
    }
  }, [step, open, mounted]);

  function dismiss() {
    localStorage.setItem(STORAGE_DONE_KEY, "true");
    localStorage.removeItem(STORAGE_STEP_KEY);
    setDone(true);
    setOpen(false);
    stopPolling();
  }

  // ── Copy API key (step 1) ─────────────────────────────────────────────────
  async function handleCopyKey() {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  // ── Polling (step 3) ──────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPolling(false);
  }, []);

  async function fetchTxCount(): Promise<number> {
    try {
      const res = await fetch("/api/wizard/poll", { cache: "no-store" });
      if (!res.ok) return 0;
      const data = (await res.json()) as { count: number };
      return data.count ?? 0;
    } catch {
      return 0;
    }
  }

  const startPolling = useCallback(async () => {
    setPolling(true);
    const baseline = await fetchTxCount();
    baselineRef.current = baseline;

    pollTimerRef.current = setInterval(async () => {
      const count = await fetchTxCount();
      if (baselineRef.current !== null && count > baselineRef.current) {
        stopPolling();
        setDetected(true);
        fireConfetti();
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  useEffect(() => {
    if (step === 3 && open && !detected) {
      void startPolling();
    }
    return () => stopPolling();
  }, [step, open, detected, startPolling, stopPolling]);

  function handleComplete() {
    stopPolling();
    fireConfetti();
    dismiss();
  }

  // ── Snippets ──────────────────────────────────────────────────────────────
  const installCommands: Record<string, string> = {
    npm: "npm install @stellar/stellar-sdk",
    yarn: "yarn add @stellar/stellar-sdk",
    pnpm: "pnpm add @stellar/stellar-sdk",
  };

  const codeSnippet = `const response = await fetch("https://your-paymaster-server/fee-bump", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": "${apiKey}",
  },
  body: JSON.stringify({
    xdr: "<your-signed-inner-transaction-xdr>",
    submit: true,
  }),
});

const result = await response.json();
console.log("Fee-bump hash:", result.hash);`;

  // ── Render guard ──────────────────────────────────────────────────────────
  if (!mounted || done) return null;

  return (
    <>
      {/* Resume banner — shown when wizard was closed mid-way */}
      {!open && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800"
        >
          <span className="font-medium">
            <Sparkles className="mr-1.5 inline h-4 w-4 text-sky-500" />
            Resume your quickstart guide
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-sky-700"
          >
            Resume
          </button>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) setOpen(false);
        }}
      >
        <DialogContent
          className="max-w-xl"
          aria-label="Quickstart wizard"
          data-testid="quickstart-wizard"
        >
          <DialogHeader>
            <StepIndicator current={step} total={TOTAL_STEPS} />
            <DialogTitle className="mt-3 text-xl">
              {step === 1 && "Copy your API key"}
              {step === 2 && "Install the Stellar SDK"}
              {step === 3 && "Send your first fee-bump"}
            </DialogTitle>
            <DialogDescription>
              {step === 1 &&
                "Keep this key safe — you'll pass it in every request."}
              {step === 2 && "Add the Stellar SDK to your project."}
              {step === 3 &&
                "Run the snippet below and we'll detect your first successful fee-bump automatically."}
            </DialogDescription>
          </DialogHeader>

          {/* ── Step 1: Copy API key ── */}
          {step === 1 && (
            <div className="space-y-3">
              <div
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm"
                data-testid="api-key-display"
              >
                <span className="flex-1 truncate text-slate-700">{apiKey}</span>
                <button
                  type="button"
                  onClick={handleCopyKey}
                  data-testid="copy-api-key"
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition",
                    copied
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-sky-100 text-sky-700 hover:bg-sky-200",
                  )}
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Store this in an environment variable — never commit API keys to
                source control.
              </p>
            </div>
          )}

          {/* ── Step 2: Install SDK ── */}
          {step === 2 && (
            <Tabs defaultValue="npm">
              <TabsList>
                <TabsTrigger value="npm">npm</TabsTrigger>
                <TabsTrigger value="yarn">yarn</TabsTrigger>
                <TabsTrigger value="pnpm">pnpm</TabsTrigger>
              </TabsList>
              {Object.entries(installCommands).map(([pkg, cmd]) => (
                <TabsContent key={pkg} value={pkg}>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-700">
                    <span className="flex-1 select-all">{cmd}</span>
                    <InlineCopyButton value={cmd} />
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}

          {/* ── Step 3: First fee-bump ── */}
          {step === 3 && (
            <div className="space-y-4">
              {detected ? (
                <div
                  className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 py-8 text-center"
                  data-testid="bump-detected"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check className="h-6 w-6" />
                  </div>
                  <p className="font-semibold text-emerald-800">
                    First fee-bump detected!
                  </p>
                  <p className="text-sm text-emerald-700">
                    Your Paymaster integration is working.
                  </p>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-4 text-xs text-slate-300">
                      <code>{codeSnippet}</code>
                    </pre>
                    <div className="absolute right-3 top-3">
                      <InlineCopyButton value={codeSnippet} light />
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    data-testid="poll-status"
                  >
                    {polling ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Listening for your first fee-bump…
                      </>
                    ) : (
                      "Run the snippet, then come back here."
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Footer ── */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-muted-foreground transition hover:text-foreground"
              data-testid="skip-wizard"
            >
              {step === TOTAL_STEPS && detected ? "" : "Skip for now"}
            </button>
            <div className="flex gap-2">
              {step > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep((s) => s - 1)}
                  data-testid="wizard-back"
                >
                  Back
                </Button>
              )}
              {step < TOTAL_STEPS ? (
                <Button
                  size="sm"
                  onClick={() => setStep((s) => s + 1)}
                  data-testid="wizard-next"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleComplete}
                  disabled={!detected}
                  className={
                    detected ? "bg-emerald-600 hover:bg-emerald-700" : ""
                  }
                  data-testid="wizard-finish"
                >
                  {detected ? "Finish 🎉" : "Waiting…"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
