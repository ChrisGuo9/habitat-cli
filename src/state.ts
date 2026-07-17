import { randomUUID } from "node:crypto";
import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import type { KeplerAlertContract, KeplerBlueprint, KeplerStarterHuman, KeplerStarterModule, KeplerStreamMetadata } from "./kepler";

export type HabitatRegistration = {
  habitatId: string;
  habitatUuid: string;
  displayName: string;
  baseUrl: string;
  tokenSource: string;
  streamUrl?: string;
  apiToken?: string;
  stream?: KeplerStreamMetadata;
};

export type HabitatClockState = {
  mode: "manual" | "kepler";
  connectionState: "disconnected" | "connecting" | "connected" | "error";
  lastKeplerTick: number | null;
  lastAdvancedBy: number | null;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastConnectionError: string | null;
};

export type HabitatModuleState = {
  modules: KeplerStarterModule[];
  blueprints: KeplerBlueprint[];
};

export type HabitatSimulationState = {
  currentTick: number;
};

export type HabitatInventoryState = {
  resources: Record<string, number>;
};

export type HabitatHumanState = { humans: KeplerStarterHuman[] };
export type HabitatExplorationState = { humanId: string; suitportModuleId: string; x: number; y: number; carriedResources: Record<string, number>; maxCapacityKg: number };
export type HabitatAlertSubject = { type: "human" | "module"; id: string };
export type HabitatAlert = { id: string; code: string; title: string; description: string; severity: string; status: "open" | "acknowledged" | "resolved"; source: string; subject?: HabitatAlertSubject; details?: Record<string, string | number | boolean>; openedAt: string; lastObservedAt: string; acknowledgedAt?: string; resolvedAt?: string; occurrenceCount: number };
export type HabitatAlertState = { alerts: HabitatAlert[] };

export type HabitatConstructionJob = {
  blueprintId: string;
  futureModuleId: string;
  futureModuleType: string;
  futureModuleDisplayName: string;
  facilityModuleId: string;
  totalBuildTicks: number;
  remainingBuildTicks: number;
  futureRuntimeAttributes: Record<string, unknown>;
  futureCapabilities: string[];
  requiredMaterials: Record<string, number>;
};

export type HabitatConstructionState = {
  activeJob: HabitatConstructionJob | null;
};

export type LocalModuleInput = {
  blueprintId: string;
  displayName: string;
  connectedTo: string[];
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
};

export type LocalModuleUpdate = {
  blueprintId?: string;
  displayName?: string;
  connectedTo?: string[];
  runtimeAttributes?: Record<string, unknown>;
  capabilities?: string[];
};

export type ModuleReference = {
  alias: string;
  module: KeplerStarterModule;
};

const DATABASE_NAME = "habitat.sqlite";

type StateRow = { value: string };

function databasePath(cwd = process.cwd()): string {
  return resolve(cwd, DATABASE_NAME);
}

function withDatabase<T>(cwd: string, operation: (database: Database) => T): T {
  const database = new Database(databasePath(cwd));
  database.run(`
    CREATE TABLE IF NOT EXISTS habitat_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  try {
    return operation(database);
  } finally {
    database.close();
  }
}

function readState<T>(key: string, cwd: string): T | null {
  return withDatabase(cwd, (database) => {
    const row = database.query("SELECT value FROM habitat_state WHERE key = ?1").get(key) as StateRow | null;
    return row ? (JSON.parse(row.value) as T) : null;
  });
}

function writeState(key: string, value: unknown, cwd: string): void {
  withDatabase(cwd, (database) => {
    database
      .query("INSERT INTO habitat_state (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, JSON.stringify(value));
  });
}

function writeStateWithDatabase(database: Database, key: string, value: unknown): void {
  database.query("INSERT INTO habitat_state (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
}

function removeState(key: string, cwd: string): void {
  withDatabase(cwd, (database) => {
    database.query("DELETE FROM habitat_state WHERE key = ?1").run(key);
  });
}

export function readRegistration(cwd = process.cwd()): HabitatRegistration | null {
  return readState<HabitatRegistration>("registration", cwd);
}

export function writeRegistration(registration: HabitatRegistration, cwd = process.cwd()): void {
  writeState("registration", registration, cwd);
}

export function removeRegistration(cwd = process.cwd()): void {
  removeState("registration", cwd);
}

export function defaultClockState(): HabitatClockState {
  return {
    mode: "manual",
    connectionState: "disconnected",
    lastKeplerTick: null,
    lastAdvancedBy: null,
    lastConnectedAt: null,
    lastMessageAt: null,
    lastConnectionError: null,
  };
}

export function readClockState(cwd = process.cwd()): HabitatClockState {
  return readState<HabitatClockState>("clock", cwd) ?? defaultClockState();
}

export function writeClockState(state: HabitatClockState, cwd = process.cwd()): void {
  writeState("clock", state, cwd);
}

export function removeClockState(cwd = process.cwd()): void {
  removeState("clock", cwd);
}

export function readModuleState(cwd = process.cwd()): HabitatModuleState | null {
  return readState<HabitatModuleState>("modules", cwd);
}

export function writeModuleState(state: HabitatModuleState, cwd = process.cwd()): void {
  writeState("modules", state, cwd);
}

export function removeModuleState(cwd = process.cwd()): void {
  removeState("modules", cwd);
}

export function readSimulationState(cwd = process.cwd()): HabitatSimulationState | null {
  return readState<HabitatSimulationState>("simulation", cwd);
}

export function writeSimulationState(state: HabitatSimulationState, cwd = process.cwd()): void {
  writeState("simulation", state, cwd);
}

export function removeSimulationState(cwd = process.cwd()): void {
  removeState("simulation", cwd);
}

export function readInventoryState(cwd = process.cwd()): HabitatInventoryState | null {
  return readState<HabitatInventoryState>("inventory", cwd);
}

export function writeInventoryState(state: HabitatInventoryState, cwd = process.cwd()): void {
  writeState("inventory", state, cwd);
}

export function removeInventoryState(cwd = process.cwd()): void {
  removeState("inventory", cwd);
}

export function readConstructionState(cwd = process.cwd()): HabitatConstructionState | null {
  return readState<HabitatConstructionState>("construction", cwd);
}

export function writeConstructionState(state: HabitatConstructionState, cwd = process.cwd()): void {
  writeState("construction", state, cwd);
}

export function removeConstructionState(cwd = process.cwd()): void {
  removeState("construction", cwd);
}

export const readHumanState = (cwd = process.cwd()) => readState<HabitatHumanState>("humans", cwd);
export const writeHumanState = (state: HabitatHumanState, cwd = process.cwd()) => writeState("humans", state, cwd);
export const removeHumanState = (cwd = process.cwd()) => removeState("humans", cwd);
export const readExplorationState = (cwd = process.cwd()) => readState<HabitatExplorationState>("exploration", cwd);
export const writeExplorationState = (state: HabitatExplorationState, cwd = process.cwd()) => writeState("exploration", state, cwd);
export const removeExplorationState = (cwd = process.cwd()) => removeState("exploration", cwd);
export const readAlertContract = (cwd = process.cwd()) => readState<KeplerAlertContract>("alert-contract", cwd);
export const writeAlertContract = (state: KeplerAlertContract, cwd = process.cwd()) => writeState("alert-contract", state, cwd);
export const removeAlertContract = (cwd = process.cwd()) => removeState("alert-contract", cwd);
export const readAlertState = (cwd = process.cwd()) => readState<HabitatAlertState>("alerts", cwd);
export const writeAlertState = (state: HabitatAlertState, cwd = process.cwd()) => writeState("alerts", state, cwd);
export const removeAlertState = (cwd = process.cwd()) => removeState("alerts", cwd);

export function hydrateRegistrationState(input: { registration: HabitatRegistration; modules: HabitatModuleState; humans: HabitatHumanState; alertContract: KeplerAlertContract }, cwd = process.cwd()): void {
  if (!Array.isArray(input.modules.modules) || !Array.isArray(input.humans.humans)) throw new Error("Registration modules and humans are required.");
  withDatabase(cwd, (database) => database.transaction(() => {
    writeStateWithDatabase(database, "registration", input.registration);
    writeStateWithDatabase(database, "modules", input.modules);
    writeStateWithDatabase(database, "humans", input.humans);
    writeStateWithDatabase(database, "alert-contract", input.alertContract);
    writeStateWithDatabase(database, "alerts", { alerts: [] });
  })());
}

export function dockExploration(cwd = process.cwd()): { inventory: HabitatInventoryState; humans: HabitatHumanState } {
  return withDatabase(cwd, (database) => database.transaction(() => {
    const get = <T>(key: string): T | null => { const row = database.query("SELECT value FROM habitat_state WHERE key = ?1").get(key) as StateRow | null; return row ? JSON.parse(row.value) as T : null; };
    const exploration = get<HabitatExplorationState>("exploration");
    const humans = get<HabitatHumanState>("humans");
    const inventory = get<HabitatInventoryState>("inventory") ?? { resources: {} };
    if (!exploration) throw new Error("No human is deployed outside the habitat.");
    if (exploration.x !== 0 || exploration.y !== 0) throw new Error("Explorer must return to (0, 0) before docking.");
    if (!humans) throw new Error("No local human state found.");
    if (!humans.humans.some((human) => human.id === exploration.humanId)) throw new Error(`Deployed human not found: ${exploration.humanId}`);
    const updatedHumans = { humans: humans.humans.map((human) => human.id === exploration.humanId ? { ...human, locationModuleId: exploration.suitportModuleId } : human) };
    const resources = { ...inventory.resources };
    for (const [type, amount] of Object.entries(exploration.carriedResources)) resources[type] = (resources[type] ?? 0) + amount;
    const updatedInventory = { resources };
    writeStateWithDatabase(database, "inventory", updatedInventory);
    writeStateWithDatabase(database, "humans", updatedHumans);
    database.query("DELETE FROM habitat_state WHERE key = 'exploration'").run();
    return { inventory: updatedInventory, humans: updatedHumans };
  })());
}

export function readOrCreateInventoryState(cwd = process.cwd()): HabitatInventoryState {
  const existing = readInventoryState(cwd);
  if (existing) {
    return existing;
  }

  const initialState = { resources: {} };
  writeInventoryState(initialState, cwd);
  return initialState;
}

export function readOrCreateSimulationState(cwd = process.cwd()): HabitatSimulationState {
  const existing = readSimulationState(cwd);
  if (existing) {
    return existing;
  }

  const initialState = { currentTick: 0 };
  writeSimulationState(initialState, cwd);
  return initialState;
}

export function hydrateModulesFromRegistration(
  starterModules: KeplerStarterModule[],
  blueprints: KeplerBlueprint[],
): HabitatModuleState {
  return {
    modules: starterModules,
    blueprints,
  };
}

function requireModuleState(cwd = process.cwd()): HabitatModuleState {
  const state = readModuleState(cwd);
  if (!state) {
    throw new Error('No local module state found. Run "habitat register --name \\"<habitat name>\\"" first.');
  }
  return state;
}

export function listModules(cwd = process.cwd()): KeplerStarterModule[] {
  return requireModuleState(cwd).modules;
}

export function listModuleReferences(cwd = process.cwd()): ModuleReference[] {
  const aliasCounts = new Map<string, number>();
  return listModules(cwd).map((module) => {
    const aliasStem = aliasStemForBlueprint(module.blueprintId);
    const aliasIndex = (aliasCounts.get(aliasStem) ?? 0) + 1;
    aliasCounts.set(aliasStem, aliasIndex);

    return {
      alias: `${aliasStem}-${aliasIndex}`,
      module,
    };
  });
}

export function getModule(id: string, cwd = process.cwd()): KeplerStarterModule | null {
  return findModuleReference(id, cwd)?.module ?? null;
}

export function getModuleReference(id: string, cwd = process.cwd()): ModuleReference | null {
  return findModuleReference(id, cwd);
}

export function createModule(input: LocalModuleInput, cwd = process.cwd()): KeplerStarterModule {
  const state = requireModuleState(cwd);
  const module: KeplerStarterModule = {
    id: `module_${randomUUID()}`,
    blueprintId: input.blueprintId,
    displayName: input.displayName,
    connectedTo: input.connectedTo,
    runtimeAttributes: input.runtimeAttributes,
    capabilities: input.capabilities,
  };

  writeModuleState(
    {
      ...state,
      modules: [...state.modules, module],
    },
    cwd,
  );

  return module;
}

export function updateModule(id: string, updates: LocalModuleUpdate, cwd = process.cwd()): KeplerStarterModule | null {
  const state = requireModuleState(cwd);
  const target = findModuleReference(id, cwd);
  if (!target) {
    return null;
  }

  const index = state.modules.findIndex((module) => module.id === target.module.id);
  if (index === -1) {
    return null;
  }

  const current = state.modules[index]!;
  const updated: KeplerStarterModule = {
    ...current,
    blueprintId: updates.blueprintId ?? current.blueprintId,
    displayName: updates.displayName ?? current.displayName,
    connectedTo: updates.connectedTo ?? current.connectedTo,
    runtimeAttributes: updates.runtimeAttributes ?? current.runtimeAttributes,
    capabilities: updates.capabilities ?? current.capabilities,
  };

  const modules = [...state.modules];
  modules[index] = updated;
  writeModuleState({ ...state, modules }, cwd);
  return updated;
}

export function updateModuleStatus(id: string, status: string, cwd = process.cwd()): KeplerStarterModule | null {
  const state = requireModuleState(cwd);
  const target = findModuleReference(id, cwd);
  if (!target) {
    return null;
  }

  const index = state.modules.findIndex((module) => module.id === target.module.id);
  if (index === -1) {
    return null;
  }

  const current = state.modules[index]!;
  const updated: KeplerStarterModule = {
    ...current,
    runtimeAttributes: {
      ...current.runtimeAttributes,
      status,
    },
  };

  const modules = [...state.modules];
  modules[index] = updated;
  writeModuleState({ ...state, modules }, cwd);
  return updated;
}

export function deleteModule(id: string, cwd = process.cwd()): boolean {
  const state = requireModuleState(cwd);
  const target = findModuleReference(id, cwd);
  if (!target) {
    return false;
  }

  const modules = state.modules.filter((module) => module.id !== target.module.id);
  if (modules.length === state.modules.length) {
    return false;
  }

  writeModuleState({ ...state, modules }, cwd);
  return true;
}

function findModuleReference(idOrAlias: string, cwd = process.cwd()): ModuleReference | null {
  return (
    listModuleReferences(cwd).find(
      ({ alias, module }) => alias === idOrAlias || module.id === idOrAlias,
    ) ?? null
  );
}

function aliasStemForBlueprint(blueprintId: string): string {
  const overrides: Record<string, string> = {
    "basic-battery": "battery",
    "basic-suitport": "suit",
    "command-module": "cmd",
    "life-support": "life",
    "supply-cache": "cache",
    "workshop-fabricator": "fab",
  };

  if (overrides[blueprintId]) {
    return overrides[blueprintId];
  }

  const normalized = blueprintId.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const firstSegment = normalized.split("-").find(Boolean) ?? "module";
  return firstSegment;
}
