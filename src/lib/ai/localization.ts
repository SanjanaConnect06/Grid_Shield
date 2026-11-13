import { adjacency } from "@/lib/grid/ieee14";
import { METERS, METERS_BY_BUS, N } from "@/lib/grid/powerflow";
import { stateEstimate, type SEResult } from "./estimation";

/* ------------------------------------------------------------------ */
/* Graph utilities on the IEEE 14-bus topology (NetworkX-equivalent)    */
/* ------------------------------------------------------------------ */
const ADJ = adjacency();

export function hopDistances(src: number): number[] {
  const dist = new Array(N).fill(Infinity);
  dist[src - 1] = 0;
  const q = [src - 1];
  while (q.length) {
    const u = q.shift() as number;
    for (const v of ADJ[u]) {
      if (dist[v] === Infinity) {
        dist[v] = dist[u] + 1;
        q.push(v);
      }
    }
  }
  return dist;
}

export function hopDistance(a: number, b: number): number {
  return hopDistances(a)[b - 1];
}

export function neighbours(bus: number): number[] {
  return ADJ[bus - 1].map((i) => i + 1);
}

/* ------------------------------------------------------------------ */
/* Localization                                                        */
/* ------------------------------------------------------------------ */
export interface EvidenceItem {
  meterId: string;
  label: string;
  rN: number;
  removedByLNR: boolean;
}

export interface BusCandidate {
  bus: number;
  score: number;
  rms: number;
  deltaJ: number;
  neighbourMean: number;
  /** Share of total evidence – a relative ranking weight, NOT a calibrated probability. */
  evidenceShare: number;
  evidence: EvidenceItem[];
}

export interface LocalizationOutput {
  ranked: BusCandidate[];
  predictedBuses: number[];
  removedMeters: { meterId: string; rN: number; bus: number }[];
  significant: boolean;
  calibrated: false;
  method: string;
}

const Z_SIGNIFICANT = 3.0;

/**
 * Locate compromised buses from the OBSERVED measurement vector only (the simulated attack
 * target is never an input):
 *  1. WLS state estimation → J statistic and normalised residuals per meter.
 *  2. Meter-to-bus mapping: each meter belongs to the bus where it is installed.
 *  3. Bus-level hypothesis test by measurement elimination: for every bus, discard all of its meters,
 *     re-estimate, and measure the drop in J. Under "bus is clean" the drop is χ² with k = lost degrees
 *     of freedom, so ΔJ is corrected by k and standardised by √(2k) → a z-score evidence value.
 *  4. Graph topology: neighbour evidence is reported and hop distance is used for scoring/evaluation.
 */
export function localize(z: Float64Array, first?: SEResult): LocalizationOutput {
  const se0 = first ?? stateEstimate(z);
  const rms = new Array(N).fill(0);
  const dJ = new Array(N).fill(0);
  const zs = new Array(N).fill(0);
  for (let b = 0; b < N; b++) {
    const ids = METERS_BY_BUS[b];
    let sq = 0;
    for (const i of ids) sq += se0.rN[i] ** 2;
    rms[b] = Math.sqrt(sq / ids.length);
    const se = stateEstimate(z, new Set(ids));
    if (!se.converged) continue;
    const k = se0.dof - se.dof;
    if (k <= 0) continue;
    dJ[b] = se0.J - se.J - k;
    zs[b] = dJ[b] / Math.sqrt(2 * k);
  }
  const score = zs.map((v) => Math.max(0, v));
  const total = score.reduce((a, c) => a + c, 0) || 1;
  const ranked: BusCandidate[] = score
    .map((s, b) => {
      const nb = ADJ[b];
      const nm = nb.reduce((a, j) => a + score[j], 0) / Math.max(nb.length, 1);
      const evidence = METERS_BY_BUS[b]
        .map((i) => ({ meterId: METERS[i].id, label: METERS[i].label, rN: se0.rN[i], removedByLNR: Math.abs(se0.rN[i]) > 3 }))
        .sort((x, y) => Math.abs(y.rN) - Math.abs(x.rN))
        .slice(0, 5);
      return { bus: b + 1, score: s, rms: rms[b], deltaJ: dJ[b], neighbourMean: nm, evidenceShare: s / total, evidence };
    })
    .sort((a, b) => b.score - a.score);
  const top = ranked[0].score;
  const significant = top > Z_SIGNIFICANT;
  const predictedBuses = significant ? ranked.filter((c) => c.score >= 0.5 * top && c.score > Z_SIGNIFICANT).slice(0, 3).map((c) => c.bus) : [];
  const flagged = ranked[0].evidence.filter((e) => Math.abs(e.rN) > 3).map((e) => ({ meterId: e.meterId, rN: e.rN, bus: ranked[0].bus }));
  return {
    ranked,
    predictedBuses,
    removedMeters: significant ? flagged : [],
    significant,
    calibrated: false,
    method: "WLS residual analysis + per-bus measurement-elimination test (standardised ΔJ) on the IEEE 14-bus topology graph",
  };
}
