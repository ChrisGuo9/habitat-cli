import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
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

export function hydrateModulesFromRegistration(
  starterModules: KeplerStarterModule[],
  blueprints: KeplerBlueprint[],
): HabitatModuleState {
  return {
    modules: starterModules,
    blueprints,
  };
}
