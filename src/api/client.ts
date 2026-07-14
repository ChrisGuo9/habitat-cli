import { spawnSync } from "node:child_process";
import type { ApiBlueprint, ApiSolar, ApiState } from "./types";
import type { KeplerBlueprintCatalogResponse, KeplerResourceCatalogResponse } from "../kepler";
import type { HabitatInventoryState, HabitatModuleState } from "../state";

const DEFAULT_BASE_URL = "http://localhost:8787";

export function apiBaseUrl(): string {
  return (process.env.HABITAT_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await response.text();
  let parsed: unknown = undefined;
  if (body) {
    try { parsed = JSON.parse(body); } catch { parsed = body; }
  }
  if (!response.ok) {
    const message = parsed && typeof parsed === "object" && "error" in parsed
      ? String((parsed as { error: unknown }).error)
      : `Habitat API request failed (${response.status})`;
    throw new Error(message);
  }
  return parsed as T;
}

export function apiRequestSync<T>(path: string, method = "GET", body?: unknown): T {
  const args = ["-sS", "-X", method, `${apiBaseUrl()}${path}`];
  if (body !== undefined) {
    args.push("-H", "Content-Type: application/json", "--data", JSON.stringify(body));
  }

  const result = spawnSync("curl", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Unable to reach Habitat API. Start it with `bun run server`.");
  }

  return JSON.parse(result.stdout) as T;
}

export const getApiState = () => apiRequest<ApiState>("/state");
export const getRegistration = async () => (await apiRequest<{ registration: ApiState["registration"] }>("/registration")).registration;
export const registerViaApi = (name: string) => apiRequest<ApiState["registration"]>("/registration", { method: "POST", body: JSON.stringify({ name }) });
export const unregisterViaApi = () => apiRequest<{ ok: true }>("/registration", { method: "DELETE" });
export const getCatalog = () => apiRequest<KeplerBlueprintCatalogResponse>("/catalog/blueprints");
export const getResources = () => apiRequest<KeplerResourceCatalogResponse>("/catalog/resources");
export const getBlueprintViaApi = (id: string) => apiRequest<ApiBlueprint>(`/catalog/blueprints/${encodeURIComponent(id)}`);
export const getSolarViaApi = () => apiRequest<ApiSolar>("/solar/irradiance");
export const getModules = () => apiRequest<HabitatModuleState | null>("/modules");
export const putModules = (state: HabitatModuleState) => apiRequest<HabitatModuleState>("/modules", { method: "PUT", body: JSON.stringify(state) });
export const getInventory = () => apiRequest<HabitatInventoryState | null>("/inventory");
export const putInventory = (state: HabitatInventoryState) => apiRequest<HabitatInventoryState>("/inventory", { method: "PUT", body: JSON.stringify(state) });
