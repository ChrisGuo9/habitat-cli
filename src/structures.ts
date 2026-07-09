import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Door = {
  id: string;
  name: string;
  status: string;
  locked: boolean;
};

export type Airlock = {
  id: string;
  name: string;
  pressureLevel: number;
  locked: boolean;
  doorIds: string[];
};

type StructureState = {
  doors: Door[];
  airlocks: Airlock[];
};

const STRUCTURES_PATH = ".habitat/structures.json";

function structuresPath(cwd = process.cwd()): string {
  return resolve(cwd, STRUCTURES_PATH);
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readState(cwd = process.cwd()): StructureState {
  return readJson<StructureState>(structuresPath(cwd)) ?? { doors: [], airlocks: [] };
}

function writeState(state: StructureState, cwd = process.cwd()): void {
  writeJson(structuresPath(cwd), state);
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextId(prefix: string, items: Array<{ id: string }>): string {
  let highest = 0;
  for (const item of items) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(item.id);
    if (!match) continue;
    highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix}${highest + 1}`;
}

function findDoorIndex(state: StructureState, id: string): number {
  return state.doors.findIndex((door) => door.id === id || door.name === id || slugify(door.name) === id);
}

function findAirlockIndex(state: StructureState, id: string): number {
  return state.airlocks.findIndex((airlock) => airlock.id === id || airlock.name === id || slugify(airlock.name) === id);
}

export function listDoors(cwd = process.cwd()): Door[] {
  return readState(cwd).doors;
}

export function getDoor(id: string, cwd = process.cwd()): Door | null {
  return readState(cwd).doors.find((door) => door.id === id || door.name === id || slugify(door.name) === id) ?? null;
}

export function createDoor(name: string, cwd = process.cwd()): Door {
  const state = readState(cwd);
  const door: Door = { id: nextId("d", state.doors), name, status: "closed", locked: true };
  writeState({ ...state, doors: [...state.doors, door] }, cwd);
  return door;
}

export function updateDoor(
  id: string,
  patch: Partial<Omit<Door, "id">>,
  cwd = process.cwd(),
): Door | null {
  const state = readState(cwd);
  const index = findDoorIndex(state, id);
  if (index < 0) return null;
  const updated = { ...state.doors[index], ...patch, id: state.doors[index].id };
  const doors = [...state.doors];
  doors[index] = updated;
  writeState({ ...state, doors }, cwd);
  return updated;
}

export function deleteDoor(id: string, cwd = process.cwd()): boolean {
  const state = readState(cwd);
  const doors = state.doors.filter((door) => door.id !== id && door.name !== id && slugify(door.name) !== id);
  if (doors.length === state.doors.length) return false;
  const airlocks = state.airlocks.map((airlock) => ({
    ...airlock,
    doorIds: airlock.doorIds.filter((doorId) => doorId !== id),
  }));
  const nextState = { doors, airlocks };
  if (doors.length === 0 && airlocks.length === 0) {
    const filePath = structuresPath(cwd);
    if (existsSync(filePath)) unlinkSync(filePath);
    return true;
  }
  writeState(nextState, cwd);
  return true;
}

export function listAirlocks(cwd = process.cwd()): Airlock[] {
  return readState(cwd).airlocks;
}

export function getAirlock(id: string, cwd = process.cwd()): Airlock | null {
  return readState(cwd).airlocks.find((airlock) => airlock.id === id || airlock.name === id || slugify(airlock.name) === id) ?? null;
}

export function createAirlock(name: string, cwd = process.cwd()): Airlock {
  const state = readState(cwd);
  const airlock: Airlock = { id: nextId("a", state.airlocks), name, pressureLevel: 100, locked: true, doorIds: [] };
  writeState({ ...state, airlocks: [...state.airlocks, airlock] }, cwd);
  return airlock;
}

export function updateAirlock(
  id: string,
  patch: Partial<Omit<Airlock, "id" | "doorIds">>,
  cwd = process.cwd(),
): Airlock | null {
  const state = readState(cwd);
  const index = findAirlockIndex(state, id);
  if (index < 0) return null;
  const updated = { ...state.airlocks[index], ...patch, id: state.airlocks[index].id };
  const airlocks = [...state.airlocks];
  airlocks[index] = updated;
  writeState({ ...state, airlocks }, cwd);
  return updated;
}

export function deleteAirlock(id: string, cwd = process.cwd()): boolean {
  const state = readState(cwd);
  const airlocks = state.airlocks.filter((airlock) => airlock.id !== id && airlock.name !== id && slugify(airlock.name) !== id);
  if (airlocks.length === state.airlocks.length) return false;
  if (airlocks.length === 0 && state.doors.length === 0) {
    const filePath = structuresPath(cwd);
    if (existsSync(filePath)) unlinkSync(filePath);
    return true;
  }
  writeState({ ...state, airlocks }, cwd);
  return true;
}

export function addDoorToAirlock(airlockId: string, doorId: string, cwd = process.cwd()): Airlock | null {
  const state = readState(cwd);
  const airlockIndex = findAirlockIndex(state, airlockId);
  const door = state.doors.find((item) => item.id === doorId || item.name === doorId || slugify(item.name) === doorId);
  if (airlockIndex < 0 || !door) return null;
  const airlock = state.airlocks[airlockIndex];
  if (airlock.doorIds.includes(door.id)) return airlock;
  const updated = { ...airlock, doorIds: [...airlock.doorIds, door.id] };
  const airlocks = [...state.airlocks];
  airlocks[airlockIndex] = updated;
  writeState({ ...state, airlocks }, cwd);
  return updated;
}
