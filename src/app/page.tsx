"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { SeriesChart, VoltageProfile } from "@/components/charts";
import { GridTopology, TopologyLegend } from "@/components/grid/GridTopology";
import { Badge, Button, Card, CardBody, CardHeader, Empty, ErrorState, PageHeader, Skeleton, Stat, StatStrip, severityTone } from "@/components/ui";
import { useFrame, useStatus, useTopology } from "@/hooks/useGrid";
import { api } from "@/services/api";
import { useAppStore } from "@/stores/app-store";
import type { DemoResult } from "@/types/api";
import { DemoEvidence } from "@/components/demo/DemoEvidence";
import { cn } from "@/utils/cn";
import { fmt, label, timeAgo } from "@/utils/format";


function useDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<DemoResult>("/api/demo/run"),
    onSuccess: (d) => {
      toast.success(`${d.incident.code} filed`, { description: `Localizer picked bus ${d.predictedBuses.join(", ") || "none"}` });
      qc.invalidateQueries();
    },
    onError: (e) => toast.error("Demo didn't finish", { description: e.message }),
  });
}

const dot = { critical: "bg-critical", warning: "bg-warning", info: "bg-primary" } as const;

export default function CommandCentre() {
  const frameQ = useFrame();
  const statusQ = useStatus();
  const topoQ = useTopology();
  const history = useAppStore((s) => s.history);
  const demo = useDemo();
  const f = frameQ.data;
  const s = statusQ.data;
  const loading = !f || !s;
  const alert = s?.gridStatus === "ALERT";


  return (
    <div>
      <PageHeader
        title="Command Centre"
        subtitle={f ? `IEEE 14-bus · tick ${f.tick} · ${s?.simulation.active ? `simulated ${s.simulation.name} on bus ${s.simulation.targetBus}` : "no attack running"}` : "Connecting…"}
        actions={
          <Button onClick={() => demo.mutate()} disabled={demo.isPending}>
            <Play size={14} /> {demo.isPending ? "Running…" : "Run demo scenario"}
          </Button>
        }
      />

      <p className="mb-4 text-xs text-muted">The guided demo resets the simulation, compares normal readings with a false-data attack on bus 9, and saves an incident. It uses fixed readings so you can repeat the explanation.</p>
      {demo.isPending && <p role="status" className="mb-4 text-sm text-primary">Preparing models, comparing readings and saving evidence… First use can take a minute.</p>}
      {demo.isError && <div className="mb-4"><ErrorState message={demo.error.message} onRetry={() => demo.mutate()} /></div>}
      {demo.data && !demo.isPending && <DemoEvidence result={demo.data} />}

      {(frameQ.isError || statusQ.isError) && (
        <div className="mb-4">
          <ErrorState message={(frameQ.error ?? statusQ.error)?.message ?? "Backend unavailable"} onRetry={() => { frameQ.refetch(); statusQ.refetch(); }} />
        </div>
      )}

      <StatStrip className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Grid status"
          loading={loading}
          value={s?.gridStatus === "INITIALISING" ? <span className="text-warning">Training</span> : alert ? <span className="text-critical">Alert</span> : <span className="text-success">Normal</span>}
          hint={s?.gridStatus === "INITIALISING" ? "AI models warming up" : s?.simulation.active ? "Simulated attack running" : "All detectors quiet"}
        />
        <Stat label="Monitored buses" loading={loading} value={s?.busesMonitored} hint={`${s?.branchesMonitored ?? 20} branches, 122 meters`} />
        <Stat label="Active alerts" loading={loading} value={s?.activeAlerts} hint={`${s?.anomalyStats.openIncidents ?? 0} open incidents`} />
        <Stat label="Suspect buses" loading={loading} value={s?.suspiciousBuses.length ? s.suspiciousBuses.join(", ") : "None"} hint="From live localization" />
        <Stat label="Frequency" loading={loading} value={`${fmt(s?.frequency, 3)} Hz`} hint="Synthetic droop model" />
        <Stat label="Avg voltage" loading={loading} value={`${fmt(s?.avgVoltage, 4)} pu`} hint={f ? `lowest ${fmt(f.totals.minVoltage, 3)} at bus ${f.totals.minVoltageBus}` : ""} />
      </StatStrip>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title="Network" subtitle="Voltage on each bus; line labels show MW flow" action={<Link href="/monitoring" className="text-xs text-primary hover:underline">Inspect buses</Link>} />
          <CardBody className="space-y-3">
            {topoQ.data ? <GridTopology topology={topoQ.data} frame={f} compact height={400} /> : <Skeleton className="h-[400px]" />}
            <TopologyLegend />
          </CardBody>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Bus voltages" subtitle="State estimate, per unit" />
            <CardBody>{f ? <VoltageProfile buses={f.buses} height={150} suspicious={s?.suspiciousBuses} /> : <Skeleton className="h-36" />}</CardBody>
          </Card>
          <Card className="flex-1">
            <CardHeader title="Telemetry" />
            <CardBody className="space-y-1">
              <p className="text-xs text-muted">Average voltage</p>
              <SeriesChart data={history} height={84} lines={[{ key: "avgVoltage", name: "Avg V (pu)", color: "var(--primary)" }]} />
              <p className="pt-2 text-xs text-muted">Frequency</p>
              <SeriesChart data={history} height={84} lines={[{ key: "frequency", name: "Freq (Hz)", color: "var(--cyan)" }]} domain={[49.8, 50.2]} />
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Latest alerts" action={<Link href="/incidents" className="text-xs text-primary hover:underline">All incidents</Link>} />
          <CardBody className="p-0">
            {!s ? <div className="p-4"><Skeleton className="h-40" /></div> : s.recentIncidents.length === 0 ? <div className="p-4"><Empty>Nothing filed yet.</Empty></div> : (
              <ul className="divide-y divide-line">
                {s.recentIncidents.slice(0, 5).map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-fg"><span className="font-mono text-xs text-muted">{i.code}</span> {i.title}</p>
                      <p className="text-xs text-muted">{timeAgo(i.createdAt)}{i.predictedBuses.length ? ` · bus ${i.predictedBuses.join(", ")}` : ""}</p>
                    </div>
                    <Badge tone={severityTone(i.severity)}>{i.severity}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Activity" />
          <CardBody className="p-0">
            {!s ? <div className="p-4"><Skeleton className="h-40" /></div> : s.timeline.length === 0 ? <div className="p-4"><Empty>No activity yet. Launch an attack or run the demo.</Empty></div> : (
              <ul className="divide-y divide-line">
                {s.timeline.slice(0, 6).map((e, i) => (
                  <li key={i} className="flex gap-3 px-4 py-2.5">
                    <span className="w-14 shrink-0 pt-px font-mono text-[11px] text-muted">{timeAgo(e.at)}</span>
                    <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot[e.severity])} />
                    <div className="min-w-0">
                      <p className="text-sm text-fg">{e.title}</p>
                      <p className="truncate text-xs text-muted">{e.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Detector activity" subtitle="Stored runs in PostgreSQL" />
          <CardBody className="space-y-3">
            <dl className="flex gap-6 text-sm">
              {[["Runs", s?.anomalyStats.detections], ["Flagged", s?.anomalyStats.flagged], ["Incidents", s?.anomalyStats.incidents]].map(([k, v]) => (
                <div key={k as string}>
                  <dd className="text-lg font-semibold tabular-nums text-fg">{v ?? "–"}</dd>
                  <dt className="text-xs text-muted">{k}</dt>
                </div>
              ))}
            </dl>
            <div>
              <p className="mb-1 text-xs text-muted">Bad-data statistic J against its χ² limit</p>
              <SeriesChart data={history} height={120} lines={[{ key: "j", name: "J", color: "var(--warning)" }, { key: "jThreshold", name: "Limit", color: "var(--critical)", dashed: true }]} />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
