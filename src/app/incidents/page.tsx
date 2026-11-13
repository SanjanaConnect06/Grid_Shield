"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, CardBody, Empty, ErrorState, Field, Input, Modal, PageHeader, Select, SimBanner, Skeleton, severityTone } from "@/components/ui";
import { useIncidents } from "@/hooks/useGrid";
import { api } from "@/services/api";
import type { IncidentDTO } from "@/types/api";
import { fmt, label, timeAgo } from "@/utils/format";

function Detail({ inc, onStatus }: { inc: IncidentDTO; onStatus: (s: IncidentDTO["status"]) => void }) {
  const d = inc.details as { bdd?: { j: number; threshold: number; flag: boolean }; isolationForest?: { score: number; flag: boolean }; randomForest?: Record<string, number>; latencyMs?: number; suspiciousMeasurements?: { meterId: string; rN: number }[]; localizationRanking?: { bus: number; score: number }[] };
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={severityTone(inc.severity)}>{inc.severity}</Badge>
        <Badge tone="warning">SIMULATED</Badge>
        <Badge tone="neutral">{label(inc.detectedAttackType)}</Badge>
        <span className="text-xs text-muted">{new Date(inc.createdAt).toLocaleString()}</span>
      </div>
      <p className="text-fg">{inc.summary}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Predicted buses", inc.predictedBuses.join(", ") || "—"], ["Ground-truth bus", inc.groundTruthBus ?? "n/a"], ["Ground-truth type", label(inc.groundTruthAttackType)], ["Latency", d.latencyMs ? `${fmt(d.latencyMs, 1)} ms` : "—"]].map(([k, v]) => (
          <div key={String(k)} className="rounded-md bg-subtle p-3"><div className="text-xs text-muted">{k}</div><div className="font-semibold text-fg">{v}</div></div>
        ))}
      </div>
      {d.bdd && <p className="text-muted">BDD J = <b className="text-fg">{fmt(d.bdd.j, 1)}</b> (threshold {fmt(d.bdd.threshold, 1)}) · Isolation Forest score <b className="text-fg">{fmt(d.isolationForest?.score, 3)}</b></p>}
      {d.randomForest && <p className="text-muted">RF probabilities: {Object.entries(d.randomForest).map(([k, v]) => `${label(k)} ${(v * 100).toFixed(0)}%`).join(" · ")}</p>}
      {d.suspiciousMeasurements && d.suspiciousMeasurements.length > 0 && <p className="font-mono text-xs text-muted">Suspicious: {d.suspiciousMeasurements.map((m) => `${m.meterId} (${fmt(m.rN, 1)})`).join(", ")}</p>}
      {d.localizationRanking && <p className="text-muted">Ranking: {d.localizationRanking.slice(0, 5).map((c) => `Bus ${c.bus} (${fmt(c.score, 1)})`).join(" > ")}</p>}
      <Field label="Status"><Select value={inc.status} onChange={(e) => onStatus(e.target.value as IncidentDTO["status"])}><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></Select></Field>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => exportSingle(inc.id, "pdf")}><FileText size={14} /> PDF report</Button>
        <Button variant="secondary" size="sm" onClick={() => exportSingle(inc.id, "csv")}><Download size={14} /> CSV</Button>
      </div>
    </div>
  );
}

async function exportSingle(id: number, format: "csv" | "pdf") {
  try {
    const res = await fetch("/api/reports/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format, incidentIds: [id] }) });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incident-${id}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast.error((e as Error).message);
  }
}

export default function IncidentsPage() {
  const qc = useQueryClient();
  const [f, setF] = useState({ q: "", from: "", to: "", attackType: "", severity: "" });
  const [open, setOpen] = useState<IncidentDTO | null>(null);
  const { data, isLoading, error, refetch } = useIncidents(f);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const status = useMutation({
    mutationFn: ({ id, s }: { id: number; s: IncidentDTO["status"] }) => api.patch<IncidentDTO>(`/api/incidents/${id}`, { status: s }),
    onSuccess: (i) => { setOpen(i); toast.success(`${i.code} marked ${i.status}`); qc.invalidateQueries(); },
    onError: (e) => toast.error(e.message),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div>
      <PageHeader
        title="Incident Management"
        subtitle="Everything the detectors have raised, newest first."
        actions={
          <>
            <a href={`/api/incidents/export?format=csv${qs ? `&${qs}` : ""}`} download><Button variant="secondary"><Download size={16} /> Export CSV</Button></a>
            <a href={`/api/incidents/export?format=pdf${qs ? `&${qs}` : ""}`} download><Button><FileText size={16} /> Export PDF</Button></a>
          </>
        }
      />
      <SimBanner />
      <Card>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Search"><div className="relative"><Search size={16} className="absolute left-3 top-3 text-muted" /><Input className="pl-9" placeholder="Code, title, type…" value={f.q} onChange={set("q")} /></div></Field>
          <Field label="From"><Input type="date" value={f.from} onChange={set("from")} /></Field>
          <Field label="To"><Input type="date" value={f.to} onChange={set("to")} /></Field>
          <Field label="Attack type"><Select value={f.attackType} onChange={set("attackType")}><option value="">All types</option><option value="false_data_injection">False Data Injection</option><option value="replay">Replay Attack</option><option value="data_manipulation">Data Manipulation</option><option value="normal">Normal / false alarm</option></Select></Field>
          <Field label="Severity"><Select value={f.severity} onChange={set("severity")}><option value="">All</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select></Field>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardBody>
          {error ? <ErrorState message={error.message} onRetry={() => refetch()} /> : isLoading ? <Skeleton className="h-48" /> : !data?.length ? <Empty>No incidents match. Run the judge demo on the Command Centre or generate one from Attacker Localization.</Empty> : (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-subtle text-xs text-muted"><tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Buses</th><th className="px-3 py-2">Severity</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Created</th></tr></thead>
                <tbody>
                  {data.map((i) => (
                    <tr key={i.id} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(i)} onClick={() => setOpen(i)} className="cursor-pointer border-t border-line hover:bg-subtle">
                      <td className="px-3 py-2 font-mono text-fg">{i.code}</td>
                      <td className="max-w-[280px] truncate px-3 py-2 text-fg">{i.title}</td>
                      <td className="px-3 py-2 text-muted">{label(i.detectedAttackType)}</td>
                      <td className="px-3 py-2 text-fg">{i.predictedBuses.join(", ") || "—"}</td>
                      <td className="px-3 py-2"><Badge tone={severityTone(i.severity)}>{i.severity}</Badge></td>
                      <td className="px-3 py-2"><Badge tone={i.status === "resolved" ? "success" : i.status === "investigating" ? "primary" : "warning"}>{i.status}</Badge></td>
                      <td className="px-3 py-2 text-muted">{timeAgo(i.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal open={!!open} onOpenChange={(v) => !v && setOpen(null)} title={open ? `${open.code} · ${open.title}` : ""} description="Incident detail (simulated scenario)">
        {open && <Detail inc={open} onStatus={(s) => status.mutate({ id: open.id, s })} />}
      </Modal>
    </div>
  );
}
