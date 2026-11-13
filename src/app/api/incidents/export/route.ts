import { incidentsToCsv, incidentsToPdf } from "@/lib/export";
import { filtersFromParams, queryIncidents } from "@/lib/incidentQuery";
import { fail, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/incidents/export?format=csv|pdf (+ same filters as the list endpoint) */
export async function GET(req: Request) {
  return handle(async () => {
    const sp = new URL(req.url).searchParams;
    const format = sp.get("format") ?? "csv";
    const rows = await queryIncidents(filtersFromParams(sp));
    if (format === "csv") {
      return new Response(incidentsToCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="gridshield-incidents.csv"' } });
    }
    if (format === "pdf") {
      const pdf = await incidentsToPdf(rows);
      return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="gridshield-incidents.pdf"' } });
    }
    return fail(400, "invalid_format", "format must be csv or pdf");
  });
}
