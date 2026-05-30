import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export interface UsageDataPoint {
  date: string;
  spend: number;
}

export interface UsageForecastingGraphProps {
  currentBalance: number;
  historicalData: UsageDataPoint[];
  tenantName: string;
}

interface ChartDataPoint {
  date: string;
  actualBalance?: number;
  forecastedBalance?: number;
}

export const UsageForecastingGraph: React.FC<UsageForecastingGraphProps> = ({
  currentBalance,
  historicalData,
  tenantName,
}) => {
  const chartData = useMemo(() => {
    if (!historicalData || historicalData.length === 0) return [];

    // Calculate average daily spend
    const totalSpend = historicalData.reduce((acc, curr) => acc + curr.spend, 0);
    const avgDailySpend = totalSpend / historicalData.length;

    if (avgDailySpend <= 0) return [];

    let rollingBalance = currentBalance;
    const historicalChartData: ChartDataPoint[] = [];

    // Go backwards to calculate historical balances
    for (let i = historicalData.length - 1; i >= 0; i--) {
      historicalChartData.unshift({
        date: historicalData[i].date,
        actualBalance: rollingBalance,
      });
      rollingBalance += historicalData[i].spend;
    }

    // Forecast future points until balance is 0 or less
    const forecastedChartData: ChartDataPoint[] = [];
    let projectedBalance = currentBalance;
    const lastDate = new Date(historicalData[historicalData.length - 1].date);

    // Keep adding points until balance hits 0, max 30 days
    let daysForecasted = 0;
    while (projectedBalance > 0 && daysForecasted < 30) {
      daysForecasted++;
      lastDate.setDate(lastDate.getDate() + 1);
      projectedBalance -= avgDailySpend;

      forecastedChartData.push({
        date: lastDate.toISOString().split("T")[0],
        forecastedBalance: Math.max(0, projectedBalance),
      });
    }

    // The point of transition
    const transitionPoint: ChartDataPoint = {
      date: historicalChartData[historicalChartData.length - 1].date,
      actualBalance: currentBalance,
      forecastedBalance: currentBalance,
    };

    historicalChartData[historicalChartData.length - 1] = transitionPoint;

    return [...historicalChartData, ...forecastedChartData];
  }, [currentBalance, historicalData]);

  if (!historicalData || historicalData.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        Not enough data to forecast usage for {tenantName}.
      </div>
    );
  }

  const daysUntilDepletion =
    chartData.filter((d) => d.forecastedBalance !== undefined && d.forecastedBalance <= 0).length > 0
      ? chartData.length - historicalData.length
      : "> 30";

  return (
    <div className="flex flex-col gap-4 p-6 bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{tenantName} - Usage Forecast</h3>
          <p className="text-sm text-gray-500">
            Based on current spend velocity, funds will run out in{" "}
            <span className="font-semibold text-red-600">{daysUntilDepletion} days</span>.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Current Balance</p>
          <p className="text-xl font-bold text-gray-900">
            ${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="h-72 w-full mt-4" data-testid="forecasting-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 12 }} tickMargin={10} minTickGap={30} />
            <YAxis tick={{ fill: "#888", fontSize: 12 }} tickFormatter={(value) => `$${value}`} width={80} />
            <Tooltip
              formatter={(value: number) => [`$${value.toFixed(2)}`, "Balance"]}
              labelStyle={{ color: "#333", fontWeight: "bold" }}
            />
            <Legend />
            <ReferenceLine y={0} stroke="red" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="actualBalance"
              name="Actual Balance"
              stroke="#0ea5e9"
              strokeWidth={3}
              dot={{ r: 4, fill: "#0ea5e9", strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="forecastedBalance"
              name="Forecasted Balance"
              stroke="#cbd5e1"
              strokeWidth={3}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 6, fill: "#94a3b8" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};