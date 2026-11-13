import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attackEvents, detectionResults, incidents, localizationResults, modelEvaluations, simulationSessions } from "@/db/schema";
import { applyAttack, ATTACK_NAMES, frequencyAt, makeFrame, type AttackConfig, type Frame, type Label } from "@/lib/sim/frames";
import { METERS, M } from "@/lib/grid/powerflow";
import { stateEstimate, type SEResult } from "@/lib/ai/estimation";
import { analyzeVector, trainModels, type Analysis, type TrainedModels } from "@/lib/ai/models";
import { localize, type LocalizationOutput } from "@/lib/ai/localization";

interface ActiveAttack {
  eventId: number;
  cfg: AttackConfig;
  launchTick: number;
  launchedAt: number;
}

interface Runtime {
  startMs: number;
  sessionId: number | null;
  salt: number;
  attack: ActiveAttack | null;
  models: TrainedModels | null;
  training: Promise<TrainedModels> | null;
  trainError: string | null;
  snap: { key: string; value: LiveSnapshot } | null;
  init: Promise<void> | null;
}

const g = globalThis as typeof globalThis & { __gridShield?: Runtime };
function rt(): Runtime {
  if (!g.__gridShield) {
    g.__gridShield = { startMs: Date.now(), sessionId: null, salt: 1, attack: null, models: null, training: null, trainError: null, snap: null, init: null };
  }
  return g.__gridShield;
}

export function currentTick(): number {
  return 300 + Math.floor((Date.now() - rt().startMs) / 1000);
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */
async function createSession(scenario: string, fixedSeed?: number): Promise<number> {
  const r = rt();
  const seed = fixedSeed ?? (1000 + Math.floor(Math.random() * 900000));
  const [row] = await db.insert(simulationSessions).values({ name: `Session ${new Date().toISOString().slice(0, 19)}`, scenario, seed }).returning();
  r.sessionId = row.id;
  r.salt = seed;
  r.snap = null;
  return row.id;
}

export async function ensureSession(): Promise<number> {
  const r = rt();
  if (r.sessionId) return r.sessionId;
  r.init ??= (async () => {
    // attacks never survive a process restart – close dangling records
    await db.update(attackEvents).set({ status: "stopped", stoppedAt: new Date() }).where(eq(attackEvents.status, "active"));
    await db.update(simulationSessions).set({ status: "stopped", endedAt: new Date() }).where(eq(simulationSessions.status, "running"));
    await createSession("live");
  })();
  try {
    await r.init;
  } catch (error) {
    r.init = null; // allow recovery after database setup or a temporary outage
    throw error;
  }
  return r.sessionId as number;
}

export async function startSession(scenario = "live") {
  const r = rt();
  await ensureSession();
  if (r.sessionId) {
    await stopAttack();
    await db.update(simulationSessions).set({ status: "stopped", endedAt: new Date() }).where(eq(simulationSessions.id, r.sessionId));
  }
  return createSession(scenario);
}

export async function stopAttack() {
  const r = rt();
  if (!r.attack) return null;
  const ev = r.attack;
  await db.update(attackEvents).set({ status: "stopped", stoppedAt: new Date() }).where(eq(attackEvents.id, ev.eventId));
  r.attack = null;
  r.snap = null;
  return ev;
}

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
  const [row] = await db
    .insert(attackEvents)
    .values({
      sessionId,
      attackType: cfg.type,
      targetBus: cfg.targetBus,
      intensity: cfg.intensity,
      measurementGroups: cfg.groups,
      sign: cfg.sign,
      launchTick: t,
      snapshot: {
        meters: METERS.map((m) => m.id),
        original: Array.from(frame.original),
        attacked: Array.from(att.observed),
        tamperedMeters: att.tampered.map((i) => METERS[i].id),
      },
    })
    .returning();
  r.attack = { eventId: row.id, cfg, launchTick: t, launchedAt: Date.now() };
  r.snap = null;
  return row;
}

/* ------------------------------------------------------------------ */
/* Models                                                              */
/* ------------------------------------------------------------------ */
export function getModels(): TrainedModels | null {
  return rt().models;
}

export function isTraining(): boolean {
  return !!rt().training;
}

export function ensureModels(force = false): Promise<TrainedModels> {
  const r = rt();
  if (r.models && !force) return Promise.resolve(r.models);
  if (r.training) return r.training;
  r.trainError = null;
  r.training = trainModels()
    .then(async (m) => {
      await db.insert(modelEvaluations).values({ seed: m.evaluation.seed, datasetSize: m.evaluation.dataset.total, metrics: m.evaluation as unknown as Record<string, unknown> });
      r.models = m;
      r.snap = null;
      return m;
    })
    .catch((e) => {
      r.trainError = String(e);
      throw e;
    })
    .finally(() => {
      r.training = null;
    });
  return r.training;
}

export function warmModels() {
  ensureModels().catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* Live snapshot                                                       */
/* ------------------------------------------------------------------ */
export interface LiveSnapshot {
  t: number;
  frame: Frame;
  observed: Float64Array;
  tampered: Set<number>;
  se: SEResult;
  frequency: number;
  attack: ActiveAttack | null;
  analysis: Analysis | null;
  localization: LocalizationOutput | null;
  sessionId: number;
  groundTruth: Label;
}

export async function liveSnapshot(fixedTick?: number): Promise<LiveSnapshot> {
  const sessionId = await ensureSession();
  const r = rt();
  if (!r.models && !r.training && !r.trainError) warmModels();
  const t = fixedTick ?? currentTick();
  const key = `${t}:${r.attack?.eventId ?? 0}:${r.models ? 1 : 0}:${sessionId}`;
  if (r.snap?.key === key) return r.snap.value;
  const frame = makeFrame(t, r.salt);
  let observed = frame.original;
  let tampered = new Set<number>();
  if (r.attack) {
    const a = applyAttack(frame, r.attack.cfg, r.salt);
    observed = a.observed;
    tampered = new Set(a.tampered);
  }
  const se = stateEstimate(observed);
  let analysis: Analysis | null = null;
  let localization: LocalizationOutput | null = null;
  if (r.models) {
    analysis = analyzeVector(observed, r.models);
    if (analysis.hybrid.flag) localization = localize(observed, analysis.se);
  }
  const value: LiveSnapshot = {
    t,
    frame,
    observed,
    tampered,
    se,
    frequency: frequencyAt(t, r.salt),
    attack: r.attack,
    analysis,
    localization,
    sessionId,
    groundTruth: r.attack ? r.attack.cfg.type : "normal",
  };
  r.snap = { key, value };
  return value;
}

export function activeAttack() {
  return rt().attack;
}

/* ------------------------------------------------------------------ */
/* Persisted pipeline                                                  */
/* ------------------------------------------------------------------ */
export async function runDetection(snapshot?: LiveSnapshot) {
  await ensureModels();
  const snap = snapshot ?? await liveSnapshot();
  const a = snap.analysis as Analysis;
  const [row] = await db
    .insert(detectionResults)
    .values({
      sessionId: snap.sessionId,
      attackEventId: snap.attack?.eventId ?? null,
      tick: snap.t,
      bddFlag: a.bdd.flag,
      bddJ: a.bdd.j,
      bddThreshold: a.bdd.threshold,
      ifScore: a.isolationForest.score,
      ifFlag: a.isolationForest.flag,
      rfProbabilities: a.randomForest.probabilities,
      hybridFlag: a.hybrid.flag,
      predictedClass: a.hybrid.predictedClass,
      groundTruthLabel: snap.groundTruth,
      latencyMs: a.latencyMs,
      suspicious: a.suspicious,
    })
    .returning();
  return { row, snap, analysis: a };
}

export async function runLocalization(detectionId?: number, snapshot?: LiveSnapshot) {
  await ensureModels();
  const snap = snapshot ?? await liveSnapshot();
  const loc = snap.localization ?? localize(snap.observed, (snap.analysis as Analysis).se);
  const gt = snap.attack?.cfg.targetBus ?? null;
  const [row] = await db
    .insert(localizationResults)
    .values({
      detectionId: detectionId ?? null,
      attackEventId: snap.attack?.eventId ?? null,
      predictedBuses: loc.predictedBuses,
      ranked: loc.ranked.slice(0, 6),
      groundTruthBus: gt,
      correctTop1: gt ? loc.ranked[0].bus === gt : null,
      method: loc.method,
    })
    .returning();
  return { row, loc, snap };
}

export async function createIncident(opts: { detectionId: number; localizationId: number }) {
  const [det] = await db.select().from(detectionResults).where(eq(detectionResults.id, opts.detectionId));
  const [loc] = await db.select().from(localizationResults).where(eq(localizationResults.id, opts.localizationId));
  if (!det || !loc) throw new Error("Detection or localization result not found");
  if (loc.detectionId !== det.id || loc.attackEventId !== det.attackEventId) {
    throw new Error("Detection and localization must belong to the same analysis");
  }
  const probs = det.rfProbabilities;
  const pAttack = 1 - (probs.normal ?? 0);
  const ratio = det.bddJ / det.bddThreshold;
  const severity = !det.hybridFlag ? "low" : pAttack > 0.9 || ratio > 3 ? "critical" : pAttack > 0.65 || ratio > 1.5 ? "high" : "medium";
  const cls = det.predictedClass as Label;
  const top = (loc.predictedBuses[0] ?? (loc.ranked[0] as { bus: number } | undefined)?.bus) as number | undefined;
  const title = det.hybridFlag ? `${ATTACK_NAMES[cls]} suspected${top ? ` near Bus ${top}` : ""}` : `Low-confidence anomaly review${top ? ` – Bus ${top}` : ""}`;
  const summary = det.hybridFlag
    ? `Hybrid detector flagged tick ${det.tick}: classified as ${ATTACK_NAMES[cls]} (RF attack probability ${(pAttack * 100).toFixed(0)}%). Predicted suspicious bus(es): ${loc.predictedBuses.join(", ") || "none above evidence threshold"}. SIMULATED scenario – not a real-world cyber event.`
    : `Detectors did not reach a hybrid alert at tick ${det.tick}. Recorded for analyst review. SIMULATED scenario.`;
  const [inc] = await db
    .insert(incidents)
    .values({
      code: "PENDING",
      title,
      severity,
      detectedAttackType: det.hybridFlag ? cls : "normal",
      groundTruthAttackType: det.groundTruthLabel,
      predictedBuses: loc.predictedBuses,
      groundTruthBus: loc.groundTruthBus,
      detectionId: det.id,
      localizationId: loc.id,
      attackEventId: det.attackEventId,
      summary,
      details: {
        bdd: { j: det.bddJ, threshold: det.bddThreshold, flag: det.bddFlag },
        isolationForest: { score: det.ifScore, flag: det.ifFlag },
        randomForest: probs,
        latencyMs: det.latencyMs,
        suspiciousMeasurements: det.suspicious,
        localizationRanking: loc.ranked,
        localizationMethod: loc.method,
        note: "All data originates from an isolated simulation of the IEEE 14-bus network.",
      },
    })
    .returning();
  const code = `INC-${String(inc.id).padStart(4, "0")}`;
  const [done] = await db.update(incidents).set({ code }).where(eq(incidents.id, inc.id)).returning();
  return done;
}

export async function latestEvaluation() {
  const r = rt();
  if (r.models) return r.models.evaluation;
  const [row] = await db.select().from(modelEvaluations).orderBy(desc(modelEvaluations.id)).limit(1);
  return row ? (row.metrics as unknown as TrainedModels["evaluation"]) : null;
}

export async function dbCounts() {
  const [d] = await db.select({ total: sql<number>`count(*)::int`, flagged: sql<number>`count(*) filter (where ${detectionResults.hybridFlag})::int` }).from(detectionResults);
  const [i] = await db.select({ open: sql<number>`count(*) filter (where ${incidents.status} <> 'resolved')::int`, total: sql<number>`count(*)::int` }).from(incidents);
  return { detections: d.total, flagged: d.flagged, openIncidents: i.open, incidents: i.total };
}

export { M };
