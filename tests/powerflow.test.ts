import { describe, expect, it } from "vitest";
import { solvePowerFlow, N, METERS, M, measurementFunction } from "@/lib/grid/powerflow";
import { BUSES, BRANCHES } from "@/lib/grid/ieee14";

describe("IEEE 14-bus AC power flow", () => {
  const pf = solvePowerFlow(new Array(N).fill(1));
  it("has 14 buses and 20 branches", () => {
    expect(BUSES.length).toBe(14);
    expect(BRANCHES.length).toBe(20);
  });
  it("converges", () => {
    expect(pf.converged).toBe(true);
  });
  it("matches published MATPOWER case14 solution", () => {
    const deg = (r: number) => (r * 180) / Math.PI;
    expect(pf.vm[3]).toBeCloseTo(1.018, 2); // bus 4
    expect(pf.vm[13]).toBeCloseTo(1.036, 2); // bus 14
    expect(deg(pf.va[1])).toBeCloseTo(-4.98, 1);
    expect(deg(pf.va[13])).toBeCloseTo(-16.04, 1);
    expect(pf.pInj[0] * 100).toBeCloseTo(232.4, 0); // slack MW
  });
  it("builds a measurement vector", () => {
    const z = measurementFunction(pf.vm, pf.va, new Float64Array(M));
    expect(z.length).toBe(METERS.length);
    expect(Number.isFinite(z[M - 1])).toBe(true);
  });
});
