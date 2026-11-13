import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

if (!fs.existsSync(path.join(root, "src/lib/runtime.ts"))) {
  throw new Error("Run this script inside your demo2 folder.");
}

const changes = new Map();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8")
    .replace(/\r\n/g, "\n");
}

function edit(file, before, after) {
  const source = changes.get(file) ?? read(file);

  if (
    !source.includes(before) ||
    source.indexOf(before) !== source.lastIndexOf(before)
  ) {
    throw new Error(
      `Could not match ${file}. No files have been changed. Send me this error.`
    );
  }

  changes.set(file, source.replace(before, after));
}

// Update simulation sessions and snapshot handling.

edit("src/lib/runtime.ts",
`/* Sessions                                                            */
/* ------------------------------------------------------------------ */
async function createSession(scenario: string): Promise<number> {
  const r = rt();
  const seed = 1000 + Math.floor(Math.random() * 900000);
  const [row] = await db.insert(simulationSessions).values({ name: \`Session \${new Date().toISOString().slice(0, 19)}\`, scenario, seed }).returning();
  r.sessionId = row.id;
`,
`/* Sessions                                                            */
/* ------------------------------------------------------------------ */
async function createSession(scenario: string, fixedSeed?: number): Promise<number> {
  const r = rt();
  const seed = fixedSeed ?? (1000 + Math.floor(Math.random() * 900000));
  const [row] = await db.insert(simulationSessions).values({ name: \`Session \${new Date().toISOString().slice(0, 19)}\`, scenario, seed }).returning();
  r.sessionId = row.id;
`);

edit("src/lib/runtime.ts",
`    await createSession("live");
  })();
  await r.init;
  return r.sessionId as number;
}
`,
`    await createSession("live");
  })();
  try {
    await r.init;
  } catch (error) {
    r.init = null; // allow recovery after database setup or a temporary outage
    throw error;
  }
  return r.sessionId as number;
}
`);

edit("src/lib/runtime.ts",
`}

export async function resetSession() {
  const r = rt();
  await ensureSession();
  await stopAttack();
  if (r.sessionId) await db.update(simulationSessions).set({ status: "reset", endedAt: new Date() }).where(eq(simulationSessions.id, r.sessionId));
  return createSession("live");
}

export async function launchAttack(cfg: AttackConfig) {
  const r = rt();
  const sessionId = await ensureSession();
  await stopAttack();
  const t = currentTick();
  const frame = makeFrame(t, r.salt);
  const att = applyAttack(frame, cfg, r.salt);
`,
`}

export async function resetSession(fixedSeed?: number) {
  const r = rt();
  await ensureSession();
  await stopAttack();
  if (r.sessionId) await db.update(simulationSessions).set({ status: "reset", endedAt: new Date() }).where(eq(simulationSessions.id, r.sessionId));
  return createSession(fixedSeed === undefined ? "live" : "guided-demo", fixedSeed);
}

export async function launchAttack(cfg: AttackConfig, fixedTick?: number) {
  const r = rt();
  const sessionId = await ensureSession();
  await stopAttack();
  const t = fixedTick ?? currentTick();
  const frame = makeFrame(t, r.salt);
  const att = applyAttack(frame, cfg, r.salt);
`);

edit("src/lib/runtime.ts",
`  r.training = trainModels()
    .then(async (m) => {
      r.models = m;
      r.snap = null;
      await db.insert(modelEvaluations).values({ seed: m.evaluation.seed, datasetSize: m.evaluation.dataset.total, metrics: m.evaluation as unknown as Record<string, unknown> });
      return m;
    })
`,
`  r.training = trainModels()
    .then(async (m) => {
      await db.insert(modelEvaluations).values({ seed: m.evaluation.seed, datasetSize: m.evaluation.dataset.total, metrics: m.evaluation as unknown as Record<string, unknown> });
      r.models = m;
      r.snap = null;
      return m;
    })
`);

edit("src/lib/runtime.ts",
`}

export async function liveSnapshot(): Promise<LiveSnapshot> {
  const sessionId = await ensureSession();
  const r = rt();
  if (!r.models && !r.training && !r.trainError) warmModels();
  const t = currentTick();
  const key = \`\${t}:\${r.attack?.eventId ?? 0}:\${r.models ? 1 : 0}:\${sessionId}\`;
  if (r.snap?.key === key) return r.snap.value;
`,
`}

export async function liveSnapshot(fixedTick?: number): Promise<LiveSnapshot> {
  const sessionId = await ensureSession();
  const r = rt();
  if (!r.models && !r.training && !r.trainError) warmModels();
  const t = fixedTick ?? currentTick();
  const key = \`\${t}:\${r.attack?.eventId ?? 0}:\${r.models ? 1 : 0}:\${sessionId}\`;
  if (r.snap?.key === key) return r.snap.value;
`);

edit("src/lib/runtime.ts",
`/* Persisted pipeline                                                  */
/* ------------------------------------------------------------------ */
export async function runDetection() {
  await ensureModels();
  const snap = await liveSnapshot();
  const a = snap.analysis as Analysis;
  const [row] = await db
`,
`/* Persisted pipeline                                                  */
/* ------------------------------------------------------------------ */
export async function runDetection(snapshot?: LiveSnapshot) {
  await ensureModels();
  const snap = snapshot ?? await liveSnapshot();
  const a = snap.analysis as Analysis;
  const [row] = await db
`);

edit("src/lib/runtime.ts",
`}

export async function runLocalization(detectionId?: number) {
  await ensureModels();
  const snap = await liveSnapshot();
  const loc = snap.localization ?? localize(snap.observed, (snap.analysis as Analysis).se);
  const gt = snap.attack?.cfg.targetBus ?? null;
`,
`}

export async function runLocalization(detectionId?: number, snapshot?: LiveSnapshot) {
  await ensureModels();
  const snap = snapshot ?? await liveSnapshot();
  const loc = snap.localization ?? localize(snap.observed, (snap.analysis as Analysis).se);
  const gt = snap.attack?.cfg.targetBus ?? null;
`);

edit("src/lib/runtime.ts",
`  const [loc] = await db.select().from(localizationResults).where(eq(localizationResults.id, opts.localizationId));
  if (!det || !loc) throw new Error("Detection or localization result not found");
  const probs = det.rfProbabilities;
  const pAttack = 1 - (probs.normal ?? 0);
`,
`  const [loc] = await db.select().from(localizationResults).where(eq(localizationResults.id, opts.localizationId));
  if (!det || !loc) throw new Error("Detection or localization result not found");
  if (loc.detectionId !== det.id || loc.attackEventId !== det.attackEventId) {
    throw new Error("Detection and localization must belong to the same analysis");
  }
  const probs = det.rfProbabilities;
  const pAttack = 1 - (probs.normal ?? 0);
`);

// Add the evidence panel to Command Centre.

edit("src/app/page.tsx",
`
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Play } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
`,
`
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
`);

edit("src/app/page.tsx",
`import { api } from "@/services/api";
import { useAppStore } from "@/stores/app-store";
import type { AnalysisDTO, IncidentDTO } from "@/types/api";
import { cn } from "@/utils/cn";
import { fmt, label, timeAgo } from "@/utils/format";

interface DemoResult {
  predictedBuses: number[];
  groundTruthBus: number;
  incident: IncidentDTO;
  detection: AnalysisDTO;
}

function useDemo() {
`,
`import { api } from "@/services/api";
import { useAppStore } from "@/stores/app-store";
import type { DemoResult } from "@/types/api";
import { DemoEvidence } from "@/components/demo/DemoEvidence";
import { cn } from "@/utils/cn";
import { fmt, label, timeAgo } from "@/utils/format";


function useDemo() {
`);

edit("src/app/page.tsx",
`  const loading = !f || !s;
  const alert = s?.gridStatus === "ALERT";
  const hit = demo.data ? demo.data.predictedBuses.includes(demo.data.groundTruthBus) : false;

  return (
`,
`  const loading = !f || !s;
  const alert = s?.gridStatus === "ALERT";


  return (
`);

edit("src/app/page.tsx",
`      />

      {demo.data ? (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-success/30 bg-success/5 px-4 py-2.5 text-sm">
          <CheckCircle2 size={16} className="text-success" />
          <span className="font-medium text-fg">{demo.data.incident.code}</span>
          <span className="text-fg">{label(demo.data.detection.hybrid.predictedClass)}</span>
          <span className="text-muted">
            localizer picked bus {demo.data.predictedBuses.join(", ") || "none"}; the simulated target was bus {demo.data.groundTruthBus} {hit ? "(hit)" : "(miss)"}
          </span>
          <Link href="/incidents" className="ml-auto text-primary hover:underline">Open incident</Link>
        </div>
      ) : (
        <p className="mb-4 text-xs text-muted">The demo resets the grid, injects a simulated false-data attack on bus 9, then detects, classifies and localizes it and files an incident.</p>
      )}

      {(frameQ.isError || statusQ.isError) && (
`,
`      />

      <p className="mb-4 text-xs text-muted">The guided demo resets the simulation, compares normal readings with a false-data attack on bus 9, and saves an incident. It uses fixed readings so you can repeat the explanation.</p>
      {demo.isPending && <p role="status" className="mb-4 text-sm text-primary">Preparing models, comparing readings and saving evidence… First use can take a minute.</p>}
      {demo.isError && <div className="mb-4"><ErrorState message={demo.error.message} onRetry={() => demo.mutate()} /></div>}
      {demo.data && !demo.isPending && <DemoEvidence result={demo.data} />}

      {(frameQ.isError || statusQ.isError) && (
`);

edit("src/types/api.ts",
`  source: string;
}
`,
`  source: string;
}

export interface DemoResult {
  scenario: { seed: number; tick: number; targetBus: number; intensity: number };
  baseline: AnalysisDTO;
  detection: AnalysisDTO;
  predictedBuses: number[];
  groundTruthBus: number;
  incident: IncidentDTO;
  evaluation: EvaluationDTO;
}
`);

// Keep internal errors in the server terminal.

edit("src/lib/http.ts",
`    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    console.error(e);
    return fail(500, "internal_error", e instanceof Error ? e.message : "Unexpected server error");
  }
}
`,
`    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    console.error(e);
    return fail(500, "internal_error", "The server could not complete this request. Check the server terminal for details.");
  }
}
`);

// Restore React Flow attribution.

edit("src/app/globals.css",
`  background: var(--subtle);
}
.react-flow__attribution {
  display: none;
}
.react-flow__edge-text {
  fill: var(--muted);
`,
`  background: var(--subtle);
}
.react-flow__edge-text {
  fill: var(--muted);
`);

edit("src/components/grid/GridTopology.tsx",
`        maxZoom={1.8}
        onNodeClick={(_, n) => onSelect?.(Number(n.id))}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
`,
`        maxZoom={1.8}
        onNodeClick={(_, n) => onSelect?.(Number(n.id))}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
`);

// Verify the fixed scenario in the existing model test.

edit("tests/models.test.ts",
`import { describe, expect, it } from "vitest";
import { trainModels } from "@/lib/ai/models";

describe("AI engine", () => {
`,
`import { describe, expect, it } from "vitest";
import { analyzeVector, trainModels } from "@/lib/ai/models";

import { makeFrame, applyAttack } from "@/lib/sim/frames";
import { localize } from "@/lib/ai/localization";
import { DEMO_ATTACK, DEMO_SEED, DEMO_TICK } from "@/lib/demo";

describe("AI engine", () => {
`);

edit("tests/models.test.ts",
`    expect(e.detection.hybrid.recall).toBeGreaterThan(0.5);
    expect(e.detection.hybrid.fpr).toBeLessThan(0.15);
  });
});
`,
`    expect(e.detection.hybrid.recall).toBeGreaterThan(0.5);
    expect(e.detection.hybrid.fpr).toBeLessThan(0.15);
    expect(e.detection.hybrid.tp + e.detection.hybrid.fn).toBe(300);
    expect(e.detection.hybrid.fp + e.detection.hybrid.tn).toBe(100);

    const frame = makeFrame(DEMO_TICK, DEMO_SEED);
    const before = frame.original.slice();
    const normal = analyzeVector(frame.original, m);
    const attacked = applyAttack(frame, DEMO_ATTACK, DEMO_SEED);
    const analysis = analyzeVector(attacked.observed, m);
    const location = localize(attacked.observed, analysis.se);
    expect(normal.hybrid.flag).toBe(false);
    expect(analysis.hybrid.flag).toBe(true);
    expect(location.predictedBuses).toContain(DEMO_ATTACK.targetBus);
    expect(frame.original).toEqual(before);
    expect(makeFrame(DEMO_TICK, DEMO_SEED).original).toEqual(before);
    console.log("Measured evaluation:", JSON.stringify({ detection: e.detection, localization: e.localization }));
  });
});
`);

// Create the fixed scenario.

changes.set("src/lib/demo.ts", `/** Fixed teaching scenario, independent of the model training/evaluation seed. */
export const DEMO_SEED = 14009;
export const DEMO_TICK = 500;
export const DEMO_ATTACK = {
  type: "false_data_injection" as const,
  targetBus: 9,
  intensity: 0.8,
  groups: ["voltage", "active_power", "reactive_power"] as ("voltage" | "active_power" | "reactive_power")[],
  sign: 1 as const,
};
`);

// Create the before/after evidence component.

changes.set("src/components/demo/DemoEvidence.tsx", `"use client";

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
      <CardHeader title="Guided demo evidence" subtitle={\`Saved snapshot · seed \${r.scenario.seed} · tick \${r.scenario.tick}. Live telemetry below continues independently.\`} />
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
        <p className="text-sm"><b>4. Localization:</b> predicted {r.predictedBuses.length ? \`bus \${r.predictedBuses.join(", ")}\` : "no bus above the evidence threshold"}. Simulated target: bus {r.groundTruthBus}. <Badge tone={hit ? "success" : "warning"}>{hit ? "Target included" : "Target missed"}</Badge></p>
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
`);

// Replace the guided demo endpoint.

changes.set("src/app/api/demo/run/route.ts", `import { toIncidentDTO } from "@/lib/dto";
import { handle, ok } from "@/lib/http";
import { createIncident, ensureModels, launchAttack, liveSnapshot, resetSession, runDetection, runLocalization } from "@/lib/runtime";
import { buildFrame } from "@/lib/serialize";
import { DEMO_ATTACK, DEMO_SEED, DEMO_TICK } from "@/lib/demo";

export const dynamic = "force-dynamic";

async function runDemo() {
  const models = await ensureModels();
  await resetSession(DEMO_SEED);
  const baseline = await liveSnapshot(DEMO_TICK);
  await launchAttack(DEMO_ATTACK, DEMO_TICK);
  const attacked = await liveSnapshot(DEMO_TICK);
  const det = await runDetection(attacked);
  const loc = await runLocalization(det.row.id, det.snap);
  const inc = await createIncident({ detectionId: det.row.id, localizationId: loc.row.id });
  return {
    scenario: { seed: DEMO_SEED, tick: DEMO_TICK, targetBus: DEMO_ATTACK.targetBus, intensity: DEMO_ATTACK.intensity },
    baseline: buildFrame(baseline).analysis!,
    detection: buildFrame(det.snap).analysis!,
    predictedBuses: loc.loc.predictedBuses,
    groundTruthBus: DEMO_ATTACK.targetBus,
    incident: toIncidentDTO(inc),
    evaluation: models.evaluation,
  };
}

// Concurrent clicks share one run in this process, avoiding duplicate incidents.
const shared = globalThis as typeof globalThis & { __gridShieldDemo?: ReturnType<typeof runDemo> };
export async function POST() {
  return handle(async () => {
    shared.__gridShieldDemo ??= runDemo().finally(() => { shared.__gridShieldDemo = undefined; });
    return ok(await shared.__gridShieldDemo);
  });
}
`);

// Use the existing environment file for Drizzle too.

changes.set("drizzle.config.ts", `import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Match Next.js local setup: process environment wins, then .env.local, then .env.
config({ path: [".env.local", ".env"], quiet: true });
if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL in .env.local before running database commands.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url: process.env.DATABASE_URL },
});
`);

// Prepare package scripts and backup exclusions.

const pkg = JSON.parse(read("package.json"));

pkg.scripts = {
  ...pkg.scripts,
  test: "vitest run",
  "db:push": "drizzle-kit push"
};

changes.set("package.json", JSON.stringify(pkg, null, 2) + "\n");

const ignore = fs.existsSync(".gitignore") ? read(".gitignore") : "";

changes.set(
  ".gitignore",
  ignore + "\n.gridshield-backup-*/\n.env*\n!.env.example\n"
);

// All replacements have been checked. Back up before writing.

const backup = path.join(root, ".gridshield-backup-" + Date.now());

for (const file of [...changes.keys(), "drizzle.config.json"]) {
  const original = path.join(root, file);

  if (!fs.existsSync(original)) continue;

  const destination = path.join(backup, file);

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(original, destination);
}

for (const [file, content] of changes) {
  const destination = path.join(root, file);

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}

// Its backed-up copy remains in the backup folder.
if (fs.existsSync("drizzle.config.json")) {
  fs.unlinkSync("drizzle.config.json");
}

console.log("Updated successfully. Backup: " + path.basename(backup));
console.log("Your .env files and database contents were not changed.");
console.log("Next: npm run typecheck && npm test && npm run dev");