import { apiRequestSync } from "./api/client";
import type { HabitatConstructionState, HabitatInventoryState, HabitatModuleState, HabitatRegistration, HabitatSimulationState, LocalModuleInput, LocalModuleUpdate, ModuleReference } from "./state";
import type { KeplerStarterModule } from "./kepler";

function request<T>(path: string, method = "GET", body?: unknown): T {
  return apiRequestSync<T>(path, method, body);
}
type State = { registration: HabitatRegistration | null; modules: HabitatModuleState | null; inventory: HabitatInventoryState | null; construction: HabitatConstructionState | null; simulation?: HabitatSimulationState | null };
const state = () => request<State>("/state");
const put = (value: Partial<State>) => { request("/state", "PUT", value); };
export const readRegistration = () => state().registration;
export const writeRegistration = (value: HabitatRegistration) => { request("/registration", "POST", { name: value.displayName }); };
export const removeRegistration = () => { request("/registration", "DELETE"); };
export const readModuleState = () => state().modules;
export const writeModuleState = (value: HabitatModuleState) => put({ modules: value });
export const removeModuleState = () => put({ modules: null });
export const readInventoryState = () => state().inventory;
export const writeInventoryState = (value: HabitatInventoryState) => put({ inventory: value });
export const removeInventoryState = () => put({ inventory: null });
export const readConstructionState = () => state().construction;
export const writeConstructionState = (value: HabitatConstructionState) => put({ construction: value });
export const removeConstructionState = () => put({ construction: null });
export const readSimulationState = () => state().simulation ?? null;
export const writeSimulationState = (value: HabitatSimulationState) => put({ simulation: value });
export const removeSimulationState = () => put({ simulation: null });
export const readOrCreateSimulationState = () => readSimulationState() ?? { currentTick: 0 };
export const readOrCreateInventoryState = () => readInventoryState() ?? { resources: {} };
export const listModules = () => { const value = readModuleState(); if (!value) throw new Error("No local module state found."); return value.modules; };
export function listModuleReferences(): ModuleReference[] { const counts = new Map<string, number>(); const overrides: Record<string, string> = { "basic-battery": "battery", "basic-suitport": "suit", "command-module": "cmd", "life-support": "life", "supply-cache": "cache", "workshop-fabricator": "fab" }; return listModules().map((module) => { const stem = overrides[module.blueprintId] ?? module.blueprintId.replace(/[^a-z0-9-]/gi, "-").toLowerCase().split("-").find(Boolean) ?? "module"; const index = (counts.get(stem) ?? 0) + 1; counts.set(stem, index); return { alias: `${stem}-${index}`, module }; }); }
export const getModuleReference = (id: string) => listModuleReferences().find((ref) => ref.alias === id || ref.module.id === id) ?? null;
export const createModule = (input: LocalModuleInput) => { const value = readModuleState(); if (!value) throw new Error("No local module state found."); const module: KeplerStarterModule = { id: `module_${crypto.randomUUID()}`, ...input }; writeModuleState({ ...value, modules: [...value.modules, module] }); return module; };
export const updateModule = (id: string, updates: LocalModuleUpdate) => { const value = readModuleState(); const ref = value && getModuleReference(id); if (!value || !ref) return null; const module = { ...ref.module, blueprintId: updates.blueprintId ?? ref.module.blueprintId, displayName: updates.displayName ?? ref.module.displayName, connectedTo: updates.connectedTo ?? ref.module.connectedTo, runtimeAttributes: updates.runtimeAttributes ?? ref.module.runtimeAttributes, capabilities: updates.capabilities ?? ref.module.capabilities }; writeModuleState({ ...value, modules: value.modules.map((item) => item.id === ref.module.id ? module : item) }); return module; };
export const updateModuleStatus = (id: string, status: string) => updateModule(id, { runtimeAttributes: { ...(getModuleReference(id)?.module.runtimeAttributes ?? {}), status } });
export const deleteModule = (id: string) => { const value = readModuleState(); const ref = value && getModuleReference(id); if (!value || !ref) return false; writeModuleState({ ...value, modules: value.modules.filter((item) => item.id !== ref.module.id) }); return true; };
export { hydrateModulesFromRegistration } from "./state";
