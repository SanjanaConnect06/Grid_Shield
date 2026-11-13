"use client";

import { Moon, Sun } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Field, PageHeader, Select } from "@/components/ui";
import { useStatus } from "@/hooks/useGrid";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/utils/cn";

export default function SettingsPage() {
  const { theme, setTheme, pollMs, setPollMs, sidebarCollapsed, toggleSidebar, clearNotifications } = useAppStore();
  const { data: s } = useStatus();
  return (
    <div>
      <PageHeader title="Settings" subtitle="Saved in this browser." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Appearance" subtitle="NEXUS CYBER GRID design system" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {(["dark", "light"] as const).map((t) => (
                <button key={t} onClick={() => setTheme(t)} aria-pressed={theme === t} className={cn("flex items-center gap-3 rounded-md border p-4 text-left transition", theme === t ? "border-primary bg-primary/10" : "border-line hover:border-primary/50")}>
                  {t === "dark" ? <Moon size={20} className="text-purple" /> : <Sun size={20} className="text-warning" />}
                  <span><span className="block text-sm font-semibold capitalize text-fg">{t} theme</span><span className="block text-xs text-muted">{t === "dark" ? "Control-room default" : "Bright office use"}</span></span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-md border border-line p-3 text-sm"><span className="text-fg">Collapsed sidebar</span><Button variant="secondary" size="sm" onClick={toggleSidebar}>{sidebarCollapsed ? "Expand" : "Collapse"}</Button></div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Live monitoring" />
          <CardBody className="space-y-4">
            <Field label="Telemetry refresh interval" hint="The frontend polls the backend; connection loss is detected and retried automatically.">
              <Select value={pollMs} onChange={(e) => setPollMs(Number(e.target.value))}>
                {[1000, 1500, 2000, 3000, 5000].map((v) => <option key={v} value={v}>{v / 1000} s</option>)}
              </Select>
            </Field>
            <Button variant="secondary" size="sm" onClick={clearNotifications}>Clear notification centre</Button>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="System information" />
          <CardBody>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[["Environment", "Isolated simulation"], ["Network", "IEEE 14-bus (AC power flow)"], ["Database", s?.database ?? "PostgreSQL"], ["AI models", s ? (s.modelsReady ? "Ready" : "Training") : "—"]].map(([k, v]) => (
                <div key={k} className="rounded-md bg-subtle p-3"><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold text-fg">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-4 text-sm text-muted"><Badge tone="warning">Disclaimer</Badge> GRID SHIELD AI is a research prototype operating on simulated data only. Simulated attacks are never real-world cyber operations and predictions are not verified real incidents. No secrets are stored in the frontend; all configuration is read server-side from environment variables.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
