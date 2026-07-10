import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

const REGISTRATION_PATH = ".habitat/registration.json";
const MODULES_PATH = ".habitat/modules.json";
const SIMULATION_PATH = ".habitat/simulation.json";
const INVENTORY_PATH = ".habitat/inventory.json";
const CONSTRUCTION_PATH = ".habitat/construction.json";

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
    throw error;
  }
}

function removeJson(filePath: string): void {
  if (existsSync(filePath)) unlinkSync(filePath);
}

function registrationPath(cwd = process.cwd()): string {
  return resolve(cwd, REGISTRATION_PATH);
}

function modulesPath(cwd = process.cwd()): string {
  return resolve(cwd, MODULES_PATH);
}

function simulationPath(cwd = process.cwd()): string {
  return resolve(cwd, SIMULATION_PATH);
}

function inventoryPath(cwd = process.cwd()): string {
  return resolve(cwd, INVENTORY_PATH);
}

function constructionPath(cwd = process.cwd()): string {
  return resolve(cwd, CONSTRUCTION_PATH);
}

export function readRegistration(cwd = process.cwd()): HabitatRegistration | null {
  return readJson<HabitatRegistration>(registrationPath(cwd));
}

export function writeRegistration(registration: HabitatRegistration, cwd = process.cwd()): void {
  writeJson(registrationPath(cwd), registration);
}

export function removeRegistration(cwd = process.cwd()): void {
  removeJson(registrationPath(cwd));
}

export function readModuleState(cwd = process.cwd()): HabitatModuleState | null {
  return readJson<HabitatModuleState>(modulesPath(cwd));
}

export function writeModuleState(state: HabitatModuleState, cwd = process.cwd()): void {
  writeJson(modulesPath(cwd), state);
}

export function removeModuleState(cwd = process.cwd()): void {
  removeJson(modulesPath(cwd));
}

export function readSimulationState(cwd = process.cwd()): HabitatSimulationState | null {
  return readJson<HabitatSimulationState>(simulationPath(cwd));
}

export function writeSimulationState(state: HabitatSimulationState, cwd = process.cwd()): void {
  writeJson(simulationPath(cwd), state);
}

export function removeSimulationState(cwd = process.cwd()): void {
  removeJson(simulationPath(cwd));
}

export function readInventoryState(cwd = process.cwd()): HabitatInventoryState | null {
  return readJson<HabitatInventoryState>(inventoryPath(cwd));
}

export function writeInventoryState(state: HabitatInventoryState, cwd = process.cwd()): void {
  writeJson(inventoryPath(cwd), state);
}

export function removeInventoryState(cwd = process.cwd()): void {
  removeJson(inventoryPath(cwd));
}

export function readConstructionState(cwd = process.cwd()): HabitatConstructionState | null {
  return readJson<HabitatConstructionState>(constructionPath(cwd));
}

export function writeConstructionState(state: HabitatConstructionState, cwd = process.cwd()): void {
  writeJson(constructionPath(cwd), state);
}

export function removeConstructionState(cwd = process.cwd()): void {
  removeJson(constructionPath(cwd));
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
