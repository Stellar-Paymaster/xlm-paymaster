"use client";

import React, { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCongestionMultiplier } from "../config/region-congestion-config";
import { cn } from "@/lib/utils";

interface HourlyDataPoint {
  hour: number;
  label: string;
  baseMultiplier: number;
  multiplier: number;
  projectedFee: number;
}

const REGIONS = [
  { code: "US", name: "United States" },
  { code: "EU", name: "Europe" },
  { code: "APAC", name: "Asia-Pacific" },
  { code: "BR", name: "Brazil" },
];

// Helper to format hours to AM/PM labels
function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

// 24-hour base congestion multiplier curve (simulates peak hours)
const BASE_CONGESTION_CURVE: number[] = [
  1.0, 1.0, 1.05, 1.05, 1.1, 1.15, // Night/early morning (0-5)
  1.2, 1.35, 1.5, 1.7, 1.8, 1.75, // Morning rush & business hours (6-11)
  1.6, 1.5, 1.55, 1.7, 1.85, 1.9, // Lunch & afternoon/evening peak (12-17)
  1.65, 1.5, 1.35, 1.25, 1.15, 1.05 // Dinner & late night (18-23)
];

export function CongestionFeeEstimatorGraph() {
  const [region, setRegion] = useState("US");
  const [baseFee, setBaseFee] = useState(100);
  const [selectedHour, setSelectedHour] = useState<number | null>(17); // Default to 5 PM
  const [simulationOverrides, setSimulationOverrides] = useState<Record<number, number>>({});

  // Generate 24-hour chart dataset based on configurations and simulation overrides
  const chartData = useMemo<HourlyDataPoint[]>(() => {
    return Array.from({ length: 24 }, (_, hour) => {
      const baseHourMultiplier = BASE_CONGESTION_CURVE[hour];
      
      // Determine regional congestion level category based on raw base hour multiplier
      const level = baseHourMultiplier >= 1.7 ? "high" : baseHourMultiplier >= 1.3 ? "medium" : "low";
      const regionMultiplier = getCongestionMultiplier(region, level);
      
      // Final multiplier combines baseline hour trend with the regional factor
      const defaultMultiplier = baseHourMultiplier * regionMultiplier;
      
      // Check if user has overridden the multiplier for this hour in the simulator
      const finalMultiplier = simulationOverrides[hour] !== undefined 
        ? simulationOverrides[hour] 
        : defaultMultiplier;

      return {
        hour,
        label: formatHourLabel(hour),
        baseMultiplier: defaultMultiplier,
        multiplier: Number(finalMultiplier.toFixed(2)),
        projectedFee: Math.floor(baseFee * finalMultiplier),
      };
    });
  }, [region, baseFee, simulationOverrides]);

  const selectedData = useMemo(() => {
    if (selectedHour === null) return null;
    return chartData.find((d) => d.hour === selectedHour) ?? null;
  }, [chartData, selectedHour]);

  // Adjust simulation override for the selected hour
  function handleSimulationChange(value: number) {
    if (selectedHour === null) return;
    setSimulationOverrides((prev) => ({
      ...prev,
      [selectedHour]: value,
    }));
  }

  // Reset all simulation overrides back to defaults
  function handleResetSimulation() {
    setSimulationOverrides({});
  }

  // Quick preset buttons for base fee
  const baseFeePresets = [100, 500, 1000, 5000];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col gap-6" data-testid="congestion-fee-graph-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-100 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-violet-600">Dynamic Pricing</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">Congestion Fee Estimator Graph</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Interactive 24-hour simulation of regional transaction fee spikes and network load.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="region-select" className="text-xs font-bold text-slate-500 uppercase">Region</label>
            <select
              id="region-select"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-800 outline-none transition focus:border-violet-400 bg-slate-50 font-medium"
            >
              {REGIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Controls Column */}
        <div className="flex flex-col gap-5 border-r border-slate-100 pr-0 lg:pr-6">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-800">1. Set Base Fee (Stroops)</span>
            <div className="flex items-center gap-3">
              <input
                id="base-fee-range"
                type="range"
                min="100"
                max="5000"
                step="100"
                value={baseFee}
                onChange={(e) => setBaseFee(Number(e.target.value))}
                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-violet-600"
              />
              <span className="min-w-16 font-mono text-sm font-bold text-slate-900 text-right">
                {baseFee}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              {baseFeePresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setBaseFee(preset)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-semibold transition border",
                    baseFee === preset
                      ? "bg-violet-50 border-violet-200 text-violet-700"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Surge Simulator Widget */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Surge Simulator</span>
              {Object.keys(simulationOverrides).length > 0 && (
                <button
                  type="button"
                  onClick={handleResetSimulation}
                  className="text-xs font-medium text-violet-600 hover:underline"
                >
                  Reset Defaults
                </button>
              )}
            </div>

            {selectedData ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Selected Time</span>
                  <span className="text-sm font-bold text-slate-900">{selectedData.label}</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="surge-range" className="text-xs font-semibold text-slate-600">
                    Simulate Congestion Multiplier ({selectedData.multiplier.toFixed(2)}x)
                  </label>
                  <input
                    id="surge-range"
                    type="range"
                    min="1.0"
                    max="4.0"
                    step="0.05"
                    value={selectedData.multiplier}
                    onChange={(e) => handleSimulationChange(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-semibold uppercase">
                    <span>1.0x (Low)</span>
                    <span>2.5x (Medium)</span>
                    <span>4.0x (High)</span>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3 flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Baseline Multiplier</span>
                    <span className="font-mono text-slate-700">{selectedData.baseMultiplier.toFixed(2)}x</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-semibold border-t border-dashed border-slate-200 pt-2">
                    <span className="text-slate-800">Projected Cost</span>
                    <span className="font-mono text-violet-700 font-bold">{selectedData.projectedFee} stroops</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-4">
                Click any point on the chart to simulate real-time traffic surges for that hour.
              </p>
            )}
          </div>
        </div>

        {/* Chart Column */}
        <div className="lg:col-span-2 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hourly Traffic Curve</span>
            <div className="flex gap-4 text-xs font-medium text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-violet-600 opacity-60"></span>
                <span>Projected Fee (Stroops)</span>
              </div>
            </div>
          </div>

          <div className="h-64 w-full" data-testid="congestion-recharts-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                onClick={(state) => {
                  if (state && state.activeTooltipIndex !== undefined) {
                    setSelectedHour(state.activeTooltipIndex);
                  }
                }}
              >
                <defs>
                  <linearGradient id="violetGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#64748b", fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                  interval={3}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b", fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: any) => [`${value} stroops`, "Projected Fee"]}
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="projectedFee"
                  stroke="#7c3aed"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#violetGradient)"
                  activeDot={{
                    r: 6,
                    fill: "#7c3aed",
                    strokeWidth: 2,
                    stroke: "#ffffff",
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
