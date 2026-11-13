import { desc } from "drizzle-orm";
import { db } from "@/db";
import { attackEvents, detectionResults, incidents } from "@/db/schema";
import { handle, ok } from "@/lib/http";
import { toIncidentDTO } from "@/lib/dto";
import { dbCounts, liveSnapshot } from "@/lib/runtime";
import { buildFrame } from "@/lib/serialize";
import { ATTACK_NAMES, type Label } from "@/lib/sim/frames";
import type { StatusSummary, TimelineEvent } from "@/types/api";

export const dynamic = "force-dynamic";

/** GET /api/grid/status – command-centre summary. */
export async function GET() {
  return handle(async () => {
    const snap = await liveSnapshot();
    const frame = buildFrame(snap);
    const counts = await dbCounts();
    const recent = await db.select().from(incidents).orderBy(desc(incidents.id)).limit(6);
    const attacks = await db.select().from(attackEvents).orderBy(desc(attackEvents.id)).limit(6);
    const dets = await db.select().from(detectionResults).orderBy(desc(detectionResults.id)).limit(6);
    const timeline: TimelineEvent[] = [];
    for (const a of attacks) {
      timeline.push({ at: a.launchedAt.toISOString(), kind: "attack_launched", title: `Simulated ${ATTACK_NAMES[a.attackType as Label]} launched`, detail: `Target bus ${a.targetBus}, intensity ${(a.intensity * 100).toFixed(0)}% (simulation)`, severity: "warning" });
      if (a.stoppedAt) timeline.push({ at: a.stoppedAt.toISOString(), kind: "attack_stopped", title: "Simulated attack stopped", detail: `Attack #${a.id} ended`, severity: "info" });
    }
    for (const d of dets) {
      timeline.push({ at: d.createdAt.toISOString(), kind: "detection", title: d.hybridFlag ? `Hybrid alert: ${ATTACK_NAMES[d.predictedClass as Label]}` : "Detection run: grid normal", detail: `J=${d.bddJ.toFixed(0)} · IF=${d.ifScore.toFixed(2)} · ${d.latencyMs.toFixed(1)} ms`, severity: d.hybridFlag ? "critical" : "info" });
    }
    for (const i of recent) {
      timeline.push({ at: i.createdAt.toISOString(), kind: "incident", title: `${i.code}: ${i.title}`, detail: `Severity ${i.severity}`, severity: i.severity === "critical" || i.severity === "high" ? "critical" : "warning" });
    }
    timeline.sort((x, y) => (x.at < y.at ? 1 : -1));
    const liveAlert = frame.analysis?.hybrid.flag ?? false;
    const data: StatusSummary = {
      tick: frame.tick,
      gridStatus: !frame.modelsReady ? "INITIALISING" : liveAlert ? "ALERT" : "NORMAL",
      frequency: frame.frequency,
      avgVoltage: frame.totals.avgVoltage,
      busesMonitored: frame.buses.length,
      branchesMonitored: frame.branches.length,
      activeAlerts: counts.openIncidents + (liveAlert ? 1 : 0),
      suspiciousBuses: frame.analysis?.localization?.predictedBuses ?? [],
      simulation: frame.simulation,
      modelsReady: frame.modelsReady,
      training: frame.training,
      anomalyStats: { detections: counts.detections, flagged: counts.flagged, incidents: counts.incidents, openIncidents: counts.openIncidents },
      recentIncidents: recent.map(toIncidentDTO),
      timeline: timeline.slice(0, 12),
      database: "PostgreSQL via Drizzle ORM",
    };
    return ok(data);
  });
}
