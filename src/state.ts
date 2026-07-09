import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import type { KeplerStarterModule } from "./kepler";

export type HabitatRegistration = {
  habitatId: string;
  displayName: string;
  catalogVersion: string;
};

export type HabitatModule = {
  id: string;
  blueprintId: string;
  displayName: string;
  status?: string;
  condition?: number;
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
};

type RegistrationState = HabitatRegistration;
type ModuleState = {
  catalogVersion: string;
  modules: HabitatModule[];
};

const REGISTRATION_PATH = ".habitat/registration.json";
const MODULES_PATH = ".habitat/modules.json";

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

export function readRegistration(cwd = process.cwd()): HabitatRegistration | null {
  return readJson<RegistrationState>(registrationPath(cwd));
}

export function writeRegistration(registration: HabitatRegistration, cwd = process.cwd()): void {
  writeJson(registrationPath(cwd), registration);
}

export function removeRegistration(cwd = process.cwd()): void {
  removeJson(registrationPath(cwd));
}

export function readModuleState(cwd = process.cwd()): ModuleState | null {
  return readJson<ModuleState>(modulesPath(cwd));
}

export function writeModuleState(state: ModuleState, cwd = process.cwd()): void {
  writeJson(modulesPath(cwd), state);
}

export function removeModuleState(cwd = process.cwd()): void {
  removeJson(modulesPath(cwd));
}

export function hydrateModulesFromStarterModules(
  catalogVersion: string,
  starterModules: KeplerStarterModule[],
): ModuleState {
  return {
    catalogVersion,
    modules: starterModules.map((module, index) => ({
      id: `${module.blueprintId}-${index + 1}`,
      blueprintId: module.blueprintId,
      displayName: module.displayName,
      status: "active",
      condition: 100,
      runtimeAttributes: module.runtimeAttributes,
      capabilities: module.capabilities,
    })),
  };
}

export function createModule(
  input: Omit<HabitatModule, "id"> & Partial<Pick<HabitatModule, "id">>,
  cwd: string = process.cwd(),
): HabitatModule {
  const state = readModuleState(cwd) ?? { catalogVersion: "unknown", modules: [] };
  const id = input.id ?? `module-${randomUUID()}`;
  const moduleRecord: HabitatModule = { ...input, id };
  writeModuleState({ ...state, modules: [...state.modules, moduleRecord] }, cwd);
  return moduleRecord;
}

export function updateModule(
  id: string,
  patch: Partial<Omit<HabitatModule, "id">>,
  cwd: string = process.cwd(),
): HabitatModule | null {
  const state = readModuleState(cwd);
  if (!state) return null;
  const index = state.modules.findIndex((module) => module.id === id);
  if (index < 0) return null;
  const updated = { ...state.modules[index], ...patch, id };
  const modules = [...state.modules];
  modules[index] = updated;
  writeModuleState({ ...state, modules }, cwd);
  return updated;
}

export function deleteModule(id: string, cwd: string = process.cwd()): boolean {
  const state = readModuleState(cwd);
  if (!state) return false;
  const modules = state.modules.filter((module) => module.id !== id);
  if (modules.length === state.modules.length) return false;
  writeModuleState({ ...state, modules }, cwd);
  return true;
}

export function getModule(id: string, cwd: string = process.cwd()): HabitatModule | null {
  const state = readModuleState(cwd);
  return state?.modules.find((module) => module.id === id) ?? null;
}
