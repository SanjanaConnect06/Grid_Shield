"use client";

import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { Factory, Home, Zap } from "lucide-react";
import { memo, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import type { GridFrame, TopologyDTO } from "@/types/api";
import { cn } from "@/utils/cn";

interface BusNodeData extends Record<string, unknown> {
  id: number;
  type: string;
  zone: string;
  vm: number | null;
  suspicious: boolean;
  selected: boolean;
  truth: boolean;
  rank: number | null;
  compact: boolean;
}

const BusNode = memo(function BusNode({ data }: NodeProps<Node<BusNodeData>>) {
  const Icon = data.zone === "generation" ? Factory : data.zone === "distribution" ? Home : Zap;
  const vBad = data.vm !== null && (data.vm < 0.95 || data.vm > 1.1);
  return (
    <div className="relative" role="button" aria-label={`Bus ${data.id}${data.suspicious ? ", suspicious" : ""}`}>
      {data.suspicious && <span className="threat-ring absolute inset-0 rounded-lg border-2 border-critical" />}
      {data.truth && <span className="absolute -inset-1.5 rounded-lg border-2 border-dashed border-purple" />}
      <div
        className={cn(
          "relative flex flex-col items-center justify-center rounded-lg border-2 bg-card shadow-card transition",
          data.compact ? "h-[50px] w-[58px]" : "h-[62px] w-[72px]",
          data.suspicious ? "border-critical" : data.selected ? "border-primary" : vBad ? "border-warning" : "border-line hover:border-primary/70",
          data.selected && !data.suspicious && "ring-4 ring-primary/25",
        )}
      >
        <div className="flex items-center gap-1 text-fg">
          <Icon size={data.compact ? 11 : 13} className={data.zone === "generation" ? "text-purple" : data.zone === "distribution" ? "text-cyan" : "text-primary"} />
          <span className={cn("font-bold", data.compact ? "text-sm" : "text-base")}>{data.id}</span>
        </div>
        <span className={cn("font-mono text-muted", data.compact ? "text-[10px]" : "text-[11px]")}>{data.vm !== null ? `${data.vm.toFixed(3)} pu` : "—"}</span>
        {data.rank !== null && !data.compact && <span className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-critical text-[10px] font-bold text-white">{data.rank}</span>}
      </div>
      <Handle type="target" position={Position.Top} style={{ left: "50%", top: "50%" }} />
      <Handle type="source" position={Position.Top} style={{ left: "50%", top: "50%" }} />
    </div>
  );
});

const nodeTypes = { bus: BusNode };

export function GridTopology({
  topology,
  frame,
  selectedBus,
  onSelect,
  highlightBuses,
  groundTruthBus,
  compact = false,
  height = 480,
  rankedBuses,
}: {
  topology: TopologyDTO;
  frame?: GridFrame | null;
  selectedBus?: number | null;
  onSelect?: (id: number) => void;
  highlightBuses?: number[];
  groundTruthBus?: number | null;
  compact?: boolean;
  height?: number | string;
  rankedBuses?: number[];
}) {
  const theme = useAppStore((s) => s.theme);
  const predicted = useMemo(() => new Set(highlightBuses ?? frame?.analysis?.localization?.predictedBuses ?? []), [highlightBuses, frame]);

  const nodes: Node<BusNodeData>[] = useMemo(
    () =>
      topology.buses.map((b) => {
        const st = frame?.buses.find((x) => x.id === b.id);
        const ri = rankedBuses ? rankedBuses.indexOf(b.id) : -1;
        return {
          id: String(b.id),
          type: "bus",
          position: { x: b.x * (compact ? 0.9 : 1), y: b.y * (compact ? 0.9 : 1) },
          draggable: false,
          data: { id: b.id, type: b.type, zone: b.zone, vm: st ? st.vm : null, suspicious: predicted.has(b.id), selected: selectedBus === b.id, truth: groundTruthBus === b.id, rank: ri >= 0 && ri < 3 ? ri + 1 : null, compact },
        };
      }),
    [topology, frame, predicted, selectedBus, groundTruthBus, compact, rankedBuses],
  );

  const edges: Edge[] = useMemo(
    () =>
      topology.branches.map((br) => {
        const st = frame?.branches.find((x) => x.id === br.id);
        const hot = predicted.has(br.from) || predicted.has(br.to);
        const flow = st ? Math.abs(st.pFromMw) : 0;
        const width = 1.5 + Math.min(flow / 40, 3);
        return {
          id: `l${br.id}`,
          source: String(br.from),
          target: String(br.to),
          type: "straight",
          animated: hot,
          style: { stroke: hot ? "var(--critical)" : br.tap ? "var(--purple)" : "var(--cyan)", strokeWidth: width, opacity: hot ? 1 : 0.65 },
          label: !compact && st ? `${st.pFromMw.toFixed(0)} MW` : undefined,
          labelStyle: { fontSize: 10, fontFamily: "var(--font-mono)" },
          labelBgStyle: { fill: "var(--card)", fillOpacity: 0.9 },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
        };
      }),
    [topology, frame, predicted, compact],
  );

  return (
    <div style={{ height }} className="w-full overflow-hidden rounded-xl border border-line bg-subtle" aria-label="IEEE 14-bus topology">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={theme}
        fitView
        fitViewOptions={{ padding: compact ? 0.08 : 0.15 }}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnScroll={!compact}
        panOnDrag={!compact}
        minZoom={0.3}
        maxZoom={1.8}
        onNodeClick={(_, n) => onSelect?.(Number(n.id))}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
        {!compact && <Controls showInteractive={false} />}
      </ReactFlow>
    </div>
  );
}

export function TopologyLegend() {
  const item = (c: string, t: string) => (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-5 rounded-full", c)} />
      {t}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {item("bg-cyan", "Line")}
      {item("bg-purple", "Transformer")}
      {item("bg-critical", "Suspicious / predicted")}
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border-2 border-dashed border-purple" />
        Simulated target (ground truth)
      </span>
    </div>
  );
}
