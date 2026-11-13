import { and, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { incidents } from "@/db/schema";
import { toIncidentDTO } from "@/lib/dto";

export interface IncidentFilters {
  q?: string;
  from?: string;
  to?: string;
  attackType?: string;
  severity?: string;
  status?: string;
}

export function filtersFromParams(sp: URLSearchParams): IncidentFilters {
  const g = (k: string) => sp.get(k) || undefined;
  return { q: g("q"), from: g("from"), to: g("to"), attackType: g("attackType"), severity: g("severity"), status: g("status") };
}

export async function queryIncidents(f: IncidentFilters, limit = 200) {
  const conds: SQL[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(incidents.code, like), ilike(incidents.title, like), ilike(incidents.summary, like), ilike(incidents.detectedAttackType, like)) as SQL);
  }
  if (f.from && !Number.isNaN(Date.parse(f.from))) conds.push(gte(incidents.createdAt, new Date(`${f.from}T00:00:00.000Z`)));
  if (f.to && !Number.isNaN(Date.parse(f.to))) conds.push(lte(incidents.createdAt, new Date(`${f.to}T23:59:59.999Z`)));
  if (f.attackType) conds.push(eq(incidents.detectedAttackType, f.attackType));
  if (f.severity) conds.push(eq(incidents.severity, f.severity));
  if (f.status) conds.push(eq(incidents.status, f.status));
  const rows = await db.select().from(incidents).where(conds.length ? and(...conds) : undefined).orderBy(desc(incidents.id)).limit(limit);
  return rows.map(toIncidentDTO);
}
