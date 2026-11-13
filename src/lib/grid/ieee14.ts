/**
 * IEEE 14-bus benchmark (MATPOWER case14 / pandapower `case14` data).
 * These are the published benchmark parameters – nothing here is invented or random.
 * Per-unit values on a 100 MVA base.
 */
export const BASE_MVA = 100;

export interface BusData {
  id: number; // 1-based bus number
  name: string;
  type: "slack" | "pv" | "pq";
  pd: number; // MW
  qd: number; // MVAr
  bs: number; // shunt susceptance MVAr at 1.0 pu
  vset: number; // voltage set-point for slack/PV buses (pu)
  pg: number; // scheduled generation MW (non-slack)
  zone: "generation" | "transmission" | "distribution";
}

export const BUSES: BusData[] = [
  { id: 1, name: "Bus 1 (Slack)", type: "slack", pd: 0, qd: 0, bs: 0, vset: 1.06, pg: 0, zone: "generation" },
  { id: 2, name: "Bus 2", type: "pv", pd: 21.7, qd: 12.7, bs: 0, vset: 1.045, pg: 40, zone: "generation" },
  { id: 3, name: "Bus 3", type: "pv", pd: 94.2, qd: 19, bs: 0, vset: 1.01, pg: 0, zone: "generation" },
  { id: 4, name: "Bus 4", type: "pq", pd: 47.8, qd: -3.9, bs: 0, vset: 1, pg: 0, zone: "transmission" },
  { id: 5, name: "Bus 5", type: "pq", pd: 7.6, qd: 1.6, bs: 0, vset: 1, pg: 0, zone: "transmission" },
  { id: 6, name: "Bus 6", type: "pv", pd: 11.2, qd: 7.5, bs: 0, vset: 1.07, pg: 0, zone: "generation" },
  { id: 7, name: "Bus 7", type: "pq", pd: 0, qd: 0, bs: 0, vset: 1, pg: 0, zone: "transmission" },
  { id: 8, name: "Bus 8", type: "pv", pd: 0, qd: 0, bs: 0, vset: 1.09, pg: 0, zone: "generation" },
  { id: 9, name: "Bus 9", type: "pq", pd: 29.5, qd: 16.6, bs: 19, vset: 1, pg: 0, zone: "distribution" },
  { id: 10, name: "Bus 10", type: "pq", pd: 9, qd: 5.8, bs: 0, vset: 1, pg: 0, zone: "distribution" },
  { id: 11, name: "Bus 11", type: "pq", pd: 3.5, qd: 1.8, bs: 0, vset: 1, pg: 0, zone: "distribution" },
  { id: 12, name: "Bus 12", type: "pq", pd: 6.1, qd: 1.6, bs: 0, vset: 1, pg: 0, zone: "distribution" },
  { id: 13, name: "Bus 13", type: "pq", pd: 13.5, qd: 5.8, bs: 0, vset: 1, pg: 0, zone: "distribution" },
  { id: 14, name: "Bus 14", type: "pq", pd: 14.9, qd: 5, bs: 0, vset: 1, pg: 0, zone: "distribution" },
];

export interface BranchData {
  id: number; // 0-based index
  from: number; // bus id
  to: number; // bus id
  r: number;
  x: number;
  b: number;
  tap: number; // 0 => no transformer (ratio 1)
}

const RAW: [number, number, number, number, number, number][] = [
  [1, 2, 0.01938, 0.05917, 0.0528, 0],
  [1, 5, 0.05403, 0.22304, 0.0492, 0],
  [2, 3, 0.04699, 0.19797, 0.0438, 0],
  [2, 4, 0.05811, 0.17632, 0.034, 0],
  [2, 5, 0.05695, 0.17388, 0.0346, 0],
  [3, 4, 0.06701, 0.17103, 0.0128, 0],
  [4, 5, 0.01335, 0.04211, 0, 0],
  [4, 7, 0, 0.20912, 0, 0.978],
  [4, 9, 0, 0.55618, 0, 0.969],
  [5, 6, 0, 0.25202, 0, 0.932],
  [6, 11, 0.09498, 0.1989, 0, 0],
  [6, 12, 0.12291, 0.25581, 0, 0],
  [6, 13, 0.06615, 0.13027, 0, 0],
  [7, 8, 0, 0.17615, 0, 0],
  [7, 9, 0, 0.11001, 0, 0],
  [9, 10, 0.03181, 0.0845, 0, 0],
  [9, 14, 0.12711, 0.27038, 0, 0],
  [10, 11, 0.08205, 0.19207, 0, 0],
  [12, 13, 0.22092, 0.19988, 0, 0],
  [13, 14, 0.17093, 0.34802, 0, 0],
];

export const BRANCHES: BranchData[] = RAW.map(([from, to, r, x, b, tap], id) => ({ id, from, to, r, x, b, tap }));

/** Schematic canvas layout for the one-line diagram (presentation only). */
export const BUS_LAYOUT: Record<number, { x: number; y: number }> = {
  1: { x: 60, y: 150 },
  2: { x: 60, y: 440 },
  3: { x: 300, y: 600 },
  4: { x: 330, y: 360 },
  5: { x: 300, y: 190 },
  6: { x: 560, y: 120 },
  7: { x: 640, y: 380 },
  8: { x: 860, y: 480 },
  9: { x: 800, y: 330 },
  10: { x: 960, y: 210 },
  11: { x: 800, y: 80 },
  12: { x: 560, y: -30 },
  13: { x: 760, y: -10 },
  14: { x: 1020, y: 100 },
};

/** Adjacency list from the branch table (bus index 0..13). */
export function adjacency(): number[][] {
  const adj: number[][] = Array.from({ length: BUSES.length }, () => []);
  for (const br of BRANCHES) {
    adj[br.from - 1].push(br.to - 1);
    adj[br.to - 1].push(br.from - 1);
  }
  return adj;
}
