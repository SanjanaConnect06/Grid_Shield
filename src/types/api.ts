export type Label = "normal" | "false_data_injection" | "replay" | "data_manipulation";
export type AttackType = Exclude<Label, "normal">;
export type MeasurementGroup = "voltage" | "active_power" | "reactive_power";

export interface ApiOk<T> {
  ok: true;
  data: T;
}
export interface ApiErr {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export interface BusState {
  id: number;
  name: string;
  type: "slack" | "pv" | "pq";
  zone: "generation" | "transmission" | "distribution";
  /** State-estimator output computed from the OBSERVED measurements (operator view). */
  vm: number;
  vaDeg: number;
  pMw: number;
  qMvar: number;
  loadMw: number;
  measured: { v: number; p: number; q: number };
  original: { v: number; p: number; q: number };
  tampered: boolean;
  status: "normal" | "suspicious";
  evidenceScore: number | null;
}

export interface BranchState {
  id: number;
  from: number;
  to: number;
  pFromMw: number;
  qFromMvar: number;
  pToMw: number;
  qToMvar: number;
  currentPu: number;
  lossMw: number;
  transformer: boolean;
}

export interface MeterDTO {
  id: string;
  kind: string;
  bus: number;
  branch?: number;
  label: string;
  unit: string;
  original: number;
  observed: number;
  tampered: boolean;
  rN: number;
}

export interface CandidateDTO {
  bus: number;
  score: number;
  rms: number;
  deltaJ: number;
  neighbourMean: number;
  evidenceShare: number;
  evidence: { meterId: string; label: string; rN: number; removedByLNR: boolean }[];
}

export interface LocalizationDTO {
  predictedBuses: number[];
  ranked: CandidateDTO[];
  significant: boolean;
  calibrated: false;
  method: string;
  removedMeters: { meterId: string; rN: number; bus: number }[];
}

export interface SuspiciousMeter {
  meterId: string;
  label: string;
  bus: number;
  rN: number;
  unit: string;
}

export interface AnalysisDTO {
  bdd: { j: number; dof: number; threshold: number; maxRN: number; flag: boolean; flagChi2: boolean; flagLNR: boolean };
  isolationForest: { score: number; threshold: number; flag: boolean };
  randomForest: { probabilities: Record<string, number>; attackProbability: number; threshold: number; flag: boolean };
  hybrid: { flag: boolean; votes: number; predictedClass: Label; className: string };
  suspicious: SuspiciousMeter[];
  latencyMs: number;
  localization: LocalizationDTO | null;
}

export interface SimulationInfo {
  active: boolean;
  eventId?: number;
  type?: AttackType;
  name?: string;
  targetBus?: number;
  intensity?: number;
  groups?: MeasurementGroup[];
  launchedAt?: number;
  tamperedMeters?: number;
}

export interface GridFrame {
  tick: number;
  timestamp: string;
  sessionId: number;
  frequency: number;
  buses: BusState[];
  branches: BranchState[];
  totals: { loadMw: number; generationMw: number; lossMw: number; avgVoltage: number; minVoltage: number; minVoltageBus: number; maxVoltage: number };
  simulation: SimulationInfo;
  modelsReady: boolean;
  training: boolean;
  analysis: AnalysisDTO | null;
  meters?: MeterDTO[];
}

export interface IncidentDTO {
  id: number;
  code: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "resolved";
  detectedAttackType: string;
  groundTruthAttackType: string | null;
  predictedBuses: number[];
  groundTruthBus: number | null;
  summary: string;
  details: Record<string, unknown>;
  simulated: boolean;
  createdAt: string;
  detectionId: number | null;
  localizationId: number | null;
  attackEventId: number | null;
}

export interface TimelineEvent {
  at: string;
  kind: "attack_launched" | "attack_stopped" | "detection" | "incident";
  title: string;
  detail: string;
  severity: "info" | "warning" | "critical";
}

export interface StatusSummary {
  tick: number;
  gridStatus: "NORMAL" | "ALERT" | "INITIALISING";
  frequency: number;
  avgVoltage: number;
  busesMonitored: number;
  branchesMonitored: number;
  activeAlerts: number;
  suspiciousBuses: number[];
  simulation: SimulationInfo;
  modelsReady: boolean;
  training: boolean;
  anomalyStats: { detections: number; flagged: number; incidents: number; openIncidents: number };
  recentIncidents: IncidentDTO[];
  timeline: TimelineEvent[];
  database: string;
}

export interface DetectionRow {
  id: number;
  tick: number;
  createdAt: string;
  bddFlag: boolean;
  bddJ: number;
  bddThreshold: number;
  ifScore: number;
  ifFlag: boolean;
  rfProbabilities: Record<string, number>;
  hybridFlag: boolean;
  predictedClass: string;
  groundTruthLabel: string;
  latencyMs: number;
  suspicious: SuspiciousMeter[];
  attackEventId: number | null;
}

export interface AttackRow {
  id: number;
  attackType: string;
  targetBus: number;
  intensity: number;
  measurementGroups: string[];
  status: string;
  launchedAt: string;
  stoppedAt: string | null;
  launchTick: number;
  snapshot: { tamperedMeters: string[] } | null;
}

export interface LocalizationRow {
  id: number;
  detectionId: number | null;
  createdAt: string;
  predictedBuses: number[];
  ranked: CandidateDTO[];
  groundTruthBus: number | null;
  correctTop1: boolean | null;
  method: string;
}

export interface BinaryMetrics {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  fpr: number;
}

export interface EvaluationDTO {
  seed: number;
  trainedAt: string;
  trainingSeconds: number;
  dataset: { perClass: number; total: number; train: number; validation: number; test: number; testPerClass: Record<string, number>; features: number; meters: number };
  thresholds: { isolationForest: number; randomForest: number; chi2Alpha: number; lnr: number; fusionRule: string };
  detection: { bdd: BinaryMetrics; isolationForest: BinaryMetrics; randomForest: BinaryMetrics; hybrid: BinaryMetrics };
  classification: {
    labels: string[];
    confusion: number[][];
    accuracy: number;
    macroF1: number;
    perClass: { label: string; precision: number; recall: number; f1: number; support: number }[];
  };
  latency: { meanMs: number; p95Ms: number };
  localization: { evaluated: number; top1: number; top3: number; meanHopError: number; perType: { label: string; n: number; top1: number; top3: number }[] };
  featureImportance: { name: string; importance: number }[];
  methodology: string[];
}

export interface TopologyDTO {
  buses: { id: number; name: string; type: string; zone: string; x: number; y: number; pdMw: number; qdMvar: number }[];
  branches: { id: number; from: number; to: number; r: number; x: number; b: number; tap: number }[];
  baseMva: number;
  source: string;
}

export interface DemoResult {
  scenario: { seed: number; tick: number; targetBus: number; intensity: number };
  baseline: AnalysisDTO;
  detection: AnalysisDTO;
  predictedBuses: number[];
  groundTruthBus: number;
  incident: IncidentDTO;
  evaluation: EvaluationDTO;
}
