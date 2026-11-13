import { z } from "zod";
import { handle, ok, parseBody } from "@/lib/http";
import { startSession } from "@/lib/runtime";

export const dynamic = "force-dynamic";
const Body = z.object({ scenario: z.string().max(60).default("live") });

/** POST /api/simulation/start – begin a fresh, isolated simulation session in normal condition. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await parseBody(req, Body);
    const id = await startSession(body.scenario);
    return ok({ sessionId: id, status: "running", note: "Isolated simulation session started. No real-world systems are involved." });
  });
}
