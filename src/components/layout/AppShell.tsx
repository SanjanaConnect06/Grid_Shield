"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, BarChart3, Bell, Crosshair, FileWarning, LayoutDashboard, Menu, Moon, PanelLeftClose, PanelLeftOpen, Radar, Settings, Sun, Swords, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useFrame } from "@/hooks/useGrid";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/utils/cn";
import { timeAgo } from "@/utils/format";

type Item = { href: string; label: string; icon: typeof Activity };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Operate",
    items: [
      { href: "/", label: "Command Centre", icon: LayoutDashboard },
      { href: "/monitoring", label: "Live Grid Monitoring", icon: Activity },
    ],
  },
  {
    title: "Security",
    items: [
      { href: "/simulator", label: "Cyberattack Simulator", icon: Swords },
      { href: "/detection", label: "AI Threat Detection", icon: Radar },
      { href: "/localization", label: "Attacker Localization", icon: Crosshair },
      { href: "/incidents", label: "Incident Management", icon: FileWarning },
    ],
  },
  { title: "Analyse", items: [{ href: "/performance", label: "Model Performance", icon: BarChart3 }] },
];
const SETTINGS: Item = { href: "/settings", label: "Settings", icon: Settings };
const ALL = [...GROUPS.flatMap((g) => g.items), SETTINGS];

function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-primary" aria-hidden>
      <path d="M12 2.5 20 6v6c0 4.6-3.3 8.4-8 9.5C7.3 20.4 4 16.6 4 12V6l8-3.5Z" />
      <path d="M7.8 13.2h2.3l1.4-3.6 2 5.2 1.2-3.1h1.5" />
    </svg>
  );
}

function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="Grid Shield AI home">
      <Mark />
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight text-fg">
          Grid Shield <span className="font-normal text-muted">AI</span>
        </span>
      )}
    </Link>
  );
}

function NavLink({ item, collapsed, onNavigate }: { item: Item; collapsed: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
        active ? "bg-subtle font-medium text-fg" : "text-muted hover:bg-subtle hover:text-fg",
        collapsed && "justify-center px-0",
      )}
    >
      {active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-primary" />}
      <item.icon size={16} strokeWidth={1.75} className={cn("shrink-0", active && "text-primary")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5 px-3 py-4" aria-label="Primary">
      {GROUPS.map((g) => (
        <div key={g.title}>
          {!collapsed && <p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted/80">{g.title}</p>}
          <div className="flex flex-col gap-0.5">
            {g.items.map((i) => (
              <NavLink key={i.href} item={i} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function ConnectionStatus() {
  const { isError, data, isLoading } = useFrame();
  const state = isError ? "down" : isLoading ? "connecting" : "up";
  return (
    <div className="hidden items-center gap-2 text-xs sm:flex" role="status" aria-live="polite">
      <span className={cn("h-2 w-2 rounded-full", state === "up" ? "bg-success" : state === "down" ? "bg-critical" : "bg-warning")} />
      <span className="text-muted">{state === "down" ? "Backend unreachable, retrying" : state === "connecting" ? "Connecting" : "Connected"}</span>
      {state === "up" && data && <span className="font-mono text-muted/70">t{data.tick}</span>}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const { notifications, markAllRead, clearNotifications } = useAppStore();
  const unread = notifications.filter((n) => !n.read).length;
  const dot = { critical: "bg-critical", warning: "bg-warning", success: "bg-success", info: "bg-primary" } as const;
  return (
    <div className="relative">
      <button
        className="relative grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-fg"
        aria-label={`Notifications (${unread} unread)`}
        onClick={() => {
          setOpen(!open);
          if (!open) markAllRead();
        }}
      >
        <Bell size={16} strokeWidth={1.75} />
        {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-critical ring-2 ring-app" />}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[88vw] rounded-lg border border-line bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <span className="text-sm font-semibold text-fg">Notifications</span>
            <button className="text-xs text-muted hover:text-fg" onClick={clearNotifications}>
              Clear
            </button>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing yet.</li>}
            {notifications.map((n) => (
              <li key={n.id} className="flex gap-2.5 border-b border-line px-3 py-2.5 last:border-0">
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot[n.level])} />
                <div className="min-w-0">
                  <p className="text-sm text-fg">{n.title}</p>
                  <p className="text-xs text-muted">{n.body}</p>
                  <p className="mt-0.5 text-[11px] text-muted/70">{timeAgo(new Date(n.at).toISOString())}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useAppStore();
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-fg"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title="Toggle theme"
    >
      {theme === "dark" ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { sidebarCollapsed, toggleSidebar, mobileNav, setMobileNav } = useAppStore();
  const path = usePathname();
  const current = ALL.find((n) => (n.href === "/" ? path === "/" : path.startsWith(n.href)));
  return (
    <div className="min-h-screen bg-app">
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-sidebar transition-[width] duration-150 lg:flex", sidebarCollapsed ? "w-16" : "w-60")}>
        <div className={cn("flex h-14 items-center border-b border-line px-4", sidebarCollapsed && "justify-center px-0")}>
          <Logo compact={sidebarCollapsed} />
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList collapsed={sidebarCollapsed} />
        </div>
        <div className="flex flex-col gap-0.5 border-t border-line p-3">
          <NavLink item={SETTINGS} collapsed={sidebarCollapsed} />
          <button onClick={toggleSidebar} className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-muted transition-colors hover:bg-subtle hover:text-fg", sidebarCollapsed && "justify-center px-0")} aria-label="Toggle sidebar">
            {sidebarCollapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
            {!sidebarCollapsed && "Collapse"}
          </button>
        </div>
      </aside>

      <AnimatePresence>
        {mobileNav && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileNav(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-sidebar lg:hidden" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: "tween", duration: 0.18 }}>
              <div className="flex h-14 items-center justify-between border-b border-line px-4">
                <Logo />
                <button onClick={() => setMobileNav(false)} aria-label="Close menu" className="text-muted">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <NavList collapsed={false} onNavigate={() => setMobileNav(false)} />
              </div>
              <div className="border-t border-line p-3">
                <NavLink item={SETTINGS} collapsed={false} onNavigate={() => setMobileNav(false)} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className={cn("transition-[padding] duration-150", sidebarCollapsed ? "lg:pl-16" : "lg:pl-60")}>
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-app/90 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <button className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-subtle lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu">
              <Menu size={18} />
            </button>
            <div className="lg:hidden">
              <Logo compact />
            </div>
            <span className="hidden text-sm font-medium text-fg lg:block">{current?.label}</span>
            <span className="hidden items-center gap-1.5 border-l border-line pl-3 text-xs text-muted md:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              Simulation environment
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <ConnectionStatus />
            <span className="mx-1 hidden h-4 w-px bg-line sm:block" />
            <ThemeToggle />
            <Notifications />
            <button className="ml-1 flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-subtle" title="SOC Analyst · Team Vortex" aria-label="User profile">
              <span className="grid h-7 w-7 place-items-center rounded-full border border-line bg-subtle text-[11px] font-semibold text-fg">TV</span>
              <span className="hidden text-xs text-muted md:block">Analyst</span>
            </button>
          </div>
        </header>
        <AnimatePresence mode="wait">
          <motion.main key={path} className="mx-auto w-full max-w-[1480px] p-4 md:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.14 }}>
            {children}
          </motion.main>
        </AnimatePresence>
        <footer className="px-6 pb-6 text-xs text-muted/70">Grid Shield </footer>
      </div>
    </div>
  );
}
