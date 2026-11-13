import { create } from "zustand";
import { THEME_STORAGE_KEY, type ThemeName } from "@/themes/tokens";
import type { GridFrame } from "@/types/api";

export interface HistoryPoint {
  tick: number;
  frequency: number;
  avgVoltage: number;
  minVoltage: number;
  loadMw: number;
  lossMw: number;
  j: number | null;
  jThreshold: number | null;
  ifScore: number | null;
  ifThreshold: number | null;
  attackProb: number | null;
  alert: boolean;
}

export interface AppNotification {
  id: number;
  title: string;
  body: string;
  level: "info" | "warning" | "critical" | "success";
  at: number;
  read: boolean;
}

interface AppState {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNav: boolean;
  setMobileNav: (v: boolean) => void;
  pollMs: number;
  setPollMs: (v: number) => void;
  selectedBus: number | null;
  selectBus: (b: number | null) => void;
  history: HistoryPoint[];
  pushFrame: (f: GridFrame) => void;
  notifications: AppNotification[];
  notify: (n: Omit<AppNotification, "id" | "at" | "read">) => void;
  markAllRead: () => void;
  clearNotifications: () => void;
}

let nid = 1;

function applyTheme(t: ThemeName) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", t === "dark");
}

function readLS(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: "dark",
  setTheme: (t) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      /* storage unavailable */
    }
    applyTheme(t);
    set({ theme: t });
  },
  sidebarCollapsed: false,
  toggleSidebar: () => {
    const v = !get().sidebarCollapsed;
    try {
      localStorage.setItem("gridshield-sidebar", v ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ sidebarCollapsed: v });
  },
  mobileNav: false,
  setMobileNav: (v) => set({ mobileNav: v }),
  pollMs: 1500,
  setPollMs: (v) => {
    try {
      localStorage.setItem("gridshield-poll", String(v));
    } catch {
      /* ignore */
    }
    set({ pollMs: v });
  },
  selectedBus: null,
  selectBus: (b) => set({ selectedBus: b }),
  history: [],
  pushFrame: (f) => {
    const h = get().history;
    if (h.length && h[h.length - 1].tick === f.tick) return;
    const a = f.analysis;
    const p: HistoryPoint = {
      tick: f.tick,
      frequency: f.frequency,
      avgVoltage: f.totals.avgVoltage,
      minVoltage: f.totals.minVoltage,
      loadMw: f.totals.loadMw,
      lossMw: f.totals.lossMw,
      j: a ? a.bdd.j : null,
      jThreshold: a ? a.bdd.threshold : null,
      ifScore: a ? a.isolationForest.score : null,
      ifThreshold: a ? a.isolationForest.threshold : null,
      attackProb: a ? a.randomForest.attackProbability : null,
      alert: a ? a.hybrid.flag : false,
    };
    set({ history: [...h, p].slice(-90) });
  },
  notifications: [],
  notify: (n) => set({ notifications: [{ ...n, id: nid++, at: Date.now(), read: false }, ...get().notifications].slice(0, 40) }),
  markAllRead: () => set({ notifications: get().notifications.map((n) => ({ ...n, read: true })) }),
  clearNotifications: () => set({ notifications: [] }),
}));

/** Restore persisted preferences on the client after hydration. */
export function restorePreferences() {
  const t = readLS(THEME_STORAGE_KEY);
  const theme: ThemeName = t === "light" ? "light" : "dark";
  applyTheme(theme);
  const poll = Number(readLS("gridshield-poll"));
  useAppStore.setState({
    theme,
    sidebarCollapsed: readLS("gridshield-sidebar") === "1",
    ...(poll >= 500 && poll <= 10000 ? { pollMs: poll } : {}),
  });
}
