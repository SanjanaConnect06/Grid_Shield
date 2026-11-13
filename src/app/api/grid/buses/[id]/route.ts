import { handle, ok, HttpError } from "@/lib/http";
import { liveSnapshot } from "@/lib/runtime";
import { buildFrame } from "@/lib/serialize";
import { BRANCHES } from "@/lib/grid/ieee14";

export const dynamic = "force-dynamic";

/** GET /api/grid/buses/{id} – bus-level inspection: state, meters (original/observed), connected lines. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const busId = Number(id);
    if (!Number.isInteger(busId) || busId < 1 || busId > 14) throw new HttpError(404, "bus_not_found", `Bus ${id} does not exist (valid: 1-14)`);
    const frame = buildFrame(await liveSnapshot(), true);
    const bus = frame.buses.find((b) => b.id === busId)!;
    const lines = frame.branches.filter((b) => b.from === busId || b.to === busId);
    return ok({
      bus,
      meters: (frame.meters ?? []).filter((m) => m.bus === busId),
      lines,
      neighbours: BRANCHES.filter((b) => b.from === busId || b.to === busId).map((b) => (b.from === busId ? b.to : b.from)),
      tick: frame.tick,
    });
  });
}
