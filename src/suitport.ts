import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

export type Suitport = {
  id: string;
  name: string;
  suitAttached: boolean;
  suitBatteryLevel: number;
  inUseBy: string | null;
  status: string;
};

type SuitportState = {
  suitports: Suitport[];
};

const SUITPORTS_PATH = ".habitat/suitports.json";

function suitportsPath(cwd = process.cwd()): string {
  return resolve(cwd, SUITPORTS_PATH);
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readState(cwd = process.cwd()): SuitportState {
  return readJson<SuitportState>(suitportsPath(cwd)) ?? { suitports: [] };
}

function writeState(state: SuitportState, cwd = process.cwd()): void {
  writeJson(suitportsPath(cwd), state);
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextSuitportId(suitports: Suitport[]): string {
  let highest = 0;
  for (const suitport of suitports) {
    const match = /^s(\d+)$/.exec(suitport.id);
    if (!match) continue;
    highest = Math.max(highest, Number(match[1]));
  }
  return `s${highest + 1}`;
}

function findSuitportIndex(state: SuitportState, id: string): number {
  return state.suitports.findIndex((suitport) => suitport.id === id || suitport.name === id || slugify(suitport.name) === id);
}

export function listSuitports(cwd = process.cwd()): Suitport[] {
  return readState(cwd).suitports;
}

export function getSuitport(id: string, cwd = process.cwd()): Suitport | null {
  return readState(cwd).suitports.find((suitport) => suitport.id === id || suitport.name === id || slugify(suitport.name) === id) ?? null;
}

export function createSuitport(name: string, cwd = process.cwd()): Suitport {
  const state = readState(cwd);
  const suitport: Suitport = {
    id: nextSuitportId(state.suitports),
    name,
    suitAttached: false,
    suitBatteryLevel: 100,
    inUseBy: null,
    status: "idle",
  };
  writeState({ suitports: [...state.suitports, suitport] }, cwd);
  return suitport;
}

export function attachSuit(id: string, cwd = process.cwd()): Suitport | null {
  const state = readState(cwd);
  const index = findSuitportIndex(state, id);
  if (index < 0) return null;
  const updated = {
    ...state.suitports[index],
    suitAttached: true,
    status: "attached",
  };
  const suitports = [...state.suitports];
  suitports[index] = updated;
  writeState({ suitports }, cwd);
  return updated;
}

export function detachSuit(id: string, cwd = process.cwd()): Suitport | null {
  const state = readState(cwd);
  const index = findSuitportIndex(state, id);
  if (index < 0) return null;
  const updated = {
    ...state.suitports[index],
    suitAttached: false,
    inUseBy: null,
    status: "idle",
  };
  const suitports = [...state.suitports];
  suitports[index] = updated;
  writeState({ suitports }, cwd);
  return updated;
}

export function deleteSuitport(id: string, cwd = process.cwd()): boolean {
  const state = readState(cwd);
  const suitports = state.suitports.filter((suitport) => suitport.id !== id && suitport.name !== id && slugify(suitport.name) !== id);
  if (suitports.length === state.suitports.length) return false;
  if (suitports.length === 0) {
    const filePath = suitportsPath(cwd);
    if (existsSync(filePath)) unlinkSync(filePath);
    return true;
  }
  writeState({ suitports }, cwd);
  return true;
}
