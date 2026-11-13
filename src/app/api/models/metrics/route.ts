import { handle, ok } from "@/lib/http";
import { ensureModels, latestEvaluation } from "@/lib/runtime";

export const dynamic = "force-dynamic";

/** GET /api/models/metrics – measured held-out test metrics. Trains (deterministically) on first use. */
export async function GET() {
  return handle(async () => {
    const ev = (await latestEvaluation()) ?? (await ensureModels()).evaluation;
    return ok(ev);
  });
}
