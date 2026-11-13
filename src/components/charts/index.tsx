"use client";

import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartColors as C } from "@/themes/tokens";
import type { HistoryPoint } from "@/stores/app-store";

/** Theme-aware tooltip + axis defaults – everything references CSS variables so charts follow the active theme. */
export const tooltipProps = {
  contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--fg)", fontSize: 12, boxShadow: "var(--shadow)" },
  labelStyle: { color: "var(--muted)" },
  itemStyle: { color: "var(--fg)" },
  cursor: { stroke: "var(--border)" },
};
const axis = { stroke: C.axis, tick: { fill: C.axis, fontSize: 11 }, tickLine: false, axisLine: { stroke: C.grid } } as const;

export function ChartBox({ height = 220, children, empty }: { height?: number; children: ReactNode; empty?: boolean }) {
  if (empty) return <div className="grid place-items-center text-sm text-muted" style={{ height }}>Collecting live data…</div>;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export function SeriesChart({ data, lines, height = 220, domain, yFormatter, area }: { data: HistoryPoint[]; lines: { key: keyof HistoryPoint; name: string; color: string; dashed?: boolean }[]; height?: number; domain?: [number | "auto", number | "auto"]; yFormatter?: (v: number) => string; area?: boolean }) {
  const Chart = area ? AreaChart : LineChart;
  return (
    <ChartBox height={height} empty={data.length < 2}>
      <Chart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="tick" {...axis} minTickGap={32} />
        <YAxis {...axis} domain={domain ?? ["auto", "auto"]} width={52} tickFormatter={yFormatter} />
        <Tooltip {...tooltipProps} formatter={(v) => (typeof v === "number" ? v.toFixed(3) : String(v))} labelFormatter={(l) => `tick ${l}`} />
        {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />}
        {lines.map((l) =>
          area ? (
            <Area key={String(l.key)} type="monotone" dataKey={l.key as string} name={l.name} stroke={l.color} fill={l.color} fillOpacity={0.15} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          ) : (
            <Line key={String(l.key)} type="monotone" dataKey={l.key as string} name={l.name} stroke={l.color} strokeWidth={2} strokeDasharray={l.dashed ? "5 4" : undefined} dot={false} isAnimationActive={false} connectNulls />
          ),
        )}
      </Chart>
    </ChartBox>
  );
}

export function VoltageProfile({ buses, height = 220, suspicious = [] }: { buses: { id: number; vm: number }[]; height?: number; suspicious?: number[] }) {
  const data = buses.map((b) => ({ bus: `B${b.id}`, id: b.id, vm: Number(b.vm.toFixed(4)) }));
  return (
    <ChartBox height={height} empty={!data.length}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="bus" {...axis} />
        <YAxis {...axis} domain={[0.94, 1.12]} width={46} />
        <Tooltip {...tooltipProps} cursor={{ fill: "var(--subtle)" }} formatter={(v) => `${Number(v).toFixed(4)} pu`} />
        <ReferenceLine y={1.05} stroke={C.warning} strokeDasharray="4 4" />
        <ReferenceLine y={0.95} stroke={C.warning} strokeDasharray="4 4" />
        <Bar dataKey="vm" name="|V|" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.id} fill={suspicious.includes(d.id) ? C.critical : C.primary} />
          ))}
        </Bar>
      </BarChart>
    </ChartBox>
  );
}

export function SimpleBars({ data, height = 220, color = C.primary, format }: { data: { name: string; value: number }[]; height?: number; color?: string; format?: (v: number) => string }) {
  return (
    <ChartBox height={height} empty={!data.length}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...axis} tickFormatter={format} />
        <YAxis type="category" dataKey="name" {...axis} width={110} />
        <Tooltip {...tooltipProps} cursor={{ fill: "var(--subtle)" }} formatter={(v) => (format ? format(Number(v)) : Number(v).toFixed(3))} />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartBox>
  );
}
