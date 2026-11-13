/**
 * NEXUS CYBER GRID design tokens. The CSS variables in globals.css are the runtime source of truth;
 * this file mirrors them for documentation, tests and non-CSS consumers.
 */
export const THEME_TOKENS = {
  dark: { background: "#0A0A0A", sidebar: "#101010", card: "#161616", border: "#2B2B2B", primary: "#3B82F6", cyan: "#22D3EE", purple: "#A78BFA", success: "#22C55E", warning: "#F59E0B", critical: "#EF4444", text: "#F8FAFC", secondary: "#A1A1AA" },
  light: { background: "#F5F7FB", sidebar: "#FFFFFF", card: "#FFFFFF", border: "#E2E8F0", primary: "#2563EB", cyan: "#0891B2", purple: "#7C3AED", success: "#16A34A", warning: "#D97706", critical: "#DC2626", text: "#0F172A", secondary: "#64748B" },
} as const;

export type ThemeName = keyof typeof THEME_TOKENS;
export const THEME_STORAGE_KEY = "gridshield-theme";

/** CSS-variable references usable in chart props (SVG attributes accept var()). */
export const chartColors = {
  grid: "var(--border)",
  axis: "var(--muted)",
  text: "var(--fg)",
  primary: "var(--primary)",
  cyan: "var(--cyan)",
  purple: "var(--purple)",
  success: "var(--success)",
  warning: "var(--warning)",
  critical: "var(--critical)",
};
