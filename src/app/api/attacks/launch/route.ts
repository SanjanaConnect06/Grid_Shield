import { z } from "zod";
import { handle, ok, parseBody } from "@/lib/http";
import { launchAttack } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const LaunchBody = z.object({
  attackType: z.enum(["false_data_injection", "replay", "data_manipulation"]),
  targetBus: z.number().int().min(1).max(14),
  intensity: z.number().min(0.05).max(1),
  measurementGroups: z.array(z.enum(["voltage", "active_power", "reactive_power"])).min(1, "Select at least one measurement type"),
  sign: z.union([z.literal(1), z.literal(-1)]).default(1),
});

/** POST /api/attacks/launch – launch a SIMULATED attack in the isolated environment. */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await parseBody(req, LaunchBody);
    const row = await launchAttack({ type: b.attackType, targetBus: b.targetBus, intensity: b.intensity, groups: b.measurementGroups, sign: b.sign });
    return ok({
      attackEventId: row.id,
      launchTick: row.launchTick,
      tamperedMeters: row.snapshot?.tamperedMeters ?? [],
      note: "SIMULATED attack: original measurements are preserved; attacked values and ground-truth labels are stored.",
    }, 201);
  });
}
