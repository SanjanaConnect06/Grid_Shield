/** Minimal dense linear algebra (row-major Float64Array matrices). */

/** Solve A x = b in place copies; returns null if singular. */
export function solveLinear(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const a = A.slice();
  const x = b.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = Math.abs(a[col * n + col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(a[r * n + col]);
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (best < 1e-14) return null;
    if (piv !== col) {
      for (let c = 0; c < n; c++) {
        const t = a[col * n + c];
        a[col * n + c] = a[piv * n + c];
        a[piv * n + c] = t;
      }
      const t = x[col];
      x[col] = x[piv];
      x[piv] = t;
    }
    const d = a[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = a[r * n + col] / d;
      if (f === 0) continue;
      for (let c = col; c < n; c++) a[r * n + c] -= f * a[col * n + c];
      x[r] -= f * x[col];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = x[r];
    for (let c = r + 1; c < n; c++) s -= a[r * n + c] * x[c];
    x[r] = s / a[r * n + r];
  }
  return x;
}

/** Matrix inverse via Gauss-Jordan; returns null if singular. */
export function invert(A: Float64Array, n: number): Float64Array | null {
  const a = A.slice();
  const inv = new Float64Array(n * n);
  for (let i = 0; i < n; i++) inv[i * n + i] = 1;
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = Math.abs(a[col * n + col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(a[r * n + col]);
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (best < 1e-14) return null;
    if (piv !== col) {
      for (let c = 0; c < n; c++) {
        let t = a[col * n + c];
        a[col * n + c] = a[piv * n + c];
        a[piv * n + c] = t;
        t = inv[col * n + c];
        inv[col * n + c] = inv[piv * n + c];
        inv[piv * n + c] = t;
      }
    }
    const d = a[col * n + col];
    for (let c = 0; c < n; c++) {
      a[col * n + c] /= d;
      inv[col * n + c] /= d;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r * n + col];
      if (f === 0) continue;
      for (let c = 0; c < n; c++) {
        a[r * n + c] -= f * a[col * n + c];
        inv[r * n + c] -= f * inv[col * n + c];
      }
    }
  }
  return inv;
}
