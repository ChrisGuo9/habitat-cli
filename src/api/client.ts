import { spawnSync } from "node:child_process";
import type { ApiBlueprint, ApiSolar, ApiState } from "./types";
import type { KeplerBlueprintCatalogResponse, KeplerResourceCatalogResponse } from "../kepler";
import type { HabitatInventoryState, HabitatModuleState } from "../state";

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
export const getModules = () => apiRequest<HabitatModuleState | null>("/modules");
export const putModules = (state: HabitatModuleState) => apiRequest<HabitatModuleState>("/modules", { method: "PUT", body: JSON.stringify(state) });
export const getInventory = () => apiRequest<HabitatInventoryState | null>("/inventory");
export const putInventory = (state: HabitatInventoryState) => apiRequest<HabitatInventoryState>("/inventory", { method: "PUT", body: JSON.stringify(state) });
