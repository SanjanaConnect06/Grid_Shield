import { BASE_MVA, BRANCHES, BUSES, BUS_LAYOUT } from "@/lib/grid/ieee14";
import { handle, ok } from "@/lib/http";
import type { TopologyDTO } from "@/types/api";

export const dynamic = "force-dynamic";

/** GET /api/grid/topology – IEEE 14-bus benchmark network (buses, branches, parameters). */
export async function GET() {
  return handle(async () => {
    const data: TopologyDTO = {
      buses: BUSES.map((b) => ({ id: b.id, name: b.name, type: b.type, zone: b.zone, x: BUS_LAYOUT[b.id].x, y: BUS_LAYOUT[b.id].y, pdMw: b.pd, qdMvar: b.qd })),
      branches: BRANCHES.map((b) => ({ id: b.id, from: b.from, to: b.to, r: b.r, x: b.x, b: b.b, tap: b.tap })),
      baseMva: BASE_MVA,
      source: "IEEE 14-bus benchmark (MATPOWER case14 / pandapower case14 parameters)",
    };
    return ok(data);
  });
}
