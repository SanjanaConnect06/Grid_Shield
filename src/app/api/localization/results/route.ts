import { desc } from "drizzle-orm";
import { db } from "@/db";
import { localizationResults } from "@/db/schema";
import { handle, ok } from "@/lib/http";
import type { LocalizationRow } from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const rows = await db.select().from(localizationResults).orderBy(desc(localizationResults.id)).limit(50);
    return ok(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }) as unknown as LocalizationRow));
  });
}
