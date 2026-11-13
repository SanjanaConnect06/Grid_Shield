import { handle, ok } from "@/lib/http";
import { ensureModels } from "@/lib/runtime";

export const dynamic = "force-dynamic";

/** POST /api/models/train – retrain on the seeded dataset (train/validation/test split) and re-evaluate. */
export async function POST() {
  return handle(async () => {
    const m = await ensureModels(true);
    return ok(m.evaluation);
  });
}
