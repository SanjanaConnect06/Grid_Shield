import { BASE_MVA, BRANCHES, BUSES } from "@/lib/grid/ieee14";
import { METERS, N, branchCurrentPu, branchFlow, injections } from "@/lib/grid/powerflow";
import { loadFactors, ATTACK_NAMES } from "@/lib/sim/frames";
import { getModels, isTraining, type LiveSnapshot } from "@/lib/runtime";
import type { AnalysisDTO, BranchState, BusState, GridFrame, MeterDTO } from "@/types/api";

const eng = (kind: string, pu: number) => (kind === "V" ? pu : pu * BASE_MVA);

export function buildFrame(snap: LiveSnapshot, withMeters = false): GridFrame {
  const { se, frame, observed } = snap;
  const vm = se.converged ? se.vm : frame.pf.vm;
  const va = se.converged ? se.va : frame.pf.va;
  const P = new Float64Array(N);
  const Q = new Float64Array(N);
  injections(vm, va, P, Q);
  const lf = loadFactors(snap.t);
  const predicted = new Set(snap.localization?.predictedBuses ?? []);
  const scoreOf = new Map(snap.localization?.ranked.map((c) => [c.bus, c.score]) ?? []);
  const idxOf = (kind: string, bus: number) => METERS.find((m) => m.kind === kind && m.bus === bus)!.idx;
  const buses: BusState[] = BUSES.map((b, i) => {
    const iv = idxOf("V", b.id);
    const ip = idxOf("P", b.id);
    const iq = idxOf("Q", b.id);
    return {
      id: b.id,
      name: b.name,
      type: b.type,
      zone: b.zone,
      vm: vm[i],
      vaDeg: (va[i] * 180) / Math.PI,
      pMw: P[i] * BASE_MVA,
      qMvar: Q[i] * BASE_MVA,
      loadMw: b.pd * lf[i],
      measured: { v: observed[iv], p: observed[ip] * BASE_MVA, q: observed[iq] * BASE_MVA },
      original: { v: frame.original[iv], p: frame.original[ip] * BASE_MVA, q: frame.original[iq] * BASE_MVA },
      tampered: [iv, ip, iq].some((k) => snap.tampered.has(k)) || METERS.some((m) => m.bus === b.id && snap.tampered.has(m.idx)),
      status: predicted.has(b.id) ? "suspicious" : "normal",
      evidenceScore: scoreOf.get(b.id) ?? null,
    };
  });
  const branches: BranchState[] = BRANCHES.map((br) => {
    const f = branchFlow(br.id, vm, va);
    return {
      id: br.id,
      from: br.from,
      to: br.to,
      pFromMw: f.pf * BASE_MVA,
      qFromMvar: f.qf * BASE_MVA,
      pToMw: f.pt * BASE_MVA,
      qToMvar: f.qt * BASE_MVA,
      currentPu: branchCurrentPu(br.id, vm, va),
      lossMw: (f.pf + f.pt) * BASE_MVA,
      transformer: br.tap !== 0,
    };
  });
  const vs = Array.from(vm);
  const minV = Math.min(...vs);
  const totalLoad = buses.reduce((a, b) => a + b.loadMw, 0);
  const gen = buses.filter((b) => b.type !== "pq").reduce((a, b) => a + b.pMw + b.loadMw, 0);
  const a = snap.analysis;
  const analysis: AnalysisDTO | null = a
    ? {
        bdd: { j: a.bdd.j, dof: a.bdd.dof, threshold: a.bdd.threshold, maxRN: a.bdd.maxRN, flag: a.bdd.flag, flagChi2: a.bdd.flagChi2, flagLNR: a.bdd.flagLNR },
        isolationForest: a.isolationForest,
        randomForest: a.randomForest,
        hybrid: { flag: a.hybrid.flag, votes: a.hybrid.votes, predictedClass: a.hybrid.predictedClass, className: ATTACK_NAMES[a.hybrid.predictedClass] },
        suspicious: a.suspicious,
        latencyMs: a.latencyMs,
        localization: snap.localization
          ? {
              predictedBuses: snap.localization.predictedBuses,
              ranked: snap.localization.ranked,
              significant: snap.localization.significant,
              calibrated: false,
              method: snap.localization.method,
              removedMeters: snap.localization.removedMeters,
            }
          : null,
      }
    : null;
  const att = snap.attack;
  const frameOut: GridFrame = {
    tick: snap.t,
    timestamp: new Date().toISOString(),
    sessionId: snap.sessionId,
    frequency: snap.frequency,
    buses,
    branches,
    totals: {
      loadMw: totalLoad,
      generationMw: gen,
      lossMw: branches.reduce((x, b) => x + b.lossMw, 0),
      avgVoltage: vs.reduce((x, y) => x + y, 0) / vs.length,
      minVoltage: minV,
      minVoltageBus: vs.indexOf(minV) + 1,
      maxVoltage: Math.max(...vs),
    },
    simulation: att
      ? { active: true, eventId: att.eventId, type: att.cfg.type, name: ATTACK_NAMES[att.cfg.type], targetBus: att.cfg.targetBus, intensity: att.cfg.intensity, groups: att.cfg.groups, launchedAt: att.launchedAt, tamperedMeters: snap.tampered.size }
      : { active: false },
    modelsReady: !!getModels(),
    training: isTraining(),
    analysis,
  };
  if (withMeters) {
    const meters: MeterDTO[] = METERS.map((m) => ({
      id: m.id,
      kind: m.kind,
      bus: m.bus,
      branch: m.branch,
      label: m.label,
      unit: m.unit,
      original: eng(m.kind, frame.original[m.idx]),
      observed: eng(m.kind, observed[m.idx]),
      tampered: snap.tampered.has(m.idx),
      rN: se.rN[m.idx],
    }));
    frameOut.meters = meters;
  }
  return frameOut;
}
