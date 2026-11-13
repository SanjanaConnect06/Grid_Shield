import { z } from "zod";
import { handle, ok, parseBody } from "@/lib/http";
import { runLocalization } from "@/lib/runtime";

export const dynamic = "force-dynamic";
const Body = z.object({ detectionId: z.number().int().positive().optional() });

/** POST /api/localization/run – localize suspicious buses from observed data only (never from the simulated target). */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await parseBody(req, Body);
    const { row, loc, snap } = await runLocalization(b.detectionId);
    return ok({
      localizationId: row.id,
      detectionId: b.detectionId ?? null,
      tick: snap.t,
      predictedBuses: loc.predictedBuses,
      ranked: loc.ranked,
      significant: loc.significant,
      calibrated: loc.calibrated,
      method: loc.method,
      removedMeters: loc.removedMeters,
      evaluation: { groundTruthBus: row.groundTruthBus, correctTop1: row.correctTop1, note: "Ground truth is attached only AFTER prediction, for scoring." },
    });
  });
}
