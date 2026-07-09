import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type WorkshopFabricator = {
  id: string;
  name: string;
  status: string;
};

type WorkshopState = {
  fabricators: WorkshopFabricator[];
};

const WORKSHOPS_PATH = ".habitat/workshops.json";

function workshopsPath(cwd = process.cwd()): string {
  return resolve(cwd, WORKSHOPS_PATH);
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readState(cwd = process.cwd()): WorkshopState {
  return readJson<WorkshopState>(workshopsPath(cwd)) ?? { fabricators: [] };
}

function writeState(state: WorkshopState, cwd = process.cwd()): void {
  writeJson(workshopsPath(cwd), state);
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextFabricatorId(fabricators: WorkshopFabricator[]): string {
  let highest = 0;
  for (const fabricator of fabricators) {
    const match = /^w(\d+)$/.exec(fabricator.id);
    if (!match) continue;
    highest = Math.max(highest, Number(match[1]));
  }
  return `w${highest + 1}`;
}

function findFabricatorIndex(state: WorkshopState, id: string): number {
  return state.fabricators.findIndex((fabricator) => fabricator.id === id || fabricator.name === id || slugify(fabricator.name) === id);
}

export function listFabricators(cwd = process.cwd()): WorkshopFabricator[] {
  return readState(cwd).fabricators;
}

export function getFabricator(id: string, cwd = process.cwd()): WorkshopFabricator | null {
  return readState(cwd).fabricators.find((fabricator) => fabricator.id === id || fabricator.name === id || slugify(fabricator.name) === id) ?? null;
}

export function createFabricator(name: string, cwd = process.cwd()): WorkshopFabricator {
  const state = readState(cwd);
  const fabricator: WorkshopFabricator = {
    id: nextFabricatorId(state.fabricators),
    name,
    status: "idle",
  };
  writeState({ fabricators: [...state.fabricators, fabricator] }, cwd);
  return fabricator;
}

export function deleteFabricator(id: string, cwd = process.cwd()): boolean {
  const state = readState(cwd);
  const fabricators = state.fabricators.filter((fabricator) => fabricator.id !== id && fabricator.name !== id && slugify(fabricator.name) !== id);
  if (fabricators.length === state.fabricators.length) return false;
  if (fabricators.length === 0) {
    const filePath = workshopsPath(cwd);
    if (existsSync(filePath)) unlinkSync(filePath);
    return true;
  }
  writeState({ fabricators }, cwd);
  return true;
}
