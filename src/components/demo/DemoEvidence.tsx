"use client";

import Link from "next/link";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import type { AnalysisDTO, DemoResult } from "@/types/api";
import { fmt, pct } from "@/utils/format";

function Evidence({ title, analysis }: { title: string; analysis: AnalysisDTO }) {
  return (
    <section className="rounded-lg border border-line p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        <Badge tone={analysis.hybrid.flag ? "critical" : "success"}>{analysis.hybrid.flag ? "Alert" : "No alert"}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted">Electrical mismatch J</dt><dd className="text-right font-mono">{fmt(analysis.bdd.j, 1)} / {fmt(analysis.bdd.threshold, 1)}</dd>
        <dt className="text-muted">Largest residual |rN|</dt><dd className="text-right font-mono">{fmt(analysis.bdd.maxRN, 2)} / 4.00</dd>
        <dt className="text-muted">Isolation Forest score</dt><dd className="text-right font-mono">{fmt(analysis.isolationForest.score, 3)} / {fmt(analysis.isolationForest.threshold, 3)}</dd>
        <dt className="text-muted">RF attack score</dt><dd className="text-right font-mono">{pct(analysis.randomForest.attackProbability)} / {pct(analysis.randomForest.threshold)}</dd>
      </dl>
      <p className="mt-3 text-xs text-muted">Values show measured score / alert threshold. Electrical checks flag either excessive total mismatch or a large individual residual. RF scores are model estimates, not calibrated confidence.</p>
    </section>
  );
}

export function DemoEvidence({ result: r }: { result: DemoResult }) {
  const h = r.evaluation.detection.hybrid;
  const detected = r.detection.hybrid.flag;
  const hit = r.predictedBuses.includes(r.groundTruthBus);
  return (
    <Card className="mb-5" >
      <CardHeader title="Guided demo evidence" subtitle={`Saved snapshot · seed ${r.scenario.seed} · tick ${r.scenario.tick}. Live telemetry below continues independently.`} />
      <CardBody className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Evidence title="1. Before: normal measurements" analysis={r.baseline} />
          <Evidence title="2. After: simulated false-data injection" analysis={r.detection} />
        </div>
        <p className="text-sm text-fg"><b>3. Detector conclusion:</b> {detected ? r.detection.hybrid.className : "No attack flagged (missed attack)"}. Electrical check: {r.detection.bdd.flag ? "flagged" : "quiet"}; Isolation Forest: {r.detection.isolationForest.flag ? "flagged" : "quiet"}; Random Forest: {r.detection.randomForest.flag ? "flagged" : "quiet"}.</p>
        <p className="text-xs text-muted">Decision rule: {r.evaluation.thresholds.fusionRule}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-left text-sm">
            <caption className="mb-2 text-left text-xs text-muted">Largest suspicious measurement residuals from the attacked snapshot</caption>
            <thead><tr className="text-xs text-muted"><th className="py-2">Meter</th><th>Bus</th><th className="text-right">|rN|</th></tr></thead>
            <tbody>{r.detection.suspicious.slice(0, 5).map((m) => <tr key={m.meterId} className="border-t border-line"><td className="py-2">{m.label}</td><td>{m.bus}</td><td className="text-right font-mono">{fmt(Math.abs(m.rN), 2)}</td></tr>)}</tbody>
          </table>
          {!r.detection.suspicious.length && <p className="text-sm text-muted">No measurement residual exceeded the display threshold.</p>}
        </div>
        <p className="text-sm"><b>4. Localization:</b> predicted {r.predictedBuses.length ? `bus ${r.predictedBuses.join(", ")}` : "no bus above the evidence threshold"}. Simulated target: bus {r.groundTruthBus}. <Badge tone={hit ? "success" : "warning"}>{hit ? "Target included" : "Target missed"}</Badge></p>
        <p className="text-xs text-muted">The target is used after prediction to score the result. Localization evidence scores are not probabilities.</p>
        <div className="rounded-lg bg-subtle p-3">
          <h3 className="text-sm font-semibold">5. Performance beyond this example</h3>
          <p className="mt-1 text-sm">Precision {pct(h.precision)} · Recall {pct(h.recall)} · False positive rate {pct(h.fpr)}</p>
          <p className="mt-1 text-xs text-muted">{h.tp} detected / {h.tp + h.fn} test attacks; {h.fn} missed attacks. {h.fp} false alerts / {h.fp + h.tn} normal test scenarios. Train {r.evaluation.dataset.train} / validation {r.evaluation.dataset.validation} / test {r.evaluation.dataset.test}. Evaluation seed {r.evaluation.seed}.</p>
          <p className="mt-2 text-xs text-muted">These are held-out synthetic scenarios from the same simulator. This fixed teaching example is not an additional accuracy benchmark. Real utility telemetry has not been validated.</p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/incidents" className="text-primary hover:underline">Review saved incident {r.incident.code}</Link>
          <Link href="/performance" className="text-primary hover:underline">Compare all detectors and localization metrics</Link>
        </div>
      </CardBody>
    </Card>
  );
}
