import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { incidents } from "@/db/schema";
import { toIncidentDTO } from "@/lib/dto";
import { HttpError, handle, ok, parseBody } from "@/lib/http";

export const dynamic = "force-dynamic";

async function load(idParam: string) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "invalid_id", "Incident id must be a positive integer");
  const [row] = await db.select().from(incidents).where(eq(incidents.id, id));
  if (!row) throw new HttpError(404, "incident_not_found", `Incident ${id} not found`);
  return row;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => ok(toIncidentDTO(await load((await ctx.params).id))));
}

const Patch = z.object({ status: z.enum(["open", "investigating", "resolved"]) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const row = await load((await ctx.params).id);
    const b = await parseBody(req, Patch);
    const [u] = await db.update(incidents).set({ status: b.status }).where(eq(incidents.id, row.id)).returning();
    return ok(toIncidentDTO(u));
  });
}
