import { N, M, METERS, METERS_BY_BUS, solvePowerFlow, measurementFunction, type PowerFlowResult } from "@/lib/grid/powerflow";
import { gauss, mulberry32 } from "@/lib/grid/rng";

export type AttackType = "false_data_injection" | "replay" | "data_manipulation";
export type MeasurementGroup = "voltage" | "active_power" | "reactive_power";
export type Label = "normal" | AttackType;

export const ATTACK_TYPES: AttackType[] = ["false_data_injection", "replay", "data_manipulation"];
export const LABELS: Label[] = ["normal", ...ATTACK_TYPES];
export const ATTACK_NAMES: Record<Label, string> = {
  normal: "Normal operation",
  false_data_injection: "False Data Injection",
  replay: "Replay Attack",
  data_manipulation: "Data Manipulation",
};

export interface AttackConfig {
  type: AttackType;
  targetBus: number; // 1-based
  intensity: number; // 0.05 - 1
  groups: MeasurementGroup[];
  sign: 1 | -1;
}

/** Time-varying demand profile (daily-load-like curve compressed into simulation ticks). */
export function loadFactors(t: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    out.push(1 + 0.12 * Math.sin((2 * Math.PI * t) / 240) + 0.04 * Math.sin((2 * Math.PI * t) / 70 + i * 0.9));
  }
  return out;
}

/** Synthetic frequency from a simple droop relation on aggregate demand (not a dynamic simulation). */
export function frequencyAt(t: number, salt: number): number {
  const lf = loadFactors(t);
  const avg = lf.reduce((a, b) => a + b, 0) / lf.length;
  const rng = mulberry32(hashSeed(t, salt + 77));
  return 50 - 0.6 * (avg - 1) + 0.008 * gauss(rng);
}

export function hashSeed(t: number, salt: number): number {
  let h = (Math.imul(t | 0, 2654435761) ^ Math.imul((salt | 0) + 0x9e3779b9, 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  return h;
}

const pfCache = new Map<number, PowerFlowResult>();
export function truePowerFlow(t: number): PowerFlowResult {
  const hit = pfCache.get(t);
  if (hit) return hit;
  const pf = solvePowerFlow(loadFactors(t));
  pfCache.set(t, pf);
  if (pfCache.size > 600) pfCache.delete(pfCache.keys().next().value as number);
  return pf;
}

export interface Frame {
  t: number;
  pf: PowerFlowResult;
  /** Noise-free model values (pu). */
  truth: Float64Array;
  /** Original (clean, noisy) sensor readings in per-unit. */
  original: Float64Array;
}

export function makeFrame(t: number, salt: number): Frame {
  const pf = truePowerFlow(t);
  const truth = measurementFunction(pf.vm, pf.va, new Float64Array(M));
  const rng = mulberry32(hashSeed(t, salt));
  const original = new Float64Array(M);
  for (let i = 0; i < M; i++) original[i] = truth[i] + METERS[i].sigma * gauss(rng);
  return { t, pf, truth, original };
}

export function groupMeters(bus: number, groups: MeasurementGroup[]): number[] {
  return METERS_BY_BUS[bus - 1].filter((idx) => {
    const k = METERS[idx].kind;
    if (k === "V") return groups.includes("voltage");
    if (k === "P" || k === "Pf") return groups.includes("active_power");
    return groups.includes("reactive_power");
  });
}

export function replayLag(intensity: number): number {
  return Math.round(15 + 105 * intensity);
}

export interface AttackedFrame {
  observed: Float64Array;
  tampered: number[];
}

/**
 * Apply a simulated attack. `original` is never mutated – the attacked vector is a copy so that
 * both original and attacked data are preserved with ground-truth labels.
 */
export function applyAttack(frame: Frame, cfg: AttackConfig, salt: number): AttackedFrame {
  const observed = frame.original.slice();
  const idxs = groupMeters(cfg.targetBus, cfg.groups);
  const bi = cfg.targetBus - 1;
  if (cfg.type === "false_data_injection") {
    // Attacker biases the local state estimate: V and theta at the target bus are shifted and the
    // locally-compromised meters are made consistent with that false state (others are untouched).
    const vm = Float64Array.from(frame.pf.vm);
    const va = Float64Array.from(frame.pf.va);
    vm[bi] += cfg.sign * 0.06 * cfg.intensity;
    va[bi] += cfg.sign * 0.08 * cfg.intensity;
    const falsified = measurementFunction(vm, va, new Float64Array(M));
    for (const i of idxs) observed[i] += falsified[i] - frame.truth[i];
  } else if (cfg.type === "replay") {
    const lag = replayLag(cfg.intensity);
    const old = makeFrame(Math.max(0, frame.t - lag), salt);
    for (const i of idxs) observed[i] = old.original[i];
  } else {
    for (const i of idxs) {
      const m = METERS[i];
      if (m.kind === "V") observed[i] = observed[i] * (1 - cfg.sign * 0.06 * cfg.intensity);
      else observed[i] = observed[i] * (1 - cfg.sign * 0.35 * cfg.intensity) - cfg.sign * 0.03 * cfg.intensity;
    }
  }
  const tampered = idxs.filter((i) => Math.abs(observed[i] - frame.original[i]) > 1e-9);
  return { observed, tampered };
}
