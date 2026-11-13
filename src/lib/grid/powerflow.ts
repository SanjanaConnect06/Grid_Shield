import { BASE_MVA, BRANCHES, BUSES } from "./ieee14";
import { solveLinear } from "./linalg";

export const N = BUSES.length;

/* ------------------------------------------------------------------ */
/* Admittance model (MATPOWER pi-model with off-nominal tap on from side) */
/* ------------------------------------------------------------------ */
interface BranchY {
  f: number;
  t: number;
  yffRe: number;
  yffIm: number;
  yftRe: number;
  yftIm: number;
  ytfRe: number;
  ytfIm: number;
  yttRe: number;
  yttIm: number;
}

function buildBranchY(): BranchY[] {
  return BRANCHES.map((br) => {
    const den = br.r * br.r + br.x * br.x;
    const ysRe = br.r / den;
    const ysIm = -br.x / den;
    const a = br.tap === 0 ? 1 : br.tap;
    const bc = br.b / 2;
    return {
      f: br.from - 1,
      t: br.to - 1,
      yffRe: ysRe / (a * a),
      yffIm: (ysIm + bc) / (a * a),
      yftRe: -ysRe / a,
      yftIm: -ysIm / a,
      ytfRe: -ysRe / a,
      ytfIm: -ysIm / a,
      yttRe: ysRe,
      yttIm: ysIm + bc,
    };
  });
}

const BY = buildBranchY();
export const G = new Float64Array(N * N);
export const B = new Float64Array(N * N);
(function buildYbus() {
  for (const y of BY) {
    G[y.f * N + y.f] += y.yffRe;
    B[y.f * N + y.f] += y.yffIm;
    G[y.t * N + y.t] += y.yttRe;
    B[y.t * N + y.t] += y.yttIm;
    G[y.f * N + y.t] += y.yftRe;
    B[y.f * N + y.t] += y.yftIm;
    G[y.t * N + y.f] += y.ytfRe;
    B[y.t * N + y.f] += y.ytfIm;
  }
  BUSES.forEach((b, i) => {
    B[i * N + i] += b.bs / BASE_MVA;
  });
})();

/* ------------------------------------------------------------------ */
/* Injections & flows                                                  */
/* ------------------------------------------------------------------ */
export function injections(vm: ArrayLike<number>, va: ArrayLike<number>, P: Float64Array, Q: Float64Array) {
  for (let i = 0; i < N; i++) {
    let p = 0;
    let q = 0;
    for (let k = 0; k < N; k++) {
      const g = G[i * N + k];
      const b = B[i * N + k];
      if (g === 0 && b === 0) continue;
      const th = va[i] - va[k];
      const c = Math.cos(th);
      const s = Math.sin(th);
      p += vm[k] * (g * c + b * s);
      q += vm[k] * (g * s - b * c);
    }
    P[i] = vm[i] * p;
    Q[i] = vm[i] * q;
  }
}

export interface Flow {
  pf: number;
  qf: number;
  pt: number;
  qt: number;
}

export function branchFlow(k: number, vm: ArrayLike<number>, va: ArrayLike<number>): Flow {
  const y = BY[k];
  const vfRe = vm[y.f] * Math.cos(va[y.f]);
  const vfIm = vm[y.f] * Math.sin(va[y.f]);
  const vtRe = vm[y.t] * Math.cos(va[y.t]);
  const vtIm = vm[y.t] * Math.sin(va[y.t]);
  // I_f = yff Vf + yft Vt ; I_t = ytf Vf + ytt Vt
  const ifRe = y.yffRe * vfRe - y.yffIm * vfIm + y.yftRe * vtRe - y.yftIm * vtIm;
  const ifIm = y.yffRe * vfIm + y.yffIm * vfRe + y.yftRe * vtIm + y.yftIm * vtRe;
  const itRe = y.ytfRe * vfRe - y.ytfIm * vfIm + y.yttRe * vtRe - y.yttIm * vtIm;
  const itIm = y.ytfRe * vfIm + y.ytfIm * vfRe + y.yttRe * vtIm + y.yttIm * vtRe;
  // S = V conj(I)
  return {
    pf: vfRe * ifRe + vfIm * ifIm,
    qf: vfIm * ifRe - vfRe * ifIm,
    pt: vtRe * itRe + vtIm * itIm,
    qt: vtIm * itRe - vtRe * itIm,
  };
}

/** Branch current magnitude (pu) at the from end. */
export function branchCurrentPu(k: number, vm: ArrayLike<number>, va: ArrayLike<number>): number {
  const f = branchFlow(k, vm, va);
  return Math.hypot(f.pf, f.qf) / Math.max(vm[BY[k].f], 1e-6);
}

/* ------------------------------------------------------------------ */
/* Newton-Raphson AC power flow                                        */
/* ------------------------------------------------------------------ */
export interface PowerFlowResult {
  vm: Float64Array;
  va: Float64Array; // radians
  converged: boolean;
  iterations: number;
  maxMismatch: number;
  pInj: Float64Array; // pu net injection
  qInj: Float64Array;
}

const pqIdx = BUSES.map((b, i) => (b.type === "pq" ? i : -1)).filter((i) => i >= 0);
const nonSlack = BUSES.map((b, i) => (b.type !== "slack" ? i : -1)).filter((i) => i >= 0);

export function solvePowerFlow(loadFactor: ArrayLike<number>): PowerFlowResult {
  const pSpec = new Float64Array(N);
  const qSpec = new Float64Array(N);
  BUSES.forEach((b, i) => {
    pSpec[i] = (b.pg - b.pd * loadFactor[i]) / BASE_MVA;
    qSpec[i] = (-b.qd * loadFactor[i]) / BASE_MVA;
  });
  const vm = new Float64Array(N);
  const va = new Float64Array(N);
  BUSES.forEach((b, i) => {
    vm[i] = b.type === "pq" ? 1 : b.vset;
  });
  const nu = nonSlack.length + pqIdx.length;
  const P = new Float64Array(N);
  const Q = new Float64Array(N);
  const F = new Float64Array(nu);
  const mismatch = (out: Float64Array) => {
    injections(vm, va, P, Q);
    let r = 0;
    for (const i of nonSlack) out[r++] = P[i] - pSpec[i];
    for (const i of pqIdx) out[r++] = Q[i] - qSpec[i];
  };
  const apply = (u: Float64Array, sign: number) => {
    let r = 0;
    for (const i of nonSlack) va[i] += sign * u[r++];
    for (const i of pqIdx) vm[i] += sign * u[r++];
  };
  let converged = false;
  let it = 0;
  let maxMis = Infinity;
  for (; it < 25; it++) {
    mismatch(F);
    maxMis = 0;
    for (let i = 0; i < nu; i++) maxMis = Math.max(maxMis, Math.abs(F[i]));
    if (maxMis < 1e-9) {
      converged = true;
      break;
    }
    // numerical Jacobian (forward difference)
    const J = new Float64Array(nu * nu);
    const F2 = new Float64Array(nu);
    const h = 1e-7;
    const du = new Float64Array(nu);
    for (let c = 0; c < nu; c++) {
      du.fill(0);
      du[c] = h;
      apply(du, 1);
      mismatch(F2);
      apply(du, -1);
      for (let r = 0; r < nu; r++) J[r * nu + c] = (F2[r] - F[r]) / h;
    }
    const dx = solveLinear(J, F, nu);
    if (!dx) break;
    apply(dx, -1);
  }
  injections(vm, va, P, Q);
  return { vm, va, converged, iterations: it, maxMismatch: maxMis, pInj: P.slice(), qInj: Q.slice() };
}

/* ------------------------------------------------------------------ */
/* Measurement model                                                   */
/* ------------------------------------------------------------------ */
export type MeterKind = "V" | "P" | "Q" | "Pf" | "Qf";

export interface Meter {
  idx: number;
  id: string;
  kind: MeterKind;
  /** Bus (1-based) where the RTU/meter is physically installed. */
  bus: number;
  branch?: number;
  end?: "from" | "to";
  sigma: number;
  label: string;
  unit: string;
}

export const SIGMA = { V: 0.004, P: 0.01, Q: 0.01, Pf: 0.008, Qf: 0.008 } as const;

function buildMeters(): Meter[] {
  const m: Meter[] = [];
  const push = (x: Omit<Meter, "idx">) => m.push({ ...x, idx: m.length });
  BUSES.forEach((b) => push({ id: `V@${b.id}`, kind: "V", bus: b.id, sigma: SIGMA.V, label: `Voltage magnitude, bus ${b.id}`, unit: "pu" }));
  BUSES.forEach((b) => push({ id: `P@${b.id}`, kind: "P", bus: b.id, sigma: SIGMA.P, label: `Active power injection, bus ${b.id}`, unit: "MW" }));
  BUSES.forEach((b) => push({ id: `Q@${b.id}`, kind: "Q", bus: b.id, sigma: SIGMA.Q, label: `Reactive power injection, bus ${b.id}`, unit: "MVAr" }));
  for (const kind of ["Pf", "Qf"] as const) {
    BRANCHES.forEach((br) => {
      for (const end of ["from", "to"] as const) {
        const bus = end === "from" ? br.from : br.to;
        push({
          id: `${kind}:L${br.id + 1}@${bus}`,
          kind,
          bus,
          branch: br.id,
          end,
          sigma: SIGMA[kind],
          label: `${kind === "Pf" ? "Active" : "Reactive"} flow, line ${br.from}-${br.to}, metered at bus ${bus}`,
          unit: kind === "Pf" ? "MW" : "MVAr",
        });
      }
    });
  }
  return m;
}

export const METERS: Meter[] = buildMeters();
export const M = METERS.length;
export const N_STATES = 2 * N - 1; // theta (13, slack fixed) + |V| (14)

const _P = new Float64Array(N);
const _Q = new Float64Array(N);

/** Noise-free measurement function h(V, theta) in per-unit. */
export function measurementFunction(vm: ArrayLike<number>, va: ArrayLike<number>, out: Float64Array): Float64Array {
  injections(vm, va, _P, _Q);
  for (let i = 0; i < N; i++) {
    out[i] = vm[i];
    out[N + i] = _P[i];
    out[2 * N + i] = _Q[i];
  }
  const base = 3 * N;
  const nb = BRANCHES.length;
  for (let k = 0; k < nb; k++) {
    const f = branchFlow(k, vm, va);
    out[base + 2 * k] = f.pf;
    out[base + 2 * k + 1] = f.pt;
    out[base + 2 * nb + 2 * k] = f.qf;
    out[base + 2 * nb + 2 * k + 1] = f.qt;
  }
  return out;
}

/** Convert per-unit meter value to engineering unit. */
export function toEngineering(m: Meter, pu: number): number {
  return m.kind === "V" ? pu : pu * BASE_MVA;
}
export function fromEngineering(m: Meter, v: number): number {
  return m.kind === "V" ? v : v / BASE_MVA;
}

export const METERS_BY_BUS: number[][] = Array.from({ length: N }, () => []);
METERS.forEach((m) => METERS_BY_BUS[m.bus - 1].push(m.idx));
