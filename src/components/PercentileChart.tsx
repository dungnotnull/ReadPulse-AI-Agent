"use client";
import { ReferenceArea, ReferenceLine, ResponsiveContainer, ScatterChart, XAxis, YAxis } from "recharts";

// National percentile bands per Hasbrouck & Tindal (2017) tiers:
// <10th at risk, 10th-25th below benchmark, >25th on track.
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export default function PercentileChart({ estimated, tier }: { estimated: number | "<10" | ">90"; tier: string }) {
  const x = typeof estimated === "number" ? estimated : estimated === "<10" ? 5 : 95;
  const label =
    typeof estimated === "number"
      ? `~${ordinal(estimated)} percentile`
      : estimated === "<10"
        ? "below 10th percentile"
        : "above 90th percentile";
  return (
    <div
      className="h-28 w-full"
      role="img"
      aria-label={`${label}, tier: ${tier}`}
      data-testid="percentile-chart"
      data-tier={tier}
    >
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 18, right: 24, bottom: 0, left: 24 }}>
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, 100]}
            ticks={[10, 25, 50, 75, 90]}
            tickFormatter={(v: number) => `${v}th`}
          />
          <YAxis dataKey="y" type="number" domain={[0, 1]} hide />
          <ReferenceArea x1={0} x2={10} y1={0} y2={1} fill="#dc2626" fillOpacity={0.12} />
          <ReferenceArea x1={10} x2={25} y1={0} y2={1} fill="#f59e0b" fillOpacity={0.12} />
          <ReferenceArea x1={25} x2={100} y1={0} y2={1} fill="#16a34a" fillOpacity={0.12} />
          <ReferenceLine
            x={x}
            stroke="#111827"
            strokeWidth={2}
            label={{ value: label, position: "top", fontSize: 12 }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
