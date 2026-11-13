import { boolean, doublePrecision, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const simulationSessions = pgTable("simulation_sessions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("running"), // running | stopped | reset
  scenario: text("scenario").notNull().default("live"),
  seed: integer("seed").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const attackEvents = pgTable("attack_events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  attackType: text("attack_type").notNull(),
  targetBus: integer("target_bus").notNull(),
  intensity: doublePrecision("intensity").notNull(),
  measurementGroups: jsonb("measurement_groups").$type<string[]>().notNull(),
  sign: integer("sign").notNull().default(1),
  status: text("status").notNull().default("active"), // active | stopped
  launchedAt: timestamp("launched_at", { withTimezone: true }).notNull().defaultNow(),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  launchTick: integer("launch_tick").notNull(),
  /** Ground-truth snapshot at launch: original and attacked readings + tampered meter labels. */
  snapshot: jsonb("snapshot").$type<{
    meters: string[];
    original: number[];
    attacked: number[];
    tamperedMeters: string[];
  }>(),
});

export const detectionResults = pgTable("detection_results", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id"),
  attackEventId: integer("attack_event_id"),
  tick: integer("tick").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  bddFlag: boolean("bdd_flag").notNull(),
  bddJ: doublePrecision("bdd_j").notNull(),
  bddThreshold: doublePrecision("bdd_threshold").notNull(),
  ifScore: doublePrecision("if_score").notNull(),
  ifFlag: boolean("if_flag").notNull(),
  rfProbabilities: jsonb("rf_probabilities").$type<Record<string, number>>().notNull(),
  hybridFlag: boolean("hybrid_flag").notNull(),
  predictedClass: text("predicted_class").notNull(),
  groundTruthLabel: text("ground_truth_label").notNull(),
  latencyMs: doublePrecision("latency_ms").notNull(),
  suspicious: jsonb("suspicious").$type<unknown[]>().notNull(),
});

export const localizationResults = pgTable("localization_results", {
  id: serial("id").primaryKey(),
  detectionId: integer("detection_id"),
  attackEventId: integer("attack_event_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  predictedBuses: jsonb("predicted_buses").$type<number[]>().notNull(),
  ranked: jsonb("ranked").$type<unknown[]>().notNull(),
  groundTruthBus: integer("ground_truth_bus"),
  correctTop1: boolean("correct_top1"),
  method: text("method").notNull(),
});

export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  severity: text("severity").notNull(), // low | medium | high | critical
  status: text("status").notNull().default("open"), // open | investigating | resolved
  detectedAttackType: text("detected_attack_type").notNull(),
  groundTruthAttackType: text("ground_truth_attack_type"),
  predictedBuses: jsonb("predicted_buses").$type<number[]>().notNull(),
  groundTruthBus: integer("ground_truth_bus"),
  detectionId: integer("detection_id"),
  localizationId: integer("localization_id"),
  attackEventId: integer("attack_event_id"),
  summary: text("summary").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull(),
  simulated: boolean("simulated").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modelEvaluations = pgTable("model_evaluations", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  seed: integer("seed").notNull(),
  datasetSize: integer("dataset_size").notNull(),
  metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull(),
});
