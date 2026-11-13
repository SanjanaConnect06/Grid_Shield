import { LABELS, ATTACK_NAMES, applyAttack, groupMeters, makeFrame, type AttackConfig, type Label, type MeasurementGroup } from "@/lib/sim/frames";
import { M, METERS, N, SIGMA } from "@/lib/grid/powerflow";
import { mulberry32, randInt, shuffle, type Rng } from "@/lib/grid/rng";
import { badDataDetection, extractFeatures, stateEstimate, FEATURE_NAMES, type BddResult, type SEResult } from "./estimation";
import { IsolationForest } from "./iforest";
import { RandomForest } from "./rforest";
import { hopDistance, localize } from "./localization";

export const DATASET_SEED = 2026;
const PER_CLASS = 400;
const SPLIT = { train: 0.6, val: 0.15, test: 0.25 };
const IF_CORROBORATE = 0.25;

const tick = () => new Promise<void>((r) => setImmediate(r));

/* ------------------------------------------------------------------ */
export interface Sample {
  features: number[];
  label: number;
  z: Float64Array;
  target?: number;
}

const ALL_GROUPS: MeasurementGroup[] = ["voltage", "active_power", "reactive_power"];

function randomConfig(rng: Rng, label: Label): AttackConfig {
  let groups = ALL_GROUPS.filter(() => rng() < 0.6);
  if (groups.length === 0) groups = [ALL_GROUPS[randInt(rng, 0, 2)]];
  return {
    type: label as AttackConfig["type"],
    targetBus: randInt(rng, 1, N),
    intensity: 0.2 + 0.8 * rng(),
    groups,
    sign: rng() < 0.5 ? 1 : -1,
  };
}

function makeSample(rng: Rng, labelIdx: number): Sample {
  const label = LABELS[labelIdx];
  const t = randInt(rng, 200, 8000);
  const salt = randInt(rng, 0, 1_000_000_000);
  const frame = makeFrame(t, salt);
  let z = frame.original;
  let target: number | undefined;
  if (label !== "normal") {
    const cfg = randomConfig(rng, label);
    // guard: a configuration that tampers nothing is relabelled by re-drawing the target
    let att = applyAttack(frame, cfg, salt);
    let guard = 0;
    while (att.tampered.length === 0 && guard++ < 10) {
      cfg.targetBus = randInt(rng, 1, N);
      att = applyAttack(frame, cfg, salt);
    }
    z = att.observed;
    target = cfg.targetBus;
  }
  const se = stateEstimate(z);
  return { features: extractFeatures(se), label: labelIdx, z, target };
}

/* ------------------------------------------------------------------ */
export interface BinaryMetrics {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  fpr: number;
}

function binary(pred: boolean[], truth: boolean[]): BinaryMetrics {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  pred.forEach((p, i) => {
    if (p && truth[i]) tp++;
    else if (p && !truth[i]) fp++;
    else if (!p && !truth[i]) tn++;
    else fn++;
  });
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  return {
    tp, fp, tn, fn,
    accuracy: (tp + tn) / pred.length,
    precision,
    recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    fpr: fp + tn ? fp / (fp + tn) : 0,
  };
}

export interface Evaluation {
  seed: number;
  trainedAt: string;
  trainingSeconds: number;
  dataset: {
    perClass: number;
    total: number;
    train: number;
    validation: number;
    test: number;
    testPerClass: Record<string, number>;
    features: number;
    meters: number;
    noiseSigma: typeof SIGMA;
  };
  thresholds: { isolationForest: number; randomForest: number; chi2Alpha: number; lnr: number; fusionRule: string };
  detection: { bdd: BinaryMetrics; isolationForest: BinaryMetrics; randomForest: BinaryMetrics; hybrid: BinaryMetrics };
  classification: {
    labels: string[];
    confusion: number[][];
    accuracy: number;
    macroF1: number;
    perClass: { label: string; precision: number; recall: number; f1: number; support: number }[];
  };
  latency: { meanMs: number; p95Ms: number };
  localization: {
    evaluated: number;
    top1: number;
    top3: number;
    meanHopError: number;
    perType: { label: string; n: number; top1: number; top3: number }[];
  };
  featureImportance: { name: string; importance: number }[];
  methodology: string[];
}

export interface TrainedModels {
  iforest: IsolationForest;
  rf: RandomForest;
  ifThreshold: number;
  rfThreshold: number;
  evaluation: Evaluation;
}

/* ------------------------------------------------------------------ */
/* Training                                                            */
/* ------------------------------------------------------------------ */
export async function trainModels(seed = DATASET_SEED): Promise<TrainedModels> {
  const t0 = performance.now();
  const rng = mulberry32(seed);
  const splits: Record<"train" | "val" | "test", Sample[]> = { train: [], val: [], test: [] };
  for (let c = 0; c < LABELS.length; c++) {
    const samples: Sample[] = [];
    for (let i = 0; i < PER_CLASS; i++) {
      samples.push(makeSample(rng, c));
      if (i % 40 === 0) await tick();
    }
    const nTrain = Math.round(PER_CLASS * SPLIT.train);
    const nVal = Math.round(PER_CLASS * SPLIT.val);
    const sh = shuffle(samples, rng);
    splits.train.push(...sh.slice(0, nTrain));
    splits.val.push(...sh.slice(nTrain, nTrain + nVal));
    splits.test.push(...sh.slice(nTrain + nVal));
  }

  // --- fit (training split ONLY) ---
  const normalTrain = splits.train.filter((s) => s.label === 0).map((s) => s.features);
  const iforest = new IsolationForest(100, 128).fit(normalTrain, mulberry32(seed + 1));
  const rf = new RandomForest(60, 10, 2, LABELS.length).fit(
    splits.train.map((s) => s.features),
    splits.train.map((s) => s.label),
    mulberry32(seed + 2),
  );
  await tick();

  // --- threshold calibration (validation split ONLY): 95th percentile of normal scores ---
  const valNormal = splits.val.filter((s) => s.label === 0).map((s) => iforest.score(s.features)).sort((a, b) => a - b);
  const ifThreshold = valNormal[Math.floor(0.95 * (valNormal.length - 1))];
  const valNormalRf = splits.val.filter((s) => s.label === 0).map((s) => 1 - rf.predictProba(s.features)[0]).sort((a, b) => a - b);
  const rfThreshold = Math.min(0.6, Math.max(0.3, valNormalRf[Math.floor(0.95 * (valNormalRf.length - 1))]));

  // --- final evaluation on untouched test split ---
  const preds = { bdd: [] as boolean[], iforest: [] as boolean[], rf: [] as boolean[], hybrid: [] as boolean[] };
  const truthAttack: boolean[] = [];
  const confusion = LABELS.map(() => LABELS.map(() => 0));
  const lat: number[] = [];
  const locAgg: Record<string, { n: number; t1: number; t3: number }> = {};
  let locN = 0, locT1 = 0, locT3 = 0, hopSum = 0;
  let k = 0;
  const models: TrainedModels = { iforest, rf, ifThreshold, rfThreshold, evaluation: undefined as unknown as Evaluation };
  for (const s of splits.test) {
    const ts = performance.now();
    const a = analyzeVector(s.z, models);
    lat.push(performance.now() - ts);
    preds.bdd.push(a.bdd.flag);
    preds.iforest.push(a.isolationForest.flag);
    preds.rf.push(a.randomForest.attackProbability >= rfThreshold);
    preds.hybrid.push(a.hybrid.flag);
    truthAttack.push(s.label !== 0);
    const predIdx = LABELS.indexOf(a.hybrid.predictedClass);
    confusion[s.label][predIdx]++;
    if (s.label !== 0 && a.hybrid.flag && s.target) {
      const loc = localize(s.z, a.se);
      locN++;
      const top1 = loc.ranked[0].bus === s.target;
      const top3 = loc.ranked.slice(0, 3).some((c) => c.bus === s.target);
      if (top1) locT1++;
      if (top3) locT3++;
      hopSum += hopDistance(loc.ranked[0].bus, s.target);
      const lab = LABELS[s.label];
      locAgg[lab] ??= { n: 0, t1: 0, t3: 0 };
      locAgg[lab].n++;
      if (top1) locAgg[lab].t1++;
      if (top3) locAgg[lab].t3++;
    }
    if (++k % 30 === 0) await tick();
  }
  lat.sort((x, y) => x - y);
  const perClass = LABELS.map((l, i) => {
    const tp = confusion[i][i];
    const fp = confusion.reduce((acc, row, r) => acc + (r !== i ? row[i] : 0), 0);
    const fn = confusion[i].reduce((acc, v, c) => acc + (c !== i ? v : 0), 0);
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    return { label: l, precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0, support: confusion[i].reduce((a, b) => a + b, 0) };
  });
  const correct = confusion.reduce((acc, row, i) => acc + row[i], 0);
  const nTest = splits.test.length;
  const testPerClass: Record<string, number> = {};
  LABELS.forEach((l, i) => (testPerClass[l] = confusion[i].reduce((a, b) => a + b, 0)));
  const imp = Array.from(rf.importance)
    .map((v, i) => ({ name: FEATURE_NAMES[i], importance: v }))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10);

  const evaluation: Evaluation = {
    seed,
    trainedAt: new Date().toISOString(),
    trainingSeconds: (performance.now() - t0) / 1000,
    dataset: {
      perClass: PER_CLASS,
      total: PER_CLASS * LABELS.length,
      train: splits.train.length,
      validation: splits.val.length,
      test: nTest,
      testPerClass,
      features: FEATURE_NAMES.length,
      meters: M,
      noiseSigma: SIGMA,
    },
    thresholds: {
      isolationForest: ifThreshold,
      randomForest: rfThreshold,
      chi2Alpha: 0.01,
      lnr: 4.0,
      fusionRule: `ALERT if (BDD) OR (RF attack probability ≥ ${rfThreshold.toFixed(2)}) OR (Isolation Forest flag AND RF attack probability ≥ ${IF_CORROBORATE})`,
    },
    detection: {
      bdd: binary(preds.bdd, truthAttack),
      isolationForest: binary(preds.iforest, truthAttack),
      randomForest: binary(preds.rf, truthAttack),
      hybrid: binary(preds.hybrid, truthAttack),
    },
    classification: {
      labels: LABELS.map((l) => ATTACK_NAMES[l]),
      confusion,
      accuracy: correct / nTest,
      macroF1: perClass.reduce((a, c) => a + c.f1, 0) / perClass.length,
      perClass: perClass.map((p) => ({ ...p, label: ATTACK_NAMES[p.label as Label] })),
    },
    latency: { meanMs: lat.reduce((a, b) => a + b, 0) / lat.length, p95Ms: lat[Math.floor(0.95 * (lat.length - 1))] },
    localization: {
      evaluated: locN,
      top1: locN ? locT1 / locN : 0,
      top3: locN ? locT3 / locN : 0,
      meanHopError: locN ? hopSum / locN : 0,
      perType: Object.entries(locAgg).map(([l, v]) => ({ label: ATTACK_NAMES[l as Label], n: v.n, top1: v.t1 / v.n, top3: v.t3 / v.n })),
    },
    featureImportance: imp,
    methodology: [
      `Labelled scenarios are generated from IEEE 14-bus AC power-flow solutions with a time-varying load profile, Gaussian meter noise and seed ${seed} (fully reproducible).`,
      `${PER_CLASS} scenarios per class (normal, false data injection, replay, data manipulation) with random target bus, intensity, measurement groups and sign.`,
      "Stratified split: 60% train / 15% validation / 25% test. Test scenarios are never used for fitting or threshold selection.",
      "Isolation Forest is fitted on normal TRAIN scenarios only; its alert threshold is the 95th percentile of normal VALIDATION scores.",
      "Random Forest is fitted on TRAIN scenarios only. Features are residual statistics from WLS state estimation – no ground-truth labels or target buses are used as inputs.",
      `Random Forest alert threshold is the 95th percentile of normal VALIDATION attack-probabilities (clipped to 0.3-0.6). Hybrid alert = BDD OR RF ≥ threshold OR (Isolation Forest AND RF ≥ ${IF_CORROBORATE}). Class = Random Forest argmax among attack classes.`,
      "Localization is evaluated only on test attacks that the hybrid detector flagged; the true target bus is used solely to score the result.",
      "All figures are measured on simulated data. They do not represent performance on real utility telemetry or real cyber operations.",
    ],
  };
  models.evaluation = evaluation;
  return models;
}

/* ------------------------------------------------------------------ */
/* Inference                                                           */
/* ------------------------------------------------------------------ */
export interface SuspiciousMeasurement {
  meterId: string;
  label: string;
  bus: number;
  rN: number;
  unit: string;
}

export interface Analysis {
  bdd: BddResult;
  isolationForest: { score: number; threshold: number; flag: boolean };
  randomForest: { probabilities: Record<string, number>; attackProbability: number; threshold: number; flag: boolean };
  hybrid: { flag: boolean; votes: number; predictedClass: Label; classProbabilities: Record<string, number> };
  suspicious: SuspiciousMeasurement[];
  latencyMs: number;
  se: SEResult;
  features: number[];
}

export function analyzeVector(z: Float64Array, models: TrainedModels): Analysis {
  const t0 = performance.now();
  const se = stateEstimate(z);
  const features = extractFeatures(se);
  const bdd = badDataDetection(se);
  const ifScore = models.iforest.score(features);
  const ifFlag = ifScore > models.ifThreshold;
  const probs = models.rf.predictProba(features);
  const pAttack = 1 - probs[0];
  const rfFlag = pAttack >= models.rfThreshold;
  const votes = Number(bdd.flag) + Number(ifFlag) + Number(rfFlag);
  const flag = bdd.flag || rfFlag || (ifFlag && pAttack >= IF_CORROBORATE);
  let cls: Label = "normal";
  const attackSum = probs[1] + probs[2] + probs[3] || 1;
  if (flag) {
    let bi = 1;
    for (let i = 2; i < LABELS.length; i++) if (probs[i] > probs[bi]) bi = i;
    cls = LABELS[bi];
  }
  const classProbabilities: Record<string, number> = { normal: probs[0] };
  for (let i = 1; i < LABELS.length; i++) classProbabilities[LABELS[i]] = probs[i];
  void attackSum;
  const order = Array.from(se.rN, (v, i) => ({ i, a: Math.abs(v) })).sort((a, b) => b.a - a.a).slice(0, 8);
  const suspicious = order
    .filter((o) => o.a > 2)
    .map((o) => ({ meterId: METERS[o.i].id, label: METERS[o.i].label, bus: METERS[o.i].bus, rN: se.rN[o.i], unit: METERS[o.i].unit }));
  return {
    bdd,
    isolationForest: { score: ifScore, threshold: models.ifThreshold, flag: ifFlag },
    randomForest: { probabilities: classProbabilities, attackProbability: pAttack, threshold: models.rfThreshold, flag: rfFlag },
    hybrid: { flag, votes, predictedClass: cls, classProbabilities },
    suspicious,
    latencyMs: performance.now() - t0,
    se,
    features,
  };
}

export { groupMeters };
