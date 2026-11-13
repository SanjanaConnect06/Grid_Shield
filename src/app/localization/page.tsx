"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Crosshair, FilePlus2, Info, ScanSearch, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { GridTopology, TopologyLegend } from "@/components/grid/GridTopology";
import { Badge, Button, Card, CardBody, CardHeader, Empty, PageHeader, SimBanner, Skeleton } from "@/components/ui";
import { useFrame, useLocalizations, useTopology } from "@/hooks/useGrid";
import { api } from "@/services/api";
import type { AnalysisDTO, CandidateDTO, IncidentDTO } from "@/types/api";
import { fmt, pct, timeAgo } from "@/utils/format";

interface LocResult {
  localizationId: number;
  detectionId: number | null;
  predictedBuses: number[];
  ranked: CandidateDTO[];
  significant: boolean;
  method: string;
  removedMeters: { meterId: string; rN: number; bus: number }[];
  evaluation: { groundTruthBus: number | null; correctTop1: boolean | null };
}

export default function LocalizationPage() {
  const qc = useQueryClient();
  const topo = useTopology();
  const { data: frame } = useFrame();
  const history = useLocalizations();
  const [res, setRes] = useState<LocResult | null>(null);
  const [incident, setIncident] = useState<IncidentDTO | null>(null);

  const pipeline = useMutation({
    mutationFn: async () => {
      const det = await api.post<{ detectionId: number; analysis: AnalysisDTO }>("/api/detection/run");
      const loc = await api.post<LocResult>("/api/localization/run", { detectionId: det.detectionId });
      return { det, loc };
    },
    onSuccess: ({ det, loc }) => {
      setRes(loc);
      setIncident(null);
      toast.info(loc.predictedBuses.length ? `Predicted suspicious bus(es): ${loc.predictedBuses.join(", ")}` : "No bus exceeds the evidence threshold", { description: det.analysis.hybrid.flag ? `Hybrid alert: ${det.analysis.hybrid.className}` : "Hybrid detector did not raise an alert" });
      qc.invalidateQueries();
    },
    onError: (e) => toast.error("Localization failed", { description: e.message }),
  });
  const makeIncident = useMutation({
    mutationFn: () => api.post<IncidentDTO>("/api/incidents", { detectionId: res!.detectionId, localizationId: res!.localizationId }),
    onSuccess: (i) => { setIncident(i); toast.success(`${i.code} stored in PostgreSQL`, { description: i.title }); qc.invalidateQueries(); },
    onError: (e) => toast.error("Could not create incident", { description: e.message }),
  });

  const live = frame?.analysis?.localization ?? null;
  const ranked = res?.ranked ?? live?.ranked ?? [];
  const predicted = res?.predictedBuses ?? live?.predictedBuses ?? [];
  const gt = res?.evaluation.groundTruthBus ?? null;
  const maxScore = Math.max(...ranked.map((r) => r.score), 0.001);

  return (
    <div>
      <PageHeader
        title="Attacker Localization"
        subtitle="Works from the observed measurements only. The simulated target is shown afterwards, just for scoring."
        actions={
          <>
            <Button onClick={() => pipeline.mutate()} disabled={pipeline.isPending || !frame?.modelsReady}><ScanSearch size={16} /> {pipeline.isPending ? "Analysing…" : "Run detection + localization"}</Button>
            <Button variant="success" onClick={() => makeIncident.mutate()} disabled={!res || !!incident || makeIncident.isPending}><FilePlus2 size={16} /> Generate incident</Button>
          </>
        }
      />
      <SimBanner />
      {incident && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm">
          <CheckCircle2 size={18} className="text-success" />
          <span className="font-semibold text-fg">{incident.code} stored</span>
          <span className="text-muted">{incident.title}</span>
          <Link href="/incidents" className="font-medium text-primary hover:underline">View in Incident Management →</Link>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Predicted buses on the grid" subtitle={res ? "Result of the last localization run" : "Live localization of the current frame"} action={<Badge tone={predicted.length ? "critical" : "success"}>{predicted.length ? `Bus ${predicted.join(", ")}` : "No suspect"}</Badge>} />
          <CardBody className="space-y-3">
            {topo.data ? <GridTopology topology={topo.data} frame={frame} highlightBuses={predicted} groundTruthBus={res ? gt : null} rankedBuses={ranked.map((r) => r.bus)} height={500} /> : <Skeleton className="h-[500px]" />}
            <TopologyLegend />
          </CardBody>
        </Card>
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader title="Evaluation: predicted vs ground truth" />
            <CardBody className="space-y-3 text-sm">
              {!res ? <Empty>Run detection + localization to compare the prediction with the simulator’s ground truth.</Empty> : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md bg-subtle p-3"><div className="text-xs text-muted">Predicted (top-1)</div><div className="text-xl font-semibold text-fg">{ranked[0] ? `Bus ${ranked[0].bus}` : "—"}</div></div>
                    <div className="rounded-md bg-subtle p-3"><div className="text-xs text-muted">Ground truth (sim.)</div><div className="text-xl font-semibold text-purple">{gt ? `Bus ${gt}` : "No attack"}</div></div>
                  </div>
                  {gt ? (
                    <p className="flex items-center gap-2">{res.evaluation.correctTop1 ? <CheckCircle2 size={16} className="text-success" /> : <XCircle size={16} className="text-warning" />}
                      <span className="text-fg">{res.evaluation.correctTop1 ? "Top-1 prediction matches the simulated target." : ranked.slice(0, 3).some((r) => r.bus === gt) ? "Target is within the top-3 candidates." : "Target not in the top-3 candidates."}</span></p>
                  ) : <p className="text-muted">No simulated attack is active, so there is no ground truth to score against.</p>}
                  <p className="text-xs text-muted">Ground truth was attached after prediction; the localizer sees only observed measurements.</p>
                </>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Method" />
            <CardBody className="space-y-2 text-sm text-muted">
              <p>{live?.method ?? res?.method ?? "WLS residual analysis + iterative LNR identification + graph-neighbour smearing correction"}</p>
              <p className="rounded-lg bg-warning/10 p-3 text-xs text-fg"><span className="font-semibold text-warning">Confidence note:</span> “evidence share” is a relative ranking weight, <b>not a calibrated probability</b>. Reliability is reported empirically as top-1 / top-3 accuracy on the Model Performance page.</p>
              {res && res.removedMeters.length > 0 && <p className="text-xs">Flagged meters: {res.removedMeters.map((m) => `${m.meterId} (${fmt(m.rN, 1)})`).join(", ")}</p>}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="Ranked bus candidates" subtitle="Evidence = standardised drop in the bad-data statistic J when all meters at that bus are discarded (z-score)" />
        <CardBody>
          {ranked.length === 0 ? <Empty>{frame?.modelsReady ? "The hybrid detector has not flagged the grid – no live localization. Run the pipeline to force a localization." : "Waiting for AI models…"}</Empty> : (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-subtle text-xs text-muted"><tr><th className="px-3 py-2">Rank</th><th className="px-3 py-2">Bus</th><th className="px-3 py-2">Evidence score</th><th className="px-3 py-2 text-right">Share*</th><th className="px-3 py-2">Top evidence (meter · r<sub>N</sub>)</th></tr></thead>
                <tbody>
                  {ranked.slice(0, 6).map((c, i) => (
                    <tr key={c.bus} className="border-t border-line align-top">
                      <td className="px-3 py-2 font-semibold text-fg">{i + 1}</td>
                      <td className="px-3 py-2"><Badge tone={predicted.includes(c.bus) ? "critical" : "neutral"}>Bus {c.bus}</Badge></td>
                      <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="h-2 w-28 rounded-full bg-line"><div className={`h-full rounded-full ${predicted.includes(c.bus) ? "bg-critical" : "bg-primary"}`} style={{ width: `${(c.score / maxScore) * 100}%` }} /></div><span className="font-mono text-xs text-fg">{fmt(c.score, 2)}</span></div></td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{pct(c.evidenceShare, 0)}</td>
                      <td className="px-3 py-2 text-xs text-muted">{c.evidence.slice(0, 3).map((e) => <span key={e.meterId} className="mr-3 inline-block font-mono">{e.meterId} · <span className={Math.abs(e.rN) > 3 ? "text-critical" : ""}>{fmt(e.rN, 1)}</span></span>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-line px-3 py-2 text-xs text-muted">*Relative share of total evidence – not a calibrated probability.</p>
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Localization history" subtitle="Persisted results (localization_results)" />
        <CardBody>
          {!history.data?.length ? <Empty>No localization runs stored.</Empty> : (
            <ul className="divide-y divide-line">
              {history.data.slice(0, 8).map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-fg">#{h.id} · predicted {h.predictedBuses.join(", ") || "none"}</span>
                  <span className="text-muted">truth {h.groundTruthBus ?? "n/a"} · {timeAgo(h.createdAt)}</span>
                  {h.correctTop1 === null ? <Badge>no ground truth</Badge> : <Badge tone={h.correctTop1 ? "success" : "warning"}>{h.correctTop1 ? "top-1 hit" : "top-1 miss"}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
