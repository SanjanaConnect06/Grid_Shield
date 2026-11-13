"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useAppStore } from "@/stores/app-store";
import type { AttackRow, DetectionRow, EvaluationDTO, GridFrame, IncidentDTO, LocalizationRow, StatusSummary, TopologyDTO, MeterDTO, BusState, BranchState } from "@/types/api";

export function useFrame(withMeters = false) {
  const pollMs = useAppStore((s) => s.pollMs);
  return useQuery({
    queryKey: ["frame", withMeters],
    queryFn: () => api.get<GridFrame>(`/api/grid/measurements${withMeters ? "?meters=1" : ""}`),
    refetchInterval: pollMs,
    placeholderData: keepPreviousData,
    retry: 1,
  });
}

export function useStatus() {
  const pollMs = useAppStore((s) => s.pollMs);
  return useQuery({ queryKey: ["status"], queryFn: () => api.get<StatusSummary>("/api/grid/status"), refetchInterval: pollMs * 2, placeholderData: keepPreviousData, retry: 1 });
}

export function useTopology() {
  return useQuery({ queryKey: ["topology"], queryFn: () => api.get<TopologyDTO>("/api/grid/topology"), staleTime: Infinity });
}

export function useBusDetail(id: number | null) {
  const pollMs = useAppStore((s) => s.pollMs);
  return useQuery({
    queryKey: ["bus", id],
    enabled: id !== null,
    queryFn: () => api.get<{ bus: BusState; meters: MeterDTO[]; lines: BranchState[]; neighbours: number[]; tick: number }>(`/api/grid/buses/${id}`),
    refetchInterval: pollMs,
    placeholderData: keepPreviousData,
  });
}

export function useIncidents(params: Record<string, string>) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return useQuery({ queryKey: ["incidents", qs], queryFn: () => api.get<IncidentDTO[]>(`/api/incidents${qs ? `?${qs}` : ""}`), placeholderData: keepPreviousData });
}

export function useDetections() {
  return useQuery({ queryKey: ["detections"], queryFn: () => api.get<DetectionRow[]>("/api/detection/results") });
}

export function useLocalizations() {
  return useQuery({ queryKey: ["localizations"], queryFn: () => api.get<LocalizationRow[]>("/api/localization/results") });
}

export function useAttacks() {
  return useQuery({ queryKey: ["attacks"], queryFn: () => api.get<AttackRow[]>("/api/attacks/history") });
}

export function useMetrics() {
  return useQuery({ queryKey: ["metrics"], queryFn: () => api.get<EvaluationDTO>("/api/models/metrics"), staleTime: 60_000 });
}
