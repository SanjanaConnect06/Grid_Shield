/** Fixed teaching scenario, independent of the model training/evaluation seed. */
export const DEMO_SEED = 14009;
export const DEMO_TICK = 500;
export const DEMO_ATTACK = {
  type: "false_data_injection" as const,
  targetBus: 9,
  intensity: 0.8,
  groups: ["voltage", "active_power", "reactive_power"] as ("voltage" | "active_power" | "reactive_power")[],
  sign: 1 as const,
};
