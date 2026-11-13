export const fmt = (v: number | null | undefined, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(d));
export const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(d)}%`);
export const timeAgo = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
export const ATTACK_LABELS: Record<string, string> = {
  normal: "Normal operation",
  false_data_injection: "False Data Injection",
  replay: "Replay Attack",
  data_manipulation: "Data Manipulation",
};
export const label = (k: string | null | undefined) => (k ? (ATTACK_LABELS[k] ?? k) : "—");
