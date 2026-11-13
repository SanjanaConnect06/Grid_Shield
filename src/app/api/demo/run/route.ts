import { toIncidentDTO } from "@/lib/dto";
import { handle, ok } from "@/lib/http";
import { createIncident, ensureModels, launchAttack, liveSnapshot, resetSession, runDetection, runLocalization } from "@/lib/runtime";
import { buildFrame } from "@/lib/serialize";
import { DEMO_ATTACK, DEMO_SEED, DEMO_TICK } from "@/lib/demo";

export const dynamic = "force-dynamic";

async function runDemo() {
  const models = await ensureModels();
  await resetSession(DEMO_SEED);
  const baseline = await liveSnapshot(DEMO_TICK);
  await launchAttack(DEMO_ATTACK, DEMO_TICK);
  const attacked = await liveSnapshot(DEMO_TICK);
  const det = await runDetection(attacked);
  const loc = await runLocalization(det.row.id, det.snap);
  const inc = await createIncident({ detectionId: det.row.id, localizationId: loc.row.id });
  return {
    scenario: { seed: DEMO_SEED, tick: DEMO_TICK, targetBus: DEMO_ATTACK.targetBus, intensity: DEMO_ATTACK.intensity },
    baseline: buildFrame(baseline).analysis!,
    detection: buildFrame(det.snap).analysis!,
    predictedBuses: loc.loc.predictedBuses,
    groundTruthBus: DEMO_ATTACK.targetBus,
    incident: toIncidentDTO(inc),
    evaluation: models.evaluation,
  };
}

// Concurrent clicks share one run in this process, avoiding duplicate incidents.
const shared = globalThis as typeof globalThis & { __gridShieldDemo?: ReturnType<typeof runDemo> };
export async function POST() {
  return handle(async () => {
    shared.__gridShieldDemo ??= runDemo().finally(() => { shared.__gridShieldDemo = undefined; });
    return ok(await shared.__gridShieldDemo);
  });
}
