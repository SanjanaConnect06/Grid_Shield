"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, RotateCcw, ShieldAlert, Square, Swords } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Card, CardBody, CardHeader, Empty, Field, PageHeader, Select, SimBanner, Skeleton, Slider } from "@/components/ui";
import { useAttacks, useFrame } from "@/hooks/useGrid";
import { api } from "@/services/api";
import type { AttackType, MeasurementGroup } from "@/types/api";
import { cn } from "@/utils/cn";
import { fmt, label, timeAgo } from "@/utils/format";

const ATTACKS: { id: AttackType; title: string; desc: string }[] = [
  { id: "false_data_injection", title: "False Data Injection", desc: "Compromised meters report values consistent with a falsified local bus state (voltage / angle shift)." },
  { id: "replay", title: "Replay Attack", desc: "Meters at the target bus replay stale recorded readings from earlier simulation ticks while the grid evolves." },
  { id: "data_manipulation", title: "Data Manipulation", desc: "Readings are scaled and offset in transit (gain/bias tampering) by a man-in-the-middle." },
];
const GROUPS: { id: MeasurementGroup; label: string; hint: string }[] = [
  { id: "voltage", label: "Voltage magnitude", hint: "V" },
  { id: "active_power", label: "Active power", hint: "P, line P flows" },
  { id: "reactive_power", label: "Reactive power", hint: "Q, line Q flows" },
];

export default function SimulatorPage() {
  const qc = useQueryClient();
  const [type, setType] = useState<AttackType>("false_data_injection");
  const [bus, setBus] = useState(9);
  const [intensity, setIntensity] = useState(0.7);
  const [groups, setGroups] = useState<MeasurementGroup[]>(["voltage", "active_power", "reactive_power"]);
  const { data: frame } = useFrame(true);
  const attacks = useAttacks();
  const sim = frame?.simulation;
  const refresh = () => qc.invalidateQueries();

  const launch = useMutation({
    mutationFn: () => api.post<{ attackEventId: number; tamperedMeters: string[] }>("/api/attacks/launch", { attackType: type, targetBus: bus, intensity, measurementGroups: groups }),
    onSuccess: (d) => { toast.warning("Simulated attack launched", { description: `${d.tamperedMeters.length} meters tampered at bus ${bus} (simulation)` }); refresh(); },
    onError: (e) => toast.error("Launch failed", { description: e.message }),
  });
  const stop = useMutation({ mutationFn: () => api.post("/api/simulation/stop"), onSuccess: () => { toast.info("Simulated attack stopped"); refresh(); }, onError: (e) => toast.error(e.message) });
  const reset = useMutation({ mutationFn: () => api.post("/api/simulation/reset"), onSuccess: () => { toast.success("Simulation reset to normal condition"); refresh(); }, onError: (e) => toast.error(e.message) });
  const tampered = (frame?.meters ?? []).filter((m) => m.tampered);
  const toggle = (g: MeasurementGroup) => setGroups((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  return (
    <div>
      <PageHeader title="Cyberattack Simulator" subtitle="Tamper with one bus's telemetry and watch the detectors react. Original readings are kept alongside." />
      <SimBanner />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Attack configuration" />
          <CardBody className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-fg">Attack type</legend>
              <div className="space-y-2">
                {ATTACKS.map((a) => (
                  <label key={a.id} className={cn("flex cursor-pointer gap-3 rounded-md border p-3 transition", type === a.id ? "border-primary bg-primary/10" : "border-line hover:border-primary/50")}>
                    <input type="radio" name="attack" className="mt-1 accent-[var(--primary)]" checked={type === a.id} onChange={() => setType(a.id)} />
                    <span><span className="block text-sm font-semibold text-fg">{a.title}</span><span className="block text-xs text-muted">{a.desc}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Target bus">
              <Select value={bus} onChange={(e) => setBus(Number(e.target.value))}>
                {Array.from({ length: 14 }, (_, i) => i + 1).map((b) => <option key={b} value={b}>Bus {b}</option>)}
              </Select>
            </Field>
            <Field label={`Attack intensity: ${(intensity * 100).toFixed(0)}%`} hint={type === "replay" ? "Controls how old the replayed data is (15–120 ticks)." : "Scales the magnitude of tampering. Low values are harder to detect."}>
              <Slider value={intensity} onChange={setIntensity} min={0.05} max={1} step={0.05} label="Attack intensity" />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-fg">Measurement types</legend>
              <div className="space-y-2">
                {GROUPS.map((g) => (
                  <label key={g.id} className="flex cursor-pointer items-center gap-3 text-sm text-fg">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={groups.includes(g.id)} onChange={() => toggle(g.id)} />
                    {g.label} <span className="text-xs text-muted">({g.hint})</span>
                  </label>
                ))}
              </div>
              {groups.length === 0 && <p className="mt-1 text-xs text-critical">Select at least one measurement type.</p>}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => launch.mutate()} disabled={launch.isPending || groups.length === 0}><Play size={16} /> Launch simulation</Button>
              <Button variant="secondary" onClick={() => stop.mutate()} disabled={stop.isPending || !sim?.active}><Square size={16} /> Stop</Button>
              <Button variant="secondary" onClick={() => reset.mutate()} disabled={reset.isPending}><RotateCcw size={16} /> Reset</Button>
            </div>
          </CardBody>
        </Card>

        <div className="space-y-4 xl:col-span-3">
          <Card>
            <CardHeader title="Simulation state" action={<Badge tone={sim?.active ? "critical" : "success"}>{sim?.active ? "ATTACK ACTIVE (simulated)" : "NORMAL CONDITION"}</Badge>} />
            <CardBody>
              {sim?.active ? (
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {[["Type", sim.name], ["Target bus", sim.targetBus], ["Intensity", `${((sim.intensity ?? 0) * 100).toFixed(0)}%`], ["Tampered meters", sim.tamperedMeters]].map(([k, v]) => (
                    <div key={String(k)} className="rounded-md bg-subtle p-3"><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold text-fg">{v}</dd></div>
                  ))}
                </dl>
              ) : <p className="text-sm text-muted">Grid operating normally. Configure an attack and press Launch to inject simulated tampering into the telemetry stream.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Original vs attacked measurements" subtitle="Ground-truth labels: tampered meters are highlighted" />
            <CardBody>
              {!frame?.meters ? <Skeleton className="h-40" /> : tampered.length === 0 ? <Empty>No tampered meters – original and observed data are identical.</Empty> : (
                <div className="max-h-80 overflow-auto rounded-md border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-subtle text-muted"><tr><th className="px-3 py-2">Meter</th><th className="px-3 py-2 text-right">Original</th><th className="px-3 py-2 text-right">Attacked</th><th className="px-3 py-2 text-right">Δ</th><th className="px-3 py-2">Label</th></tr></thead>
                    <tbody>
                      {tampered.map((m) => (
                        <tr key={m.id} className="border-t border-line">
                          <td className="px-3 py-1.5 font-mono text-fg">{m.id}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-muted">{fmt(m.original, m.kind === "V" ? 4 : 2)} {m.unit}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-fg">{fmt(m.observed, m.kind === "V" ? 4 : 2)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-critical">{fmt(m.observed - m.original, m.kind === "V" ? 4 : 2)}</td>
                          <td className="px-3 py-1.5"><Badge tone="purple">TAMPERED</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Attack history" subtitle="Stored in PostgreSQL (attack_events)" />
            <CardBody>
              {!attacks.data?.length ? <Empty>No attacks launched yet.</Empty> : (
                <ul className="space-y-2">
                  {attacks.data.slice(0, 6).map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm">
                      <span className="font-medium text-fg">#{a.id} {label(a.attackType)} → bus {a.targetBus}</span>
                      <span className="text-xs text-muted">{(a.intensity * 100).toFixed(0)}% · {a.measurementGroups.length} groups · {timeAgo(a.launchedAt)}</span>
                      <Badge tone={a.status === "active" ? "critical" : "neutral"}>{a.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
