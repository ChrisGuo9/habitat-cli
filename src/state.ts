import { randomUUID } from "node:crypto";
import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import type { KeplerBlueprint, KeplerStarterModule } from "./kepler";

export type HabitatRegistration = {
  habitatId: string;
  habitatUuid: string;
  displayName: string;
  baseUrl: string;
  tokenSource: string;
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
