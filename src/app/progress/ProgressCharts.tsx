"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MARK = "#059669"; // validated vs dark surface
const GRID = "#2a3441";
const MUTED = "#8b97a5";

export interface WeeklyVolumePoint {
  week: string;
  volume: number;
}

export default function ProgressCharts({
  weekly,
  units,
}: {
  weekly: WeeklyVolumePoint[];
  units: string;
}) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weekly} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="0" />
          <XAxis
            dataKey="week"
            tickLine={false}
            axisLine={false}
            tick={{ fill: MUTED, fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{
              background: "#1c242f",
              border: `1px solid ${GRID}`,
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: MUTED }}
            itemStyle={{ color: "#e8edf2" }}
            formatter={(value) => [
              `${Number(value).toLocaleString()} ${units}`,
              "volume",
            ]}
          />
          <Bar
            dataKey="volume"
            fill={MARK}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
