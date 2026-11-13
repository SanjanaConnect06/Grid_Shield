import { describe, expect, it } from "vitest";
import { analyzeVector, trainModels } from "@/lib/ai/models";

import { makeFrame, applyAttack } from "@/lib/sim/frames";
import { localize } from "@/lib/ai/localization";
import { DEMO_ATTACK, DEMO_SEED, DEMO_TICK } from "@/lib/demo";

describe("AI engine", () => {
  it("trains with leak-free split and reports measured metrics", async () => {
    const m = await trainModels();
    const e = m.evaluation;
    expect(e.dataset.train + e.dataset.validation + e.dataset.test).toBe(e.dataset.total);
    expect(e.detection.hybrid.recall).toBeGreaterThan(0.5);
    expect(e.detection.hybrid.fpr).toBeLessThan(0.15);
    expect(e.detection.hybrid.tp + e.detection.hybrid.fn).toBe(300);
    expect(e.detection.hybrid.fp + e.detection.hybrid.tn).toBe(100);

    const frame = makeFrame(DEMO_TICK, DEMO_SEED);
    const before = frame.original.slice();
    const normal = analyzeVector(frame.original, m);
    const attacked = applyAttack(frame, DEMO_ATTACK, DEMO_SEED);
    const analysis = analyzeVector(attacked.observed, m);
    const location = localize(attacked.observed, analysis.se);
    expect(normal.hybrid.flag).toBe(false);
    expect(analysis.hybrid.flag).toBe(true);
    expect(location.predictedBuses).toContain(DEMO_ATTACK.targetBus);
    expect(frame.original).toEqual(before);
    expect(makeFrame(DEMO_TICK, DEMO_SEED).original).toEqual(before);
    console.log("Measured evaluation:", JSON.stringify({ detection: e.detection, localization: e.localization }));
  });
});
