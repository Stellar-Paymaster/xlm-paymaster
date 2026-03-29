"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner"; // Or react-hot-toast

// 1. Validation Schema (Requirement: Multiplier >= 1)
const settingsSchema = z.object({
  baseFee: z.coerce.number().min(0, "Base fee cannot be negative"),
  feeMultiplier: z.coerce.number().min(1, "Multiplier must be at least 1"),
  lowBalanceThreshold: z.coerce.number().min(0, "Threshold cannot be negative"),
});

type SettingsValues = z.infer<typeof settingsSchema>;

export default function SettingsPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      baseFee: 10,
      feeMultiplier: 1,
      lowBalanceThreshold: 50,
    },
  });

  const onSubmit = async (data: SettingsValues) => {
    try {
      // This will connect to your API route later
      console.log("Saving to DB:", data);
      
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      toast.success("Settings updated successfully!"); 
      // ^ This is the toast you need to screenshot for the PR!
    } catch (error) {
      toast.error("Failed to update settings.");
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Server Configuration</h1>
      
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Group 1: Financials */}
        <section className="p-4 border rounded-lg space-y-4">
          <h2 className="text-lg font-semibold text-gray-700">Financial Settings</h2>
          
          <div>
            <label className="block text-sm font-medium">Base Fee</label>
            <input 
              {...register("baseFee")}
              type="number"
              className="w-full p-2 border rounded mt-1"
            />
            {errors.baseFee && <p className="text-red-500 text-xs">{errors.baseFee.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium">Fee Multiplier</label>
            <input 
              {...register("feeMultiplier")}
              type="number"
              step="0.1"
              className="w-full p-2 border rounded mt-1"
            />
            {errors.feeMultiplier && <p className="text-red-500 text-xs">{errors.feeMultiplier.message}</p>}
          </div>
        </section>

        {/* Group 2: Thresholds */}
        <section className="p-4 border rounded-lg space-y-4">
          <h2 className="text-lg font-semibold text-gray-700">System Thresholds</h2>
          <div>
            <label className="block text-sm font-medium">Low Balance Threshold</label>
            <input 
              {...register("lowBalanceThreshold")}
              type="number"
              className="w-full p-2 border rounded mt-1"
            />
            {errors.lowBalanceThreshold && <p className="text-red-500 text-xs">{errors.lowBalanceThreshold.message}</p>}
          </div>
        </section>

        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-blue-300"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}