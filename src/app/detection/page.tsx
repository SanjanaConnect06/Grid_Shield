"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Cpu, Radar, RefreshCw, Timer, TreePine, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { SeriesChart, SimpleBars } from "@/components/charts";
import { Badge, Button, Card, CardBody, CardHeader, Empty, PageHeader, SimBanner, Skeleton } from "@/components/ui";
import { useDetections, useFrame } from "@/hooks/useGrid";
import { api } from "@/services/api";
import { useAppStore } from "@/stores/app-store";
import type { AnalysisDTO, EvaluationDTO } from "@/types/api";
import { fmt, label, pct, timeAgo } from "@/utils/format";

function Meter({ value, threshold, max, flag }: { value: number; threshold: number; max: number; flag: boolean }) {
  const w = Math.min(100, (value / max) * 100);
  const t = Math.min(100, (threshold / max) * 100);
  return (
    <div className="relative mt-3 h-2.5 rounded-full bg-line" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={`h-full rounded-full ${flag ? "bg-critical" : "bg-success"}`} style={{ width: `${w}%` }} />
      <div className="absolute -top-1 h-4.5 w-0.5 bg-fg" style={{ left: `${t}%`, height: 18 }} title="threshold" />
    </div>
  );
}

function MethodCard({ title, flag, children }: { title: string; flag: boolean; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-fg">{title}</span>
        <Badge tone={flag ? "critical" : "success"}>{flag ? "ANOMALY" : "NORMAL"}</Badge>
      </div>
      {children}
    </Card>
  );
}

export default function DetectionPage() {
  const qc = useQueryClient();
  const { data: frame } = useFrame();
  const history = useAppStore((s) => s.history);
  const detections = useDetections();
  const a: AnalysisDTO | null = frame?.analysis ?? null;

  const run = useMutation({
    mutationFn: () => api.post<{ detectionId: number; analysis: AnalysisDTO; groundTruth: string }>("/api/detection/run"),
    onSuccess: (d) => {
      const hit = d.analysis.hybrid.flag;
      (hit ? toast.error : toast.success)(hit ? `Hybrid alert: ${d.analysis.hybrid.className}` : "Hybrid detector: grid normal", { description: `Result #${d.detectionId} stored · ${d.analysis.latencyMs.toFixed(1)} ms` });
      qc.invalidateQueries({ queryKey: ["detections"] });
      qc.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (e) => toast.error("Detection failed", { description: e.message }),
  });
  const train = useMutation({
    mutationFn: () => api.post<EvaluationDTO>("/api/models/train"),
    onSuccess: (d) => { toast.success("Models retrained", { description: `${d.dataset.total} scenarios · ${d.trainingSeconds.toFixed(1)} s · hybrid F1 ${d.detection.hybrid.f1.toFixed(3)}` }); qc.invalidateQueries(); },
    onError: (e) => toast.error("Training failed", { description: e.message }),
  });

  const probs = a ? Object.entries(a.randomForest.probabilities).map(([k, v]) => ({ name: label(k), value: v })) : [];
  const chartData = history.map((h) => ({ ...h, jRatio: h.j !== null && h.jThreshold ? h.j / h.jThreshold : null }));

  return (
    <div>
      <PageHeader
        title="AI Threat Detection"
        subtitle="Four detectors look at the same live frame. Run it to store the result."
        actions={
          <>
            <Button variant="secondary" onClick={() => train.mutate()} disabled={train.isPending}><RefreshCw size={16} className={train.isPending ? "animate-spin" : ""} /> {train.isPending ? "Training…" : "Retrain models"}</Button>
            <Button onClick={() => run.mutate()} disabled={run.isPending || !frame?.modelsReady}><Radar size={16} /> Run hybrid detection</Button>
          </>
        }
      />
      <SimBanner />
      {frame && !frame.modelsReady && (
        <div className="mb-4 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-fg">
          <span className="font-semibold text-primary">AI models are training</span> on the seeded labelled dataset (≈30 s on first start). The live analysis will appear automatically.
        </div>
      )}

      {!a ? (
        <div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MethodCard title="Bad Data Detection" flag={a.bdd.flag}>
              <p className="mt-3 text-2xl font-semibold text-fg">J = {fmt(a.bdd.j, 1)}</p>
              <p className="text-xs text-muted">χ² threshold {fmt(a.bdd.threshold, 1)} (α=0.01, {a.bdd.dof} dof)</p>
              <Meter value={a.bdd.j} threshold={a.bdd.threshold} max={a.bdd.threshold * 2.5} flag={a.bdd.flag} />
              <p className="mt-2 text-xs text-muted">max |r<sub>N</sub>| = {fmt(a.bdd.maxRN, 2)} (limit 4.0)</p>
            </MethodCard>
            <MethodCard title="Isolation Forest" flag={a.isolationForest.flag}>
              <p className="mt-3 text-2xl font-semibold text-fg">{fmt(a.isolationForest.score, 3)}</p>
              <p className="text-xs text-muted">Anomaly score · threshold {fmt(a.isolationForest.threshold, 3)} (95th pct. of normal validation)</p>
              <Meter value={a.isolationForest.score} threshold={a.isolationForest.threshold} max={1} flag={a.isolationForest.flag} />
            </MethodCard>
            <MethodCard title="Random Forest" flag={a.randomForest.flag}>
              <p className="mt-3 text-2xl font-semibold text-fg">{pct(a.randomForest.attackProbability, 1)}</p>
              <p className="text-xs text-muted">Attack probability · alert threshold {pct(a.randomForest.threshold, 0)}</p>
              <Meter value={a.randomForest.attackProbability} threshold={a.randomForest.threshold} max={1} flag={a.randomForest.flag} />
            </MethodCard>
            <Card className={`p-4 ${a.hybrid.flag ? "border-critical/60" : "border-success/40"}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-fg"><TriangleAlert size={16} className="text-primary" />Hybrid decision</span>
                <Badge tone={a.hybrid.flag ? "critical" : "success"}>{a.hybrid.flag ? "ATTACK SUSPECTED" : "NORMAL"}</Badge>
              </div>
              <p className="mt-3 text-xl font-semibold text-fg">{a.hybrid.className}</p>
              <p className="text-xs text-muted">{a.hybrid.votes}/3 detectors flagged</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Timer size={13} /> Detection latency {fmt(a.latencyMs, 1)} ms</p>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="Class probabilities" subtitle="Random Forest vote shares" />
              <CardBody><SimpleBars data={probs} format={(v) => `${(v * 100).toFixed(0)}%`} height={190} /></CardBody>
            </Card>
            <Card>
              <CardHeader title="Anomaly score history" subtitle="Isolation Forest vs. calibrated threshold" />
              <CardBody><SeriesChart data={history} height={190} domain={[0.3, 0.9]} lines={[{ key: "ifScore", name: "IF score", color: "var(--purple)" }, { key: "ifThreshold", name: "Threshold", color: "var(--critical)", dashed: true }]} /></CardBody>
            </Card>
            <Card>
              <CardHeader title="Residual statistic J / threshold" subtitle=">1 means the χ² bad-data test fires" />
              <CardBody><SeriesChart data={chartData as never} height={190} lines={[{ key: "jRatio" as never, name: "J / τ", color: "var(--warning)" }]} /></CardBody>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader title="Suspicious measurements" subtitle="Largest normalised residuals (|r_N| > 2) from the state estimator" action={a.hybrid.flag ? <Link href="/localization" className="text-sm font-medium text-primary hover:underline">Localize →</Link> : undefined} />
            <CardBody>
              {a.suspicious.length === 0 ? <Empty>No measurement exceeds the residual screening level – telemetry is statistically consistent with the physical model.</Empty> : (
                <div className="overflow-x-auto rounded-md border border-line">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="bg-subtle text-xs text-muted"><tr><th className="px-3 py-2">Meter</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Bus</th><th className="px-3 py-2 text-right">r<sub>N</sub></th></tr></thead>
                    <tbody>
                      {a.suspicious.map((s) => (
                        <tr key={s.meterId} className="border-t border-line">
                          <td className="px-3 py-2 font-mono text-fg">{s.meterId}</td>
                          <td className="px-3 py-2 text-muted">{s.label}</td>
                          <td className="px-3 py-2 text-right text-fg">{s.bus}</td>
                          <td className={`px-3 py-2 text-right font-mono ${Math.abs(s.rN) > 4 ? "font-semibold text-critical" : "text-warning"}`}>{fmt(s.rN, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}

      <Card className="mt-4">
        <CardHeader title="Detection results" subtitle="Persisted runs (detection_results) with simulator ground truth for evaluation" />
        <CardBody>
          {!detections.data?.length ? <Empty>No detection runs stored yet. Press “Run hybrid detection”.</Empty> : (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-subtle text-xs text-muted"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">When</th><th className="px-3 py-2">BDD</th><th className="px-3 py-2">IF</th><th className="px-3 py-2">Hybrid</th><th className="px-3 py-2">Predicted</th><th className="px-3 py-2">Ground truth</th><th className="px-3 py-2 text-right">ms</th></tr></thead>
                <tbody>
                  {detections.data.slice(0, 10).map((d) => {
                    const correct = (d.hybridFlag ? d.predictedClass : "normal") === d.groundTruthLabel;
                    return (
                      <tr key={d.id} className="border-t border-line">
                        <td className="px-3 py-2 text-fg">{d.id}</td>
                        <td className="px-3 py-2 text-muted">{timeAgo(d.createdAt)}</td>
                        <td className="px-3 py-2"><Badge tone={d.bddFlag ? "critical" : "success"}>{d.bddFlag ? "flag" : "ok"}</Badge></td>
                        <td className="px-3 py-2"><Badge tone={d.ifFlag ? "critical" : "success"}>{fmt(d.ifScore, 2)}</Badge></td>
                        <td className="px-3 py-2"><Badge tone={d.hybridFlag ? "critical" : "success"}>{d.hybridFlag ? "alert" : "normal"}</Badge></td>
                        <td className="px-3 py-2 text-fg">{label(d.hybridFlag ? d.predictedClass : "normal")}</td>
                        <td className="px-3 py-2"><span className={correct ? "text-success" : "text-warning"}>{label(d.groundTruthLabel)}</span></td>
                        <td className="px-3 py-2 text-right font-mono text-muted">{fmt(d.latencyMs, 1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
