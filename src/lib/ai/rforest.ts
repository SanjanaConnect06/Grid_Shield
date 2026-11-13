import type { Rng } from "@/lib/grid/rng";

/** Random Forest classifier (CART/Gini, bootstrap + random feature subsets) – implemented from scratch. */
interface TNode {
  feature?: number;
  threshold?: number;
  left?: TNode;
  right?: TNode;
  probs?: number[];
}

function gini(counts: number[], n: number): number {
  if (n === 0) return 0;
  let s = 0;
  for (const c of counts) s += (c / n) ** 2;
  return 1 - s;
}

function buildTree(
  X: number[][],
  y: number[],
  idx: number[],
  nClasses: number,
  depth: number,
  opts: { maxDepth: number; minLeaf: number; mtry: number },
  rng: Rng,
  importance: Float64Array,
): TNode {
  const counts = new Array(nClasses).fill(0);
  for (const i of idx) counts[y[i]]++;
  const n = idx.length;
  const leaf = (): TNode => ({ probs: counts.map((c) => c / n) });
  if (depth >= opts.maxDepth || n < 2 * opts.minLeaf || counts.some((c) => c === n)) return leaf();
  const d = X[0].length;
  const feats: number[] = [];
  const pool = Array.from({ length: d }, (_, i) => i);
  for (let k = 0; k < opts.mtry; k++) {
    const j = k + Math.floor(rng() * (d - k));
    [pool[k], pool[j]] = [pool[j], pool[k]];
    feats.push(pool[k]);
  }
  const parentG = gini(counts, n);
  let best = { gain: 1e-9, f: -1, thr: 0 };
  for (const f of feats) {
    const order = idx.slice().sort((a, b) => X[a][f] - X[b][f]);
    const left = new Array(nClasses).fill(0);
    const right = counts.slice();
    for (let k = 0; k < n - 1; k++) {
      const c = y[order[k]];
      left[c]++;
      right[c]--;
      const v = X[order[k]][f];
      const vn = X[order[k + 1]][f];
      if (vn - v < 1e-12) continue;
      const nl = k + 1;
      const nr = n - nl;
      if (nl < opts.minLeaf || nr < opts.minLeaf) continue;
      const g = parentG - (nl / n) * gini(left, nl) - (nr / n) * gini(right, nr);
      if (g > best.gain) best = { gain: g, f, thr: (v + vn) / 2 };
    }
  }
  if (best.f < 0) return leaf();
  importance[best.f] += best.gain * n;
  const L: number[] = [];
  const R: number[] = [];
  for (const i of idx) (X[i][best.f] <= best.thr ? L : R).push(i);
  return {
    feature: best.f,
    threshold: best.thr,
    left: buildTree(X, y, L, nClasses, depth + 1, opts, rng, importance),
    right: buildTree(X, y, R, nClasses, depth + 1, opts, rng, importance),
  };
}

function predictTree(node: TNode, x: number[]): number[] {
  while (node.probs === undefined) node = x[node.feature as number] <= (node.threshold as number) ? (node.left as TNode) : (node.right as TNode);
  return node.probs;
}

export class RandomForest {
  trees: TNode[] = [];
  importance: Float64Array = new Float64Array(0);
  constructor(public nTrees = 60, public maxDepth = 10, public minLeaf = 2, public nClasses = 4) {}

  fit(X: number[][], y: number[], rng: Rng) {
    const d = X[0].length;
    this.importance = new Float64Array(d);
    const mtry = Math.max(1, Math.round(Math.sqrt(d)));
    this.trees = [];
    for (let t = 0; t < this.nTrees; t++) {
      const idx: number[] = [];
      for (let i = 0; i < X.length; i++) idx.push(Math.floor(rng() * X.length));
      this.trees.push(buildTree(X, y, idx, this.nClasses, 0, { maxDepth: this.maxDepth, minLeaf: this.minLeaf, mtry }, rng, this.importance));
    }
    const tot = this.importance.reduce((a, b) => a + b, 0) || 1;
    this.importance = this.importance.map((v) => v / tot);
    return this;
  }

  predictProba(x: number[]): number[] {
    const out = new Array(this.nClasses).fill(0);
    for (const t of this.trees) {
      const p = predictTree(t, x);
      for (let c = 0; c < this.nClasses; c++) out[c] += p[c];
    }
    return out.map((v) => v / this.trees.length);
  }
}
