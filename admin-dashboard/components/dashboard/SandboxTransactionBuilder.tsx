"use client";

import { useState } from "react";
import { Send, AlertCircle, CheckCircle2, Copy, Check } from "lucide-react";
import {
  validateTransactionFields,
  buildTransactionXdr,
  DEFAULT_FIELDS,
  type SandboxTransactionFields,
  type OperationType,
} from "@/lib/sandbox-transaction-builder";
import { cn } from "@/lib/utils";

const OPERATION_TYPES: { value: OperationType; label: string }[] = [
  { value: "payment", label: "Payment" },
  { value: "create_account", label: "Create Account" },
  { value: "manage_data", label: "Manage Data" },
];

export function SandboxTransactionBuilder() {
  const [fields, setFields] = useState<SandboxTransactionFields>(DEFAULT_FIELDS);
  const [touched, setTouched] = useState<Partial<Record<keyof SandboxTransactionFields, boolean>>>({});
  const [result, setResult] = useState<{ xdr: string; summary: string } | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const validation = validateTransactionFields(fields);

  function set<K extends keyof SandboxTransactionFields>(key: K, value: SandboxTransactionFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => ({ ...prev, [key]: true }));
    setResult(null);
    setBuildError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Mark all fields touched so errors show
    const allTouched = Object.fromEntries(
      Object.keys(fields).map((k) => [k, true])
    ) as typeof touched;
    setTouched(allTouched);

    if (!validation.valid) return;

    try {
      const built = buildTransactionXdr(fields);
      setResult(built);
      setBuildError(null);
    } catch (err: any) {
      setBuildError(err.message ?? "Build failed");
      setResult(null);
    }
  }

  async function copyXdr() {
    if (!result) return;
    await navigator.clipboard.writeText(result.xdr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function fieldError(key: keyof SandboxTransactionFields) {
    return touched[key] ? validation.errors[key] : undefined;
  }

  const showDestination = fields.operationType !== "manage_data";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-900">Transaction Builder</h2>
        <p className="mt-1 text-sm text-slate-500">
          Manually construct and test a Stellar transaction envelope in the sandbox.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 p-6">
        {/* Operation type */}
        <Field label="Operation Type">
          <div className="flex flex-wrap gap-2">
            {OPERATION_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => set("operationType", value)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition",
                  fields.operationType === value
                    ? "border-sky-400 bg-sky-50 text-sky-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        {/* Source account */}
        <Field label="Source Account" error={fieldError("sourceAccount")}>
          <TextInput
            value={fields.sourceAccount}
            onChange={(v) => set("sourceAccount", v)}
            placeholder="G…"
            mono
          />
        </Field>

        {/* Destination account */}
        {showDestination && (
          <Field label="Destination Account" error={fieldError("destinationAccount")}>
            <TextInput
              value={fields.destinationAccount}
              onChange={(v) => set("destinationAccount", v)}
              placeholder="G…"
              mono
            />
          </Field>
        )}

        {/* Amount + Asset */}
        {showDestination && (
          <div className="flex gap-3">
            <Field label="Amount" error={fieldError("amount")} className="flex-1">
              <TextInput
                value={fields.amount}
                onChange={(v) => set("amount", v)}
                placeholder="10"
                type="number"
              />
            </Field>
            <Field label="Asset" className="w-32">
              <TextInput
                value={fields.asset}
                onChange={(v) => set("asset", v)}
                placeholder="XLM"
              />
            </Field>
          </div>
        )}

        {/* Fee */}
        <Field label="Fee (stroops)" error={fieldError("fee")}>
          <TextInput
            value={fields.fee}
            onChange={(v) => set("fee", v)}
            placeholder="100"
            type="number"
          />
        </Field>

        {/* Memo */}
        <Field label="Memo (optional)">
          <TextInput
            value={fields.memo}
            onChange={(v) => set("memo", v)}
            placeholder="Optional memo text"
          />
        </Field>

        {/* Network passphrase */}
        <Field label="Network Passphrase" error={fieldError("networkPassphrase")}>
          <TextInput
            value={fields.networkPassphrase}
            onChange={(v) => set("networkPassphrase", v)}
            placeholder="Test SDF Network ; September 2015"
            mono
          />
        </Field>

        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          <Send className="h-4 w-4" aria-hidden />
          Build Transaction
        </button>
      </form>

      {/* Result */}
      {buildError && (
        <div className="mx-6 mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
          <p className="text-sm text-rose-700">{buildError}</p>
        </div>
      )}

      {result && (
        <div className="mx-6 mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
            <p className="text-sm font-semibold text-emerald-800">{result.summary}</p>
          </div>
          <div className="mt-3 flex items-start gap-2">
            <code className="flex-1 break-all rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-800">
              {result.xdr}
            </code>
            <button
              type="button"
              onClick={copyXdr}
              aria-label="Copy XDR"
              className="shrink-0 rounded-lg border border-emerald-200 bg-white p-2 text-emerald-700 transition hover:bg-emerald-50"
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-emerald-700">
            Copy this XDR and submit it via the fee-bump endpoint or Stellar Laboratory.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 placeholder-slate-400",
        "focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400",
        mono && "font-mono"
      )}
    />
  );
}
