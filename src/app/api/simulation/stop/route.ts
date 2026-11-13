import { handle, ok } from "@/lib/http";
import { stopAttack } from "@/lib/runtime";

export const dynamic = "force-dynamic";

/** POST /api/simulation/stop – stop the active simulated attack (grid returns to normal telemetry). */
export async function POST() {
  return handle(async () => {
    const ev = await stopAttack();
    return ok({ stopped: !!ev, attackEventId: ev?.eventId ?? null });
  });
}
