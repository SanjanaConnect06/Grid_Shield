import { handle, ok } from "@/lib/http";
import { liveSnapshot } from "@/lib/runtime";
import { buildFrame } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** GET /api/grid/measurements[?meters=1] – current frame: estimated state, original vs observed readings, live AI analysis. */
export async function GET(req: Request) {
  return handle(async () => {
    const withMeters = new URL(req.url).searchParams.get("meters") === "1";
    const snap = await liveSnapshot();
    return ok(buildFrame(snap, withMeters));
  });
}
