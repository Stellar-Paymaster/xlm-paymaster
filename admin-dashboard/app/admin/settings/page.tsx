"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useEffect } from "react";

const schema = z.object({
  base_fee: z.number().min(0),
  fee_multiplier: z.number().min(1),
  low_balance_threshold: z.number().min(0),
});

export default function SettingsPage() {
const form = useForm({
  resolver: zodResolver(schema),
  defaultValues: {
    base_fee: 100,
    fee_multiplier: 2,
    low_balance_threshold: 1000,
  },
});

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

  useEffect(() => {
    fetch("/admin/settings")
      .then((res) => res.json())
      .then((data) => {
        setValue("base_fee", data.base_fee);
        setValue("fee_multiplier", data.fee_multiplier);
        setValue("low_balance_threshold", data.low_balance_threshold);
      });
  }, []);

  const onSubmit = async (data: any) => {
    const res = await fetch("/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      toast.success("Settings saved successfully");
    } else {
      toast.error("Failed to save settings");
    }
  };

return (
  <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-3xl font-bold">Settings</h1>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="rounded-xl border border-slate-800 bg-slate-900 p-6"
      >
        {/* Base Fee */}
        <div className="mb-5">
          <label className="mb-2 block text-sm text-slate-300">Base Fee</label>
          <input
            type="number"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
            {...register("base_fee", { valueAsNumber: true })}
          />
          {errors.base_fee && (
            <p className="mt-1 text-sm text-red-400">
              {errors.base_fee.message}
            </p>
          )}
        </div>

        {/* Fee Multiplier */}
        <div className="mb-5">
          <label className="mb-2 block text-sm text-slate-300">
            Fee Multiplier
          </label>
          <input
            type="number"
            step="0.1"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
            {...register("fee_multiplier", { valueAsNumber: true })}
          />
          {errors.fee_multiplier && (
            <p className="mt-1 text-sm text-red-400">
              {errors.fee_multiplier.message}
            </p>
          )}
        </div>

        {/* Threshold */}
        <div className="mb-6">
          <label className="mb-2 block text-sm text-slate-300">
            Low Balance Threshold
          </label>
          <input
            type="number"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
            {...register("low_balance_threshold", { valueAsNumber: true })}
          />
          {errors.low_balance_threshold && (
            <p className="mt-1 text-sm text-red-400">
              {errors.low_balance_threshold.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-blue-600 py-2 font-semibold hover:bg-blue-500 disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  </main>
);
}
