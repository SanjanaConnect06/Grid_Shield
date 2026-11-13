import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { IncidentDTO } from "@/types/api";

const COLUMNS: { key: string; get: (i: IncidentDTO) => unknown }[] = [
  { key: "code", get: (i) => i.code },
  { key: "created_at", get: (i) => i.createdAt },
  { key: "severity", get: (i) => i.severity },
  { key: "status", get: (i) => i.status },
  { key: "title", get: (i) => i.title },
  { key: "detected_attack_type", get: (i) => i.detectedAttackType },
  { key: "ground_truth_attack_type", get: (i) => i.groundTruthAttackType },
  { key: "predicted_buses", get: (i) => i.predictedBuses.join("|") },
  { key: "ground_truth_bus", get: (i) => i.groundTruthBus },
  { key: "simulated", get: (i) => i.simulated },
  { key: "summary", get: (i) => i.summary },
];

function esc(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // neutralise spreadsheet formula injection
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function incidentsToCsv(rows: IncidentDTO[]): string {
  const head = COLUMNS.map((c) => c.key).join(",");
  const body = rows.map((r) => COLUMNS.map((c) => esc(c.get(r))).join(","));
  return [head, ...body].join("\n") + "\n";
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.replace(/[^\x20-\x7E]/g, "?").split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

export async function incidentsToPdf(rows: IncidentDTO[], title = "GRID SHIELD AI - Incident Report"): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595;
  const H = 842;
  const margin = 48;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - margin;
  const ensure = (need: number) => {
    if (y - need < margin) {
      page = pdf.addPage([W, H]);
      y = H - margin;
    }
  };
  const text = (s: string, size = 10, f = font, color = rgb(0.1, 0.12, 0.18), indent = 0) => {
    for (const l of wrap(s, f, size, W - 2 * margin - indent)) {
      ensure(size + 4);
      page.drawText(l, { x: margin + indent, y: y - size, size, font: f, color });
      y -= size + 4;
    }
  };
  page.drawRectangle({ x: 0, y: H - 70, width: W, height: 70, color: rgb(0.04, 0.04, 0.04) });
  page.drawText(title, { x: margin, y: H - 38, size: 18, font: bold, color: rgb(0.97, 0.98, 1) });
  page.drawText("BESCOM POWER HACK 2026 - Team Vortex - Theme 2: Cyber Secure Smart Grid", { x: margin, y: H - 56, size: 9, font, color: rgb(0.58, 0.64, 0.72) });
  y = H - 92;
  text(`Generated: ${new Date().toISOString()}   Incidents: ${rows.length}`, 9, font, rgb(0.35, 0.4, 0.5));
  text("DISCLAIMER: Every incident in this report originates from an isolated SIMULATION of the IEEE 14-bus network. Attacks are simulated; nothing here is a verified real-world cyber event.", 9, font, rgb(0.6, 0.35, 0.05));
  y -= 8;
  for (const i of rows) {
    ensure(120);
    page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, thickness: 0.5, color: rgb(0.8, 0.83, 0.88) });
    y -= 14;
    text(`${i.code}  |  ${i.severity.toUpperCase()}  |  ${i.status}`, 11, bold);
    text(i.title, 11, bold, rgb(0.15, 0.3, 0.8));
    text(`Created: ${i.createdAt}`, 9, font, rgb(0.4, 0.45, 0.55));
    text(`Detected class: ${i.detectedAttackType}    Ground truth (simulation): ${i.groundTruthAttackType ?? "n/a"}`);
    text(`Predicted buses: ${i.predictedBuses.join(", ") || "none"}    Ground-truth target bus: ${i.groundTruthBus ?? "n/a"}`);
    text(i.summary, 10);
    const d = i.details as { bdd?: { j: number; threshold: number }; isolationForest?: { score: number }; latencyMs?: number; randomForest?: Record<string, number> };
    if (d.bdd) text(`BDD J=${d.bdd.j.toFixed(1)} (threshold ${d.bdd.threshold.toFixed(1)}), IF score=${d.isolationForest?.score.toFixed(3)}, latency ${d.latencyMs?.toFixed(1)} ms`, 9, font, rgb(0.35, 0.4, 0.5));
    y -= 8;
  }
  return pdf.save();
}
