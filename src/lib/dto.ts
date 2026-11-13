import type { incidents } from "@/db/schema";
import type { IncidentDTO } from "@/types/api";

export function toIncidentDTO(r: typeof incidents.$inferSelect): IncidentDTO {
  return { ...r, severity: r.severity as IncidentDTO["severity"], status: r.status as IncidentDTO["status"], createdAt: r.createdAt.toISOString() };
}
