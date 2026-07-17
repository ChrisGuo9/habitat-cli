import { spawnSync } from "node:child_process";
import type { ApiBlueprint, ApiClockEvent, ApiClockStatus, ApiSolar, ApiState } from "./types";
import type { KeplerBlueprintCatalogResponse, KeplerResourceCatalogResponse, WorldScanResponse } from "../kepler";
import type { HabitatAlertState, HabitatExplorationState, HabitatInventoryState, HabitatModuleState, LocalModuleInput, LocalModuleUpdate, ModuleReference } from "../state";
import type { KeplerStarterHuman, KeplerStarterModule } from "../kepler";
import type { ConstructionStartResult, ConstructionCancellationResult } from "../construction";
import type { SimulationResult } from "../simulation";

const DEFAULT_BASE_URL = "http://localhost:8787";

export function apiBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.HABITAT_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

function requestLabel(path: string, method: string): string {
  return `${method.toUpperCase()} ${path}`;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, fetchImplementation: typeof fetch = fetch): Promise<T> {
  const method = init.method ?? "GET";
  const label = requestLabel(path, method);
  let response: Response;

  try {
    response = await fetchImplementation(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new Error(`${label} could not connect to the Habitat API. Start it with \`bun run server\`.`);
  }

  const body = await response.text();
  let parsed: unknown = undefined;
  if (body) {
    try { parsed = JSON.parse(body); } catch { parsed = body; }
  }
  if (!response.ok) {
    const message = parsed && typeof parsed === "object" && "error" in parsed
      ? String((parsed as { error: unknown }).error)
      : `Habitat API request failed (${response.status})`;
    throw new Error(`${label} failed (${response.status}): ${message}`);
  }
  return parsed as T;
}

export function apiRequestSync<T>(path: string, method = "GET", body?: unknown): T {
  const label = requestLabel(path, method);
  const args = ["-sS", "-X", method, "-w", "\n%{http_code}", `${apiBaseUrl()}${path}`];
  if (body !== undefined) {
    args.push("-H", "Content-Type: application/json", "--data", JSON.stringify(body));
  }

  const result = spawnSync("curl", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${label} could not connect to the Habitat API. Start it with \`bun run server\`.`);
  }

  const separator = result.stdout.lastIndexOf("\n");
  const responseBody = separator >= 0 ? result.stdout.slice(0, separator) : result.stdout;
  const status = separator >= 0 ? Number(result.stdout.slice(separator + 1)) : 200;
  const parsed = responseBody ? JSON.parse(responseBody) as unknown : undefined;
  if (status < 200 || status >= 300) {
    const message = parsed && typeof parsed === "object" && "error" in parsed
      ? String((parsed as { error: unknown }).error)
      : `Habitat API request failed (${status})`;
    throw new Error(`${label} failed (${status}): ${message}`);
  }

  return parsed as T;
}

export const getApiState = () => apiRequest<ApiState>("/state");
export const getRegistration = async () => (await apiRequest<{ registration: ApiState["registration"] }>("/registration")).registration;
export const registerViaApi = (name: string) => apiRequest<ApiState["registration"]>("/registration", { method: "POST", body: JSON.stringify({ name }) });
export const unregisterViaApi = () => apiRequest<{ ok: true }>("/registration", { method: "DELETE" });
export const getCatalog = () => apiRequest<KeplerBlueprintCatalogResponse>("/catalog/blueprints");
export const getResources = () => apiRequest<KeplerResourceCatalogResponse>("/catalog/resources");
export const getBlueprintViaApi = (id: string) => apiRequest<ApiBlueprint>(`/catalog/blueprints/${encodeURIComponent(id)}`);
export const getSolarViaApi = () => apiRequest<ApiSolar>("/solar/irradiance");
export const scanWorldViaApi = (
  input: { sensorStrength: number; radiusTiles: number },
  fetchImplementation: typeof fetch = fetch,
) => {
  const query = new URLSearchParams({
    sensorStrength: String(input.sensorStrength),
    radiusTiles: String(input.radiusTiles),
  });
  return apiRequest<WorldScanResponse>(`/world/scan?${query}`, {}, fetchImplementation);
};
export const getHumans = () => apiRequest<{ humans: KeplerStarterHuman[] }>("/humans");
export const moveHumanViaApi = (humanId: string, moduleId: string) => apiRequest<KeplerStarterHuman>(`/humans/${encodeURIComponent(humanId)}/location`, { method: "PATCH", body: JSON.stringify({ moduleId }) });
export const getEvaStatus = () => apiRequest<HabitatExplorationState | null>("/eva");
export const deployEva = (humanId: string) => apiRequest<HabitatExplorationState>("/eva/deploy", { method: "POST", body: JSON.stringify({ humanId }) });
export const moveEva = (x: number, y: number) => apiRequest<HabitatExplorationState>("/eva/move", { method: "POST", body: JSON.stringify({ x, y }) });
export const dockEva = () => apiRequest<{ inventory: HabitatInventoryState }>("/eva/dock", { method: "POST" });
export const collectViaApi = (quantityKg: number) => apiRequest<unknown>("/collect", { method: "POST", body: JSON.stringify({ quantityKg }) });
export const getAlerts = () => apiRequest<HabitatAlertState>("/alerts");
export const acknowledgeAlertViaApi = (id: string) => apiRequest<unknown>(`/alerts/${encodeURIComponent(id)}/acknowledge`, { method: "POST" });
export const getModules = () => apiRequest<HabitatModuleState | null>("/modules");
export async function getModuleReferences(): Promise<ModuleReference[]> {
  const state = await getModules();
  if (!state) throw new Error("No local module state found.");
  const counts = new Map<string, number>();
  const overrides: Record<string, string> = { "basic-battery": "battery", "basic-suitport": "suit", "command-module": "cmd", "life-support": "life", "supply-cache": "cache", "workshop-fabricator": "fab" };
  return state.modules.map((module) => {
    const stem = overrides[module.blueprintId] ?? module.blueprintId.replace(/[^a-z0-9-]/gi, "-").toLowerCase().split("-").find(Boolean) ?? "module";
    const index = (counts.get(stem) ?? 0) + 1;
    counts.set(stem, index);
    return { alias: `${stem}-${index}`, module };
  });
}
export const putModules = (state: HabitatModuleState) => apiRequest<HabitatModuleState>("/modules", { method: "PUT", body: JSON.stringify(state) });
export const getModule = (id: string) => apiRequest<KeplerStarterModule>(`/modules/${encodeURIComponent(id)}`);
export const createModuleViaApi = (input: LocalModuleInput) => apiRequest<KeplerStarterModule>("/modules", { method: "POST", body: JSON.stringify(input) });
export const updateModuleViaApi = (id: string, updates: LocalModuleUpdate) => apiRequest<KeplerStarterModule>(`/modules/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(updates) });
export const deleteModuleViaApi = (id: string) => apiRequest<{ ok: true }>(`/modules/${encodeURIComponent(id)}`, { method: "DELETE" });
export const getInventory = () => apiRequest<HabitatInventoryState | null>("/inventory");
export const putInventory = (state: HabitatInventoryState) => apiRequest<HabitatInventoryState>("/inventory", { method: "PUT", body: JSON.stringify(state) });
export const addInventory = (resourceType: string, quantity: number) => apiRequest<HabitatInventoryState>(`/inventory/resources/${encodeURIComponent(resourceType)}`, { method: "POST", body: JSON.stringify({ quantity }) });
export const removeInventory = (resourceType: string, quantity: number) => apiRequest<HabitatInventoryState>(`/inventory/resources/${encodeURIComponent(resourceType)}`, { method: "DELETE", body: JSON.stringify({ quantity }) });
export const runTicksViaApi = (count: number) => apiRequest<SimulationResult & { solarIrradiance: { wPerM2: number; condition: string } }>("/ticks", { method: "POST", body: JSON.stringify({ count }) });
export const startConstructionViaApi = (blueprintId: string) => apiRequest<ConstructionStartResult>("/construction/jobs", { method: "POST", body: JSON.stringify({ blueprintId }) });
export const cancelConstructionViaApi = (facilityId: string) => apiRequest<ConstructionCancellationResult>(`/construction/jobs/${encodeURIComponent(facilityId)}/cancel`, { method: "POST" });
export const getClockStatus = (fetchImplementation: typeof fetch = fetch) => apiRequest<ApiClockStatus>("/clock/status", {}, fetchImplementation);
export const setClockListening = (listening: boolean, fetchImplementation: typeof fetch = fetch) => apiRequest<ApiClockStatus>("/clock/listen", { method: "POST", body: JSON.stringify({ listening }) }, fetchImplementation);

export async function watchClockEvents(
  onEvent: (event: ApiClockEvent) => void,
  signal?: AbortSignal,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImplementation(`${apiBaseUrl()}/clock/events`, { signal, headers: { Accept: "text/event-stream" } });
  } catch (error) {
    if (signal?.aborted) return;
    throw new Error("GET /clock/events could not connect to the Habitat API. Start it with `bun run server`.");
  }
  if (!response.ok || !response.body) throw new Error(`GET /clock/events failed (${response.status}).`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const record = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const lines = record.split("\n");
        if (lines.some((line) => line === "event: planet_tick")) {
          const data = lines.find((line) => line.startsWith("data: "))?.slice(6);
          if (data) onEvent(JSON.parse(data) as ApiClockEvent);
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
