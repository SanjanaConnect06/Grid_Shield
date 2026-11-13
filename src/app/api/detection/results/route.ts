import { desc } from "drizzle-orm";
import { db } from "@/db";
import { detectionResults } from "@/db/schema";
import { handle, ok } from "@/lib/http";
import type { DetectionRow } from "@/types/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const rows = await db.select().from(detectionResults).orderBy(desc(detectionResults.id)).limit(50);
    return ok(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }) as unknown as DetectionRow));
  });
}
