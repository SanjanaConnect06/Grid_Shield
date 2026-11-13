import { desc } from "drizzle-orm";
import { db } from "@/db";
import { attackEvents } from "@/db/schema";
import { handle, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const rows = await db.select().from(attackEvents).orderBy(desc(attackEvents.id)).limit(50);
    return ok(rows.map((r) => ({ ...r, launchedAt: r.launchedAt.toISOString(), stoppedAt: r.stoppedAt?.toISOString() ?? null })));
  });
}
