import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Airlock = {
  id: string;
  name: string;
  pressureLevel: number;
  locked: boolean;
  innerDoorOpen: boolean;
  outerDoorOpen: boolean;
};

type AirlockState = {
  airlocks: Airlock[];
};

const AIRLOCKS_PATH = ".habitat/airlocks.json";

function airlocksPath(cwd = process.cwd()): string {
  return resolve(cwd, AIRLOCKS_PATH);
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readState(cwd = process.cwd()): AirlockState {
  return readJson<AirlockState>(airlocksPath(cwd)) ?? { airlocks: [] };
}

function writeState(state: AirlockState, cwd = process.cwd()): void {
  writeJson(airlocksPath(cwd), state);
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextAirlockId(airlocks: Airlock[]): string {
  let highest = 0;
  for (const airlock of airlocks) {
    const match = /^a(\d+)$/.exec(airlock.id);
    if (!match) continue;
    highest = Math.max(highest, Number(match[1]));
  }
  return `a${highest + 1}`;
}

function findAirlockIndex(state: AirlockState, id: string): number {
  return state.airlocks.findIndex((airlock) => airlock.id === id || airlock.name === id || slugify(airlock.name) === id);
}

export function listAirlocks(cwd = process.cwd()): Airlock[] {
  return readState(cwd).airlocks;
}

export function getAirlock(id: string, cwd = process.cwd()): Airlock | null {
  return readState(cwd).airlocks.find((airlock) => airlock.id === id || airlock.name === id || slugify(airlock.name) === id) ?? null;
}

export function createAirlock(name: string, cwd = process.cwd()): Airlock {
  const state = readState(cwd);
  const airlock: Airlock = {
    id: nextAirlockId(state.airlocks),
    name,
    pressureLevel: 100,
    locked: true,
    innerDoorOpen: false,
    outerDoorOpen: false,
  };
  writeState({ airlocks: [...state.airlocks, airlock] }, cwd);
  return airlock;
}

export function openAirlock(id: string, cwd = process.cwd()): Airlock | null {
  const state = readState(cwd);
  const index = findAirlockIndex(state, id);
  if (index < 0) return null;
  const updated = {
    ...state.airlocks[index],
    locked: false,
  };
  const airlocks = [...state.airlocks];
  airlocks[index] = updated;
  writeState({ airlocks }, cwd);
  return updated;
}

export function closeAirlock(id: string, cwd = process.cwd()): Airlock | null {
  const state = readState(cwd);
  const index = findAirlockIndex(state, id);
  if (index < 0) return null;
  const updated = {
    ...state.airlocks[index],
    locked: true,
    innerDoorOpen: false,
    outerDoorOpen: false,
  };
  const airlocks = [...state.airlocks];
  airlocks[index] = updated;
  writeState({ airlocks }, cwd);
  return updated;
}

export function decompressAirlock(id: string, cwd = process.cwd()): Airlock | null {
  const state = readState(cwd);
  const index = findAirlockIndex(state, id);
  if (index < 0) return null;
  const updated = {
    ...state.airlocks[index],
    pressureLevel: 0,
  };
  const airlocks = [...state.airlocks];
  airlocks[index] = updated;
  writeState({ airlocks }, cwd);
  return updated;
}

export function refillAirlock(id: string, cwd = process.cwd()): Airlock | null {
  const state = readState(cwd);
  const index = findAirlockIndex(state, id);
  if (index < 0) return null;
  const updated = {
    ...state.airlocks[index],
    pressureLevel: 100,
  };
  const airlocks = [...state.airlocks];
  airlocks[index] = updated;
  writeState({ airlocks }, cwd);
  return updated;
}

export function deleteAirlock(id: string, cwd = process.cwd()): boolean {
  const state = readState(cwd);
  const airlocks = state.airlocks.filter((airlock) => airlock.id !== id && airlock.name !== id && slugify(airlock.name) !== id);
  if (airlocks.length === state.airlocks.length) return false;
  if (airlocks.length === 0) {
    const filePath = airlocksPath(cwd);
    if (existsSync(filePath)) unlinkSync(filePath);
    return true;
  }
  writeState({ airlocks }, cwd);
  return true;
}
