import { M, METERS, N, N_STATES, measurementFunction } from "@/lib/grid/powerflow";
import { invert } from "@/lib/grid/linalg";

export interface SEResult {
  vm: Float64Array;
  va: Float64Array;
  /** raw residual z - h(x̂) (pu) */
  residual: Float64Array;
  /** normalised residuals r / sqrt(Ω_ii); 0 for excluded meters */
  rN: Float64Array;
  /** weighted sum of squares */
  J: number;
  dof: number;
  converged: boolean;
  iterations: number;
  used: Uint8Array;
}

function unpack(x: Float64Array, vm: Float64Array, va: Float64Array) {
  va[0] = 0;
  for (let i = 1; i < N; i++) va[i] = x[i - 1];
  for (let i = 0; i < N; i++) vm[i] = x[N - 1 + i];
}

function jacobian(x: Float64Array, h0: Float64Array, vm: Float64Array, va: Float64Array, H: Float64Array) {
  const step = 1e-6;
  const h1 = new Float64Array(M);
  for (let j = 0; j < N_STATES; j++) {
    const old = x[j];
    x[j] = old + step;
    unpack(x, vm, va);
    measurementFunction(vm, va, h1);
    for (let i = 0; i < M; i++) H[i * N_STATES + j] = (h1[i] - h0[i]) / step;
    x[j] = old;
  }
  unpack(x, vm, va);
}

/**
 * Weighted-least-squares AC state estimation (Gauss-Newton, flat start) with
 * normalised-residual computation. `exclude` removes suspected bad meters (LNR identification).
 */
export function stateEstimate(z: Float64Array, exclude?: Set<number>): SEResult {
  const used = new Uint8Array(M).fill(1);
  if (exclude) for (const i of exclude) used[i] = 0;
  const x = new Float64Array(N_STATES);
  for (let i = 0; i < N; i++) x[N - 1 + i] = 1;
  const vm = new Float64Array(N).fill(1);
  const va = new Float64Array(N);
  const h = new Float64Array(M);
  const H = new Float64Array(M * N_STATES);
  let converged = false;
  let it = 0;
  let Ginv: Float64Array | null = null;
  const build = () => {
    unpack(x, vm, va);
    measurementFunction(vm, va, h);
    jacobian(x, h, vm, va, H);
    const G = new Float64Array(N_STATES * N_STATES);
    const rhs = new Float64Array(N_STATES);
    for (let i = 0; i < M; i++) {
      if (!used[i]) continue;
      const w = 1 / (METERS[i].sigma * METERS[i].sigma);
      const r = z[i] - h[i];
      for (let a = 0; a < N_STATES; a++) {
        const ha = H[i * N_STATES + a];
        if (ha === 0) continue;
        rhs[a] += w * ha * r;
        for (let b = a; b < N_STATES; b++) G[a * N_STATES + b] += w * ha * H[i * N_STATES + b];
      }
    }
    for (let a = 0; a < N_STATES; a++) for (let b = 0; b < a; b++) G[a * N_STATES + b] = G[b * N_STATES + a];
    return { G, rhs };
  };
  for (; it < 12; it++) {
    const { G, rhs } = build();
    Ginv = invert(G, N_STATES);
    if (!Ginv) break;
    let maxDx = 0;
    const dx = new Float64Array(N_STATES);
    for (let a = 0; a < N_STATES; a++) {
      let s = 0;
      for (let b = 0; b < N_STATES; b++) s += Ginv[a * N_STATES + b] * rhs[b];
      dx[a] = s;
      maxDx = Math.max(maxDx, Math.abs(s));
    }
    for (let a = 0; a < N_STATES; a++) x[a] += dx[a];
    if (maxDx < 1e-6) {
      converged = true;
      it++;
      break;
    }
  }
  // final linearisation for normalised residuals
  const { G } = build();
  Ginv = invert(G, N_STATES);
  const residual = new Float64Array(M);
  const rN = new Float64Array(M);
  let J = 0;
  let nUsed = 0;
  for (let i = 0; i < M; i++) {
    residual[i] = z[i] - h[i];
    if (!used[i]) continue;
    nUsed++;
    const s = METERS[i].sigma;
    J += (residual[i] / s) ** 2;
    if (Ginv) {
      let q = 0;
      for (let a = 0; a < N_STATES; a++) {
        let t = 0;
        for (let b = 0; b < N_STATES; b++) t += Ginv[a * N_STATES + b] * H[i * N_STATES + b];
        q += H[i * N_STATES + a] * t;
      }
      const omega = s * s - q;
      rN[i] = omega > 1e-3 * s * s ? residual[i] / Math.sqrt(omega) : 0;
    }
  }
  return { vm: Float64Array.from(vm), va: Float64Array.from(va), residual, rN, J, dof: nUsed - N_STATES, converged: converged && !!Ginv, iterations: it, used };
}

/* ------------------------------------------------------------------ */
/* Conventional bad-data detection                                     */
/* ------------------------------------------------------------------ */
/** Chi-square upper quantile (Wilson-Hilferty approximation, z for alpha = 0.01). */
export function chi2Threshold(dof: number, z = 2.3263): number {
  const k = Math.max(dof, 1);
  const c = 2 / (9 * k);
  return k * Math.pow(1 - c + z * Math.sqrt(c), 3);
}

export const LNR_THRESHOLD = 4.0;

export interface BddResult {
  j: number;
  dof: number;
  threshold: number;
  maxRN: number;
  maxMeter: number;
  flagChi2: boolean;
  flagLNR: boolean;
  flag: boolean;
}

export function badDataDetection(se: SEResult): BddResult {
  const threshold = chi2Threshold(se.dof);
  let maxRN = 0;
  let maxMeter = -1;
  for (let i = 0; i < M; i++) {
    const a = Math.abs(se.rN[i]);
    if (a > maxRN) {
      maxRN = a;
      maxMeter = i;
    }
  }
  const flagChi2 = se.J > threshold || !se.converged;
  const flagLNR = maxRN > LNR_THRESHOLD;
  return { j: se.J, dof: se.dof, threshold, maxRN, maxMeter, flagChi2, flagLNR, flag: flagChi2 || flagLNR };
}

/* ------------------------------------------------------------------ */
/* Feature extraction                                                  */
/* ------------------------------------------------------------------ */
export const FEATURE_NAMES = [
  "J/dof",
  "max|rN|",
  "mean|rN| V",
  "mean|rN| P",
  "mean|rN| Q",
  "mean|rN| Pflow",
  "mean|rN| Qflow",
  "max|rN| V",
  "max|rN| P",
  "max|rN| Q",
  "max|rN| Pflow",
  "max|rN| Qflow",
  "mean rN V",
  "mean rN P",
  "mean rN Q",
  "mean rN Pflow",
  "mean rN Qflow",
  "count |rN|>3",
  "count |rN|>2",
  "top1 |rN|",
  "top2 |rN|",
  "top3 |rN|",
  "top-bus RMS rN",
] as const;

const KINDS = ["V", "P", "Q", "Pf", "Qf"] as const;

export function extractFeatures(se: SEResult): number[] {
  const absSum: Record<string, number> = { V: 0, P: 0, Q: 0, Pf: 0, Qf: 0 };
  const sSum: Record<string, number> = { V: 0, P: 0, Q: 0, Pf: 0, Qf: 0 };
  const cnt: Record<string, number> = { V: 0, P: 0, Q: 0, Pf: 0, Qf: 0 };
  const mx: Record<string, number> = { V: 0, P: 0, Q: 0, Pf: 0, Qf: 0 };
  let c3 = 0;
  let c2 = 0;
  const abs: number[] = [];
  const busSq = new Float64Array(N);
  const busN = new Float64Array(N);
  for (let i = 0; i < M; i++) {
    const k = METERS[i].kind;
    const r = se.rN[i];
    const a = Math.abs(r);
    absSum[k] += a;
    sSum[k] += r;
    cnt[k]++;
    if (a > mx[k]) mx[k] = a;
    if (a > 3) c3++;
    if (a > 2) c2++;
    abs.push(a);
    busSq[METERS[i].bus - 1] += r * r;
    busN[METERS[i].bus - 1]++;
  }
  abs.sort((a, b) => b - a);
  let topBus = 0;
  for (let b = 0; b < N; b++) topBus = Math.max(topBus, Math.sqrt(busSq[b] / busN[b]));
  return [
    se.J / Math.max(se.dof, 1),
    abs[0],
    ...KINDS.map((k) => absSum[k] / cnt[k]),
    ...KINDS.map((k) => mx[k]),
    ...KINDS.map((k) => sSum[k] / cnt[k]),
    c3,
    c2,
    abs[0],
    abs[1],
    abs[2],
    topBus,
  ];
}
