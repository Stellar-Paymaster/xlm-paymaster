"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  DEFAULT_SETTINGS,
  SETTINGS_FIELDS,
  type SettingsConfig,
} from "@/lib/settings-config";

const schema = z.object({
  base_fee: z.number().min(0, "Must be 0 or greater"),
  fee_multiplier: z.number().min(1, "Must be at least 1"),
  low_balance_threshold: z.number().min(0, "Must be 0 or greater"),
  rate_limit_per_minute: z.number().min(1, "Must be at least 1"),
  max_wallets_per_tenant: z.number().min(1, "Must be at least 1"),
  max_tx_per_hour: z.number().min(1, "Must be at least 1"),
});

type FormValues = z.infer<typeof schema>;

export default function SettingsPage() {
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_SETTINGS,
  });

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Partial<SettingsConfig>) => {
        reset({ ...DEFAULT_SETTINGS, ...data });
      })
      .catch(() => {
        setLoadError(
          "Could not reach the settings endpoint — showing defaults. Changes will still be persisted when you save.",
        );
      });
  }, [reset]);

  const onSubmit = async (data: FormValues) => {
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
      }

      toast.success("Settings saved and hot-reloaded.");
      reset(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings.");
    }
  };

  function handleReset() {
    reset(DEFAULT_SETTINGS);
    toast.info("Form reset to factory defaults. Save to apply.");
  }

  const sections: Array<{ heading: string; keys: Array<keyof SettingsConfig> }> = [
    { heading: "Fee Configuration", keys: ["base_fee", "fee_multiplier", "low_balance_threshold"] },
    { heading: "Rate & Quota Limits", keys: ["rate_limit_per_minute", "max_wallets_per_tenant", "max_tx_per_hour"] },
  ];

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
            Paymaster Admin
          </p>
          <h1 className="mt-2 text-3xl font-bold text-foreground">Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Hot-reload runtime variables without restarting the server. Changes take effect immediately on save.
          </p>
        </div>

        {loadError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {loadError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8" noValidate>
          {sections.map((section) => {
            const fields = SETTINGS_FIELDS.filter((f) =>
              section.keys.includes(f.key),
            );

            return (
              <div
                key={section.heading}
                className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-sm"
              >
                <div className="border-b border-border/50 px-6 py-4">
                  <h2 className="text-base font-semibold text-foreground">
                    {section.heading}
                  </h2>
                </div>
                <div className="divide-y divide-border/50">
                  {fields.map((field) => (
                    <div key={field.key} className="px-6 py-5">
                      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className="flex-1">
                          <label
                            htmlFor={field.key}
                            className="block text-sm font-semibold text-foreground"
                          >
                            {field.label}
                            {field.unit && (
                              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                {field.unit}
                              </span>
                            )}
                          </label>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {field.description}
                          </p>
                        </div>
                        <div className="w-full sm:w-36">
                          <input
                            id={field.key}
                            type="number"
                            step={field.step}
                            min={field.min}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
                            {...register(field.key, { valueAsNumber: true })}
                          />
                          {errors[field.key] && (
                            <p className="mt-1 text-xs text-rose-600">
                              {errors[field.key]?.message}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-border/50 bg-card px-5 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              Reset to defaults
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isDirty}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? "Saving…" : "Save & hot-reload"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
