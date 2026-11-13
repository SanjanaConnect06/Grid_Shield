import { handle, ok } from "@/lib/http";
import { runDetection } from "@/lib/runtime";
import { buildFrame } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** POST /api/detection/run – run BDD + Isolation Forest + Random Forest + hybrid on the current frame and persist the result. */
export async function POST() {
  return handle(async () => {
    const { row, snap } = await runDetection();
    const frame = buildFrame(snap);
    return ok({ detectionId: row.id, tick: snap.t, groundTruth: snap.groundTruth, analysis: frame.analysis, simulation: frame.simulation });
  });
}
