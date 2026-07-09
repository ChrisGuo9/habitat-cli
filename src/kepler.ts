import type { KeplerConfig } from "./config";

export type KeplerRegistrationResponse = {
  habitatId: string;
  catalogVersion: string;
  starterModules: KeplerStarterModule[];
};

export type KeplerStarterModule = {
  blueprintId: string;
  displayName: string;
  runtimeAttributes: Record<string, unknown>;
  capabilities: string[];
};

export type KeplerHabitat = {
  id: string;
  habitatSlug: string;
  displayName: string;
  catalogVersion: string;
  status: string;
  lastSeenAt: string | null;
};

async function keplerRequest<T>(config: KeplerConfig, path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Kepler request failed (${response.status}): ${body || response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function registerHabitat(config: KeplerConfig, displayName: string, habitatUuid: string) {
  return keplerRequest<KeplerRegistrationResponse>(config, "/habitats/register", {
    method: "POST",
    body: JSON.stringify({ displayName, habitatUuid }),
  });
}

export function listHabitats(config: KeplerConfig) {
  return keplerRequest<{ habitats: KeplerHabitat[] }>(config, "/habitats", { method: "GET" });
}

export function deleteHabitat(config: KeplerConfig, habitatId: string) {
  return keplerRequest<void>(config, `/habitats/${encodeURIComponent(habitatId)}`, {
    method: "DELETE",
  });
}
