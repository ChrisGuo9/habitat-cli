import { listHumans } from "./humans";
import { getModule, listModules, readExplorationState, writeExplorationState } from "./state";
import type { HabitatExplorationState } from "./state";

export const DEFAULT_CARRYING_CAPACITY_KG = 10;
export type SectorBounds = { minX: number; maxX: number; minY: number; maxY: number };

export function deployExplorer(humanId: string, cwd = process.cwd()): HabitatExplorationState {
  if (readExplorationState(cwd)) throw new Error("A human is already deployed.");
  const human = listHumans(cwd).find((item) => item.id === humanId);
  if (!human) throw new Error(`Human not found: ${humanId}`);
  const suitport = listModules(cwd).find((module) => module.blueprintId === "basic-suitport" && module.runtimeAttributes.status !== "offline");
  if (!suitport || human.locationModuleId !== suitport.id) throw new Error("Human must be in the active suitport module before deployment.");
  const state = { humanId, suitportModuleId: suitport.id, x: 0, y: 0, carriedResources: {}, maxCapacityKg: DEFAULT_CARRYING_CAPACITY_KG };
  writeExplorationState(state, cwd);
  return state;
}

export function moveExplorer(x: number, y: number, bounds: SectorBounds, cwd = process.cwd()): HabitatExplorationState {
  const state = readExplorationState(cwd);
  if (!state) throw new Error("No human is deployed outside the habitat.");
  if (Math.abs(x - state.x) + Math.abs(y - state.y) !== 1) throw new Error("EVA movement must be exactly one grid tile north, south, east, or west.");
  if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) throw new Error("Destination is outside the current Kepler sector.");
  const updated = { ...state, x, y };
  writeExplorationState(updated, cwd);
  return updated;
}

export function validateCollection(quantityKg: number, cwd = process.cwd()): { state: HabitatExplorationState; remainingCapacityKg: number } {
  const state = readExplorationState(cwd);
  if (!state) throw new Error("No human is deployed outside the habitat.");
  if (!Number.isInteger(quantityKg) || quantityKg <= 0) throw new Error("Collection quantity must be a positive whole number of kilograms.");
  const carried = Object.values(state.carriedResources).reduce((sum, amount) => sum + amount, 0);
  const remainingCapacityKg = state.maxCapacityKg - carried;
  if (quantityKg > remainingCapacityKg) throw new Error("Collection would exceed carrying capacity.");
  return { state, remainingCapacityKg };
}

export function addCarriedResource(resourceType: string, quantityKg: number, cwd = process.cwd()): HabitatExplorationState {
  const { state } = validateCollection(quantityKg, cwd);
  const updated = { ...state, carriedResources: { ...state.carriedResources, [resourceType]: (state.carriedResources[resourceType] ?? 0) + quantityKg } };
  writeExplorationState(updated, cwd);
  return updated;
}
