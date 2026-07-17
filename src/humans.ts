import type { KeplerStarterHuman } from "./kepler";
import { getModule, readHumanState, writeHumanState } from "./state";

export function listHumans(cwd = process.cwd()): KeplerStarterHuman[] {
  const state = readHumanState(cwd);
  if (!state) throw new Error("No local human state found. Register the habitat first.");
  return state.humans;
}

export function moveHuman(humanId: string, moduleId: string, cwd = process.cwd()): KeplerStarterHuman {
  const humans = readHumanState(cwd);
  if (!humans) throw new Error("No local human state found.");
  const human = humans.humans.find((item) => item.id === humanId);
  if (!human) throw new Error(`Human not found: ${humanId}`);
  const destination = getModule(moduleId, cwd);
  if (!destination) throw new Error(`Destination module not found: ${moduleId}`);
  const capacity = Number(destination.runtimeAttributes.crewCapacity ?? 0);
  const occupants = humans.humans.filter((item) => item.locationModuleId === destination.id && item.id !== humanId).length;
  if (!Number.isFinite(capacity) || occupants >= capacity) throw new Error(`Destination module has reached its crew capacity: ${destination.id}`);
  const updated = { ...human, locationModuleId: destination.id };
  writeHumanState({ humans: humans.humans.map((item) => item.id === humanId ? updated : item) }, cwd);
  return updated;
}

export function moduleHasOccupants(moduleId: string, cwd = process.cwd()): boolean {
  return readHumanState(cwd)?.humans.some((human) => human.locationModuleId === moduleId) ?? false;
}
