"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Toaster, toast } from "sonner";
import { useFrame } from "@/hooks/useGrid";
import { restorePreferences, useAppStore } from "@/stores/app-store";

/** Pushes every new frame into the history buffer and raises alert notifications on state changes. */
function LiveBridge() {
  const { data } = useFrame();
  const pushFrame = useAppStore((s) => s.pushFrame);
  const notify = useAppStore((s) => s.notify);
  const lastAlert = useRef<boolean | null>(null);
  const lastSim = useRef<number | null>(null);
  useEffect(() => {
    if (!data) return;
    pushFrame(data);
    const flag = data.analysis?.hybrid.flag ?? false;
    if (lastAlert.current !== null && flag !== lastAlert.current) {
      if (flag) {
        const msg = `${data.analysis?.hybrid.className} suspected${data.analysis?.localization?.predictedBuses.length ? ` near bus ${data.analysis.localization.predictedBuses.join(", ")}` : ""}`;
        toast.error("Hybrid detector alert", { description: msg });
        notify({ title: "Hybrid detector alert", body: msg, level: "critical" });
      } else {
        toast.success("Grid telemetry back to normal");
        notify({ title: "Telemetry normal", body: "Hybrid detector no longer flags the grid.", level: "success" });
      }
    }
    lastAlert.current = flag;
    const ev = data.simulation.active ? (data.simulation.eventId ?? null) : null;
    if (lastSim.current !== ev && lastSim.current !== undefined && (ev !== null || lastSim.current !== null)) {
      notify({ title: ev ? "Simulated attack active" : "Simulated attack stopped", body: ev ? `${data.simulation.name} on bus ${data.simulation.targetBus} (simulation)` : "Simulator returned to normal telemetry.", level: ev ? "warning" : "info" });
    }
    lastSim.current = ev;
  }, [data, pushFrame, notify]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 1000, refetchOnWindowFocus: false } } }));
  const theme = useAppStore((s) => s.theme);
  useEffect(() => restorePreferences(), []);
  return (
    <QueryClientProvider client={client}>
      <LiveBridge />
      {children}
      <Toaster theme={theme} position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}
