"use client";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dateLabel, pace } from "@/lib/dates";
import type { weeklySeries } from "@/lib/calculations";
import { formatNumber } from "@/lib/format";
export function TrainingChart({
  series,
  metric = "distance",
}: {
  series: ReturnType<typeof weeklySeries>;
  metric?: "distance" | "pace" | "heart" | "volume" | "consistency";
}) {
  const keys =
    metric === "distance"
      ? [
          { key: "runningKm", name: "Running", color: "var(--running)" },
          { key: "cyclingKm", name: "Cycling", color: "var(--purple)" },
          {
            key: "plannedKm",
            name: "Planned total",
            color: "var(--chart-planned)",
          },
        ]
      : metric === "pace"
        ? [{ key: "pace", name: "Running pace", color: "var(--running)" }]
        : metric === "heart"
          ? [{ key: "avgHr", name: "Average HR", color: "var(--peach)" }]
          : metric === "volume"
            ? [
                {
                  key: "totalMin",
                  name: "Training minutes",
                  color: "var(--purple)",
                },
              ]
            : [
                {
                  key: "consistency",
                  name: "Consistency",
                  color: "var(--running)",
                },
              ];
  return (
    <div
      className="training-chart"
      role="img"
      aria-label={`Weekly ${metric} chart`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart
          data={series}
          margin={{ top: 15, right: 4, left: -28, bottom: 0 }}
        >
          <defs>
            <linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={keys[0].color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={keys[0].color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--line)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(d) =>
              dateLabel(String(d), { day: "numeric", month: "short" })
            }
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            dy={10}
            minTickGap={22}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickFormatter={(v) =>
              metric === "pace"
                ? pace(Number(v))
                : formatNumber(
                    Number(v),
                    metric === "heart" || metric === "consistency" ? 0 : 1,
                  )
            }
            domain={metric === "consistency" ? [0, 100] : undefined}
          />
          <Tooltip
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              fontSize: 14,
              color: "var(--text)",
            }}
            labelFormatter={(d) => `Week of ${dateLabel(String(d))}`}
            formatter={(v, name) => [
              metric === "pace"
                ? `${pace(Number(v))} /km`
                : `${formatNumber(v == null ? null : Number(v), metric === "heart" || metric === "consistency" ? 0 : 1)}${metric === "distance" ? " km" : metric === "heart" ? " bpm" : metric === "volume" ? " min" : "%"}`,
              name,
            ]}
          />
          {metric === "distance" ? (
            <>
              <Bar
                dataKey="cyclingKm"
                name="Cycling"
                fill="var(--purple)"
                fillOpacity={0.85}
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
              />
              <Area
                type="monotone"
                dataKey="runningKm"
                name="Running"
                stroke="var(--running)"
                strokeWidth={2.5}
                fill={`url(#fill-${metric})`}
                activeDot={{ r: 5, stroke: "var(--panel)", strokeWidth: 3 }}
              />
              <Line
                type="monotone"
                dataKey="plannedKm"
                name="Planned total"
                stroke="var(--chart-planned)"
                strokeDasharray="4 5"
                dot={false}
                strokeWidth={1.5}
              />
            </>
          ) : (
            <Area
              type="monotone"
              dataKey={keys[0].key}
              name={keys[0].name}
              stroke={keys[0].color}
              strokeWidth={2.5}
              fill={`url(#fill-${metric})`}
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
