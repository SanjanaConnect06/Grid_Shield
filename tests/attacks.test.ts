import { describe, expect, it } from "vitest";
import { applyAttack, makeFrame, type AttackConfig } from "@/lib/sim/frames";
import { METERS } from "@/lib/grid/powerflow";
import { badDataDetection, stateEstimate } from "@/lib/ai/estimation";
import { hopDistance, localize } from "@/lib/ai/localization";

const cfg = (type: AttackConfig["type"], bus = 9): AttackConfig => ({ type, targetBus: bus, intensity: 0.9, groups: ["voltage", "active_power", "reactive_power"], sign: 1 });

describe("simulated attacks", () => {
  const frame = makeFrame(500, 42);
  it("preserves original measurements and tampers only target-bus meters", () => {
    const before = frame.original.slice();
    for (const t of ["false_data_injection", "replay", "data_manipulation"] as const) {
      const a = applyAttack(frame, cfg(t), 42);
      expect(Array.from(frame.original)).toEqual(Array.from(before));
      expect(a.tampered.length).toBeGreaterThan(0);
      expect(a.tampered.every((i) => METERS[i].bus === 9)).toBe(true);
    }
  });
  it("normal telemetry passes bad-data detection state estimation", () => {
    const se = stateEstimate(frame.original);
    expect(se.converged).toBe(true);
    expect(se.dof).toBe(95);
  });
  it("flags and localizes a strong FDI without knowing the target", () => {
    const a = applyAttack(frame, cfg("false_data_injection", 12), 42);
    const se = stateEstimate(a.observed);
    expect(badDataDetection(se).flag).toBe(true);
    const loc = localize(a.observed, se);
    expect(hopDistance(loc.ranked[0].bus, 12)).toBeLessThanOrEqual(1);
    expect(loc.calibrated).toBe(false);
  });
});
