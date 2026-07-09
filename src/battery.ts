import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Battery = {
  id: string;
  name: string;
  chargeLevel: number;
  capacity: number;
  charging: boolean;
  output: boolean;
};

type BatteryState = {
  batteries: Battery[];
};

const BATTERIES_PATH = ".habitat/batteries.json";

function batteriesPath(cwd = process.cwd()): string {
  return resolve(cwd, BATTERIES_PATH);
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readState(cwd = process.cwd()): BatteryState {
  return readJson<BatteryState>(batteriesPath(cwd)) ?? { batteries: [] };
}

function writeState(state: BatteryState, cwd = process.cwd()): void {
  writeJson(batteriesPath(cwd), state);
}

function nextBatteryId(batteries: Battery[]): string {
  let highest = 0;
  for (const battery of batteries) {
    const match = /^b(\d+)$/.exec(battery.id);
    if (!match) continue;
    highest = Math.max(highest, Number(match[1]));
  }
  return `b${highest + 1}`;
}

export function listBatteries(cwd = process.cwd()): Battery[] {
  return readState(cwd).batteries;
}

export function getBattery(id: string, cwd = process.cwd()): Battery | null {
  return readState(cwd).batteries.find((battery) => battery.id === id) ?? null;
}

export function createBattery(name: string, cwd = process.cwd()): Battery {
  const state = readState(cwd);
  const battery: Battery = {
    id: nextBatteryId(state.batteries),
    name,
    chargeLevel: 0,
    capacity: 100,
    charging: false,
    output: false,
  };
  writeState({ batteries: [...state.batteries, battery] }, cwd);
  return battery;
}

export function updateBattery(
  id: string,
  patch: Partial<Pick<Battery, "name" | "chargeLevel" | "capacity" | "charging" | "output">>,
  cwd = process.cwd(),
): Battery | null {
  const state = readState(cwd);
  const index = state.batteries.findIndex((battery) => battery.id === id);
  if (index < 0) return null;
  const updated = { ...state.batteries[index], ...patch, id };
  const batteries = [...state.batteries];
  batteries[index] = updated;
  writeState({ batteries }, cwd);
  return updated;
}

export function deleteBattery(id: string, cwd = process.cwd()): boolean {
  const state = readState(cwd);
  const batteries = state.batteries.filter((battery) => battery.id !== id);
  if (batteries.length === state.batteries.length) return false;
  if (batteries.length === 0) {
    const filePath = batteriesPath(cwd);
    if (existsSync(filePath)) unlinkSync(filePath);
    return true;
  }
  writeState({ batteries }, cwd);
  return true;
}
