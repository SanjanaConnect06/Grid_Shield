import { handle, ok } from "@/lib/http";
import { resetSession } from "@/lib/runtime";

export const dynamic = "force-dynamic";

/** POST /api/simulation/reset – stop attacks, discard the session and start a clean one. */
export async function POST() {
  return handle(async () => ok({ sessionId: await resetSession(), status: "reset" }));
}
