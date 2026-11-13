import { z } from "zod";
import { handle, ok, parseBody } from "@/lib/http";
import { createIncident } from "@/lib/runtime";
import { toIncidentDTO } from "@/lib/dto";
import { filtersFromParams, queryIncidents } from "@/lib/incidentQuery";
import { db } from "@/db";
import { incidents } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
const Body = z.object({ detectionId: z.number().int().positive(), localizationId: z.number().int().positive() });

/** GET /api/incidents?q=&from=&to=&attackType=&severity=&status= */
export async function GET(req: Request) {
  return handle(async () => ok(await queryIncidents(filtersFromParams(new URL(req.url).searchParams))));
}

/** POST /api/incidents – generate an incident record from a detection + localization result. */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await parseBody(req, Body);
    const row = await createIncident(b);
    const [fresh] = await db.select().from(incidents).where(eq(incidents.id, row.id));
    return ok(toIncidentDTO(fresh), 201);
  });
}
