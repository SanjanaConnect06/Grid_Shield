"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Database, FlaskConical, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SimpleBars } from "@/components/charts";
import { Button, Card, StatStrip, CardBody, CardHeader, ErrorState, PageHeader, Skeleton, Stat } from "@/components/ui";
import { useMetrics } from "@/hooks/useGrid";
import { api } from "@/services/api";
import type { BinaryMetrics, EvaluationDTO } from "@/types/api";
import { cn } from "@/utils/cn";
import { fmt, pct } from "@/utils/format";

function Confusion({ labels, m }: { labels: string[]; m: number[][] }) {
  const rowSums = m.map((r) => r.reduce((a, b) => a + b, 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-1 text-center text-sm">
        <thead>
          <tr><th className="text-xs font-medium text-muted">actual ↓ / predicted →</th>{labels.map((l) => <th key={l} className="px-1 text-xs font-medium text-muted">{l}</th>)}</tr>
        </thead>
        <tbody>
          {m.map((row, i) => (
            <tr key={i}>
              <th className="pr-2 text-right text-xs font-medium text-muted">{labels[i]}</th>
              {row.map((v, j) => {
                const frac = rowSums[i] ? v / rowSums[i] : 0;
                return (
                  <td key={j} className="rounded-lg py-3 font-semibold text-fg" style={{ background: `color-mix(in srgb, ${i === j ? "var(--success)" : "var(--critical)"} ${Math.round(frac * 70)}%, var(--subtle))` }} title={`${(frac * 100).toFixed(1)}% of actual`}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const row = (name: string, m: BinaryMetrics, best = false) => (
  <tr key={name} className={cn("border-t border-line", best && "bg-primary/10")}>
    <td className="px-3 py-2 font-medium text-fg">{name}</td>
    <td className="px-3 py-2 text-right font-mono">{pct(m.accuracy)}</td>
    <td className="px-3 py-2 text-right font-mono">{pct(m.precision)}</td>
    <td className="px-3 py-2 text-right font-mono">{pct(m.recall)}</td>
    <td className="px-3 py-2 text-right font-mono">{fmt(m.f1, 3)}</td>
    <td className="px-3 py-2 text-right font-mono">{pct(m.fpr)}</td>
  </tr>
);

export default function PerformancePage() {
  const qc = useQueryClient();
  const { data: e, isLoading, error, refetch } = useMetrics();
  const train = useMutation({
    mutationFn: () => api.post<EvaluationDTO>("/api/models/train"),
    onSuccess: () => { toast.success("Retrained and re-evaluated on the held-out test split"); qc.invalidateQueries(); },
    onError: (er) => toast.error(er.message),
  });
  const h = e?.detection.hybrid;
  return (
    <div>
      <PageHeader title="Model Performance" subtitle="Measured on a held-out test split of simulated scenarios." actions={<Button variant="secondary" onClick={() => train.mutate()} disabled={train.isPending}><RefreshCw size={16} className={train.isPending ? "animate-spin" : ""} />{train.isPending ? "Training…" : "Retrain & re-evaluate"}</Button>} />
      {error && <ErrorState message={error.message} onRetry={() => refetch()} />}
      {isLoading && <div><p className="mb-3 text-sm text-muted">Training models on first use (≈30 s)…</p><div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div></div>}
      {e && h && (
        <>
          <StatStrip className="grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <Stat label="Accuracy" value={pct(h.accuracy)} hint="Hybrid, attack vs normal" tone="primary" />
            <Stat label="Precision" value={pct(h.precision)} tone="success" />
            <Stat label="Recall" value={pct(h.recall)} tone="cyan" />
            <Stat label="F1-score" value={fmt(h.f1, 3)} tone="purple" />
            <Stat label="False positive rate" value={pct(h.fpr)} tone="warning" />
            <Stat label="Latency (mean)" value={`${fmt(e.latency.meanMs, 1)} ms`} hint={`p95 ${fmt(e.latency.p95Ms, 1)} ms`} tone="cyan" />
            <Stat label="Localization top-1" value={pct(e.localization.top1)} hint={`n=${e.localization.evaluated}`} tone="success" />
            <Stat label="Localization top-3" value={pct(e.localization.top3)} hint={`${fmt(e.localization.meanHopError, 2)} mean hop error`} tone="primary" />
          </StatStrip>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Detector comparison" subtitle={`Binary attack-vs-normal detection on ${e.dataset.test} test scenarios`} />
              <CardBody className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="text-xs text-muted"><tr><th className="px-3 py-2">Method</th><th className="px-3 py-2 text-right">Acc.</th><th className="px-3 py-2 text-right">Prec.</th><th className="px-3 py-2 text-right">Recall</th><th className="px-3 py-2 text-right">F1</th><th className="px-3 py-2 text-right">FPR</th></tr></thead>
                  <tbody>
                    {row("Bad Data Detection (χ² + LNR)", e.detection.bdd)}
                    {row("Isolation Forest", e.detection.isolationForest)}
                    {row("Random Forest", e.detection.randomForest)}
                    {row("Hybrid (fusion)", e.detection.hybrid, true)}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted">Fusion rule: {e.thresholds.fusionRule}</p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Attack classification – confusion matrix" subtitle={`Hybrid pipeline · accuracy ${pct(e.classification.accuracy)} · macro-F1 ${fmt(e.classification.macroF1, 3)}`} />
              <CardBody>
                <Confusion labels={e.classification.labels.map((l) => l.replace(" operation", "").replace(" Attack", "").replace("False Data Injection", "FDI").replace("Data Manipulation", "Manipulation"))} m={e.classification.confusion} />
              </CardBody>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader title="Per-class scores" />
              <CardBody className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-left text-sm">
                  <thead className="text-xs text-muted"><tr><th className="py-2">Class</th><th className="text-right">Prec.</th><th className="text-right">Recall</th><th className="text-right">F1</th><th className="text-right">n</th></tr></thead>
                  <tbody>{e.classification.perClass.map((c) => <tr key={c.label} className="border-t border-line"><td className="py-2 text-fg">{c.label}</td><td className="text-right font-mono">{pct(c.precision, 0)}</td><td className="text-right font-mono">{pct(c.recall, 0)}</td><td className="text-right font-mono">{fmt(c.f1, 2)}</td><td className="text-right font-mono text-muted">{c.support}</td></tr>)}</tbody>
                </table>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Localization accuracy by attack" subtitle="Detected test attacks only" />
              <CardBody className="overflow-x-auto">
                <table className="w-full min-w-[300px] text-left text-sm">
                  <thead className="text-xs text-muted"><tr><th className="py-2">Attack</th><th className="text-right">Top-1</th><th className="text-right">Top-3</th><th className="text-right">n</th></tr></thead>
                  <tbody>{e.localization.perType.map((c) => <tr key={c.label} className="border-t border-line"><td className="py-2 text-fg">{c.label}</td><td className="text-right font-mono">{pct(c.top1, 0)}</td><td className="text-right font-mono">{pct(c.top3, 0)}</td><td className="text-right font-mono text-muted">{c.n}</td></tr>)}</tbody>
                </table>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Top Random Forest features" subtitle="Gini importance" />
              <CardBody><SimpleBars data={e.featureImportance.slice(0, 7).map((f) => ({ name: f.name, value: f.importance }))} format={(v) => `${(v * 100).toFixed(0)}%`} height={210} color="var(--cyan)" /></CardBody>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Dataset" />
              <CardBody>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  {[["Total scenarios", e.dataset.total], ["Train", e.dataset.train], ["Validation", e.dataset.validation], ["Test", e.dataset.test], ["Meters / frame", e.dataset.meters], ["Features", e.dataset.features], ["Seed", e.seed], ["Training time", `${fmt(e.trainingSeconds, 1)} s`], ["Per class", e.dataset.perClass]].map(([k, v]) => (
                    <div key={String(k)} className="rounded-md bg-subtle p-3"><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold text-fg">{v}</dd></div>
                  ))}
                </dl>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Evaluation methodology" />
              <CardBody>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">{e.methodology.map((m) => <li key={m}>{m}</li>)}</ul>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
