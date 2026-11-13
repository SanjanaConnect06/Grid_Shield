"use client";

import { Activity, Gauge, Plug } from "lucide-react";
import { VoltageProfile } from "@/components/charts";
import { GridTopology, TopologyLegend } from "@/components/grid/GridTopology";
import { Badge, Card, CardBody, CardHeader, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { useBusDetail, useFrame, useTopology } from "@/hooks/useGrid";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/utils/cn";
import { fmt } from "@/utils/format";

function BusInspector({ busId }: { busId: number }) {
  const { data, isLoading, error } = useBusDetail(busId);
  if (error) return <ErrorState message={error.message} />;
  if (isLoading || !data) return <Skeleton className="h-96" />;
  const { bus, meters, lines } = data;
  const tone = bus.status === "suspicious" ? "critical" : "success";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Voltage", `${fmt(bus.vm, 4)} pu`],
          ["Angle", `${fmt(bus.vaDeg, 2)}°`],
          ["Net P injection", `${fmt(bus.pMw, 1)} MW`],
          ["Net Q injection", `${fmt(bus.qMvar, 1)} MVAr`],
          ["Load (now)", `${fmt(bus.loadMw, 1)} MW`],
          ["Bus type", bus.type.toUpperCase()],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md bg-subtle p-3">
            <div className="text-xs text-muted">{k}</div>
            <div className="mt-0.5 text-base font-semibold text-fg">{v}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone={tone}>{bus.status === "suspicious" ? "Suspicious (AI)" : "Telemetry consistent"}</Badge>
        <Badge tone="neutral">{bus.zone}</Badge>
        {bus.tampered && <Badge tone="purple">Simulated tampering on this bus</Badge>}
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-fg">Meters installed at bus {bus.id}</h4>
        <div className="max-h-64 overflow-auto rounded-md border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-subtle text-muted">
              <tr><th className="px-3 py-2">Meter</th><th className="px-3 py-2 text-right">Original</th><th className="px-3 py-2 text-right">Observed</th><th className="px-3 py-2 text-right">r<sub>N</sub></th></tr>
            </thead>
            <tbody>
              {meters.map((m) => (
                <tr key={m.id} className={cn("border-t border-line", m.tampered && "bg-purple/10")} title={m.label}>
                  <td className="px-3 py-1.5 font-mono text-fg">{m.id}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-muted">{fmt(m.original, m.kind === "V" ? 4 : 2)} {m.unit}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-fg">{fmt(m.observed, m.kind === "V" ? 4 : 2)}</td>
                  <td className={cn("px-3 py-1.5 text-right font-mono", Math.abs(m.rN) > 3 ? "font-semibold text-critical" : "text-muted")}>{fmt(m.rN, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-fg">Connected lines</h4>
        <ul className="space-y-1.5 text-xs">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
              <span className="font-medium text-fg">{l.from} → {l.to}{l.transformer ? " (xfmr)" : ""}</span>
              <span className="font-mono text-muted">{fmt(l.pFromMw, 1)} MW · {fmt(l.qFromMvar, 1)} MVAr · I={fmt(l.currentPu, 3)} pu</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  const { data: frame, error, refetch } = useFrame();
  const topo = useTopology();
  const { selectedBus, selectBus } = useAppStore();
  const sel = selectedBus ?? 1;
  const suspicious = frame?.analysis?.localization?.predictedBuses ?? [];

  return (
    <div>
      <PageHeader title="Live Grid Monitoring" subtitle="Click a bus to see its readings. Buses the localizer suspects are outlined in red." />
      {error && <div className="mb-4"><ErrorState message={error.message} onRetry={() => refetch()} /></div>}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          <Card>
            <CardHeader
              title="Network topology"
              subtitle={`${frame?.buses.length ?? 14} buses · ${frame?.branches.length ?? 20} branches · tick ${frame?.tick ?? "—"}`}
              action={frame ? <Badge tone={frame.analysis?.hybrid.flag ? "critical" : "success"}>{frame.analysis?.hybrid.flag ? "ALERT" : "NORMAL"}</Badge> : undefined}
            />
            <CardBody className="space-y-3">
              {topo.data ? <GridTopology topology={topo.data} frame={frame} selectedBus={sel} onSelect={selectBus} height={520} /> : <Skeleton className="h-[520px]" />}
              <TopologyLegend />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Voltage profile" subtitle="Estimated |V| per bus – amber lines show ±5% band" />
            <CardBody>{frame ? <VoltageProfile buses={frame.buses} suspicious={suspicious} /> : <Skeleton className="h-52" />}</CardBody>
          </Card>
        </div>
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title={`Bus ${sel} inspector`} subtitle="Original vs observed (operator) measurements" />
            <CardBody>
              <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Select bus">
                {Array.from({ length: 14 }, (_, i) => i + 1).map((b) => (
                  <button key={b} role="tab" aria-selected={b === sel} onClick={() => selectBus(b)} className={cn("h-8 min-w-8 rounded-lg border px-2 text-xs font-semibold transition", b === sel ? "border-primary bg-primary text-white" : suspicious.includes(b) ? "border-critical text-critical" : "border-line text-muted hover:text-fg")}>
                    {b}
                  </button>
                ))}
              </div>
              <BusInspector busId={sel} />
            </CardBody>
          </Card>
        </div>
      </div>
      <Card className="mt-4">
        <CardHeader title="All buses" subtitle="Live state-estimator output" />
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr><th className="py-2">Bus</th><th>Type</th><th className="text-right">|V| pu</th><th className="text-right">θ °</th><th className="text-right">P MW</th><th className="text-right">Q MVAr</th><th className="text-right">Status</th></tr>
            </thead>
            <tbody>
              {(frame?.buses ?? []).map((b) => (
                <tr key={b.id} onClick={() => selectBus(b.id)} className={cn("cursor-pointer border-t border-line hover:bg-subtle", b.id === sel && "bg-primary/10")}>
                  <td className="py-2 font-semibold text-fg">{b.id}</td>
                  <td className="text-muted">{b.type}</td>
                  <td className="text-right font-mono text-fg">{fmt(b.vm, 4)}</td>
                  <td className="text-right font-mono text-muted">{fmt(b.vaDeg, 2)}</td>
                  <td className="text-right font-mono text-muted">{fmt(b.pMw, 1)}</td>
                  <td className="text-right font-mono text-muted">{fmt(b.qMvar, 1)}</td>
                  <td className="text-right"><Badge tone={b.status === "suspicious" ? "critical" : "success"}>{b.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
