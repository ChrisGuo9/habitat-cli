export type Registration = { habitatId: string; habitatUuid: string; displayName: string; tokenSource?: string };
export type Module = { id: string; blueprintId: string; displayName: string; connectedTo: string[]; runtimeAttributes: Record<string, unknown>; capabilities: string[] };
export type ApiState = { registration: Registration | null; modules: { modules: Module[] } | null; inventory: unknown; construction: unknown; simulation: { currentTick: number } | null };
export type TickResponse = ApiState & { moduleState: { modules: Module[] }; simulationState: { currentTick: number }; summary: { consumedKwh: number; generatedKwh: number; storedEnergyKwh: number; requestedTicks: number; completedTicks: number; blockedTicks: number; powerBlockedTicks: number; constructionCompleted: boolean }; solarIrradiance: { wPerM2: number; condition: string } };

export function validateTickCount(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function resolveBrowserApiBaseUrl(location: Pick<Location, "protocol" | "hostname" | "port"> = window.location): string {
  if (location.port === "8787") return `${location.protocol}//${location.hostname}:8787`;
  return "http://127.0.0.1:8787";
}

export function createApiClient(baseUrl = "http://127.0.0.1:8787", fetcher: Fetcher = fetch) {
  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    let response: Response;
    try { response = await fetcher(`${baseUrl.replace(/\/$/, "")}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } }); }
    catch { throw new Error("Could not connect to the Habitat API. Start it with `bun run server`."); }
    const text = await response.text();
    let body: unknown = undefined;
    try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
    if (!response.ok) throw new Error(body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : `Habitat API request failed (${response.status})`);
    return body as T;
  };
  return {
    getState: () => request<ApiState>("/state"),
    register: (name: string) => request<Registration>("/registration", { method: "POST", body: JSON.stringify({ name }) }),
    unregister: () => request<{ ok: true }>("/registration", { method: "DELETE" }),
    updateModuleStatus: (id: string, status: "online" | "offline") => request<Module>(`/modules/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ runtimeAttributes: { status } }) }),
    runTicks: (count: number) => request<TickResponse>("/ticks", { method: "POST", body: JSON.stringify({ count }) }),
  };
}
