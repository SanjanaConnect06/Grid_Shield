import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { incidents } from "@/db/schema";
import { toIncidentDTO } from "@/lib/dto";
import { incidentsToCsv, incidentsToPdf } from "@/lib/export";
import { handle, parseBody } from "@/lib/http";
import { queryIncidents } from "@/lib/incidentQuery";

export const dynamic = "force-dynamic";
const Body = z.object({ format: z.enum(["csv", "pdf"]), incidentIds: z.array(z.number().int().positive()).max(500).optional() });

/** POST /api/reports/export – export selected (or all) incidents as CSV or PDF. */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await parseBody(req, Body);
    const rows = b.incidentIds?.length ? (await db.select().from(incidents).where(inArray(incidents.id, b.incidentIds))).map(toIncidentDTO) : await queryIncidents({});
    if (b.format === "csv") return new Response(incidentsToCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="gridshield-report.csv"' } });
    const pdf = await incidentsToPdf(rows);
    return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="gridshield-report.pdf"' } });
  });
}
