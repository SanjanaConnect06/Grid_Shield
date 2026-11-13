import type { Rng } from "@/lib/grid/rng";

/** Isolation Forest (Liu et al., 2008) – implemented from scratch. Score near 1 = anomalous. */
interface INode {
  feature?: number;
  split?: number;
  left?: INode;
  right?: INode;
  size?: number;
}

function cFactor(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1)) / n;
}

function build(X: number[][], idx: number[], depth: number, maxDepth: number, rng: Rng): INode {
  if (depth >= maxDepth || idx.length <= 1) return { size: idx.length };
  const d = X[0].length;
  for (let attempt = 0; attempt < 8; attempt++) {
    const f = Math.floor(rng() * d);
    let lo = Infinity;
    let hi = -Infinity;
    for (const i of idx) {
      const v = X[i][f];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (hi - lo < 1e-12) continue;
    const split = lo + rng() * (hi - lo);
    const L: number[] = [];
    const R: number[] = [];
    for (const i of idx) (X[i][f] < split ? L : R).push(i);
    return { feature: f, split, left: build(X, L, depth + 1, maxDepth, rng), right: build(X, R, depth + 1, maxDepth, rng) };
  }
  return { size: idx.length };
}

function pathLength(node: INode, x: number[], depth: number): number {
  if (node.feature === undefined) return depth + cFactor(node.size ?? 1);
  return pathLength(x[node.feature] < (node.split as number) ? (node.left as INode) : (node.right as INode), x, depth + 1);
}

export class IsolationForest {
  trees: INode[] = [];
  psi = 0;
  constructor(public nTrees = 100, public maxSamples = 128) {}

  fit(X: number[][], rng: Rng) {
    this.psi = Math.min(this.maxSamples, X.length);
    const maxDepth = Math.ceil(Math.log2(this.psi));
    this.trees = [];
    for (let t = 0; t < this.nTrees; t++) {
      const idx: number[] = [];
      const pool = X.map((_, i) => i);
      for (let k = 0; k < this.psi; k++) {
        const j = k + Math.floor(rng() * (pool.length - k));
        [pool[k], pool[j]] = [pool[j], pool[k]];
        idx.push(pool[k]);
      }
      this.trees.push(build(X, idx, 0, maxDepth, rng));
    }
    return this;
  }

  score(x: number[]): number {
    let s = 0;
    for (const t of this.trees) s += pathLength(t, x, 0);
    const e = s / this.trees.length;
    return Math.pow(2, -e / cFactor(this.psi));
  }
}
